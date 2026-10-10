import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { ServiceOrderOpeningsService } from "../dist/modules/service-orders/service-order-openings.service.js";
import { formatServiceOrderNumber } from "../dist/modules/service-orders/domain/service-order-number-format.js";

const actor = (id, permissions = []) => ({
  id,
  publicId: "10000000-0000-0000-0000-" + String(id).padStart(12, "0"),
  isAdmin: false,
  permissions,
});

function harness() {
  let state = { next: 1n, highest: 0n, nextId: 1, openings: [], allocations: new Map(), orders: [], events: [] };
  let failEvent = false;
  let failEventType = null;
  const policy = {
    async assertAllowed(user, required) {
      if (user.isAdmin || required.every((code) => user.permissions.includes(code))) return;
      throw new ForbiddenException({ code: "PERMISSION_DENIED" });
    },
  };

  const repository = (working) => ({
    serviceOrderOpening: {
      async findUnique({ where, select, include }) {
        const opening = working.openings.find((row) =>
          where.activeForUserId !== undefined ? row.activeForUserId === where.activeForUserId
            : where.publicId !== undefined ? row.publicId === where.publicId : row.id === where.id,
        );
        if (!opening) return null;
        if (select) {
          const result = {};
          for (const key of Object.keys(select)) {
            result[key] = key === "initiator" ? { publicId: actor(opening.initiatedByUserId).publicId } : opening[key];
          }
          return result;
        }
        if (include) {
          const allocation = [...working.allocations.values()].find((row) => row.openingId === opening.id);
          return {
            ...opening,
            initiator: { publicId: actor(opening.initiatedByUserId).publicId },
            numberAllocation: allocation ? {
              numberValue: allocation.numberValue,
              status: allocation.status,
              openingId: allocation.openingId,
            } : null,
          };
        }
        return opening;
      },
      async create({ data }) {
        const id = working.nextId++;
        const now = new Date();
        const opening = {
          id,
          publicId: "20000000-0000-0000-0000-" + String(id).padStart(12, "0"),
          ...data,
          createdAt: now,
          updatedAt: now,
        };
        working.openings.push(opening);
        return { ...opening };
      },
      async update({ where, data }) {
        const opening = working.openings.find((row) => row.id === where.id);
        Object.assign(opening, data, { updatedAt: new Date() });
        return { ...opening };
      },
    },
    serviceOrderNumberAllocation: {
      async create({ data }) {
        working.allocations.set(data.numberValue, { ...data });
      },
      async update({ where, data }) {
        Object.assign(working.allocations.get(where.numberValue), data);
      },
    },
    serviceOrderNumberControl: {
      async update({ data }) {
        if (data.nextNumber !== undefined) working.next = data.nextNumber;
        if (data.highestReservedNumber !== undefined) working.highest = data.highestReservedNumber;
      },
    },
    serviceOrderEvent: {
      async create({ data }) {
        if (failEvent || data.eventType === failEventType) throw new Error("Falha simulada no evento");
        working.events.push(data);
      },
    },
    serviceOrder: {
      async findUnique({ where }) {
        return working.orders.find((row) => row.numberValue === where.numberValue) ?? null;
      },
      async findFirst({ where }) {
        return working.orders.find((row) =>
          where.OR.some((condition) =>
            condition.numberValue !== undefined ? row.numberValue === condition.numberValue
              : row.openingId === condition.openingId,
          ),
        ) ?? null;
      },
    },
    async $queryRaw(strings, ...values) {
      const sql = strings.join("?").replace(/\s+/g, " ");
      if (sql.includes("FROM service_order_number_control")) {
        return [{ id: 1, next_number: working.next, highest_reserved_number: working.highest }];
      }
      if (sql.includes("FROM service_order_openings")) {
        const opening = working.openings.find((row) => row.id === values[0]);
        return opening ? [{
          id: opening.id,
          public_id: opening.publicId,
          status: opening.status,
          initiated_by_user_id: opening.initiatedByUserId,
          active_for_user_id: opening.activeForUserId,
          attempted_number_value: opening.attemptedNumberValue,
        }] : [];
      }
      if (sql.includes("FROM service_order_number_allocations")) {
        const allocation = working.allocations.get(values[0]);
        return allocation ? [{
          number_value: allocation.numberValue,
          status: allocation.status,
          opening_id: allocation.openingId,
        }] : [];
      }
      throw new Error("Consulta inesperada no teste");
    },
  });

  const prisma = {
    get serviceOrderOpening() { return repository(state).serviceOrderOpening; },
    async $transaction(callback) {
      const working = structuredClone(state);
      const result = await callback(repository(working));
      state = working;
      return result;
    },
  };
  return {
    service: new ServiceOrderOpeningsService(prisma, policy),
    snapshot: () => structuredClone(state),
    failNextEvent: () => { failEvent = true; },
    failOnEventType: (eventType) => { failEventType = eventType; },
    injectOrder: (order) => { state.orders.push(order); },
    injectAllocation: (numberValue, allocation) => { state.allocations.set(numberValue, allocation); },
    setNumberControl: (next, highest) => { state.next = next; state.highest = highest; },
  };
}

