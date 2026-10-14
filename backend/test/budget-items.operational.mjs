import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import argon2 from "argon2";
import dotenv from "dotenv";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../dist/generated/prisma/client.js";

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = dotenv.parse(fs.readFileSync(path.join(backendDir, ".env")));
const databaseUrl = new URL(envFile.DATABASE_URL);
databaseUrl.pathname = "/gestor_os_opening_test";
assert.ok(["localhost", "127.0.0.1"].includes(databaseUrl.hostname), "A validação só aceita MySQL local.");
assert.equal(databaseUrl.pathname, "/gestor_os_opening_test", "O alvo tem que ser exclusivamente gestor_os_opening_test.");

const prisma = new PrismaClient({ adapter: new PrismaMariaDb({
  host: databaseUrl.hostname,
  port: Number(databaseUrl.port || 3306),
  user: decodeURIComponent(databaseUrl.username),
  password: decodeURIComponent(databaseUrl.password),
  database: "gestor_os_opening_test",
}) });
const nonce = randomBytes(5).toString("hex");
const username = `budgettest_${nonce}`;
const password = randomBytes(32).toString("base64url");
const catalogName = `Serviço validação ${nonce}`;
const inactiveName = `Mão de obra ${nonce}`;
const normalizedNames = [catalogName, inactiveName, `Diagnóstico ${nonce}`, `Diagnóstico alterado ${nonce}`, `Peça sem custo ${nonce}`]
  .map((value) => value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleUpperCase("pt-BR").replace(/\s+/gu, " ").trim());
let userId;
let order;
let previousSituation;
let server;
let cookie;
let csrfToken;
let editToken;
const createdServiceIds = [];
const createdItemIds = [];
const results = [];

function cookiePair(response, name) {
  const entries = response.headers.getSetCookie?.() ?? [];
  const entry = entries.find((value) => value.startsWith(`${name}=`));
  return entry?.split(";", 1)[0] ?? "";
}

async function responseJson(response) {
  return response.status === 204 ? null : response.json().catch(() => null);
}

async function api(pathname, { method = "GET", body, auth = true, csrf = true } = {}) {
  const headers = { Accept: "application/json", Origin: "http://127.0.0.1:5173" };
  if (auth) {
    headers.Cookie = cookie;
    if (csrf) headers["X-CSRF-Token"] = csrfToken;
  }
  if (editToken) headers["X-Service-Order-Edit-Token"] = editToken;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`http://127.0.0.1:3137/api/v1${pathname}`, {
    method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: await responseJson(response) };
}

function errorCode(result) {
  return result.body?.error?.code ?? result.body?.code;
}

