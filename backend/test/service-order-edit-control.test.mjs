import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { ServiceOrderEditControlService, EDIT_CONTROL_TTL_MS } from "../dist/modules/service-orders/service-order-edit-control.service.js";

const orderPublicId = "11111111-1111-4111-8111-111111111111";
const tokenA1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const tokenA2 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const tokenB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function fixture() {
  const users = new Map([
    [1, { publicId: "10000000-0000-4000-8000-000000000001", username: "editor.a" }],
    [2, { publicId: "20000000-0000-4000-8000-000000000002", username: "editor.b" }],
    [3, { publicId: "30000000-0000-4000-8000-000000000003", username: "sem.permissao" }],
  ]);
  const permissions = new Map([[1, ["service_orders.update"]], [2, ["service_orders.update", "service_orders.edit.takeover"]], [3, ["service_orders.update"]]]);
  const state = { control: null, audits: [] };
  const tx = {
    $queryRaw: async (strings) => {
      const sql = strings.join("");
      if (sql.includes("FROM service_orders")) return [{ id: 99 }];
      if (!state.control) return [];
      const holder = state.control.holderUserId === null ? null : users.get(state.control.holderUserId);
      return [{
        id: state.control.id,
        holderUserId: state.control.holderUserId,
        contextTokenHash: state.control.contextTokenHash,
        leaseVersion: state.control.leaseVersion,
        lastHeartbeatAt: state.control.lastHeartbeatAt,
        expiresAt: state.control.expiresAt,
        holderPublicId: holder?.publicId ?? null,
        holderUsername: holder?.username ?? null,
      }];
    },
    serviceOrder: { findFirst: async () => ({ id: 99 }) },
    userPermission: {
      findMany: async ({ where }) => permissions.get(where.userId).filter((code) => where.permission.code.in.includes(code)).map((code) => ({ permission: { code } })),
      findFirst: async ({ where }) => permissions.get(where.userId).includes(where.permission.code) ? { userId: where.userId } : null,
    },
    adminAuditLog: { create: async ({ data }) => { state.audits.push(data); return data; } },
    serviceOrderEditControl: {
      findUnique: async () => state.control ? { ...state.control, holder: state.control.holderUserId === null ? null : users.get(state.control.holderUserId) } : null,
      create: async ({ data }) => { state.control = { id: 1, ...data }; return { ...state.control }; },
      update: async ({ data }) => {
        const next = { ...data };
        if (next.leaseVersion?.increment) next.leaseVersion = state.control.leaseVersion + next.leaseVersion.increment;
        state.control = { ...state.control, ...next };
        return { ...state.control };
      },
    },
  };
  const prisma = { $transaction: (callback) => callback(tx) };
  const service = new ServiceOrderEditControlService(prisma);
  const a = { id: 1, publicId: users.get(1).publicId, username: "editor.a", isAdmin: false };
  const b = { id: 2, publicId: users.get(2).publicId, username: "editor.b", isAdmin: false };
  return { service, state, a, b };
}

