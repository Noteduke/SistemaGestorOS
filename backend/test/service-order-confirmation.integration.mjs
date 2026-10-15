import "reflect-metadata";
import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import * as argon2 from "argon2";
import mariadb from "mariadb";

// Never permit this test to write to the primary database.
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
  assert.equal(await db.permission.count(), 42);
  const suffix = randomBytes(5).toString("hex");
  const password = randomBytes(24).toString("base64url");
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const admin = await db.user.create({ data: { username: `confirm_admin_${suffix}`, passwordHash, isActive: true, isAdmin: true } });
  async function user(label, codes) {
    const created = await db.user.create({ data: { username: `confirm_${label}_${suffix}`, passwordHash, isActive: true } });
    for (const code of codes) {
      const permission = await db.permission.findUniqueOrThrow({ where: { code } });
      await db.userPermission.create({ data: { userId: created.id, permissionId: permission.id, grantedByUserId: admin.id } });
    }
    return created;
  }
  const owner = await user("owner", ["service_orders.opening.create", "service_orders.opening.read", "service_orders.create", "equipment.create", "equipment.transfer_ownership", "service_orders.assignment.manage"]);
  const outsider = await user("outsider", []);
  const manager = await user("manager", ["service_orders.opening.manage", "service_orders.create"]);
  const customer = await db.person.create({ data: { personType: "PF", name: `CLIENTE ${suffix}`, roles: { create: { role: "CUSTOMER" } }, phones: { create: { number: "11999999999", isPrimary: true } }, emails: { create: { address: `client_${suffix}@example.test`, isPrimary: true } } } });
  const other = await db.person.create({ data: { personType: "PF", name: `OUTRO ${suffix}`, roles: { create: { role: "CUSTOMER" } } } });
  const type = await db.equipmentType.create({ data: { name: `TIPO ${suffix}` } });
  const brand = await db.equipmentBrand.create({ data: { name: `MARCA ${suffix}` } });
  const unspecifiedBrand = await db.equipmentBrand.upsert({ where: { name: "NÃO INFORMADA" }, update: {}, create: { name: "NÃO INFORMADA" } });
  const existing = await db.equipment.create({ data: { ownerId: customer.id, typeId: type.id, brandId: brand.id, model: "MODELO TESTE", serialNumber: `SERIE-${suffix}` } });

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
    const result = await request("POST", "/auth/login", { cookie: cookie(pre.headers, "gos_pre_auth"), csrf: pre.body.data.csrfToken, body: { username: account.username, password } });
    assert.equal(result.status, 201, `login ${result.body?.code}`);
    return { cookie: cookie(result.headers, "gos_session"), csrf: result.body.data.csrfToken };
  }
  function status(result, expected, label) { assert.equal(result.status, expected, `${label}: ${result.status} ${result.body?.code}`); }
  async function opening(session) {
    const result = await request("POST", "/service-orders/openings", session);
    status(result, 201, "create opening");
    return { ...result.body.data, path: `/service-orders/openings/${result.body.data.publicId}` };
  }
  async function patch(selected, session, body) { status(await request("PATCH", selected.path, { ...session, body }), 200, "patch opening"); }
  async function rejectConfirmationEvent(selected, session) {
    const constraint = `confirmation_event_failure_${suffix}`;
    const ddl = await mariadb.createConnection({ host: isolated.hostname, port: Number(isolated.port || 3306),
      user: decodeURIComponent(isolated.username), password: decodeURIComponent(isolated.password), database: "gestor_os_opening_test" });
    try {
      const targetDatabase = await ddl.query("SELECT DATABASE() AS name");
      assert.equal(targetDatabase[0]?.name, "gestor_os_opening_test");
      await ddl.query(`ALTER TABLE service_order_events ADD CONSTRAINT ${constraint} CHECK (NOT (number_value = ${BigInt(selected.numberValue)} AND event_type = 'ABERTURA_CONFIRMADA'))`);
      try {
        const response = await request("POST", `${selected.path}/confirm`, session);
        assert.ok(response.status >= 400, "Event failure must reject confirmation");
      } finally {
        await ddl.query(`ALTER TABLE service_order_events DROP CHECK ${constraint}`);
      }
    } finally {
      await ddl.end();
    }
  }
  const ownerSession = await login(owner);
  const outsiderSession = await login(outsider);
  const managerSession = await login(manager);
  const adminSession = await login(admin);

  // Existing equipment, snapshots, state, reserved number, response and access control.
  const first = await opening(ownerSession);
  status(await request("POST", `${first.path}/confirm`, ownerSession), 409, "customer required");
  await patch(first, ownerSession, { customerPublicId: customer.publicId });
  status(await request("POST", `${first.path}/confirm`, ownerSession), 409, "equipment required");
  await patch(first, ownerSession, { equipmentPublicId: existing.publicId, complaint: "Queixa" });
  status(await request("POST", `${first.path}/confirm`), 401, "no login");
  status(await request("POST", `${first.path}/confirm`, { cookie: ownerSession.cookie }), 403, "no csrf");
  status(await request("POST", `${first.path}/confirm`, outsiderSession), 404, "other user denied");
  const confirmed = await request("POST", `${first.path}/confirm`, { ...ownerSession, body: { intakeObservations: "Estado físico" } });
  status(confirmed, 201, "confirm existing");
  assert.equal(confirmed.body.data.macroStatus, "ABERTA");
  assert.equal(confirmed.body.data.operationalSituation, "TRIAGEM");
  assert.equal(confirmed.body.data.numberValue, first.numberValue);
  assert.equal(confirmed.body.data.equipment.publicId, existing.publicId);
  assert.equal(confirmed.body.data.customerSnapshot.snapshotVersion, 1);
  assert.equal(confirmed.body.data.customerSnapshot.primaryPhone, "11999999999");
  assert.equal(confirmed.body.data.equipmentSnapshot.model, "MODELO TESTE");
  assert.equal(confirmed.body.data.intakeObservations, "ESTADO FÍSICO");
  assert.equal(Object.hasOwn(confirmed.body.data, "id"), false);
  assert.equal(Object.hasOwn(confirmed.body.data.customer, "id"), false);
  assert.equal(Object.hasOwn(confirmed.body.data.equipment, "id"), false);
  const firstDb = await db.serviceOrderOpening.findUniqueOrThrow({ where: { publicId: first.publicId }, include: { serviceOrder: true, numberAllocation: true } });
  assert.equal(firstDb.status, "CONFIRMED");
  assert.equal(firstDb.activeForUserId, null);
  assert.equal(firstDb.numberAllocation.status, "CONFIRMED");
  assert.equal(firstDb.serviceOrder.macroStatus, "OPEN");
  assert.equal(firstDb.serviceOrder.operationalSituation, "TRIAGE");
  assert.equal(firstDb.serviceOrder.snapshotVersion, 1);
  assert.equal(firstDb.serviceOrder.snapshotCapturedAt.toISOString(), firstDb.serviceOrder.customerSnapshotJson.capturedAt);
  status(await request("GET", "/service-orders/openings/current", { cookie: ownerSession.cookie }), 404, "confirmed opening is no longer active");
  status(await request("POST", `${first.path}/confirm`, ownerSession), 409, "double confirmation");

  // Canceled opening cannot become a ServiceOrder.
  const canceled = await opening(ownerSession);
  status(await request("POST", `${canceled.path}/cancel`, ownerSession), 200, "cancel opening");
  status(await request("POST", `${canceled.path}/confirm`, ownerSession), 409, "confirm canceled");

  // Draft creates Equipment only at confirmation; NOT_IDENTIFIED remains null.
  const second = await opening(ownerSession);
  const draft = { typePublicId: type.publicId, brandPublicId: unspecifiedBrand.publicId, model: "Não informado", serialIdentificationStatus: "NOT_IDENTIFIED", serialNumber: null };
  await patch(second, ownerSession, { customerPublicId: customer.publicId, equipmentDraft: draft });
  const beforeEquipment = await db.equipment.count();
  const beforeBrand = await db.equipmentBrand.count();
  const invalidAssignee = await user("inactive", []);
  await db.user.update({ where: { id: invalidAssignee.id }, data: { isActive: false } });
  status(await request("POST", `${second.path}/confirm`, { ...ownerSession, body: { assignedUserPublicIds: [invalidAssignee.publicId] } }), 409, "rollback on late assignment failure");
  assert.equal(await db.equipment.count(), beforeEquipment);
  assert.equal(await db.serviceOrder.findUnique({ where: { openingId: (await db.serviceOrderOpening.findUniqueOrThrow({ where: { publicId: second.publicId } })).id } }), null);
  const retryOpening = await db.serviceOrderOpening.findUniqueOrThrow({ where: { publicId: second.publicId }, include: { numberAllocation: true } });
  assert.equal(retryOpening.status, "IN_PROGRESS");
  assert.equal(retryOpening.numberAllocation.status, "RESERVED");
  const newOrder = await request("POST", `${second.path}/confirm`, { ...ownerSession, body: { assignedUserPublicIds: [owner.publicId] } });
  status(newOrder, 201, "confirm draft");
  assert.equal(newOrder.body.data.equipment.model, "NÃO INFORMADO");
  assert.equal(newOrder.body.data.equipment.brand, "NÃO INFORMADA");
  assert.equal(newOrder.body.data.equipment.serialNumber, null);
  assert.equal(await db.equipment.count(), beforeEquipment + 1);
  assert.equal(await db.equipmentBrand.count(), beforeBrand);
  assert.deepEqual(newOrder.body.data.assignedUserPublicIds, [owner.publicId]);
  const newEquipment = await db.equipment.findUniqueOrThrow({ where: { publicId: newOrder.body.data.equipment.publicId } });
  assert.equal(newEquipment.serialNumber, null);
  const newOrderDb = await db.serviceOrder.findUniqueOrThrow({ where: { publicId: newOrder.body.data.publicId } });
  assert.equal(newOrderDb.newEquipmentSerialIdentificationStatus, "NOT_IDENTIFIED");
  const newEvents = await db.serviceOrderEvent.findMany({ where: { serviceOrderId: newOrderDb.id }, select: { eventType: true } });
  assert.deepEqual(new Set(newEvents.map((event) => event.eventType)), new Set(["ABERTURA_CONFIRMADA", "EQUIPAMENTO_CRIADO_DURANTE_ABERTURA", "ATRIBUICOES_ALTERADAS"]));

  // A missing brand invalidates the draft; confirmation never creates a brand.
  const third = await opening(ownerSession);
  const disappearingBrand = await db.equipmentBrand.create({ data: { name: `TEMP ${suffix}` } });
  await patch(third, ownerSession, { customerPublicId: customer.publicId, equipmentDraft: { ...draft, brandPublicId: disappearingBrand.publicId } });
  await db.equipmentBrand.delete({ where: { id: disappearingBrand.id } });
  status(await request("POST", `${third.path}/confirm`, ownerSession), 409, "brand must exist");
  assert.equal(await db.equipmentBrand.count(), beforeBrand);
  status(await request("POST", `${third.path}/cancel`, ownerSession), 200, "cancel missing brand opening");

  // Explicit transfer only on confirmation, and permission is rechecked.
  const ownedByOther = await db.equipment.create({ data: { ownerId: other.id, typeId: type.id, brandId: brand.id, model: "TRANSFER TEST" } });
  const transferOpening = await opening(ownerSession);
  await patch(transferOpening, ownerSession, { customerPublicId: customer.publicId });
  await patch(transferOpening, ownerSession, { equipmentPublicId: ownedByOther.publicId, ownershipDecision: "TRANSFER_TO_CUSTOMER" });
  assert.equal((await db.equipment.findUniqueOrThrow({ where: { id: ownedByOther.id } })).ownerId, other.id);
  const transferPermission = await db.permission.findUniqueOrThrow({ where: { code: "equipment.transfer_ownership" } });
  await db.userPermission.delete({ where: { userId_permissionId: { userId: owner.id, permissionId: transferPermission.id } } });
  status(await request("POST", `${transferOpening.path}/confirm`, ownerSession), 403, "transfer permission rechecked");
  assert.equal((await db.equipment.findUniqueOrThrow({ where: { id: ownedByOther.id } })).ownerId, other.id);
  const transferResult = await request("POST", `${transferOpening.path}/confirm`, adminSession);
  status(transferResult, 201, "admin transfer other opening");
  assert.equal((await db.equipment.findUniqueOrThrow({ where: { id: ownedByOther.id } })).ownerId, customer.id);
  const transferDb = await db.serviceOrder.findUniqueOrThrow({ where: { publicId: transferResult.body.data.publicId } });
  assert.equal(await db.equipmentOwnership.count({ where: { serviceOrderId: transferDb.id } }), 1);
  const transferEvents = await db.serviceOrderEvent.findMany({ where: { serviceOrderId: transferDb.id }, select: { eventType: true } });
  assert.deepEqual(new Set(transferEvents.map((event) => event.eventType)), new Set(["ABERTURA_CONFIRMADA", "TITULARIDADE_TRANSFERIDA_DURANTE_ABERTURA"]));

  // A database-side event failure must roll the entire confirmation back.
  const failed = await opening(ownerSession);
  await patch(failed, ownerSession, { customerPublicId: customer.publicId, equipmentDraft: draft });
  const equipmentBeforeEventFailure = await db.equipment.count();
  const ordersBeforeEventFailure = await db.serviceOrder.count();
  const eventsBeforeEventFailure = await db.serviceOrderEvent.count();
  await rejectConfirmationEvent(failed, ownerSession);
  assert.equal(await db.equipment.count(), equipmentBeforeEventFailure);
  assert.equal(await db.serviceOrder.count(), ordersBeforeEventFailure);
  assert.equal(await db.serviceOrderEvent.count(), eventsBeforeEventFailure);
  const failedOpening = await db.serviceOrderOpening.findUniqueOrThrow({ where: { publicId: failed.publicId }, include: { numberAllocation: true } });
  assert.equal(failedOpening.status, "IN_PROGRESS");
  assert.equal(failedOpening.activeForUserId, owner.id);
  assert.equal(failedOpening.numberAllocation.status, "RESERVED");
  status(await request("POST", `${failed.path}/cancel`, ownerSession), 200, "cancel after event failure");

  const transferRollbackEquipment = await db.equipment.create({ data: { ownerId: other.id, typeId: type.id, brandId: brand.id, model: "TRANSFER ROLLBACK" } });
  const transferRollbackOpening = await opening(ownerSession);
  await patch(transferRollbackOpening, ownerSession, { customerPublicId: customer.publicId });
  // Restore permission to register the intent, then use an Admin to confirm.
  await db.userPermission.create({ data: { userId: owner.id, permissionId: transferPermission.id, grantedByUserId: admin.id } });
  await patch(transferRollbackOpening, ownerSession, { equipmentPublicId: transferRollbackEquipment.publicId, ownershipDecision: "TRANSFER_TO_CUSTOMER" });
  const ownershipEventsBefore = await db.equipmentOwnership.count();
  const ordersBeforeTransferFailure = await db.serviceOrder.count();
  const eventsBeforeTransferFailure = await db.serviceOrderEvent.count();
  await rejectConfirmationEvent(transferRollbackOpening, adminSession);
  assert.equal((await db.equipment.findUniqueOrThrow({ where: { id: transferRollbackEquipment.id } })).ownerId, other.id);
  assert.equal(await db.equipmentOwnership.count(), ownershipEventsBefore);
  assert.equal(await db.serviceOrder.count(), ordersBeforeTransferFailure);
  assert.equal(await db.serviceOrderEvent.count(), eventsBeforeTransferFailure);
  const transferFailedOpening = await db.serviceOrderOpening.findUniqueOrThrow({ where: { publicId: transferRollbackOpening.publicId }, include: { numberAllocation: true } });
  assert.equal(transferFailedOpening.status, "IN_PROGRESS");
  assert.equal(transferFailedOpening.activeForUserId, owner.id);
  assert.equal(transferFailedOpening.numberAllocation.status, "RESERVED");
  status(await request("POST", `${transferRollbackOpening.path}/cancel`, ownerSession), 200, "cancel after transfer event failure");

  // A manager with explicit grants can confirm another user's opening.
  const managerOpening = await opening(ownerSession);
  await patch(managerOpening, ownerSession, { customerPublicId: customer.publicId, equipmentPublicId: existing.publicId });
  const competing = await Promise.all([
    request("POST", `${managerOpening.path}/confirm`, managerSession),
    request("POST", `${managerOpening.path}/confirm`, adminSession),
  ]);
  assert.deepEqual(competing.map((result) => result.status).sort(), [201, 409], "Only one concurrent confirmation may win");
  const managerOpeningDb = await db.serviceOrderOpening.findUniqueOrThrow({ where: { publicId: managerOpening.publicId } });
  assert.equal(await db.serviceOrder.count({ where: { openingId: managerOpeningDb.id } }), 1);

  console.log("service-order confirmation HTTP/MySQL isolated: passed");
} finally {
  await app.close();
}
