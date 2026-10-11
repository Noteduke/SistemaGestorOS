import "reflect-metadata";
import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import * as argon2 from "argon2";

// Resolve the configured project URL only to a disposable database before app boot.
const configured = new URL(process.env.DATABASE_URL ?? "");
assert.equal(configured.protocol, "mysql:");
assert.equal(configured.hostname, "localhost");
assert.equal(configured.username, "gestor_os");
assert.equal(configured.pathname, "/gestor_os");
const isolated = new URL(configured);
isolated.pathname = "/gestor_os_opening_test";
process.env.DATABASE_URL = isolated.href;
delete process.env.SHADOW_DATABASE_URL;

const { NestFactory } = await import("@nestjs/core");
const { AppModule } = await import("../dist/app.module.js");
const { PrismaService } = await import("../dist/infrastructure/prisma/prisma.service.js");
const app = await NestFactory.create(AppModule, { logger: false });
app.setGlobalPrefix("api/v1");

try {
  await app.init();
  const db = app.get(PrismaService);
  const selected = await db.$queryRaw`SELECT DATABASE() AS name`;
  assert.equal(selected[0]?.name, "gestor_os_opening_test");
  assert.equal(await db.permission.count(), 32);

  const suffix = randomBytes(5).toString("hex");
  const password = randomBytes(24).toString("base64url");
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const admin = await db.user.create({ data: { username: `events_admin_${suffix}`, passwordHash, isActive: true, isAdmin: true } });
  async function user(label, codes = []) {
    const created = await db.user.create({ data: { username: `events_${label}_${suffix}`, passwordHash, isActive: true } });
    for (const code of codes) {
      const permission = await db.permission.findUniqueOrThrow({ where: { code } });
      await db.userPermission.create({ data: { userId: created.id, permissionId: permission.id, grantedByUserId: admin.id } });
    }
    return created;
  }
  const writer = await user("writer", [
    "service_orders.opening.create", "service_orders.create", "service_orders.situation.update",
    "service_orders.assignment.manage", "equipment.create", "equipment.transfer_ownership",
  ]);
  const reader = await user("reader", ["service_orders.events.read"]);
  const outsider = await user("outsider");
  const assignee = await user("assignee");
  const customer = await db.person.create({ data: { personType: "PF", name: `CLIENTE ${suffix}`, roles: { create: { role: "CUSTOMER" } } } });
  const previousOwner = await db.person.create({ data: { personType: "PF", name: `TITULAR ${suffix}`, roles: { create: { role: "CUSTOMER" } } } });
  const type = await db.equipmentType.create({ data: { name: `TIPO ${suffix}` } });
  const brand = await db.equipmentBrand.create({ data: { name: `MARCA ${suffix}` } });
  const equipment = await db.equipment.create({ data: { ownerId: previousOwner.id, typeId: type.id, brandId: brand.id,
    model: "MODELO TRANSFERÊNCIA", serialNumber: `EVENTS-${suffix}` } });

  await app.listen(0, "127.0.0.1");
  const base = `http://127.0.0.1:${app.getHttpServer().address().port}/api/v1`;
  async function request(method, path, options = {}) {
    const headers = {};
    if (options.cookie) headers.cookie = options.cookie;
    if (options.csrf) headers["x-csrf-token"] = options.csrf;
    if (options.body !== undefined) headers["content-type"] = "application/json";
    const response = await fetch(base + path, { method, headers, body: options.body === undefined ? undefined : JSON.stringify(options.body) });
    const body = await response.text();
    return { status: response.status, body: body ? JSON.parse(body) : null, headers: response.headers };
  }
  function cookie(headers, name) {
    const value = (headers.getSetCookie?.() ?? [headers.get("set-cookie")]).find((item) => item?.startsWith(`${name}=`));
    assert.ok(value);
    return value.split(";")[0];
  }
  async function login(account) {
    const pre = await request("GET", "/auth/csrf");
    assert.equal(pre.status, 200);
    const result = await request("POST", "/auth/login", { cookie: cookie(pre.headers, "gos_pre_auth"),
      csrf: pre.body.data.csrfToken, body: { username: account.username, password } });
    assert.equal(result.status, 201);
    return { cookie: cookie(result.headers, "gos_session"), csrf: result.body.data.csrfToken };
  }
  function status(result, expected, label) {
    assert.equal(result.status, expected, `${label}: ${result.status} ${result.body?.code}`);
  }
  const writerSession = await login(writer);
  const readerSession = await login(reader);
  const outsiderSession = await login(outsider);
  const adminSession = await login(admin);

  async function opening() {
    const result = await request("POST", "/service-orders/openings", writerSession);
    status(result, 201, "create opening");
    return result.body.data;
  }
  async function confirmTransferOrder() {
    const draft = await opening();
    status(await request("PATCH", `/service-orders/openings/${draft.publicId}`, { ...writerSession,
      body: { customerPublicId: customer.publicId, equipmentPublicId: equipment.publicId, ownershipDecision: "TRANSFER_TO_CUSTOMER" } }), 200, "prepare transfer");
    const confirmed = await request("POST", `/service-orders/openings/${draft.publicId}/confirm`, { ...writerSession, body: {} });
    status(confirmed, 201, "confirm transfer order");
    return { draft, order: confirmed.body.data };
  }
  async function confirmNewEquipmentOrder() {
    const draft = await opening();
    status(await request("PATCH", `/service-orders/openings/${draft.publicId}`, { ...writerSession, body: {
      customerPublicId: customer.publicId,
      equipmentDraft: { typePublicId: type.publicId, brandPublicId: brand.publicId, model: "MODELO NOVO",
        serialIdentificationStatus: "NOT_IDENTIFIED", serialNumber: null },
    } }), 200, "prepare new equipment");
    const confirmed = await request("POST", `/service-orders/openings/${draft.publicId}/confirm`, { ...writerSession, body: {} });
    status(confirmed, 201, "confirm new equipment order");
    return confirmed.body.data;
  }

  const { draft, order } = await confirmTransferOrder();
  const newEquipmentOrder = await confirmNewEquipmentOrder();
  const path = `/service-orders/${order.publicId}/events`;

  status(await request("GET", path), 401, "anonymous read");
  status(await request("GET", path, outsiderSession), 403, "missing permission");
  status(await request("GET", `/service-orders/${draft.publicId}/events?page=1&pageSize=20`, readerSession), 404, "opening is not an order");
  const missing = await request("GET", "/service-orders/00000000-0000-4000-8000-000000000000/events?page=1&pageSize=20", readerSession);
  status(missing, 404, "missing order");
  assert.equal(missing.body.code, "SERVICE_ORDER_NOT_FOUND");
  for (const query of ["", "?page=0&pageSize=20", "?page=1&pageSize=101", "?page=1&pageSize=20&sort=asc"]) {
    const invalid = await request("GET", `${path}${query}`, readerSession);
    status(invalid, 400, "invalid pagination/query");
    assert.ok(["INVALID_PAGINATION", "UNSUPPORTED_QUERY"].includes(invalid.body.code));
  }

  const orderBefore = await db.serviceOrder.findUniqueOrThrow({ where: { publicId: order.publicId } });
  const eventCountBefore = await db.serviceOrderEvent.count({ where: { OR: [
    { serviceOrderId: orderBefore.id }, { openingId: orderBefore.openingId },
  ] } });
  status(await request("PATCH", `/service-orders/${order.publicId}/operational-situation`, { ...writerSession,
    body: { operationalSituation: "REPAIR_AUTHORIZED" } }), 200, "change situation for event history");
  status(await request("PUT", `/service-orders/${order.publicId}/assignments`, { ...writerSession,
    body: { userPublicIds: [assignee.publicId] } }), 200, "change assignments for event history");

  const preReadOrder = await db.serviceOrder.findUniqueOrThrow({ where: { publicId: order.publicId } });
  const preReadEventCount = await db.serviceOrderEvent.count({ where: { OR: [
    { serviceOrderId: preReadOrder.id }, { openingId: preReadOrder.openingId },
  ] } });
  const preReadAssignmentCount = await db.serviceOrderAssignment.count({ where: { serviceOrderId: preReadOrder.id } });
  const all = await request("GET", `${path}?page=1&pageSize=100`, readerSession);
  status(all, 200, "reader can GET without CSRF");
  assert.equal(all.body.pagination.total, preReadEventCount);
  const eventTypes = all.body.data.map((event) => event.eventType);
  for (const expected of ["ABERTURA_EM_ANDAMENTO_CRIADA", "TITULARIDADE_TRANSFERIDA_DURANTE_ABERTURA", "ABERTURA_CONFIRMADA",
    "SITUACAO_OPERACIONAL_ALTERADA", "ATRIBUICOES_ALTERADAS"]) assert.ok(eventTypes.includes(expected), `missing ${expected}`);
  assert.deepEqual(all.body.pagination, { page: 1, pageSize: 100, total: preReadEventCount, totalPages: 1 });
  assert.equal(all.body.data[0].eventType, "ATRIBUICOES_ALTERADAS", "events are newest-first");
  for (let i = 1; i < all.body.data.length; i++) {
    assert.ok(all.body.data[i - 1].occurredAt >= all.body.data[i].occurredAt);
  }
  const expectedEventOrder = await db.serviceOrderEvent.findMany({
    where: { OR: [{ serviceOrderId: preReadOrder.id }, { openingId: preReadOrder.openingId }] },
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }], select: { eventType: true, occurredAt: true },
  });
  assert.deepEqual(all.body.data.map(({ eventType, occurredAt }) => [eventType, new Date(occurredAt).toISOString()]),
    expectedEventOrder.map(({ eventType, occurredAt }) => [eventType, occurredAt.toISOString()]));
  for (const event of all.body.data) {
    assert.equal(typeof event.visibleNumber, "string");
    assert.equal(typeof event.numberValue, "string");
    assert.equal(typeof event.actor.publicId, "string");
    assert.equal(typeof event.actor.username, "string");
    for (const forbidden of ["id", "serviceOrderId", "openingId", "actorUserId", "initiatingUserId"]) {
      assert.equal(Object.hasOwn(event, forbidden), false);
      assert.equal(Object.hasOwn(event.actor, forbidden), false);
      assert.equal(Object.hasOwn(event.payload ?? {}, forbidden), false);
    }
  }
  const confirmationEvent = all.body.data.find((event) => event.eventType === "ABERTURA_CONFIRMADA");
  assert.equal(confirmationEvent.payload.serviceOrderPublicId, order.publicId);
  assert.equal(confirmationEvent.payload.customerPublicId, customer.publicId);
  const transferEvent = all.body.data.find((event) => event.eventType === "TITULARIDADE_TRANSFERIDA_DURANTE_ABERTURA");
  assert.equal(transferEvent.payload.previousOwnerPublicId, previousOwner.publicId);
  assert.equal(transferEvent.payload.newOwnerPublicId, customer.publicId);

  const firstPage = await request("GET", `${path}?page=1&pageSize=2`, readerSession);
  const secondPage = await request("GET", `${path}?page=2&pageSize=2`, readerSession);
  status(firstPage, 200, "first event page");
  status(secondPage, 200, "second event page");
  assert.equal(firstPage.body.pagination.totalPages, Math.ceil((eventCountBefore + 2) / 2));
  assert.equal(new Set([...firstPage.body.data, ...secondPage.body.data].map((event) => `${event.eventType}:${event.occurredAt}`)).size, 4);

  const newEquipmentEvents = await request("GET", `/service-orders/${newEquipmentOrder.publicId}/events?page=1&pageSize=20`, readerSession);
  status(newEquipmentEvents, 200, "events for newly created equipment order");
  assert.ok(newEquipmentEvents.body.data.some((event) => event.eventType === "EQUIPAMENTO_CRIADO_DURANTE_ABERTURA"));

  const afterReadOrder = await db.serviceOrder.findUniqueOrThrow({ where: { id: preReadOrder.id } });
  assert.equal(afterReadOrder.macroStatus, preReadOrder.macroStatus);
  assert.equal(afterReadOrder.operationalSituation, preReadOrder.operationalSituation);
  assert.equal(afterReadOrder.updatedAt.toISOString(), preReadOrder.updatedAt.toISOString());
  assert.deepEqual(afterReadOrder.customerSnapshotJson, preReadOrder.customerSnapshotJson);
  assert.deepEqual(afterReadOrder.equipmentSnapshotJson, preReadOrder.equipmentSnapshotJson);
  assert.equal(afterReadOrder.customerId, preReadOrder.customerId);
  assert.equal(afterReadOrder.equipmentId, preReadOrder.equipmentId);
  assert.equal(await db.serviceOrderEvent.count({ where: { OR: [
    { serviceOrderId: preReadOrder.id }, { openingId: preReadOrder.openingId },
  ] } }), preReadEventCount, "reading events creates no events");
  assert.equal(await db.serviceOrderAssignment.count({ where: { serviceOrderId: preReadOrder.id } }), preReadAssignmentCount);

  const adminRead = await request("GET", `${path}?page=1&pageSize=20`, adminSession);
  status(adminRead, 200, "Admin has global access");
  console.log("Service order events read HTTP/MySQL integration passed on gestor_os_opening_test.");
} finally {
  await app.close();
}