test("formata números com no mínimo seis dígitos, sem teto visual", () => {
  assert.equal(formatServiceOrderNumber(1n), "OS-000001");
  assert.equal(formatServiceOrderNumber(120n), "OS-000120");
  assert.equal(formatServiceOrderNumber(1000000n), "OS-1000000");
  assert.throws(() => formatServiceOrderNumber(0n), RangeError);
});

test("reserva a primeira abertura, persiste evento e impede segunda ativa do mesmo usuário", async () => {
  const { service, snapshot } = harness();
  const user = actor(1, ["service_orders.opening.create", "service_orders.opening.read"]);
  const created = await service.create(user);
  assert.equal(created.data.visibleNumber, "OS-000001");
  assert.equal(created.data.numberValue, "1");
  assert.equal(created.data.status, "IN_PROGRESS");
  assert.equal(created.data.createdBy, user.publicId);
  assert.equal((await service.current(user)).data.publicId, created.data.publicId);
  await assert.rejects(service.create(user), (error) => error.status === 409 && error.response.code === "OPENING_ALREADY_EXISTS");
  assert.equal(snapshot().next, 2n);
  assert.equal(snapshot().allocations.get(1n).status, "RESERVED");
  assert.equal(snapshot().events[0].eventType, "ABERTURA_EM_ANDAMENTO_CRIADA");
});

test("números distintos por usuário; cancelar a ponta libera e permite reuso", async () => {
  const { service, snapshot } = harness();
  const one = actor(1, ["service_orders.opening.create"]);
  const two = actor(2, ["service_orders.opening.create"]);
  const three = actor(3, ["service_orders.opening.create"]);
  assert.equal((await service.create(one)).data.visibleNumber, "OS-000001");
  const second = await service.create(two);
  assert.equal(second.data.visibleNumber, "OS-000002");
  const canceled = await service.cancel(second.data.publicId, two);
  assert.equal(canceled.data.numberReleased, true);
  assert.equal(snapshot().allocations.get(2n).status, "RELEASED");
  assert.equal(snapshot().allocations.get(2n).openingId, null);
  assert.equal(snapshot().next, 2n);
  assert.equal((await service.create(three)).data.visibleNumber, "OS-000002");
  assert.equal(snapshot().highest, 2n);
});

test("cancelar número inferior ao maior consome a reserva e não o reutiliza", async () => {
  const { service, snapshot } = harness();
  const one = actor(1, ["service_orders.opening.create"]);
  const two = actor(2, ["service_orders.opening.create"]);
  const first = await service.create(one);
  await service.create(two);
  const canceled = await service.cancel(first.data.publicId, one);
  assert.equal(canceled.data.numberReleased, false);
  assert.equal(snapshot().allocations.get(1n).status, "CONSUMED");
  assert.equal(snapshot().allocations.get(1n).openingId, 1);
  assert.equal(snapshot().next, 3n);
  assert.equal(snapshot().events.at(-1).payload.numberReleased, false);
});