test("controle distingue usuário e contexto por aba, takeover invalida a origem e heartbeat renova dez minutos", async () => {
  const { service, state, a, b } = fixture();
  const acquired = await service.acquire(orderPublicId, tokenA1, a);
  assert.equal(acquired.data.acquired, true);
  assert.equal(acquired.data.heartbeatIntervalSeconds, 60);
  assert.equal(acquired.data.generation, 1);
  assert.equal(state.control.contextTokenHash.includes(tokenA1), false, "token bruto nunca fica persistido");

  const sameUserOtherTab = await service.state(orderPublicId, a, tokenA2);
  assert.equal(sameUserOtherTab.data.held, true);
  assert.equal(sameUserOtherTab.data.isCurrentContext, false);
  assert.equal(sameUserOtherTab.data.holder.username, "editor.a");
  assert.equal(sameUserOtherTab.data.isSameUser, true);
  await assert.rejects(service.acquire(orderPublicId, tokenA2, a), (error) => error.getStatus() === 409 && error.getResponse().code === "SERVICE_ORDER_EDIT_CONTROL_HELD");

  const transferred = await service.takeover(orderPublicId, tokenA2, a);
  assert.equal(transferred.data.acquired, true, "same user transfers control without special permission");
  assert.equal(state.control.holderUserId, a.id);
  assert.equal(state.control.contextTokenHash, createHash("sha256").update(tokenA2).digest("hex"));
  assert.equal(state.control.leaseVersion, 2);
  assert.equal(state.audits.length, 0, "same-user tab transfer does not create administrative noise");
  await assert.rejects(service.heartbeat(orderPublicId, tokenA1, a), (error) => error.getStatus() === 409 && error.getResponse().code === "SERVICE_ORDER_EDIT_CONTROL_LOST");

  await assert.rejects(service.takeover(orderPublicId, tokenB, { ...b, id: 3, username: "sem.permissao" }), (error) => error.getStatus() === 403);
  const before = Date.now();
  await service.takeover(orderPublicId, tokenB, b);
  assert.equal(state.control.holderUserId, b.id);
  assert.equal(state.control.leaseVersion, 3);
  assert.equal(state.audits.length, 1);
  assert.equal(state.audits[0].eventCode, "SERVICE_ORDER_EDIT_TAKEOVER");
  assert.equal(state.audits[0].targetUserId, a.id);
  assert.equal(state.audits[0].detailsJson.previousEditor.contextGeneration, 2);
  assert.equal(state.audits[0].detailsJson.newEditor.contextGeneration, 3);
  assert.equal(state.control.expiresAt.getTime() - state.control.lastHeartbeatAt.getTime(), EDIT_CONTROL_TTL_MS);
  assert.equal(state.control.lastHeartbeatAt.getTime() >= before, true);
  assert.equal((await service.state(orderPublicId, a, tokenA1)).data.isCurrentContext, false);
  assert.equal((await service.state(orderPublicId, b, tokenB)).data.isCurrentContext, true);

  await assert.rejects(service.heartbeat(orderPublicId, tokenA1, a), (error) => error.getStatus() === 409 && error.getResponse().code === "SERVICE_ORDER_EDIT_CONTROL_LOST");
  assert.equal((await service.release(orderPublicId, tokenA1, a)).data.released, false, "liberação antiga não remove o controle novo");
  const previousExpiry = state.control.expiresAt.getTime();
  await service.heartbeat(orderPublicId, tokenB, b);
  assert.ok(state.control.expiresAt.getTime() >= previousExpiry);
  assert.equal((await service.release(orderPublicId, tokenB, b)).data.released, true);
  assert.equal(state.control.holderUserId, null);
  assert.equal(state.control.contextTokenHash, null);
  assert.equal(state.control.leaseVersion, 4);
});

test("takeover não transfere controle expirado nem a própria aba", async () => {
  const { service, state, a } = fixture();
  await service.acquire(orderPublicId, tokenA1, a);
  await assert.rejects(service.takeover(orderPublicId, tokenA1, a), (error) => error.getStatus() === 409 && error.getResponse().code === "SERVICE_ORDER_EDIT_CONTROL_ALREADY_OWNED");
  state.control.expiresAt = new Date(Date.now() - 1);
  await assert.rejects(service.takeover(orderPublicId, tokenA2, a), (error) => error.getStatus() === 409 && error.getResponse().code === "SERVICE_ORDER_EDIT_CONTROL_NOT_HELD");
  assert.equal(state.control.contextTokenHash, createHash("sha256").update(tokenA1).digest("hex"));
});

test("controle expirado é tratado como livre e pode ser adquirido sem job de limpeza", async () => {
  const { service, state, a, b } = fixture();
  await service.acquire(orderPublicId, tokenA1, a);
  state.control.expiresAt = new Date(Date.now() - 1);
  const status = await service.state(orderPublicId, b);
  assert.equal(status.data.held, false);
  assert.equal((await service.acquire(orderPublicId, tokenB, b)).data.acquired, true);
  assert.equal(state.control.holderUserId, b.id);
  assert.equal(state.control.leaseVersion, 2);
});