async function expectFailure(pathname, method, body, status, code, options = {}) {
  const result = await api(pathname, { method, body, ...options });
  assert.equal(result.status, status, JSON.stringify(result.body));
  if (code) assert.equal(errorCode(result), code, JSON.stringify(result.body));
  return result;
}

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Backend de teste encerrou antes de ficar pronto (exit ${server.exitCode}).`);
    try {
      const response = await fetch("http://127.0.0.1:3137/api/v1/auth/csrf");
      if (response.ok) return;
    } catch { /* process is still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("Backend isolado não ficou pronto em 10 segundos.");
}

try {
  const selectedDatabase = await prisma.$queryRawUnsafe("SELECT DATABASE() AS db, VERSION() AS version");
  assert.equal(selectedDatabase[0].db, "gestor_os_opening_test");
  assert.match(selectedDatabase[0].version, /^8\.0\.46/u);
  order = await prisma.serviceOrder.findFirst({
    where: { opening: { is: { status: "CONFIRMED" } }, numberAllocation: { is: { status: "CONFIRMED" } } },
    orderBy: { id: "asc" },
    select: { id: true, publicId: true, numberValue: true, macroStatus: true, operationalSituation: true, updatedAt: true },
  });
  assert.ok(order, "O banco de teste precisa conter ao menos uma OS confirmada.");
  assert.equal(order.macroStatus, "OPEN", "A OS de teste precisa estar aberta.");
  previousSituation = order.operationalSituation;

  const hash = await argon2.hash(password, { type: argon2.argon2id });
  const user = await prisma.user.create({ data: { username, passwordHash: hash } });
  userId = user.id;
  const permissionCodes = [
    "service_orders.read", "service_orders.events.read", "service_orders.update", "service_orders.situation.update",
    "service_orders.budget.update", "service_orders.budget.costs.read", "service_orders.budget.costs.update", "services.manage",
  ];
  const permissionRows = await prisma.permission.findMany({ where: { code: { in: permissionCodes } }, select: { id: true, code: true } });
  assert.equal(permissionRows.length, permissionCodes.length, "Execute seed-permissions no banco de teste antes deste roteiro.");
  await prisma.userPermission.createMany({ data: permissionRows.map(({ id }) => ({ userId, permissionId: id })) });

  server = spawn(process.execPath, ["dist/main.js"], {
    cwd: backendDir,
    windowsHide: true,
    env: { ...process.env, DATABASE_URL: databaseUrl.toString(), PORT: "3137", NODE_ENV: "development" },
    stdio: "ignore",
  });
  await waitForServer();

  const preAuth = await fetch("http://127.0.0.1:3137/api/v1/auth/csrf");
  const preAuthCookie = cookiePair(preAuth, "gos_pre_auth");
  const preAuthBody = await preAuth.json();
  assert.ok(preAuthCookie && preAuthBody.data?.csrfToken, "Contexto CSRF pré-login não foi criado.");
  const login = await fetch("http://127.0.0.1:3137/api/v1/auth/login", {
    method: "POST", headers: {
      "Content-Type": "application/json", Accept: "application/json", Origin: "http://127.0.0.1:5173",
      Cookie: preAuthCookie, "X-CSRF-Token": preAuthBody.data.csrfToken,
    }, body: JSON.stringify({ username, password }),
  });
  const loginBody = await responseJson(login);
  assert.equal(login.status, 201, JSON.stringify(loginBody));
  cookie = cookiePair(login, "gos_session");
  csrfToken = loginBody.data.csrfToken;
  assert.ok(cookie && csrfToken);

  editToken = randomUUID();
  const acquiredControl = await api(`/service-orders/${order.publicId}/edit-control`, { method: "POST" });
  assert.equal(acquiredControl.status, 201, JSON.stringify(acquiredControl.body));

  const initial = await api(`/service-orders/${order.publicId}/budget-items`);
  assert.equal(initial.status, 200);
  assert.equal(initial.body.total, "0.00");
  assert.equal(initial.body.data.length, 0, "A OS escolhida deve começar sem itens de teste existentes.");
  results.push("GET composição vazia, total decimal e leitura autenticada");

  const available = await api("/services/available-for-order");
  assert.equal(available.status, 200);
  assert.deepEqual(available.body.data, []);

  const serviceCreate = await api("/services", { method: "POST", body: { name: catalogName, defaultPrice: "123.45" } });
  assert.equal(serviceCreate.status, 201, JSON.stringify(serviceCreate.body));
  const service = serviceCreate.body.data;
  createdServiceIds.push(service.publicId);
  const registered = await api(`/service-orders/${order.publicId}/budget-items/service`, {
    method: "POST", body: { servicePublicId: service.publicId },
  });
  assert.equal(registered.status, 201, JSON.stringify(registered.body));
  assert.equal(registered.body.data.quantity, 1);
  assert.equal(registered.body.data.unitPrice, "123.45");
  assert.equal(registered.body.data.description, catalogName);
  createdItemIds.push(registered.body.data.publicId);
  const duplicateService = await expectFailure(`/service-orders/${order.publicId}/budget-items/service`, "POST", { servicePublicId: service.publicId }, 409, "BUDGET_ITEM_DUPLICATE");
  assert.equal(duplicateService.body.details.existingItemPublicId, registered.body.data.publicId);
  const changedDefault = await api(`/services/${service.publicId}`, { method: "PATCH", body: { expectedVersion: 1, defaultPrice: "200.00" } });
  assert.equal(changedDefault.status, 200, JSON.stringify(changedDefault.body));
  const unchangedItemPrice = await api(`/service-orders/${order.publicId}/budget-items`);
  assert.equal(unchangedItemPrice.body.data.find((item) => item.publicId === registered.body.data.publicId).unitPrice, "123.45");
  const disabled = await api(`/services/${service.publicId}`, { method: "PATCH", body: { expectedVersion: 2, isActive: false } });
  assert.equal(disabled.status, 200, JSON.stringify(disabled.body));
  await expectFailure(`/service-orders/${order.publicId}/budget-items/service`, "POST", { servicePublicId: service.publicId }, 409, "SERVICE_INACTIVE");
  const editInactiveItem = await api(`/service-orders/${order.publicId}/budget-items/${registered.body.data.publicId}`, { method: "PATCH", body: { expectedVersion: 1, quantity: 2 } });
  assert.equal(editInactiveItem.status, 200, JSON.stringify(editInactiveItem.body));
  assert.equal(editInactiveItem.body.data.unitPrice, "123.45");
  const reenabled = await api(`/services/${service.publicId}`, { method: "PATCH", body: { expectedVersion: 3, isActive: true } });
  assert.equal(reenabled.status, 200, JSON.stringify(reenabled.body));
  await expectFailure(`/services/${service.publicId}?expectedVersion=4`, "DELETE", undefined, 409, "SERVICE_ALREADY_USED");
  results.push("Serviço cadastrado, cópia do preço padrão, duplicidade e proteção contra exclusão física");

  const inactiveCreate = await api("/services", { method: "POST", body: { name: inactiveName, defaultPrice: "0.00" } });
  assert.equal(inactiveCreate.status, 201, JSON.stringify(inactiveCreate.body));
  const inactive = inactiveCreate.body.data;
  createdServiceIds.push(inactive.publicId);
  await api(`/services/${inactive.publicId}`, { method: "PATCH", body: { expectedVersion: 1, isActive: false } }).then((r) => assert.equal(r.status, 200));
  await expectFailure(`/service-orders/${order.publicId}/budget-items/manual-labor`, "POST", { description: inactiveName, quantity: 1, unitPrice: "0" }, 409, "MANUAL_LABOR_MATCHES_CATALOG");
  await expectFailure(`/service-orders/${order.publicId}/budget-items/manual-labor`, "POST", { description: catalogName, quantity: 1, unitPrice: "0" }, 409, "MANUAL_LABOR_MATCHES_CATALOG");

  const labor = await api(`/service-orders/${order.publicId}/budget-items/manual-labor`, { method: "POST", body: { description: `Diagnóstico ${nonce}`, unitPrice: "0" } });
  assert.equal(labor.status, 201, JSON.stringify(labor.body));
  createdItemIds.push(labor.body.data.publicId);
  const part = await api(`/service-orders/${order.publicId}/budget-items/manual-part`, {
    method: "POST", body: { description: `Diagnóstico ${nonce}`, quantity: 999, unitPrice: "10.00", unitCost: "0.00" },
  });
  assert.equal(part.status, 201, JSON.stringify(part.body));
  createdItemIds.push(part.body.data.publicId);
  assert.equal(part.body.data.total, "9990.00");
  const duplicatePart = await expectFailure(`/service-orders/${order.publicId}/budget-items/manual-part`, "POST", {
    description: `  diagnostico   ${nonce}  `, unitPrice: "1.00",
  }, 409, "BUDGET_ITEM_DUPLICATE");
  assert.equal(duplicatePart.body.details.existingItemPublicId, part.body.data.publicId);
  await expectFailure(`/service-orders/${order.publicId}/budget-items/manual-part`, "POST", { description: "Quantidade inválida", quantity: 1000, unitPrice: "1.00" }, 400, "INVALID_BUDGET_QUANTITY");
  await expectFailure(`/service-orders/${order.publicId}/budget-items/manual-part`, "POST", { description: "Preço inválido", unitPrice: "1000000.00" }, 400, "INVALID_BUDGET_MONEY");
  results.push("Mão de obra e peça avulsas, equivalência com catálogo ativo/inativo, categoria, normalização e limites");

  const csrfFailure = await expectFailure(`/service-orders/${order.publicId}/budget-items/manual-part`, "POST", { description: "Sem CSRF", unitPrice: "1.00" }, 403, "CSRF_TOKEN_INVALID", { csrf: false });
  assert.equal(csrfFailure.status, 403);
  results.push("Proteção CSRF nas mutações");

  const eventsBeforeUpdate = await prisma.serviceOrderEvent.count({ where: { serviceOrderId: order.id, actorUserId: userId } });
  const update = await api(`/service-orders/${order.publicId}/budget-items/${part.body.data.publicId}`, {
    method: "PATCH", body: { expectedVersion: 1, quantity: 2, unitPrice: "11.25", description: `Diagnóstico alterado ${nonce}`, unitCost: "5.50" },
  });
  assert.equal(update.status, 200, JSON.stringify(update.body));
  const eventsAfterUpdate = await prisma.serviceOrderEvent.count({ where: { serviceOrderId: order.id, actorUserId: userId } });
  assert.equal(eventsAfterUpdate, eventsBeforeUpdate + 1, "Um salvamento deve gerar exatamente um evento.");
  assert.equal(update.body.data.total, "22.50");
  const changedEvent = await prisma.serviceOrderEvent.findFirst({ where: { serviceOrderId: order.id, actorUserId: userId, eventType: "ITEM_ORCAMENTO_ALTERADO" }, orderBy: { id: "desc" } });
  assert.deepEqual(changedEvent.payload.changes.map(({ field }) => field).sort(), ["description", "quantity", "unitCost", "unitPrice"]);
  results.push("Edição consolidada em um evento, com valores antes/depois e total calculado no Backend");

  const costReadPermission = permissionRows.find(({ code }) => code === "service_orders.budget.costs.read");
  await prisma.userPermission.delete({ where: { userId_permissionId: { userId, permissionId: costReadPermission.id } } });
  const hidden = await api(`/service-orders/${order.publicId}/budget-items`);
  assert.equal(hidden.status, 200);
  assert.equal(Object.hasOwn(hidden.body.data.find((item) => item.publicId === part.body.data.publicId), "unitCost"), false);
  await expectFailure(`/service-orders/${order.publicId}/budget-items/${part.body.data.publicId}`, "PATCH", { expectedVersion: 2, unitCost: "9.00" }, 403, "PERMISSION_DENIED");
  const quantityOnly = await api(`/service-orders/${order.publicId}/budget-items/${part.body.data.publicId}`, { method: "PATCH", body: { expectedVersion: 2, quantity: 3 } });
  assert.equal(quantityOnly.status, 200);
  const stored = await prisma.serviceOrderBudgetItem.findUnique({ where: { publicId: part.body.data.publicId } });
  assert.equal(stored.unitCost.toFixed(2), "5.50", "Edição sem leitura de custo preserva o valor interno.");
  const historyHidden = await api(`/service-orders/${order.publicId}/history?pageSize=100`);
  assert.equal(historyHidden.status, 200);
  const budgetHistory = historyHidden.body.data.filter((entry) => entry.kind === "SYSTEM_EVENT" && entry.eventType.startsWith("ITEM_ORCAMENTO_"));
  assert.ok(budgetHistory.length);
  assert.equal(JSON.stringify(budgetHistory).includes("unitCost"), false);
  const eventsHidden = await api(`/service-orders/${order.publicId}/events?page=1&pageSize=100`);
  assert.equal(JSON.stringify(eventsHidden.body.data.filter((entry) => entry.eventType.startsWith("ITEM_ORCAMENTO_"))).includes("unitCost"), false);
  await prisma.userPermission.create({ data: { userId, permissionId: costReadPermission.id } });
  results.push("Custo oculto na composição e no histórico; alteração negada sem permissão e custo preservado em edição comum");

  const nullCost = await api(`/service-orders/${order.publicId}/budget-items/manual-part`, { method: "POST", body: { description: `Peça sem custo ${nonce}`, unitPrice: "0.00" } });
  assert.equal(nullCost.status, 201, JSON.stringify(nullCost.body));
  createdItemIds.push(nullCost.body.data.publicId);
  assert.equal(nullCost.body.data.unitCost, null);
  const removed = await api(`/service-orders/${order.publicId}/budget-items/${labor.body.data.publicId}`, { method: "DELETE" });
  assert.equal(removed.status, 200, JSON.stringify(removed.body));
  const relaunch = await api(`/service-orders/${order.publicId}/budget-items/manual-labor`, { method: "POST", body: { description: `Diagnóstico ${nonce}`, unitPrice: "1.00" } });
  assert.equal(relaunch.status, 201, JSON.stringify(relaunch.body));
  createdItemIds.push(relaunch.body.data.publicId);
  const removedRow = await prisma.serviceOrderBudgetItem.findUnique({ where: { publicId: labor.body.data.publicId } });
  assert.ok(removedRow.removedAt && removedRow.removedByUserId === userId);
  results.push("Custo NULL preservado como desconhecido, remoção lógica e relançamento com novo item");

  const concurrentCreate = await api("/services", { method: "POST", body: { name: `Concorrente ${nonce}`, defaultPrice: "2.00" } });
  assert.equal(concurrentCreate.status, 201, JSON.stringify(concurrentCreate.body));
  normalizedNames.push(`CONCORRENTE ${nonce}`);
  createdServiceIds.push(concurrentCreate.body.data.publicId);
  const concurrentAdds = await Promise.all([0, 1].map(() => api(`/service-orders/${order.publicId}/budget-items/service`, {
    method: "POST", body: { servicePublicId: concurrentCreate.body.data.publicId },
  })));
  assert.deepEqual(concurrentAdds.map(({ status }) => status).sort(), [201, 409]);
  const successAdd = concurrentAdds.find(({ status }) => status === 201);
  createdItemIds.push(successAdd.body.data.publicId);
  results.push("Inclusões concorrentes do mesmo serviço são serializadas e deixam uma única linha ativa");

  const targetSituation = previousSituation === "NOT_AUTHORIZED_READY_DELIVERY" ? "NOT_AUTHORIZED_REASSEMBLE" : "NOT_AUTHORIZED_READY_DELIVERY";
  const withdrawal = await api(`/service-orders/${order.publicId}/operational-situation`, { method: "PATCH", body: { operationalSituation: targetSituation, withdrawBudget: true } });
  assert.equal(withdrawal.status, 200, JSON.stringify(withdrawal.body));
  const afterWithdrawal = await api(`/service-orders/${order.publicId}/budget-items`);
  assert.equal(afterWithdrawal.status, 200);
  assert.equal(afterWithdrawal.body.data.length, 0);
  assert.equal(afterWithdrawal.body.total, "0.00");
  const withdrawnEvent = await prisma.serviceOrderEvent.findFirst({ where: { serviceOrderId: order.id, actorUserId: userId, eventType: "ORCAMENTO_RETIRADO" }, orderBy: { id: "desc" } });
  assert.ok(withdrawnEvent);
  await expectFailure(`/services/${service.publicId}?expectedVersion=4`, "DELETE", undefined, 409, "SERVICE_ALREADY_USED");
  results.push("Retirada integral somente junto da situação NÃO AUTORIZADO, com snapshot e total histórico");

  const restored = await api(`/service-orders/${order.publicId}/operational-situation`, { method: "PATCH", body: { operationalSituation: previousSituation } });
  assert.equal(restored.status, 200, JSON.stringify(restored.body));
  const clean = await api(`/service-orders/${order.publicId}/budget-items`);
  assert.equal(clean.body.data.length, 0);
} finally {
  if (server && server.exitCode === null && editToken && cookie && order) {
    await api(`/service-orders/${order.publicId}/edit-control`, { method: "DELETE" }).catch(() => undefined);
  }
  if (server && server.exitCode === null) {
    const stopped = new Promise((resolve) => server.once("exit", resolve));
    server.kill();
    await Promise.race([stopped, new Promise((resolve) => setTimeout(resolve, 2_000))]);
  }
  try {
    if (userId && order) {
      await prisma.$transaction(async (tx) => {
        await tx.serviceOrderEvent.deleteMany({ where: { serviceOrderId: order.id, actorUserId: userId } });
        await tx.serviceOrderBudgetItem.deleteMany({ where: { serviceOrderId: order.id, OR: [{ createdByUserId: userId }, { updatedByUserId: userId }, { removedByUserId: userId }] } });
        await tx.serviceCatalog.deleteMany({ where: { createdByUserId: userId } });
        await tx.adminAuditLog.deleteMany({ where: { actorUserId: userId } });
        await tx.userSession.deleteMany({ where: { userId } });
        await tx.userPermission.deleteMany({ where: { userId } });
        await tx.user.deleteMany({ where: { id: userId } });
        if (previousSituation !== undefined) await tx.serviceOrder.update({ where: { id: order.id }, data: { operationalSituation: previousSituation, updatedAt: order.updatedAt } });
        await tx.serviceOrderBudgetNameLock.deleteMany({ where: { normalizedName: { in: normalizedNames } } });
      });
    }
  } finally {
    await prisma.$disconnect();
  }
}

console.log(`Validação HTTP concluída somente em gestor_os_opening_test (${results.length} grupos):`);
for (const result of results) console.log(`- ${result}`);