test("abertura alheia fica oculta para usuário comum e gestor pode cancelar com autoria preservada", async () => {
  const { service, snapshot } = harness();
  const owner = actor(1, ["service_orders.opening.create", "service_orders.opening.read"]);
  const stranger = actor(2, ["service_orders.opening.create", "service_orders.opening.read"]);
  const manager = actor(3, ["service_orders.opening.manage"]);
  const opened = await service.create(owner);
  await assert.rejects(service.getByPublicId(opened.data.publicId, stranger), (error) => error.status === 404);
  await assert.rejects(service.cancel(opened.data.publicId, stranger), (error) => error.status === 404);
  assert.equal((await service.getByPublicId(opened.data.publicId, manager)).data.createdBy, owner.publicId);
  const canceled = await service.cancel(opened.data.publicId, manager);
  assert.equal(canceled.data.status, "CANCELED");
  const events = snapshot().events.slice(-2);
  assert.deepEqual(events.map((event) => event.eventType), ["ABERTURA_CANCELADA", "ABERTURA_CANCELADA_POR_ADMIN"]);
  const event = events[1];
  assert.equal(event.initiatingUserId, owner.id);
  assert.equal(event.actorUserId, manager.id);
  assert.equal(event.payload.initiatingUserPublicId, owner.publicId);
  assert.equal(event.payload.canceledByUserPublicId, manager.publicId);
  assert.equal(event.payload.visibleNumber, "OS-000001");
  assert.equal(event.payload.action, "CANCEL_OPENING");
  await assert.rejects(service.cancel(opened.data.publicId, manager), (error) => error.status === 409 && error.response.code === "OPENING_NOT_IN_PROGRESS");
});

test("falha no evento reverte abertura, alocação e contador", async () => {
  const { service, snapshot, failNextEvent } = harness();
  failNextEvent();
  await assert.rejects(service.create(actor(1, ["service_orders.opening.create"])), /Falha simulada/);
  assert.equal(snapshot().openings.length, 0);
  assert.equal(snapshot().allocations.size, 0);
  assert.equal(snapshot().events.length, 0);
  assert.equal(snapshot().next, 1n);
  assert.equal(snapshot().highest, 0n);
});

test("falha no evento de cancelamento preserva abertura e reserva", async () => {
  const { service, snapshot, failNextEvent } = harness();
  const user = actor(1, ["service_orders.opening.create"]);
  const opened = await service.create(user);
  failNextEvent();
  await assert.rejects(service.cancel(opened.data.publicId, user), /Falha simulada/);
  assert.equal(snapshot().openings[0].status, "IN_PROGRESS");
  assert.equal(snapshot().openings[0].activeForUserId, user.id);
  assert.equal(snapshot().allocations.get(1n).status, "RESERVED");
  assert.equal(snapshot().next, 2n);
  assert.equal(snapshot().events.length, 1);
});

test("falha no segundo evento de cancelamento administrativo reverte toda a transação", async () => {
  const { service, snapshot, failOnEventType } = harness();
  const owner = actor(1, ["service_orders.opening.create"]);
  const manager = actor(2, ["service_orders.opening.manage"]);
  const opened = await service.create(owner);
  failOnEventType("ABERTURA_CANCELADA_POR_ADMIN");
  await assert.rejects(service.cancel(opened.data.publicId, manager), /Falha simulada/);
  assert.equal(snapshot().openings[0].status, "IN_PROGRESS");
  assert.equal(snapshot().allocations.get(1n).status, "RESERVED");
  assert.equal(snapshot().events.length, 1);
});

test("falha fechado ao reutilizar alocação com OS ou contador fora da ponta", async () => {
  const { service, snapshot, injectOrder, injectAllocation, setNumberControl } = harness();
  setNumberControl(1n, 1n);
  injectAllocation(1n, { numberValue: 1n, status: "RELEASED", openingId: null });
  injectOrder({ id: 1, numberValue: 1n, openingId: 77 });
  await assert.rejects(service.create(actor(1)), (error) => error.status === 409);
  assert.equal(snapshot().openings.length, 0);
  const other = harness();
  other.setNumberControl(1n, 2n);
  other.injectAllocation(1n, { numberValue: 1n, status: "RELEASED", openingId: null });
  await assert.rejects(other.service.create(actor(1)), (error) => error.status === 409);
  assert.equal(other.snapshot().openings.length, 0);
});

test("falha fechado ao cancelar abertura com OS vinculada", async () => {
  const { service, snapshot, injectOrder } = harness();
  const owner = actor(1, ["service_orders.opening.create"]);
  const opened = await service.create(owner);
  injectOrder({ id: 1, numberValue: 1n, openingId: 1 });
  await assert.rejects(service.cancel(opened.data.publicId, owner), (error) => error.status === 409);
  assert.equal(snapshot().openings[0].status, "IN_PROGRESS");
  assert.equal(snapshot().allocations.get(1n).status, "RESERVED");
});

test("identificador público inválido é rejeitado sem consultar outra abertura", async () => {
  const { service } = harness();
  await assert.rejects(service.getByPublicId("invalido", actor(1)), (error) => error.status === 400);
});
