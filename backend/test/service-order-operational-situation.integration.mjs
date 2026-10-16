import "reflect-metadata";
import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import * as argon2 from "argon2";

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
  const permissionCodes = await db.permission.findMany({ where: { code: { in: ["service_orders.opening.create", "service_orders.create", "service_orders.situation.update", "service_orders.read"] } }, select: { code: true } });
  assert.equal(permissionCodes.length, 4);

  const suffix = randomBytes(5).toString("hex");
  const password = randomBytes(24).toString("base64url");
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const admin = await db.user.create({ data: { username: `situation_admin_${suffix}`, passwordHash, isActive: true, isAdmin: true } });
  async function user(label, codes) {
    const created = await db.user.create({ data: { username: `situation_${label}_${suffix}`, passwordHash, isActive: true } });
    for (const code of codes) {
      const permission = await db.permission.findUniqueOrThrow({ where: { code } });
      await db.userPermission.create({ data: { userId: created.id, permissionId: permission.id, grantedByUserId: admin.id } });
    }
    return created;
  }
  const writer = await user("writer", ["service_orders.opening.create", "service_orders.create", "service_orders.situation.update"]);
  const writer2 = await user("writer2", ["service_orders.opening.create", "service_orders.create", "service_orders.situation.update"]);
  const reader = await user("reader", ["service_orders.read"]);
  const outsider = await user("outsider", []);
  const customer = await db.person.create({ data: { personType: "PF", name: `CLIENTE ${suffix}`, roles: { create: { role: "CUSTOMER" } } } });
  const type = await db.equipmentType.create({ data: { name: `TIPO ${suffix}` } });
  const brand = await db.equipmentBrand.create({ data: { name: `MARCA ${suffix}` } });
  const equipment = await db.equipment.create({ data: { ownerId: customer.id, typeId: type.id, brandId: brand.id,
    model: "MODELO ORIGINAL", serialNumber: `SITUATION-${suffix}` } });

  await app.listen(0, "127.0.0.1");
  const base = `http://127.0.0.1:${app.getHttpServer().address().port}/api/v1`;
  async function request(method, path, options = {}) {
    const headers = {};
    if (options.cookie) headers.cookie = options.cookie;
    if (options.csrf) headers["x-csrf-token"] = options.csrf;
    if (options.editToken) headers["x-service-order-edit-token"] = options.editToken;
    const revisionTarget = path.match(/^\/service-orders\/([0-9a-f-]+)\/operational-situation$/iu);
    if (revisionTarget && method === "PATCH") {
      const current = await db.serviceOrder.findUnique({ where: { publicId: revisionTarget[1] }, select: { updatedAt: true } });
      if (current) headers["x-service-order-revision"] = current.updatedAt.toISOString();
    }
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
  const writer2Session = await login(writer2);
  const readerSession = await login(reader);
  const outsiderSession = await login(outsider);
  const adminSession = await login(admin);
  const triageStatus = await db.serviceOrderStatus.findUniqueOrThrow({ where: { id: 1 } });
  const repairAuthorizedStatus = await db.serviceOrderStatus.findUniqueOrThrow({ where: { name: "AUTORIZADO REPARO" } });
  const awaitingPartsStatus = await db.serviceOrderStatus.findUniqueOrThrow({ where: { name: "AGUARDANDO COMPRA DE PEÇA" } });
  async function opening(session = writerSession) {
    const result = await request("POST", "/service-orders/openings", session);
    status(result, 201, "create opening");
    return result.body.data;
  }

  const draft = await opening();
  status(await request("PATCH", `/service-orders/openings/${draft.publicId}`, {
    ...writerSession, body: { customerPublicId: customer.publicId, equipmentPublicId: equipment.publicId },
  }), 200, "prepare confirmation");
  const confirmation = await request("POST", `/service-orders/openings/${draft.publicId}/confirm`, { ...writerSession, body: {} });
  status(confirmation, 201, "confirm opening");
  const confirmed = confirmation.body.data;
  const openingOnly = await opening();
  const path = `/service-orders/${confirmed.publicId}/operational-situation`;
  const orderPath = `/service-orders/${confirmed.publicId}`;
  const writerEditSession = { ...writerSession, editToken: randomUUID() };
  status(await request("POST", `${orderPath}/edit-control`, writerEditSession), 201, "writer acquires edit control");

  status(await request("PATCH", path, { body: { operationalStatusPublicId: repairAuthorizedStatus.publicId } }), 401, "anonymous update");
  status(await request("PATCH", path, { cookie: writerSession.cookie, body: { operationalStatusPublicId: repairAuthorizedStatus.publicId } }), 403, "missing csrf");
  status(await request("PATCH", path, { ...outsiderSession, body: { operationalStatusPublicId: repairAuthorizedStatus.publicId } }), 403, "missing permission");
  const invalid = await request("PATCH", path, { ...writerEditSession, body: { operationalStatusPublicId: "TRIAGEM" } });
  status(invalid, 400, "invalid status identifier");
  assert.equal(invalid.body.code, "INVALID_SITUATION");
  status(await request("PATCH", `/service-orders/${openingOnly.publicId}/operational-situation`, {
    ...writerEditSession, body: { operationalStatusPublicId: repairAuthorizedStatus.publicId },
  }), 404, "opening public id is not an order");
  const missing = await request("PATCH", "/service-orders/00000000-0000-4000-8000-000000000000/operational-situation", {
    ...writerSession, body: { operationalStatusPublicId: repairAuthorizedStatus.publicId },
  });
  status(missing, 404, "missing order");
  assert.equal(missing.body.code, "SERVICE_ORDER_NOT_FOUND");

  const before = await db.serviceOrder.findUniqueOrThrow({ where: { publicId: confirmed.publicId } });
  const eventCount = await db.serviceOrderEvent.count({ where: { serviceOrderId: before.id } });
  const updated = await request("PATCH", path, { ...writerEditSession, body: { operationalStatusPublicId: repairAuthorizedStatus.publicId } });
  status(updated, 200, "update operational situation");
  assert.equal(updated.body.data.operationalSituation, "AUTORIZADO REPARO");
  assert.equal(updated.body.data.macroStatus, "ABERTA");
  assert.equal(updated.body.data.numberValue, confirmed.numberValue);
  assert.equal(updated.body.data.visibleNumber, confirmed.visibleNumber);
  for (const forbidden of ["id", "serviceOrderId", "openingId", "customerId", "equipmentId", "createdByUserId"]) {
    assert.equal(Object.hasOwn(updated.body.data, forbidden), false);
  }
  const stored = await db.serviceOrder.findUniqueOrThrow({ where: { id: before.id } });
  assert.equal(stored.macroStatus, before.macroStatus);
  assert.deepEqual(stored.customerSnapshotJson, before.customerSnapshotJson);
  assert.deepEqual(stored.equipmentSnapshotJson, before.equipmentSnapshotJson);
  assert.equal(stored.customerId, before.customerId);
  assert.equal(stored.equipmentId, before.equipmentId);
  const events = await db.serviceOrderEvent.findMany({ where: { serviceOrderId: before.id, eventType: "SITUACAO_OPERACIONAL_ALTERADA" } });
  assert.equal(events.length, 1);
  assert.equal(events[0].actorUserId, writer.id);
  assert.equal(events[0].numberValue, before.numberValue);
  assert.equal(events[0].payload.previousOperationalStatusPublicId, triageStatus.publicId);
  assert.equal(events[0].payload.previousOperationalStatus, "TRIAGEM");
  assert.equal(events[0].payload.newOperationalStatusPublicId, repairAuthorizedStatus.publicId);
  assert.equal(events[0].payload.newOperationalStatus, "AUTORIZADO REPARO");
  assert.ok(events[0].occurredAt instanceof Date);

  const eventCountAfterChange = await db.serviceOrderEvent.count({ where: { serviceOrderId: before.id } });
  const noOp = await request("PATCH", path, { ...writerEditSession, body: { operationalStatusPublicId: repairAuthorizedStatus.publicId } });
  status(noOp, 200, "same situation is a no-op");
  assert.equal(noOp.body.data.operationalSituation, "AUTORIZADO REPARO");
  assert.equal(await db.serviceOrderEvent.count({ where: { serviceOrderId: before.id } }), eventCountAfterChange);
  assert.equal(eventCountAfterChange, eventCount + 1);

  const read = await request("GET", `/service-orders/${confirmed.publicId}`, readerSession);
  status(read, 200, "GET reflects the updated situation");
  assert.equal(read.body.data.operationalSituation, "AUTORIZADO REPARO");
  status(await request("PATCH", `/service-orders/${confirmed.publicId}/situation`, {
    ...adminSession, body: { operationalStatusPublicId: triageStatus.publicId },
  }), 404, "old alias is not implemented");
  const adminEditSession = { ...adminSession, editToken: randomUUID() };
  status(await request("POST", `${orderPath}/edit-control/takeover`, adminEditSession), 201, "Admin takes over control");
  const adminUpdate = await request("PATCH", path, { ...adminEditSession, body: { operationalStatusPublicId: awaitingPartsStatus.publicId } });
  status(adminUpdate, 200, "admin has global access");
  assert.equal(adminUpdate.body.data.operationalSituation, "AGUARDANDO COMPRA DE PEÇA");
  const adminEvent = await db.serviceOrderEvent.findFirst({ where: { serviceOrderId: before.id, eventType: "SITUACAO_OPERACIONAL_ALTERADA" }, orderBy: { occurredAt: "desc" } });
  assert.equal(adminEvent.actorUserId, admin.id);
  assert.equal(adminEvent.payload.previousOperationalStatusPublicId, repairAuthorizedStatus.publicId);
  assert.equal(adminEvent.payload.previousOperationalStatus, "AUTORIZADO REPARO");
  assert.equal(adminEvent.payload.newOperationalStatusPublicId, awaitingPartsStatus.publicId);
  assert.equal(adminEvent.payload.newOperationalStatus, "AGUARDANDO COMPRA DE PEÇA");

  const lifecycleCreate = await request("POST", "/service-order-statuses", { ...adminSession,
    body: { name: `Status de validação ${suffix}`, technicalCompletion: "NOT_COMPLETED" } });
  status(lifecycleCreate, 201, "admin creates a status");
  const lifecycleStatus = lifecycleCreate.body.data;
  const lifecycleStatusRow = await db.serviceOrderStatus.findUniqueOrThrow({ where: { publicId: lifecycleStatus.publicId } });
  const assignCustom = await request("PATCH", path, { ...adminEditSession, body: { operationalStatusPublicId: lifecycleStatus.publicId } });
  status(assignCustom, 200, "assign custom active status");
  const usedStatus = await request("GET", "/service-order-statuses", adminSession);
  status(usedStatus, 200, "read status usage");
  assert.equal(usedStatus.body.data.find((entry) => entry.publicId === lifecycleStatus.publicId).technicalCompletionMutable, false);
  const immutable = await request("PATCH", `/service-order-statuses/${lifecycleStatus.publicId}`, { ...adminSession,
    body: { name: lifecycleStatus.name, technicalCompletion: "COMPLETED_WITH_REPAIR", isActive: true, expectedVersion: 1 } });
  status(immutable, 409, "used status technical completion is immutable");
  assert.equal(immutable.body.code, "SERVICE_ORDER_STATUS_COMPLETION_IMMUTABLE");
  const deactivated = await request("PATCH", `/service-order-statuses/${lifecycleStatus.publicId}`, { ...adminSession,
    body: { name: lifecycleStatus.name, technicalCompletion: "NOT_COMPLETED", isActive: false, expectedVersion: 1 } });
  status(deactivated, 200, "deactivate used status");
  assert.equal(deactivated.body.data.isActive, false);
  assert.equal((await db.serviceOrder.findUniqueOrThrow({ where: { publicId: confirmed.publicId } })).operationalStatusId, lifecycleStatusRow.id);
  const currentDetail = await request("GET", `/service-orders/${confirmed.publicId}`, readerSession);
  status(currentDetail, 200, "inactive current status remains visible");
  assert.equal(currentDetail.body.data.operationalSituation, lifecycleStatus.name);

  const secondDraft = await opening(writer2Session);
  status(await request("PATCH", `/service-orders/openings/${secondDraft.publicId}`, { ...writer2Session,
    body: { customerPublicId: customer.publicId, equipmentPublicId: equipment.publicId } }), 200, "prepare second confirmation");
  const secondConfirmation = await request("POST", `/service-orders/openings/${secondDraft.publicId}/confirm`, { ...writer2Session, body: {} });
  status(secondConfirmation, 201, "confirm second opening");
  const secondOrder = secondConfirmation.body.data;
  const secondPath = `/service-orders/${secondOrder.publicId}/operational-situation`;
  const secondEditSession = { ...writer2Session, editToken: randomUUID() };
  status(await request("POST", `/service-orders/${secondOrder.publicId}/edit-control`, secondEditSession), 201, "second order edit control");
  const inactiveTarget = await request("PATCH", secondPath, { ...secondEditSession, body: { operationalStatusPublicId: lifecycleStatus.publicId } });
  status(inactiveTarget, 409, "inactive status cannot be assigned");
  assert.equal(inactiveTarget.body.code, "SERVICE_ORDER_STATUS_INACTIVE");
  const reactivated = await request("PATCH", `/service-order-statuses/${lifecycleStatus.publicId}`, { ...adminSession,
    body: { name: lifecycleStatus.name, technicalCompletion: "NOT_COMPLETED", isActive: true, expectedVersion: 2 } });
  status(reactivated, 200, "reactivate status");
  assert.equal(reactivated.body.data.isActive, true);
  assert.equal((await db.serviceOrder.findUniqueOrThrow({ where: { publicId: confirmed.publicId } })).operationalStatusId, lifecycleStatusRow.id);
  assert.equal((await db.serviceOrder.findUniqueOrThrow({ where: { publicId: secondOrder.publicId } })).operationalStatusId, triageStatus.id);
  const reassignAfterActivation = await request("PATCH", secondPath, { ...secondEditSession, body: { operationalStatusPublicId: lifecycleStatus.publicId } });
  status(reassignAfterActivation, 200, "reactivated status can be assigned");
  console.log("Service order operational situation HTTP/MySQL integration passed on gestor_os_opening_test.");
} finally {
  await app.close();
}
