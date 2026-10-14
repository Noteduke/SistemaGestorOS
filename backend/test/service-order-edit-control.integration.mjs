import "reflect-metadata";
import "dotenv/config";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
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
  assert.equal(selected[0]?.name, "gestor_os_opening_test", "nenhuma escrita pode ocorrer antes desta conferência");
  const table = await db.$queryRaw`SHOW TABLES LIKE 'service_order_edit_controls'`;
  assert.equal(table.length, 1, "migration do controle precisa estar aplicada no banco isolado");

  const suffix = randomBytes(5).toString("hex");
  const password = randomBytes(24).toString("base64url");
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const permission = await db.permission.upsert({
    where: { code: "service_orders.edit.takeover" },
    create: { code: "service_orders.edit.takeover", description: "Assumir a edição de uma Ordem de Serviço atualmente editada por outro usuário." },
    update: { description: "Assumir a edição de uma Ordem de Serviço atualmente editada por outro usuário." },
  });
  assert.equal(await db.permission.count(), 39, "catálogo local com a permissão específica de takeover");
  const admin = await db.user.create({ data: { username: `edit_control_admin_${suffix}`, passwordHash, isActive: true, isAdmin: true } });
  const basePermissions = ["service_orders.read", "service_orders.opening.create", "service_orders.create", "service_orders.update", "service_orders.assignment.manage", "service_orders.situation.update", "service_orders.budget.update"];

  async function user(label, codes = []) {
    const created = await db.user.create({ data: { username: `edit_control_${label}_${suffix}`, passwordHash, isActive: true } });
    const grants = await Promise.all(codes.map((code) => db.permission.findUniqueOrThrow({ where: { code } })));
    if (grants.length) await db.userPermission.createMany({ data: grants.map((entry) => ({ userId: created.id, permissionId: entry.id, grantedByUserId: admin.id })) });
    return created;
  }

  const alice = await user("alice", basePermissions);
  const bob = await user("bob", basePermissions);
  const carol = await user("carol", [...basePermissions, permission.code]);
  const dana = await user("dana", [...basePermissions, permission.code]);
  const budgetEditor = await user("budget_editor", [...basePermissions, permission.code]);
  const specialOnly = await user("special_only", [permission.code]);
  const readOnly = await user("reader", ["service_orders.read"]);
  const assignee = await user("assignee");
  const customer = await db.person.create({ data: { personType: "PF", name: `EDIT CONTROL ${suffix}`, roles: { create: { role: "CUSTOMER" } } } });
  const type = await db.equipmentType.create({ data: { name: `TIPO EDIT ${suffix}` } });
  const brand = await db.equipmentBrand.create({ data: { name: `MARCA EDIT ${suffix}` } });
  const equipment = await db.equipment.create({ data: { ownerId: customer.id, typeId: type.id, brandId: brand.id, model: "MODELO", serialNumber: `EDIT-${suffix}` } });

  await app.listen(0, "127.0.0.1");
  const base = `http://127.0.0.1:${app.getHttpServer().address().port}/api/v1`;
  async function request(method, path, options = {}) {
    const headers = {};
    if (options.cookie) headers.cookie = options.cookie;
    if (options.csrf) headers["x-csrf-token"] = options.csrf;
    if (options.editToken) headers["x-service-order-edit-token"] = options.editToken;
    if (options.revision) headers["x-service-order-revision"] = options.revision;
    const revisionTarget = path.match(/^\/service-orders\/([0-9a-f-]+)\/(?:assignments|operational-situation|budget-items(?:\/|$))/iu);
    if (!options.revision && options.autoRevision !== false && revisionTarget && ["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
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
    const result = await request("POST", "/auth/login", { cookie: cookie(pre.headers, "gos_pre_auth"), csrf: pre.body.data.csrfToken, body: { username: account.username, password } });
    assert.equal(result.status, 201);
    return { cookie: cookie(result.headers, "gos_session"), csrf: result.body.data.csrfToken };
  }
  function status(result, expected, label) { assert.equal(result.status, expected, `${label}: ${result.status} ${result.body?.code ?? ""}`); }

  const aliceSession = await login(alice);
  const bobSession = await login(bob);
  const carolSession = await login(carol);
  const danaSession = await login(dana);
  const budgetEditorSession = await login(budgetEditor);
  const specialOnlySession = await login(specialOnly);
  const readOnlySession = await login(readOnly);
  const adminSession = await login(admin);
  const adminSecondSession = await login(admin);
  const aliceTab1 = randomUUID();
  const aliceTab2 = randomUUID();
  const bobTab = randomUUID();
  const carolTab = randomUUID();

  const opening = await request("POST", "/service-orders/openings", { ...aliceSession, body: {} });
  status(opening, 201, "create opening in isolated DB");
  const openingId = opening.body.data.publicId;
  status(await request("PATCH", `/service-orders/openings/${openingId}`, { ...aliceSession, body: { customerPublicId: customer.publicId, equipmentPublicId: equipment.publicId } }), 200, "prepare opening");
  const confirmed = await request("POST", `/service-orders/openings/${openingId}/confirm`, { ...aliceSession, body: {} });
  status(confirmed, 201, "confirm order");
  const orderId = confirmed.body.data.publicId;
  const path = `/service-orders/${orderId}/edit-control`;
  const normalControlAuditStart = await db.adminAuditLog.count({ where: { eventCode: "SERVICE_ORDER_EDIT_TAKEOVER" } });
  const operationalEventsStart = await db.serviceOrderEvent.count({ where: { serviceOrder: { publicId: orderId } } });
  assert.equal((await request("GET", path, { ...readOnlySession, editToken: randomUUID() })).body.data.held, false, "user without edit permission can inspect a free control");
  status(await request("POST", path, { ...readOnlySession, editToken: randomUUID() }), 403, "user without edit permission cannot acquire a free OS");
  const simultaneousTokens = [randomUUID(), randomUUID()];
  const simultaneous = await Promise.all([
    request("POST", path, { ...aliceSession, editToken: simultaneousTokens[0] }),
    request("POST", path, { ...bobSession, editToken: simultaneousTokens[1] }),
  ]);
  assert.equal(simultaneous.filter((result) => result.status === 201).length, 1, "only one simultaneous opener acquires a free OS");
  assert.equal(simultaneous.filter((result) => result.status === 409).length, 1, "the other simultaneous opener remains read-only");
  const winnerIndex = simultaneous.findIndex((result) => result.status === 201);
  await request("DELETE", path, { ...(winnerIndex === 0 ? aliceSession : bobSession), editToken: simultaneousTokens[winnerIndex] });
  assert.equal(await db.adminAuditLog.count({ where: { eventCode: "SERVICE_ORDER_EDIT_TAKEOVER" } }), normalControlAuditStart, "normal acquisition and release do not create administrative entries");
  assert.equal(await db.serviceOrderEvent.count({ where: { serviceOrder: { publicId: orderId } } }), operationalEventsStart, "normal acquisition and release do not create OS history events");

  status(await request("POST", path, { cookie: aliceSession.cookie, editToken: aliceTab1 }), 403, "CSRF protects acquisition");
  status(await request("POST", `${path}/takeover`, { cookie: carolSession.cookie, editToken: randomUUID() }), 403, "CSRF protects takeover");
  status(await request("POST", path, { ...specialOnlySession, editToken: randomUUID() }), 403, "special permission does not replace normal edit permission");
  status(await request("POST", `${path}/takeover`, { ...specialOnlySession, editToken: randomUUID() }), 403, "takeover also requires normal edit permission");

  const acquired = await request("POST", path, { ...aliceSession, editToken: aliceTab1 });
  status(acquired, 201, "Alice acquires free OS");
  const visibleToBob = await request("GET", path, { ...bobSession, editToken: bobTab });
  status(visibleToBob, 200, "Bob can view control state");
  assert.equal(visibleToBob.body.data.held, true);
  assert.equal(visibleToBob.body.data.holder.username, alice.username);
  assert.equal(visibleToBob.body.data.isCurrentContext, false);
  const secondTab = await request("GET", path, { ...aliceSession, editToken: aliceTab2 });
  assert.equal(secondTab.body.data.isCurrentContext, false, "same user in a second tab is a different context");
  assert.equal(secondTab.body.data.isSameUser, true, "API identifies another context owned by the same user");
  const secondTabAcquire = await request("POST", path, { ...aliceSession, editToken: aliceTab2 });
  status(secondTabAcquire, 409, "same-user second tab cannot silently replace editor");
  const eventsBeforeTransfer = await db.serviceOrderEvent.count({ where: { serviceOrder: { publicId: orderId } } });
  const auditBeforeTransfer = await db.adminAuditLog.count({ where: { eventCode: "SERVICE_ORDER_EDIT_TAKEOVER" } });
  status(await request("POST", `${path}/takeover`, { ...aliceSession, editToken: aliceTab2 }), 201, "same user transfers control without takeover permission");
  status(await request("POST", `${path}/heartbeat`, { ...aliceSession, editToken: aliceTab1 }), 409, "old tab heartbeat cannot regain transferred control");
  assert.equal((await request("GET", path, { ...aliceSession, editToken: aliceTab1 })).body.data.isCurrentContext, false, "old tab detects lost control");
  assert.equal(await db.adminAuditLog.count({ where: { eventCode: "SERVICE_ORDER_EDIT_TAKEOVER" } }), auditBeforeTransfer, "same-user tab transfer is not an administrative takeover");
  assert.equal(await db.serviceOrderEvent.count({ where: { serviceOrder: { publicId: orderId } } }), eventsBeforeTransfer, "control transfer does not pollute OS history");
  status(await request("POST", `${path}/takeover`, { ...aliceSession, editToken: aliceTab1 }), 201, "same user can transfer control back to the original tab");
  status(await request("POST", `${path}/heartbeat`, { ...aliceSession, editToken: aliceTab2 }), 409, "previous context loses control immediately after transfer back");

  const orderPath = `/service-orders/${orderId}`;
  const bobMutation = await request("PUT", `${orderPath}/assignments`, { ...bobSession, editToken: bobTab, body: { userPublicIds: [] } });
  status(bobMutation, 409, "non-holder cannot mutate assignments");
  assert.equal(bobMutation.body.code, "SERVICE_ORDER_EDIT_CONTROL_LOST");
  const takeoverDenied = await request("POST", `${path}/takeover`, { ...bobSession, editToken: bobTab });
  status(takeoverDenied, 403, "normal editor without takeover permission cannot take over");

  const takeover = await request("POST", `${path}/takeover`, { ...carolSession, editToken: carolTab });
  status(takeover, 201, "authorized takeover is immediate");
  const takeoverAudit = await db.adminAuditLog.findFirst({ where: { eventCode: "SERVICE_ORDER_EDIT_TAKEOVER", actorUserId: carol.id, targetUserId: alice.id }, orderBy: { id: "desc" } });
  assert.ok(takeoverAudit, "takeover of another user is written to AdminAuditLog");
  assert.equal(takeoverAudit.detailsJson.serviceOrderPublicId, orderId);
  assert.equal(takeoverAudit.detailsJson.previousEditor.username, alice.username);
  assert.equal(takeoverAudit.detailsJson.newEditor.username, carol.username);
  assert.equal(await db.serviceOrderEvent.count({ where: { serviceOrder: { publicId: orderId } } }), eventsBeforeTransfer, "takeover remains outside operational OS history");
  status(await request("POST", `${path}/heartbeat`, { ...aliceSession, editToken: aliceTab1 }), 409, "old heartbeat cannot recover after takeover");
  const staleSave = await request("PUT", `${orderPath}/assignments`, { ...aliceSession, editToken: aliceTab1, body: { userPublicIds: [] } });
  status(staleSave, 409, "previous editor is rejected by backend");
  assert.equal(staleSave.body.code, "SERVICE_ORDER_EDIT_CONTROL_LOST");

  const note = await request("POST", `${orderPath}/notes`, { ...aliceSession, body: { text: "Observação manual fora do controle de edição." } });
  status(note, 201, "manual note remains available while another user holds edit control");
  status(await request("DELETE", `${orderPath}/notes/${note.body.data.publicId}`, aliceSession), 200, "note deletion follows its own authorization");

  const budgetRead = await request("GET", `${orderPath}/budget-items`, bobSession);
  status(budgetRead, 200, "read-only user can view budget");
  const budgetWithoutToken = await request("POST", `${orderPath}/budget-items/manual-labor`, { ...bobSession, body: { description: "Teste de bloqueio", quantity: 1, unitPrice: "0.00" } });
  assert.ok([400, 409].includes(budgetWithoutToken.status), "budget mutation without edit context is rejected");

  const carolRaceToken = randomUUID();
  const danaRaceToken = randomUUID();
  const concurrentTakeovers = await Promise.all([
    request("POST", `${path}/takeover`, { ...carolSession, editToken: carolRaceToken }),
    request("POST", `${path}/takeover`, { ...danaSession, editToken: danaRaceToken }),
  ]);
  for (const result of concurrentTakeovers) status(result, 201, "serialized concurrent takeover");
  const raceStates = await Promise.all([
    request("GET", path, { ...carolSession, editToken: carolRaceToken }),
    request("GET", path, { ...danaSession, editToken: danaRaceToken }),
  ]);
  assert.equal(raceStates.filter((result) => result.body.data.isCurrentContext).length, 1, "exactly one concurrent takeover context remains current");
  // Take over with a known context to verify control and authorized budget write.
  const finalOwnerToken = randomUUID();
  const finalOwnerSession = danaSession;
  const finalTakeover = await request("POST", `${path}/takeover`, { ...finalOwnerSession, editToken: finalOwnerToken });
  status(finalTakeover, 201, "known final context takes control");
  const assignmentWrite = await request("PUT", `${orderPath}/assignments`, { ...finalOwnerSession, editToken: finalOwnerToken, body: { userPublicIds: [assignee.publicId] } });
  status(assignmentWrite, 200, "holder with assignment permission can mutate");
  assert.deepEqual(assignmentWrite.body.data.assignedUserPublicIds, [assignee.publicId]);
  const staleRevision = assignmentWrite.body.data.updatedAt;
  const compositionRead = await request("GET", `${orderPath}/budget-items`, finalOwnerSession);
  status(compositionRead, 200, "budget baseline for independent additions");
  const compositionToken = compositionRead.body.compositionToken;
  const budgetWrite = await request("POST", `${orderPath}/budget-items/manual-labor`, { ...finalOwnerSession, editToken: finalOwnerToken, body: { description: `TESTE ${suffix}`, quantity: 1, unitPrice: "0.00" } });
  status(budgetWrite, 201, "holder with budget permission can mutate budget");
  const staleBudgetWrite = await request("POST", `${orderPath}/budget-items/manual-part`, { ...finalOwnerSession, editToken: finalOwnerToken, revision: staleRevision, body: { description: `STALE ${suffix}`, quantity: 1, unitPrice: "1.00", compositionToken } });
  status(staleBudgetWrite, 201, "another budget item does not conflict with a different item");
  status(await request("DELETE", `${orderPath}/budget-items/${staleBudgetWrite.body.data.publicId}`, { ...finalOwnerSession, editToken: finalOwnerToken }), 200, "independent item can be removed");
  status(await request("DELETE", `${orderPath}/budget-items/${budgetWrite.body.data.publicId}`, { ...finalOwnerSession, editToken: finalOwnerToken }), 200, "budget removal also requires and accepts current control");

  const budgetEditorToken = randomUUID();
  status(await request("POST", `${path}/takeover`, { ...budgetEditorSession, editToken: budgetEditorToken }), 201, "budget editor can take control with separate takeover permission");
  const unauthorizedCost = await request("POST", `${orderPath}/budget-items/manual-part`, {
    ...budgetEditorSession,
    editToken: budgetEditorToken,
    body: { description: `Peça sem autorização de custo ${suffix}`, quantity: 1, unitPrice: "1.00", unitCost: "0.50" },
  });
  status(unauthorizedCost, 403, "edit control and budget permission do not grant cost permissions");
  assert.equal(unauthorizedCost.body.code, "PERMISSION_DENIED");
  const partWithoutCost = await request("POST", `${orderPath}/budget-items/manual-part`, {
    ...budgetEditorSession,
    editToken: budgetEditorToken,
    body: { description: `Peça sem custo informado ${suffix}`, quantity: 1, unitPrice: "1.00" },
  });
  status(partWithoutCost, 201, "manual part without cost can be created with normal budget permission");

  const control = await db.serviceOrderEditControl.findUniqueOrThrow({ where: { serviceOrderId: (await db.serviceOrder.findUniqueOrThrow({ where: { publicId: orderId }, select: { id: true } })).id } });
  assert.equal(control.holderUserId, budgetEditor.id);
  const auditBeforeExpiry = await db.adminAuditLog.count({ where: { eventCode: "SERVICE_ORDER_EDIT_TAKEOVER" } });
  const eventsBeforeExpiry = await db.serviceOrderEvent.count({ where: { serviceOrder: { publicId: orderId } } });
  await db.serviceOrderEditControl.update({ where: { id: control.id }, data: { expiresAt: new Date(Date.now() - 1) } });
  assert.equal((await request("GET", path, { ...bobSession, editToken: bobTab })).body.data.held, false, "lease expires after ten minutes without valid heartbeat");
  const expiredOwnerAcquire = await request("POST", path, { ...budgetEditorSession, editToken: budgetEditorToken });
  status(expiredOwnerAcquire, 409, "expired owner cannot revive the same context through acquire");
  assert.equal(expiredOwnerAcquire.body.code, "SERVICE_ORDER_EDIT_CONTEXT_EXPIRED");
  const expiredHeartbeat = await request("POST", `${path}/heartbeat`, { ...budgetEditorSession, editToken: budgetEditorToken });
  status(expiredHeartbeat, 409, "expired owner cannot revive the same context through a late heartbeat");
  assert.equal(expiredHeartbeat.body.code, "SERVICE_ORDER_EDIT_CONTROL_LOST");
  const afterExpiry = await request("POST", path, { ...bobSession, editToken: bobTab });
  status(afterExpiry, 201, "expired control can be acquired");
  status(await request("DELETE", path, { ...bobSession, editToken: bobTab }), 200, "normal exit releases current context");
  assert.equal(await db.adminAuditLog.count({ where: { eventCode: "SERVICE_ORDER_EDIT_TAKEOVER" } }), auditBeforeExpiry, "expiry, acquisition and release do not create administrative entries");
  assert.equal(await db.serviceOrderEvent.count({ where: { serviceOrder: { publicId: orderId } } }), eventsBeforeExpiry, "expiry, acquisition and release do not create OS history events");

  async function createAdminOrder(session) {
    const draft = await request("POST", "/service-orders/openings", { ...session, body: {} });
    status(draft, 201, "Admin creates an order for logout-lock validation");
    status(await request("PATCH", `/service-orders/openings/${draft.body.data.publicId}`, { ...session, body: { customerPublicId: customer.publicId, equipmentPublicId: equipment.publicId } }), 200, "Admin selects existing customer and equipment");
    const result = await request("POST", `/service-orders/openings/${draft.body.data.publicId}/confirm`, { ...session, body: {} });
    status(result, 201, "Admin confirms an order for logout-lock validation");
    return result.body.data.publicId;
  }
  const logoutOrderA = await createAdminOrder(adminSession);
  const logoutOrderB = await createAdminOrder(adminSession);
  const otherSessionOrder = await createAdminOrder(adminSecondSession);
  const adminSessionId = (await db.userSession.findUniqueOrThrow({
    where: { tokenHash: createHash("sha256").update(adminSession.cookie.split("=")[1]).digest("hex") }, select: { id: true },
  })).id;
  const adminSecondSessionId = (await db.userSession.findUniqueOrThrow({
    where: { tokenHash: createHash("sha256").update(adminSecondSession.cookie.split("=")[1]).digest("hex") }, select: { id: true },
  })).id;
  const logoutTokenA = randomUUID();
  const logoutTokenB = randomUUID();
  const otherSessionToken = randomUUID();
  status(await request("POST", `/service-orders/${logoutOrderA}/edit-control`, { ...adminSession, editToken: logoutTokenA }), 201, "first Admin session owns first OS");
  status(await request("POST", `/service-orders/${logoutOrderB}/edit-control`, { ...adminSession, editToken: logoutTokenB }), 201, "first Admin session owns second OS");
  status(await request("POST", `/service-orders/${otherSessionOrder}/edit-control`, { ...adminSecondSession, editToken: otherSessionToken }), 201, "second Admin session owns independent OS");
  status(await request("POST", "/auth/logout", adminSession), 204, "logout releases every edit control belonging to this session");
  const logoutControls = await db.serviceOrderEditControl.findMany({
    where: { serviceOrder: { publicId: { in: [logoutOrderA, logoutOrderB, otherSessionOrder] } } },
    select: { holderUserId: true, holderSessionId: true },
  });
  assert.equal(logoutControls.filter((entry) => entry.holderSessionId === null && entry.holderUserId === null).length, 2, "logout clears both controls held by the ending session");
  assert.ok(logoutControls.some((entry) => entry.holderSessionId === adminSecondSessionId), "another login session of the same user keeps its own control");
  assert.equal(logoutControls.some((entry) => entry.holderSessionId === adminSessionId), false, "revoked session no longer owns edit controls");
  status(await request("POST", `/service-orders/${logoutOrderA}/edit-control/heartbeat`, { ...adminSession, editToken: logoutTokenA }), 401, "revoked session cannot heartbeat a stale context");
  status(await request("PUT", `/service-orders/${logoutOrderA}/assignments`, { ...adminSession, editToken: logoutTokenA, body: { userPublicIds: [] } }), 401, "revoked session cannot mutate through its old edit context");
  status(await request("POST", `/service-orders/${otherSessionOrder}/edit-control/heartbeat`, { ...adminSecondSession, editToken: otherSessionToken }), 201, "different active session remains valid after logout");

  const controls = await db.serviceOrderEditControl.count({ where: { serviceOrderId: control.serviceOrderId } });
  assert.equal(controls, 1, "only one control row exists for the OS");
  console.log("Exclusive service order edit control HTTP/MySQL integration passed on gestor_os_opening_test.");
} finally {
  await app.close();
}
