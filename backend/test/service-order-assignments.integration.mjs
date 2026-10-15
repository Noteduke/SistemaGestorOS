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
  assert.equal(await db.permission.count(), 43);

  const suffix = randomBytes(5).toString("hex");
  const password = randomBytes(24).toString("base64url");
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const admin = await db.user.create({ data: { username: `assign_admin_${suffix}`, passwordHash, isActive: true, isAdmin: true } });
  async function user(label, codes = [], isActive = true) {
    const created = await db.user.create({ data: { username: `assign_${label}_${suffix}`, passwordHash, isActive } });
    for (const code of codes) {
      const permission = await db.permission.findUniqueOrThrow({ where: { code } });
      await db.userPermission.create({ data: { userId: created.id, permissionId: permission.id, grantedByUserId: admin.id } });
    }
    return created;
  }
  const manager = await user("manager", ["service_orders.opening.create", "service_orders.create", "service_orders.assignment.manage"]);
  const reader = await user("reader", ["service_orders.read"]);
  const outsider = await user("outsider");
  const firstAssignee = await user("first_assignee");
  const secondAssignee = await user("second_assignee");
  const inactiveAssignee = await user("inactive_assignee", [], false);
  const customer = await db.person.create({ data: { personType: "PF", name: `CLIENTE ${suffix}`, roles: { create: { role: "CUSTOMER" } } } });
  const type = await db.equipmentType.create({ data: { name: `TIPO ${suffix}` } });
  const brand = await db.equipmentBrand.create({ data: { name: `MARCA ${suffix}` } });
  const equipment = await db.equipment.create({ data: { ownerId: customer.id, typeId: type.id, brandId: brand.id,
    model: "MODELO ORIGINAL", serialNumber: `ASSIGN-${suffix}` } });

  await app.listen(0, "127.0.0.1");
  const base = `http://127.0.0.1:${app.getHttpServer().address().port}/api/v1`;
  async function request(method, path, options = {}) {
    const headers = {};
    if (options.cookie) headers.cookie = options.cookie;
    if (options.csrf) headers["x-csrf-token"] = options.csrf;
    if (options.editToken) headers["x-service-order-edit-token"] = options.editToken;
    const revisionTarget = path.match(/^\/service-orders\/([0-9a-f-]+)\/assignments$/iu);
    if (revisionTarget && ["PUT", "PATCH"].includes(method)) {
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
  const managerSession = await login(manager);
  const readerSession = await login(reader);
  const outsiderSession = await login(outsider);
  const adminSession = await login(admin);
  async function opening() {
    const result = await request("POST", "/service-orders/openings", managerSession);
    status(result, 201, "create opening");
    return result.body.data;
  }

  const draft = await opening();
  status(await request("PATCH", `/service-orders/openings/${draft.publicId}`, {
    ...managerSession, body: { customerPublicId: customer.publicId, equipmentPublicId: equipment.publicId },
  }), 200, "prepare confirmation");
  const confirmation = await request("POST", `/service-orders/openings/${draft.publicId}/confirm`, { ...managerSession, body: {} });
  status(confirmation, 201, "confirm opening");
  const confirmed = confirmation.body.data;
  const orderPath = `/service-orders/${confirmed.publicId}`;
  const assignmentsPath = `${orderPath}/assignments`;
  const managerEditSession = { ...managerSession, editToken: randomUUID() };
  status(await request("POST", `${orderPath}/edit-control`, managerEditSession), 201, "manager acquires edit control");

  status(await request("PUT", assignmentsPath, { body: { userPublicIds: [] } }), 401, "anonymous assignment");
  status(await request("PUT", assignmentsPath, { cookie: managerSession.cookie, body: { userPublicIds: [] } }), 403, "missing csrf");
  status(await request("PUT", assignmentsPath, { ...outsiderSession, body: { userPublicIds: [] } }), 403, "missing permission");
  const duplicate = await request("PUT", assignmentsPath, { ...managerEditSession,
    body: { userPublicIds: [firstAssignee.publicId, firstAssignee.publicId.toUpperCase()] } });
  status(duplicate, 400, "duplicate publicIds");
  const malformed = await request("PUT", assignmentsPath, { ...managerEditSession, body: { userPublicIds: [], note: "not in contract" } });
  status(malformed, 400, "unexpected request field");
  const unknown = await request("PUT", assignmentsPath, { ...managerEditSession,
    body: { userPublicIds: ["00000000-0000-4000-8000-000000000001"] } });
  status(unknown, 409, "unknown user");
  assert.equal(unknown.body.code, "USER_NOT_ELIGIBLE");
  const inactive = await request("PUT", assignmentsPath, { ...managerEditSession, body: { userPublicIds: [inactiveAssignee.publicId] } });
  status(inactive, 409, "inactive user");
  assert.equal(inactive.body.code, "USER_NOT_ELIGIBLE");
  const missing = await request("PUT", "/service-orders/00000000-0000-4000-8000-000000000000/assignments", {
    ...managerEditSession, body: { userPublicIds: [] },
  });
  status(missing, 404, "missing order");
  assert.equal(missing.body.code, "SERVICE_ORDER_NOT_FOUND");

  const openingOnly = await opening();
  status(await request("PUT", `/service-orders/${openingOnly.publicId}/assignments`, { ...managerEditSession, body: { userPublicIds: [] } }), 404, "opening is not an order");
  status(await request("PATCH", assignmentsPath, { ...adminSession, body: { userPublicIds: [] } }), 404, "PATCH alias not implemented");

  const before = await db.serviceOrder.findUniqueOrThrow({ where: { publicId: confirmed.publicId } });
  const initialAssignmentEvents = await db.serviceOrderEvent.count({ where: { serviceOrderId: before.id, eventType: "ATRIBUICOES_ALTERADAS" } });
  assert.deepEqual(confirmed.assignedUserPublicIds, []);
  const one = await request("PUT", assignmentsPath, { ...managerEditSession, body: { userPublicIds: [firstAssignee.publicId] } });
  status(one, 200, "assign one user");
  assert.deepEqual(one.body.data.assignedUserPublicIds, [firstAssignee.publicId]);
  const oneEvent = await db.serviceOrderEvent.findFirst({ where: { serviceOrderId: before.id, eventType: "ATRIBUICOES_ALTERADAS" } });
  assert.equal(oneEvent.actorUserId, manager.id);
  assert.equal(oneEvent.numberValue, before.numberValue);
  assert.deepEqual(oneEvent.payload.previousUserPublicIds, []);
  assert.deepEqual(oneEvent.payload.newUserPublicIds, [firstAssignee.publicId]);
  assert.deepEqual(oneEvent.payload.addedUserPublicIds, [firstAssignee.publicId]);
  assert.deepEqual(oneEvent.payload.removedUserPublicIds, []);

  const two = await request("PUT", assignmentsPath, { ...managerEditSession,
    body: { userPublicIds: [secondAssignee.publicId, firstAssignee.publicId] } });
  status(two, 200, "replace with two users");
  assert.deepEqual(new Set(two.body.data.assignedUserPublicIds), new Set([firstAssignee.publicId, secondAssignee.publicId]));
  const beforeNoOp = await db.serviceOrderEvent.count({ where: { serviceOrderId: before.id, eventType: "ATRIBUICOES_ALTERADAS" } });
  const assignmentRowsBeforeNoOp = await db.serviceOrderAssignment.findMany({ where: { serviceOrderId: before.id }, orderBy: { userId: "asc" } });
  const reordered = await request("PUT", assignmentsPath, { ...managerEditSession,
    body: { userPublicIds: [firstAssignee.publicId, secondAssignee.publicId] } });
  status(reordered, 200, "same set in different order is a no-op");
  assert.equal(await db.serviceOrderEvent.count({ where: { serviceOrderId: before.id, eventType: "ATRIBUICOES_ALTERADAS" } }), beforeNoOp);
  assert.deepEqual(await db.serviceOrderAssignment.findMany({ where: { serviceOrderId: before.id }, orderBy: { userId: "asc" } }), assignmentRowsBeforeNoOp);

  const empty = await request("PUT", assignmentsPath, { ...managerEditSession, body: { userPublicIds: [] } });
  status(empty, 200, "empty list removes all assignments");
  assert.deepEqual(empty.body.data.assignedUserPublicIds, []);
  assert.equal(await db.serviceOrderAssignment.count({ where: { serviceOrderId: before.id } }), 0);
  const emptyEvent = await db.serviceOrderEvent.findFirst({ where: { serviceOrderId: before.id, eventType: "ATRIBUICOES_ALTERADAS" }, orderBy: { occurredAt: "desc" } });
  assert.deepEqual(new Set(emptyEvent.payload.previousUserPublicIds), new Set([firstAssignee.publicId, secondAssignee.publicId]));
  assert.deepEqual(emptyEvent.payload.newUserPublicIds, []);
  assert.deepEqual(new Set(emptyEvent.payload.removedUserPublicIds), new Set([firstAssignee.publicId, secondAssignee.publicId]));

  const adminEditSession = { ...adminSession, editToken: randomUUID() };
  status(await request("POST", `${orderPath}/edit-control/takeover`, adminEditSession), 201, "Admin takes over control");
  const adminAssignment = await request("PUT", assignmentsPath, { ...adminEditSession, body: { userPublicIds: [secondAssignee.publicId] } });
  status(adminAssignment, 200, "admin global assignment permission");
  assert.deepEqual(adminAssignment.body.data.assignedUserPublicIds, [secondAssignee.publicId]);
  assert.equal(await db.serviceOrderEvent.count({ where: { serviceOrderId: before.id, eventType: "ATRIBUICOES_ALTERADAS" } }), initialAssignmentEvents + 4);

  const stored = await db.serviceOrder.findUniqueOrThrow({ where: { id: before.id } });
  assert.equal(stored.macroStatus, before.macroStatus);
  assert.equal(stored.operationalSituation, before.operationalSituation);
  assert.deepEqual(stored.customerSnapshotJson, before.customerSnapshotJson);
  assert.deepEqual(stored.equipmentSnapshotJson, before.equipmentSnapshotJson);
  assert.equal(stored.customerId, before.customerId);
  assert.equal(stored.equipmentId, before.equipmentId);
  assert.equal(stored.numberValue, before.numberValue);
  assert.ok(stored.updatedAt >= before.updatedAt);
  for (const response of [one, two, empty, adminAssignment]) {
    for (const forbidden of ["id", "serviceOrderId", "openingId", "customerId", "equipmentId", "createdByUserId"]) {
      assert.equal(Object.hasOwn(response.body.data, forbidden), false);
    }
  }
  const read = await request("GET", orderPath, readerSession);
  status(read, 200, "GET reflects assignments");
  assert.deepEqual(read.body.data.assignedUserPublicIds, [secondAssignee.publicId]);
  console.log("Service order assignments HTTP/MySQL integration passed on gestor_os_opening_test.");
} finally {
  await app.close();
}
