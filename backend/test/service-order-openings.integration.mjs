import "reflect-metadata";
import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import * as argon2 from "argon2";

// This test must never connect to the project's primary database.
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
const { AuthService } = await import("../dist/modules/auth/auth.service.js");
const { ServiceOrderOpeningsService } = await import("../dist/modules/service-orders/service-order-openings.service.js");

const app = await NestFactory.create(AppModule, { logger: false });
app.setGlobalPrefix("api/v1");
let completed = false;

try {
  await app.init();
  const prisma = app.get(PrismaService);
  const database = await prisma.$queryRaw`SELECT DATABASE() AS name`;
  assert.equal(database[0]?.name, "gestor_os_opening_test", "Banco de teste não selecionado");
  const permissionCount = await prisma.permission.count();
  assert.equal(permissionCount, 43, "Seed de permissões ausente no banco isolado");
  const initialOrders = await prisma.serviceOrder.count();
  const initialUnspecifiedEquipment = await prisma.equipment.count({ where: { model: "NÃO INFORMADO" } });

  const suffix = randomBytes(5).toString("hex");
  const password = randomBytes(24).toString("base64url");
  const adminUsername = `osadmin_${suffix}`;
  const activeAdminCount = await prisma.user.count({ where: { isAdmin: true, isActive: true } });
  if (activeAdminCount === 0) {
    await app.get(AuthService).bootstrapFirstAdmin(adminUsername, password);
  } else {
    await prisma.user.create({
      data: { username: adminUsername, passwordHash: await argon2.hash(password, { type: argon2.argon2id }), isAdmin: true, isActive: true },
    });
  }
  const admin = await prisma.user.findUniqueOrThrow({ where: { username: adminUsername } });

  async function createUser(label, codes) {
    const username = `os_${label}_${suffix}`;
    const user = await prisma.user.create({
      data: { username, passwordHash: await argon2.hash(password, { type: argon2.argon2id }), isActive: true, isAdmin: false },
    });
    for (const code of codes) {
      const permission = await prisma.permission.findUniqueOrThrow({ where: { code } });
      await prisma.userPermission.create({
        data: { userId: user.id, permissionId: permission.id, grantedByUserId: admin.id },
      });
    }
    return user;
  }

  const create = "service_orders.opening.create";
  const read = "service_orders.opening.read";
  const manage = "service_orders.opening.manage";
  const owner = await createUser("owner", [create, read]);
  const outsider = await createUser("outsider", []);
  const manager = await createUser("manager", [manage]);
  const transferManager = await createUser("transfer_manager", [manage, "equipment.transfer_ownership"]);
  const simultaneous = await createUser("simultaneous", [create, read]);
  const second = await createUser("second", [create]);
  const third = await createUser("third", [create]);
  const fourth = await createUser("fourth", [create]);
  const fifth = await createUser("fifth", [create]);
  const failureUser = await createUser("failure", [create]);

  await app.listen(0, "127.0.0.1");
  const port = app.getHttpServer().address().port;
  const base = `http://127.0.0.1:${port}/api/v1`;

  async function request(method, path, options = {}) {
    const headers = {};
    if (options.cookie) headers.cookie = options.cookie;
    if (options.csrf) headers["x-csrf-token"] = options.csrf;
    if (options.body !== undefined) headers["content-type"] = "application/json";
    const response = await fetch(base + path, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null, headers: response.headers };
  }

  function cookie(headers, name) {
    const values = headers.getSetCookie?.() ?? [headers.get("set-cookie")];
    const value = values.find((item) => item?.startsWith(`${name}=`));
    assert.ok(value, `Cookie ${name} ausente`);
    return value.split(";")[0];
  }

  async function login(user) {
    const pre = await request("GET", "/auth/csrf");
    assert.equal(pre.status, 200);
    const preCookie = cookie(pre.headers, "gos_pre_auth");
    const result = await request("POST", "/auth/login", {
      cookie: preCookie,
      csrf: pre.body.data.csrfToken,
      body: { username: user.username, password },
    });
    assert.equal(result.status, 201, `Login: ${result.body?.code ?? result.status}`);
    return { cookie: cookie(result.headers, "gos_session"), csrf: result.body.data.csrfToken };
  }

  function expectStatus(result, status, operation) {
    assert.equal(result.status, status, `${operation}: HTTP ${result.status}, código ${result.body?.code ?? "ausente"}`);
  }

  function assertPublicOpening(result) {
    assert.equal(typeof result.body?.data?.publicId, "string");
    assert.match(result.body.data.visibleNumber, /^OS-\d{6,}$/);
    assert.match(result.body.data.numberValue, /^\d+$/);
    assert.equal(typeof result.body.data.createdBy, "string");
    assert.equal(typeof result.body.data.createdAt, "string");
    assert.equal(Object.hasOwn(result.body.data, "id"), false);
  }

  function assertPublicEquipmentSummary(opening, selectedEquipment, owner) {
    assert.equal(opening.equipmentPublicId, selectedEquipment.publicId);
    assert.deepEqual(opening.equipment, {
      publicId: selectedEquipment.publicId,
      type: { publicId: type.publicId, name: type.name },
      brand: { publicId: brand.publicId, name: brand.name },
      model: selectedEquipment.model,
      serialNumber: selectedEquipment.serialNumber,
      serialIdentificationStatus: selectedEquipment.serialNumber === null ? "NOT_IDENTIFIED" : "IDENTIFIED",
      owner: {
        publicId: owner.publicId,
        name: owner.name,
        documentHint: owner.document ? `***.***.***-${owner.document.slice(-2)}` : null,
      },
    });
    assert.equal(Object.hasOwn(opening.equipment, "id"), false);
    assert.equal(Object.hasOwn(opening.equipment.type, "id"), false);
    assert.equal(Object.hasOwn(opening.equipment.brand, "id"), false);
    assert.equal(Object.hasOwn(opening.equipment.owner, "id"), false);
    assert.equal(Object.hasOwn(opening.equipment.owner, "document"), false);
    const serialized = JSON.stringify(opening.equipment);
    assert.equal(owner.document ? serialized.includes(owner.document) : false, false);
    assert.equal(serialized.includes("passwordHash"), false);
    assert.equal(serialized.includes("private@example.test"), false);
  }

  const adminSession = await login(admin);
  expectStatus(await request("GET", "/service-orders/openings/current"), 401, "GET sem login");
  expectStatus(await request("POST", "/service-orders/openings", { csrf: adminSession.csrf }), 401, "POST sem login");
  expectStatus(await request("POST", "/service-orders/openings", { cookie: adminSession.cookie }), 403, "POST sem CSRF");

  const adminOpening = await request("POST", "/service-orders/openings", { ...adminSession });
  expectStatus(adminOpening, 201, "Criar abertura Admin");
  assertPublicOpening(adminOpening);
  assert.equal(adminOpening.body.data.status, "IN_PROGRESS");
  assert.equal(adminOpening.body.data.createdBy, admin.publicId);
  const adminPublicId = adminOpening.body.data.publicId;
  expectStatus(await request("POST", "/service-orders/openings", { ...adminSession }), 409, "Duplicar abertura ativa");
  const current = await request("GET", "/service-orders/openings/current", { cookie: adminSession.cookie });
  expectStatus(current, 200, "Consultar abertura atual");
  assert.equal(current.body.data.publicId, adminPublicId);
  const byId = await request("GET", `/service-orders/openings/${adminPublicId}`, { cookie: adminSession.cookie });
  expectStatus(byId, 200, "Consultar abertura por publicId");
  assert.equal(byId.body.data.publicId, adminPublicId);
  const adminCancel = await request("POST", `/service-orders/openings/${adminPublicId}/cancel`, { ...adminSession });
  expectStatus(adminCancel, 200, "Cancelar abertura Admin");
  assert.equal(adminCancel.body.data.status, "CANCELED");
  assert.equal(adminCancel.body.data.numberReleased, true);
  expectStatus(await request("GET", "/service-orders/openings/current", { cookie: adminSession.cookie }), 404, "Atual após cancelamento");
  const adminAllocation = await prisma.serviceOrderNumberAllocation.findUniqueOrThrow({
    where: { numberValue: BigInt(adminOpening.body.data.numberValue) },
  });
  assert.equal(adminAllocation.status, "RELEASED");
  assert.equal(adminAllocation.openingId, null);

  const ownerSession = await login(owner);
  const outsiderSession = await login(outsider);
  const managerSession = await login(manager);
  expectStatus(await request("GET", "/service-orders/openings/current", { cookie: outsiderSession.cookie }), 403, "GET current sem permissão");
  expectStatus(await request("POST", "/service-orders/openings", { ...outsiderSession }), 403, "Criar sem permissão");
  const ownedOpening = await request("POST", "/service-orders/openings", { ...ownerSession });
  expectStatus(ownedOpening, 201, "Criar abertura usuário comum");
  assert.equal(ownedOpening.body.data.numberValue, adminOpening.body.data.numberValue, "Número liberado não foi reutilizado");
  const ownedPath = `/service-orders/openings/${ownedOpening.body.data.publicId}`;
  const fakeDocument = `9${(randomBytes(5).readUIntBE(0, 5) % 10_000_000_000).toString().padStart(10, "0")}`;
  const firstCustomer = await prisma.person.create({ data: { personType: "PF", name: `CLIENTE TESTE ${suffix}`, document: fakeDocument, roles: { create: { role: "CUSTOMER" } } } });
  const secondCustomer = await prisma.person.create({ data: { personType: "PF", name: `OUTRO CLIENTE ${suffix}`, roles: { create: { role: "CUSTOMER" } } } });
  const type = await prisma.equipmentType.create({ data: { name: `TIPO TESTE ${suffix}` } });
  const brand = await prisma.equipmentBrand.create({ data: { name: `MARCA TESTE ${suffix}` } });
  const existing = await prisma.equipment.create({ data: { ownerId: firstCustomer.id, typeId: type.id, brandId: brand.id, model: "MODELO TESTE" } });
  const replacementEquipment = await prisma.equipment.create({ data: { ownerId: firstCustomer.id, typeId: type.id, brandId: brand.id, model: "MODELO TESTE 2", serialNumber: `SERIE-${suffix}` } });
  const draft = {
    typePublicId: type.publicId, brandPublicId: brand.publicId, model: "Não informado",
    serialIdentificationStatus: "NOT_IDENTIFIED", serialNumber: null,
  };
  expectStatus(await request("PATCH", ownedPath, { cookie: ownerSession.cookie, body: { complaint: "Teste" } }), 403, "PATCH sem CSRF");
  expectStatus(await request("PATCH", ownedPath, { ...outsiderSession, body: { complaint: "Negado" } }), 404, "PATCH alheio sem permissão");
  expectStatus(await request("PATCH", ownedPath, { ...ownerSession, body: { equipmentPublicId: existing.publicId, equipmentDraft: draft } }), 400, "Equipamentos simultâneos");
  const customerPatch = await request("PATCH", ownedPath, { ...ownerSession, body: { customerPublicId: firstCustomer.publicId, complaint: "Queixa inicial" } });
  expectStatus(customerPatch, 200, "PATCH próprio");
  assert.equal(customerPatch.body.data.customerPublicId, firstCustomer.publicId);
  assert.deepEqual(customerPatch.body.data.customer, {
    publicId: firstCustomer.publicId,
    name: firstCustomer.name,
    documentHint: `***.***.***-${firstCustomer.document.slice(-2)}`,
  });
  assert.equal(customerPatch.body.data.complaint, "QUEIXA INICIAL");
  assert.equal(Object.hasOwn(customerPatch.body.data, "customerId"), false);
  assert.equal(Object.hasOwn(customerPatch.body.data.customer, "id"), false);
  assert.equal(Object.hasOwn(customerPatch.body.data.customer, "document"), false);
  const currentWithCustomer = await request("GET", "/service-orders/openings/current", { cookie: ownerSession.cookie });
  expectStatus(currentWithCustomer, 200, "GET current com cliente");
  assert.equal(currentWithCustomer.body.data.customer.publicId, firstCustomer.publicId);
  const byIdWithCustomer = await request("GET", ownedPath, { cookie: ownerSession.cookie });
  expectStatus(byIdWithCustomer, 200, "GET por publicId com cliente");
  assert.equal(byIdWithCustomer.body.data.customer.publicId, firstCustomer.publicId);
  assert.equal(Object.hasOwn(byIdWithCustomer.body.data.customer, "id"), false);
  assert.equal(Object.hasOwn(byIdWithCustomer.body.data.customer, "document"), false);
  const omitted = await request("PATCH", ownedPath, { ...ownerSession, body: { complaint: "Queixa atualizada" } });
  expectStatus(omitted, 200, "PATCH campo omitido");
  assert.equal(omitted.body.data.customerPublicId, firstCustomer.publicId);
  expectStatus(await request("PATCH", ownedPath, { ...ownerSession, body: { equipmentDraft: draft } }), 403, "Rascunho sem equipment.create");
  const adminOwn = await request("PATCH", ownedPath, { ...adminSession, body: { equipmentDraft: draft } });
  expectStatus(adminOwn, 200, "PATCH rascunho por Admin");
  assert.equal(adminOwn.body.data.equipmentPublicId, null);
  assert.equal(adminOwn.body.data.equipmentDraft.model, "NÃO INFORMADO");
  assert.equal(adminOwn.body.data.equipmentDraft.serialNumber, null);
  assert.equal(adminOwn.body.data.equipmentDraft.serialIdentificationStatus, "NOT_IDENTIFIED");
  assert.equal(await prisma.equipment.count({ where: { model: "NÃO INFORMADO" } }), initialUnspecifiedEquipment, "Rascunho criou Equipment definitivo");
  const existingPatch = await request("PATCH", ownedPath, { ...ownerSession, body: { equipmentPublicId: existing.publicId } });
  expectStatus(existingPatch, 200, "PATCH equipamento existente");
  assert.equal(existingPatch.body.data.equipmentPublicId, existing.publicId);
  assert.equal(existingPatch.body.data.equipmentDraft, null);
  assertPublicEquipmentSummary(existingPatch.body.data, existing, firstCustomer);
  const currentWithEquipment = await request("GET", "/service-orders/openings/current", { cookie: ownerSession.cookie });
  expectStatus(currentWithEquipment, 200, "GET current com equipamento");
  assertPublicEquipmentSummary(currentWithEquipment.body.data, existing, firstCustomer);
  const byIdWithEquipment = await request("GET", ownedPath, { cookie: ownerSession.cookie });
  expectStatus(byIdWithEquipment, 200, "GET por publicId com equipamento");
  assertPublicEquipmentSummary(byIdWithEquipment.body.data, existing, firstCustomer);
  expectStatus(await request("GET", ownedPath, { cookie: outsiderSession.cookie }), 404, "GET alheio sem permissão");
  const invalidEquipment = await request("PATCH", ownedPath, { ...ownerSession, body: { equipmentPublicId: "00000000-0000-4000-8000-000000000000" } });
  expectStatus(invalidEquipment, 404, "PATCH equipamento inexistente");
  assert.equal(invalidEquipment.body.code, "EQUIPMENT_NOT_FOUND");
  assert.equal((await prisma.equipment.findUniqueOrThrow({ where: { id: existing.id } })).ownerId, firstCustomer.id, "Resumo/seleção alterou titularidade");
  const replacementPatch = await request("PATCH", ownedPath, { ...ownerSession, body: { equipmentPublicId: replacementEquipment.publicId } });
  expectStatus(replacementPatch, 200, "PATCH trocar equipamento existente");
  assertPublicEquipmentSummary(replacementPatch.body.data, replacementEquipment, firstCustomer);
  expectStatus(await request("PATCH", ownedPath, { ...adminSession, body: {
    equipmentDraft: { ...draft, serialNumber: "FALSO" },
  } }), 400, "Serial não identificado com texto");
  const newMode = await request("PATCH", ownedPath, { ...adminSession, body: { equipmentDraft: draft } });
  expectStatus(newMode, 200, "Modo novo substitui existente");
  assert.equal(newMode.body.data.equipmentPublicId, null);
  assert.equal(newMode.body.data.equipmentDraft.serialIdentificationStatus, "NOT_IDENTIFIED");
  const existingAgain = await request("PATCH", ownedPath, { ...ownerSession, body: { equipmentPublicId: existing.publicId } });
  expectStatus(existingAgain, 200, "Modo existente substitui novo");
  assert.equal(existingAgain.body.data.equipmentDraft, null);
  const mismatch = await request("PATCH", ownedPath, { ...ownerSession, body: { customerPublicId: secondCustomer.publicId } });
  expectStatus(mismatch, 409, "Divergência exige decisão");
  assert.equal(mismatch.body.code, "OWNERSHIP_DECISION_REQUIRED");
  expectStatus(await request("PATCH", ownedPath, { ...ownerSession, body: { customerPublicId: secondCustomer.publicId, ownershipDecision: "TRANSFER_TO_CUSTOMER" } }), 403, "Intenção sem permissão");
  const transferSession = await login(transferManager);
  const intended = await request("PATCH", ownedPath, { ...transferSession, body: { customerPublicId: secondCustomer.publicId, ownershipDecision: "TRANSFER_TO_CUSTOMER" } });
  expectStatus(intended, 200, "Intenção de transferência autorizada");
  assert.equal(intended.body.data.transferRequested, true);
  assert.equal(intended.body.data.customerPublicId, secondCustomer.publicId);
  assert.equal((await prisma.equipment.findUniqueOrThrow({ where: { id: existing.id } })).ownerId, firstCustomer.id, "Titularidade foi alterada");
  const currentOwner = await request("PATCH", ownedPath, { ...ownerSession, body: { ownershipDecision: "USE_CURRENT_OWNER" } });
  expectStatus(currentOwner, 200, "Usar proprietário atual");
  assert.equal(currentOwner.body.data.customerPublicId, firstCustomer.publicId);
  assert.equal(currentOwner.body.data.transferRequested, false);
  const cleared = await request("PATCH", ownedPath, { ...ownerSession, body: { customerPublicId: null } });
  expectStatus(cleared, 200, "Limpar cliente");
  assert.equal(cleared.body.data.customerPublicId, null);
  assert.equal(cleared.body.data.transferRequested, false);
  const noEquipment = await request("PATCH", ownedPath, { ...ownerSession, body: { equipmentPublicId: null, complaint: null } });
  expectStatus(noEquipment, 200, "Limpar equipamento e reclamação");
  assert.equal(noEquipment.body.data.equipmentPublicId, null);
  assert.equal(noEquipment.body.data.complaint, null);
  const identified = await request("PATCH", ownedPath, { ...adminSession, body: { equipmentDraft: {
    ...draft, serialIdentificationStatus: "IDENTIFIED", serialNumber: "abc-123",
  } } });
  expectStatus(identified, 200, "Rascunho com série identificada");
  assert.equal(identified.body.data.equipmentDraft.serialNumber, "ABC-123");
  const noDraft = await request("PATCH", ownedPath, { ...ownerSession, body: { equipmentDraft: null } });
  expectStatus(noDraft, 200, "Limpar rascunho");
  assert.equal(noDraft.body.data.equipmentDraft, null);
  expectStatus(await request("PATCH", ownedPath, { ...ownerSession, body: { equipmentPublicId: existing.publicId } }), 200, "Reselecionar equipamento");
  const selectionCanceled = await request("PATCH", ownedPath, { ...ownerSession, body: { ownershipDecision: "CANCEL_SELECTION" } });
  expectStatus(selectionCanceled, 200, "Cancelar seleção");
  assert.equal(selectionCanceled.body.data.equipmentPublicId, null);
  assert.equal(selectionCanceled.body.data.equipmentDraft, null);
  const currentPatch = await request("GET", `/service-orders/openings/current`, { cookie: ownerSession.cookie });
  expectStatus(currentPatch, 200, "GET após PATCH");
  assert.equal(currentPatch.body.data.equipmentPublicId, null);
  const audit = await prisma.adminAuditLog.findFirst({ where: { eventCode: "OS_OPENING_UPDATED_BY_ADMIN", targetUserId: owner.id, actorUserId: transferManager.id } });
  assert.ok(audit, "Edição administrativa sem auditoria");
  const beforeAuditFailure = await prisma.serviceOrderOpening.findUniqueOrThrow({ where: { publicId: ownedOpening.body.data.publicId } });
  const auditCount = await prisma.adminAuditLog.count({ where: { eventCode: "OS_OPENING_UPDATED_BY_ADMIN", targetUserId: owner.id } });
  let auditAttempted = false;
  const failingAuditClient = {
    serviceOrderOpening: prisma.serviceOrderOpening,
    user: prisma.user,
    $transaction: (callback, options) => prisma.$transaction((tx) => callback(new Proxy(tx, {
      get(target, key, receiver) {
        if (key === "adminAuditLog") return new Proxy(target.adminAuditLog, {
          get(delegate, method) {
            if (method === "create") return async () => { auditAttempted = true; throw new Error("INJECTED_AUDIT_FAILURE"); };
            return Reflect.get(delegate, method);
          },
        });
        return Reflect.get(target, key, receiver);
      },
    })), options),
  };
  const failingUpdate = new ServiceOrderOpeningsService(failingAuditClient, { assertAllowed: async () => {} });
  await assert.rejects(
    failingUpdate.update(ownedOpening.body.data.publicId, { complaint: "FALHA INJETADA" }, admin),
    /INJECTED_AUDIT_FAILURE/,
  );
  assert.equal(auditAttempted, true);
  const afterAuditFailure = await prisma.serviceOrderOpening.findUniqueOrThrow({ where: { publicId: ownedOpening.body.data.publicId } });
  assert.equal(afterAuditFailure.complaint, beforeAuditFailure.complaint, "Falha de auditoria não reverteu o PATCH");
  assert.equal(await prisma.adminAuditLog.count({ where: { eventCode: "OS_OPENING_UPDATED_BY_ADMIN", targetUserId: owner.id } }), auditCount);
  expectStatus(await request("GET", ownedPath, { cookie: outsiderSession.cookie }), 404, "Consulta alheia sem permissão");
  expectStatus(await request("POST", `${ownedPath}/cancel`, { ...outsiderSession }), 404, "Cancelamento alheio sem permissão");
  expectStatus(await request("GET", ownedPath, { cookie: managerSession.cookie }), 200, "Consulta alheia com manage");
  const managerCancel = await request("POST", `${ownedPath}/cancel`, { ...managerSession });
  expectStatus(managerCancel, 200, "Cancelamento alheio com manage");
  expectStatus(await request("PATCH", ownedPath, { ...ownerSession, body: { complaint: "Terminal" } }), 409, "PATCH abertura cancelada");
  const ownedRow = await prisma.serviceOrderOpening.findUniqueOrThrow({ where: { publicId: ownedOpening.body.data.publicId } });
  const administrativeEvents = await prisma.serviceOrderEvent.findMany({ where: { openingId: ownedRow.id }, orderBy: { id: "asc" } });
  assert.deepEqual(administrativeEvents.map(({ eventType }) => eventType), [
    "ABERTURA_EM_ANDAMENTO_CRIADA", "ABERTURA_CANCELADA", "ABERTURA_CANCELADA_POR_ADMIN",
  ]);
  assert.equal(administrativeEvents[2].actorUserId, manager.id);
  assert.equal(administrativeEvents[2].initiatingUserId, owner.id);

  const sameSession = await login(simultaneous);
  const sameResponses = await Promise.all([
    request("POST", "/service-orders/openings", { ...sameSession }),
    request("POST", "/service-orders/openings", { ...sameSession }),
  ]);
  assert.deepEqual(sameResponses.map(({ status }) => status).sort(), [201, 409]);
  assert.equal(await prisma.serviceOrderOpening.count({ where: { activeForUserId: simultaneous.id } }), 1);
  const sameOpening = sameResponses.find(({ status }) => status === 201).body.data;

  const secondSession = await login(second);
  const thirdSession = await login(third);
  const distinctResponses = await Promise.all([
    request("POST", "/service-orders/openings", { ...secondSession }),
    request("POST", "/service-orders/openings", { ...thirdSession }),
  ]);
  assert.deepEqual(distinctResponses.map(({ status }) => status), [201, 201]);
  const distinctNumbers = distinctResponses.map(({ body }) => body.data.numberValue);
  assert.equal(new Set(distinctNumbers).size, 2);

  const earlierCancel = await request("POST", `/service-orders/openings/${sameOpening.publicId}/cancel`, { ...sameSession });
  expectStatus(earlierCancel, 200, "Cancelar número inferior");
  assert.equal(earlierCancel.body.data.numberReleased, false);
  const consumed = await prisma.serviceOrderNumberAllocation.findUniqueOrThrow({ where: { numberValue: BigInt(sameOpening.numberValue) } });
  assert.equal(consumed.status, "CONSUMED");

  const fourthSession = await login(fourth);
  const fourthOpening = await request("POST", "/service-orders/openings", { ...fourthSession });
  expectStatus(fourthOpening, 201, "Criar após consumo");
  assert.notEqual(fourthOpening.body.data.numberValue, sameOpening.numberValue);
  const fourthCancel = await request("POST", `/service-orders/openings/${fourthOpening.body.data.publicId}/cancel`, { ...fourthSession });
  expectStatus(fourthCancel, 200, "Cancelar última reserva");
  assert.equal(fourthCancel.body.data.numberReleased, true);
  const fifthSession = await login(fifth);
  const fifthOpening = await request("POST", "/service-orders/openings", { ...fifthSession });
  expectStatus(fifthOpening, 201, "Reutilizar última reserva");
  assert.equal(fifthOpening.body.data.numberValue, fourthOpening.body.data.numberValue);

  // Inject a failure at the event write while Prisma's real MySQL transaction is open.
  const controlBefore = await prisma.serviceOrderNumberControl.findUniqueOrThrow({ where: { id: 1 } });
  const openingsBefore = await prisma.serviceOrderOpening.count();
  const allocationsBefore = await prisma.serviceOrderNumberAllocation.count();
  const eventsBefore = await prisma.serviceOrderEvent.count();
  let eventAttempted = false;
  const failingClient = {
    serviceOrderOpening: prisma.serviceOrderOpening,
    $transaction: (callback, options) => prisma.$transaction((tx) => callback(new Proxy(tx, {
      get(target, key, receiver) {
        if (key === "serviceOrderEvent") {
          return new Proxy(target.serviceOrderEvent, {
            get(delegate, method) {
              if (method === "create") return async () => { eventAttempted = true; throw new Error("INJECTED_EVENT_FAILURE"); };
              return Reflect.get(delegate, method);
            },
          });
        }
        return Reflect.get(target, key, receiver);
      },
    })), options),
  };
  const failingService = new ServiceOrderOpeningsService(failingClient, null);
  await assert.rejects(
    failingService.create({ id: failureUser.id, publicId: failureUser.publicId }),
    /INJECTED_EVENT_FAILURE/,
  );
  assert.equal(eventAttempted, true, "A falha não ocorreu na gravação do evento");
  assert.equal(await prisma.serviceOrderOpening.count(), openingsBefore);
  assert.equal(await prisma.serviceOrderNumberAllocation.count(), allocationsBefore);
  assert.equal(await prisma.serviceOrderEvent.count(), eventsBefore);
  const controlAfter = await prisma.serviceOrderNumberControl.findUniqueOrThrow({ where: { id: 1 } });
  assert.equal(controlAfter.nextNumber, controlBefore.nextNumber);
  assert.equal(controlAfter.highestReservedNumber, controlBefore.highestReservedNumber);

  const invalidAllocationCount = await prisma.$queryRaw`
    SELECT COUNT(*) AS total
    FROM service_order_number_allocations AS a
    LEFT JOIN service_order_openings AS o ON o.id = a.opening_id
    WHERE (a.status IN ('RESERVED', 'CONSUMED') AND (a.opening_id IS NULL OR o.id IS NULL))
       OR (a.status = 'RELEASED' AND a.opening_id IS NOT NULL)
  `;
  const duplicateActiveCount = await prisma.$queryRaw`
    SELECT COUNT(*) AS total FROM (
      SELECT active_for_user_id FROM service_order_openings
      WHERE active_for_user_id IS NOT NULL
      GROUP BY active_for_user_id HAVING COUNT(*) > 1
    ) AS duplicates
  `;
  const duplicateNumbers = await prisma.$queryRaw`
    SELECT COUNT(*) AS total FROM (
      SELECT number_value FROM service_order_number_allocations
      GROUP BY number_value HAVING COUNT(*) > 1
    ) AS duplicates
  `;
  const events = await prisma.serviceOrderEvent.groupBy({ by: ["eventType"], _count: { _all: true } });
  assert.equal(Number(invalidAllocationCount[0].total), 0);
  assert.equal(Number(duplicateActiveCount[0].total), 0);
  assert.equal(Number(duplicateNumbers[0].total), 0);
  assert.equal(await prisma.serviceOrder.count(), initialOrders);
  console.log(JSON.stringify({
    database: database[0].name,
    http: "auth/csrf/permissions passed",
    concurrency: "same-user and distinct-user passed",
    numbering: "released/consumed/reused passed",
    rollback: "event failure rolled back in MySQL",
    postTest: {
      nextNumber: controlAfter.nextNumber.toString(),
      highestReservedNumber: controlAfter.highestReservedNumber.toString(),
      openings: await prisma.serviceOrderOpening.count(),
      allocations: await prisma.serviceOrderNumberAllocation.count(),
      events: events.map((entry) => ({ type: entry.eventType, count: entry._count._all })),
      invalidAllocations: Number(invalidAllocationCount[0].total),
      duplicateActiveUsers: Number(duplicateActiveCount[0].total),
      duplicateNumbers: Number(duplicateNumbers[0].total),
    },
  }));
  completed = true;
} finally {
  await app.close();
  if (!completed) console.error("Teste interrompido; dados já gravados no banco isolado foram preservados para diagnóstico.");
}
