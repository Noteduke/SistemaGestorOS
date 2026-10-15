import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { NestFactory } from "@nestjs/core";
import argon2 from "argon2";
import dotenv from "dotenv";
import { AppModule } from "../dist/app.module.js";
import { PrismaService } from "../dist/infrastructure/prisma/prisma.service.js";

dotenv.config({ path: ".env", quiet: true });
const source = process.env.DATABASE_URL;
if (!source) throw new Error("DATABASE_URL ausente.");
const target = new URL(source);
if (target.protocol !== "mysql:") throw new Error("DATABASE_URL não é MySQL.");
target.pathname = "/gestor_os_opening_test";
target.search = "";
process.env.DATABASE_URL = target.toString();
delete process.env.SHADOW_DATABASE_URL;

const app = await NestFactory.create(AppModule, { logger: false });
app.setGlobalPrefix("api/v1");
const prisma = app.get(PrismaService);
let userId;
let adminUserId;
const additionalUserIds = [];
const productIds = [];

function cookie(response, name) {
  const value = response.headers.getSetCookie().find((entry) => entry.startsWith(`${name}=`));
  assert.ok(value, `Cookie ${name} ausente.`);
  return value.split(";", 1)[0];
}

async function api(base, method, path, options = {}) {
  const response = await fetch(`${base}/api/v1${path}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.cookie ? { Cookie: options.cookie } : {}),
      ...(options.csrf ? { "X-CSRF-Token": options.csrf } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  return { status: response.status, body, response };
}

async function createSession(base, username, permissionCodes = [], isAdmin = false) {
  const password = randomBytes(24).toString("base64url");
  const user = await prisma.user.create({ data: { username, passwordHash: await argon2.hash(password), isAdmin } });
  additionalUserIds.push(user.id);
  for (const code of permissionCodes) {
    const permission = await prisma.permission.findUniqueOrThrow({ where: { code } });
    await prisma.userPermission.create({ data: { userId: user.id, permissionId: permission.id } });
  }
  const csrfContext = await api(base, "GET", "/auth/csrf");
  assert.equal(csrfContext.status, 200);
  const preCookie = cookie(csrfContext.response, "gos_pre_auth");
  const login = await api(base, "POST", "/auth/login", { cookie: preCookie, csrf: csrfContext.body.data.csrfToken, body: { username, password } });
  assert.ok([200, 201].includes(login.status));
  const sessionCookie = cookie(login.response, "gos_session");
  const identity = await api(base, "GET", "/auth/me", { cookie: sessionCookie });
  assert.equal(identity.status, 200);
  return { user, cookie: sessionCookie, csrf: identity.body.data.csrfToken, identity: identity.body.data };
}

try {
  const selected = await prisma.$queryRaw`SELECT DATABASE() AS selected_database`;
  assert.equal(selected[0]?.selected_database, "gestor_os_opening_test", "Nenhuma escrita pode ocorrer fora do banco isolado.");
  process.stdout.write("DATABASE()=gestor_os_opening_test; validação operacional de Produtos inicia no banco isolado.\n");
  await app.listen(0, "127.0.0.1");

  assert.equal(await prisma.permission.count(), 43, "Atualize o seed de permissões no banco isolado antes do roteiro.");
  const permissionRow = await prisma.permission.findUniqueOrThrow({ where: { code: "products.manage" } });
  await prisma.permission.findUniqueOrThrow({ where: { code: "products.cost.read" } });
  await prisma.permission.findUniqueOrThrow({ where: { code: "products.cost.update" } });
  await prisma.permission.findUniqueOrThrow({ where: { code: "products.stock.manage" } });
  const suffix = randomBytes(5).toString("hex").toUpperCase();
  const password = randomBytes(24).toString("base64url");
  const user = await prisma.user.create({ data: {
    username: `validacao.products.${suffix.toLowerCase()}`,
    passwordHash: await argon2.hash(password),
  } });
  userId = user.id;
  const base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
  const readSession = await createSession(base, `validacao.products.read.${suffix.toLowerCase()}`, ["products.manage", "products.cost.read"]);
  const updateSession = await createSession(base, `validacao.products.update.${suffix.toLowerCase()}`, ["products.manage", "products.cost.update"]);
  const costOnlySession = await createSession(base, `validacao.products.costonly.${suffix.toLowerCase()}`, ["products.cost.update"]);
  assert.ok(readSession.identity.permissions.includes("products.cost.read"));
  assert.equal(readSession.identity.permissions.includes("products.cost.update"), false);
  assert.ok(updateSession.identity.permissions.includes("products.cost.update"));
  assert.equal(updateSession.identity.permissions.includes("products.cost.read"), false);

  const csrfContext = await api(base, "GET", "/auth/csrf");
  assert.equal(csrfContext.status, 200);
  const preCookie = cookie(csrfContext.response, "gos_pre_auth");
  const login = await api(base, "POST", "/auth/login", {
    cookie: preCookie, csrf: csrfContext.body.data.csrfToken,
    body: { username: user.username, password },
  });
  // Use a one-time in-memory password to avoid placing credentials in files or logs.
  if (login.status !== 200 && login.status !== 201) {
    throw new Error("Login operacional não autenticou; nenhuma senha é registrada pelo teste.");
  }
  const sessionCookie = cookie(login.response, "gos_session");
  const identity = await api(base, "GET", "/auth/me", { cookie: sessionCookie });
  assert.equal(identity.status, 200);
  const csrf = identity.body.data.csrfToken;
  assert.equal(identity.body.data.isAdmin, false);

  assert.equal((await api(base, "GET", "/products?page=1&pageSize=20", { cookie: sessionCookie })).status, 403);
  assert.equal((await api(base, "POST", "/products", { cookie: sessionCookie, csrf, body: { description: "Sem permissão", category: "PART" } })).status, 403);
  await prisma.userPermission.create({ data: { userId, permissionId: permissionRow.id } });
  assert.equal((await api(base, "GET", "/products?page=1&pageSize=20", { cookie: sessionCookie })).status, 200);
  assert.equal((await api(base, "POST", "/products", { cookie: sessionCookie, body: { description: "Sem CSRF", category: "PART" } })).status, 403);

  const created = await api(base, "POST", "/products", { cookie: sessionCookie, csrf, body: {
    internalCode: ` teste-${suffix} `, description: "  Placa   Mãe de Teste ", category: "PART", salePrice: "12.50",
  } });
  assert.equal(created.status, 201);
  const product = created.body.data;
  productIds.push(product.publicId);
  assert.equal(product.internalCode, `TESTE-${suffix}`);
  assert.equal(product.description, "PLACA MÃE DE TESTE");
  assert.equal(product.category, "PART");
  assert.equal(product.salePrice, "12.50");
  assert.equal(Object.hasOwn(product, "acquisitionCost"), false);
  assert.equal(Object.hasOwn(product, "grossProfitEstimate"), false);
  assert.equal(await prisma.productStockMovement.count({ where: { product: { publicId: product.publicId } } }), 0,
    "produto novo começa sem movimento; a consulta de detalhe deriva saldo zero");
  assert.deepEqual((await api(base, "GET", `/products/${product.publicId}`, { cookie: sessionCookie })).body.data.stock,
    { total: 0, applied: 0, defective: 0, available: 0 });
  const negativeSale = await api(base, "POST", "/products", { cookie: sessionCookie, csrf, body: {
    description: "Preço negativo rejeitado", category: "PART", salePrice: "-0.01",
  } });
  assert.equal(negativeSale.status, 400);
  assert.equal(product.isActive, true);

  const stockOnlySession = await createSession(base, `validacao.products.stock.${suffix.toLowerCase()}`, ["products.stock.manage"]);
  assert.equal(stockOnlySession.identity.permissions.includes("products.manage"), false);
  const stockOnlyProducts = await api(base, "GET", `/products?page=1&pageSize=20&search=${suffix}`, { cookie: stockOnlySession.cookie });
  assert.equal(stockOnlyProducts.status, 200, "gestor de estoque pode consultar produtos necessários à operação");
  assert.equal(Object.hasOwn(stockOnlyProducts.body.data[0], "acquisitionCost"), false);
  assert.equal((await api(base, "POST", "/products", { cookie: stockOnlySession.cookie, csrf: stockOnlySession.csrf, body: {
    description: "Estoque não administra cadastro", category: "PART",
  } })).status, 403);
  assert.equal((await api(base, "POST", `/products/${product.publicId}/stock/entries`, { cookie: sessionCookie, csrf, body: { quantity: 1 } })).status, 403,
    "products.manage não concede movimentação de estoque");
  const stockRoute = `/products/${product.publicId}/stock`;
  const emptyStock = await api(base, "GET", stockRoute, { cookie: stockOnlySession.cookie });
  assert.equal(emptyStock.status, 200);
  assert.deepEqual(emptyStock.body.data.stock, { total: 0, applied: 0, defective: 0, available: 0 });
  assert.equal((await api(base, "POST", `${stockRoute}/entries`, { cookie: stockOnlySession.cookie, body: { quantity: 1 } })).status, 403,
    "toda mutação exige CSRF mesmo com products.stock.manage");

  const entry = await api(base, "POST", `${stockRoute}/entries`, { cookie: stockOnlySession.cookie, csrf: stockOnlySession.csrf, body: { quantity: 5 } });
  assert.equal(entry.status, 201);
  assert.deepEqual(entry.body.data.stock, { total: 5, applied: 0, defective: 0, available: 5 });
  const negativeAdjustment = await api(base, "POST", `${stockRoute}/adjustments`, { cookie: stockOnlySession.cookie, csrf: stockOnlySession.csrf, body: { quantityDelta: -7 } });
  assert.equal(negativeAdjustment.status, 201, "ajuste manual pode levar o disponível a negativo");
  assert.deepEqual(negativeAdjustment.body.data.stock, { total: -2, applied: 0, defective: 0, available: -2 });
  const recoveryEntry = await api(base, "POST", `${stockRoute}/entries`, { cookie: stockOnlySession.cookie, csrf: stockOnlySession.csrf, body: { quantity: 6 } });
  assert.equal(recoveryEntry.status, 201);
  assert.deepEqual(recoveryEntry.body.data.stock, { total: 4, applied: 0, defective: 0, available: 4 });
  const classified = await api(base, "POST", `${stockRoute}/defective/classifications`, { cookie: stockOnlySession.cookie, csrf: stockOnlySession.csrf, body: { quantity: 2 } });
  assert.equal(classified.status, 201);
  assert.deepEqual(classified.body.data.stock, { total: 4, applied: 0, defective: 2, available: 2 });
  const overClassified = await api(base, "POST", `${stockRoute}/defective/classifications`, { cookie: stockOnlySession.cookie, csrf: stockOnlySession.csrf, body: { quantity: 3 } });
  assert.equal(overClassified.status, 409);
  assert.equal(overClassified.body.error?.code ?? overClassified.body.code, "INSUFFICIENT_AVAILABLE_STOCK");
  const returned = await api(base, "POST", `${stockRoute}/defective/returns`, { cookie: stockOnlySession.cookie, csrf: stockOnlySession.csrf, body: { quantity: 1 } });
  assert.equal(returned.status, 201);
  assert.deepEqual(returned.body.data.stock, { total: 4, applied: 0, defective: 1, available: 3 });
  const unconfirmedDisposal = await api(base, "POST", `${stockRoute}/defective/disposals`, { cookie: stockOnlySession.cookie, csrf: stockOnlySession.csrf, body: { quantity: 1, confirmed: false } });
  assert.equal(unconfirmedDisposal.status, 400);
  const disposed = await api(base, "POST", `${stockRoute}/defective/disposals`, { cookie: stockOnlySession.cookie, csrf: stockOnlySession.csrf, body: { quantity: 1, confirmed: true } });
  assert.equal(disposed.status, 201);
  assert.deepEqual(disposed.body.data.stock, { total: 3, applied: 0, defective: 0, available: 3 });

  const concurrentEntries = await Promise.all([1, 2].map(() => api(base, "POST", `${stockRoute}/entries`, {
    cookie: stockOnlySession.cookie, csrf: stockOnlySession.csrf, body: { quantity: 1 },
  })));
  assert.ok(concurrentEntries.every((result) => result.status === 201), "entradas concorrentes serializam sem perda");
  assert.deepEqual(concurrentEntries.map((result) => result.body.data.stock.total).sort((a, b) => a - b), [4, 5], "cada resposta reflete uma das duas operações serializadas");
  const stockSummary = await api(base, "GET", stockRoute, { cookie: stockOnlySession.cookie });
  assert.deepEqual(stockSummary.body.data.stock, { total: 5, applied: 0, defective: 0, available: 5 });
  const stockHistory = await api(base, "GET", `${stockRoute}/movements?page=1&pageSize=20`, { cookie: stockOnlySession.cookie });
  assert.equal(stockHistory.status, 200);
  assert.equal(stockHistory.body.data.length, 8);
  assert.ok(stockHistory.body.data.every((movement) => movement.actor.username === stockOnlySession.user.username));
  assert.equal(Object.hasOwn(stockHistory.body.data[0], "acquisitionCost"), false);
  const stockAudit = await prisma.adminAuditLog.findMany({
    where: { actorUserId: stockOnlySession.user.id, eventCode: { startsWith: "PRODUCT_STOCK_" }, detailsJson: { path: "$.productPublicId", equals: product.publicId } },
    orderBy: { id: "asc" },
  });
  assert.equal(stockAudit.length, 8);
  assert.ok(stockAudit.every((log) => log.occurredAt instanceof Date && log.detailsJson?.before && log.detailsJson?.after));
  assert.equal(stockAudit[0].eventCode, "PRODUCT_STOCK_MANUAL_ENTRY");
  assert.equal(stockAudit[0].detailsJson.after.available, 5);
  const stockOnlyMovements = await api(base, "GET", `${stockRoute}/movements?page=1&pageSize=20`, { cookie: sessionCookie });
  assert.equal(stockOnlyMovements.status, 200, "products.manage pode consultar histórico de movimentos sem permissão de escrita");

  assert.equal((await api(base, "GET", `/products/${product.publicId}`, { cookie: sessionCookie })).body.data.publicId, product.publicId);
  const byCode = await api(base, "GET", `/products?page=1&pageSize=20&search=${encodeURIComponent(suffix)}`, { cookie: sessionCookie });
  assert.equal(byCode.status, 200);
  assert.ok(byCode.body.data.some((item) => item.publicId === product.publicId));
  const duplicate = await api(base, "POST", "/products", { cookie: sessionCookie, csrf, body: {
    internalCode: `TESTE-${suffix}`, description: "Duplicado", category: "PART",
  } });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.body.error?.code ?? duplicate.body.code, "DUPLICATE_PRODUCT_CODE");

  const updated = await api(base, "PATCH", `/products/${product.publicId}`, { cookie: sessionCookie, csrf, body: {
    internalCode: product.internalCode, description: "Placa principal", category: "RESALE_GOOD", salePrice: "0.00", expectedVersion: product.version,
  } });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.data.description, "PLACA PRINCIPAL");
  assert.equal(updated.body.data.category, "RESALE_GOOD");
  assert.equal(updated.body.data.salePrice, "0.00");
  const forbiddenCostWrite = await api(base, "PATCH", `/products/${product.publicId}`, { cookie: sessionCookie, csrf, body: {
    acquisitionCost: "0.00", expectedVersion: updated.body.data.version,
  } });
  assert.equal(forbiddenCostWrite.status, 403);
  const stale = await api(base, "PATCH", `/products/${product.publicId}`, { cookie: sessionCookie, csrf, body: {
    description: "Sobrescrita antiga", expectedVersion: product.version,
  } });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.error?.code ?? stale.body.code, "PRODUCT_VERSION_CONFLICT");

  const deactivated = await api(base, "PATCH", `/products/${product.publicId}`, { cookie: sessionCookie, csrf, body: {
    isActive: false, expectedVersion: updated.body.data.version,
  } });
  assert.equal(deactivated.status, 200);
  const activeList = await api(base, "GET", `/products?page=1&pageSize=20&status=active&search=${suffix}`, { cookie: sessionCookie });
  const inactiveList = await api(base, "GET", `/products?page=1&pageSize=20&status=inactive&search=${suffix}`, { cookie: sessionCookie });
  assert.equal(activeList.body.data.some((item) => item.publicId === product.publicId), false);
  assert.equal(inactiveList.body.data.some((item) => item.publicId === product.publicId), true);
  assert.equal((await api(base, "GET", `/products/${product.publicId}`, { cookie: sessionCookie })).status, 200);
  const nonAdminList = await api(base, "GET", `/products?page=1&pageSize=20&status=all&search=${suffix}`, { cookie: sessionCookie });
  const nonAdminProduct = nonAdminList.body.data.find((item) => item.publicId === product.publicId);
  assert.equal(Object.hasOwn(nonAdminProduct, "acquisitionCost"), false);
  assert.equal(Object.hasOwn(nonAdminProduct, "grossProfitEstimate"), false);

  const costCreated = await api(base, "POST", "/products", { cookie: updateSession.cookie, csrf: updateSession.csrf, body: {
    description: "Produto com custo protegido", category: "PART", salePrice: "12.00", acquisitionCost: "4.25",
  } });
  assert.equal(costCreated.status, 201);
  const costProduct = costCreated.body.data;
  productIds.push(costProduct.publicId);
  assert.equal(Object.hasOwn(costProduct, "acquisitionCost"), false, "alterar custo não revela seu valor na resposta");
  assert.equal(Object.hasOwn(costProduct, "grossProfitEstimate"), false);
  assert.equal((await api(base, "GET", `/products?page=1&pageSize=20&search=Produto com custo protegido`, { cookie: sessionCookie })).status, 200);
  const readProduct = await api(base, "GET", `/products/${costProduct.publicId}`, { cookie: readSession.cookie });
  assert.equal(readProduct.status, 200);
  assert.equal(readProduct.body.data.acquisitionCost, "4.25");
  assert.equal(readProduct.body.data.grossProfitEstimate, "7.75");
  const readList = await api(base, "GET", `/products?page=1&pageSize=20&search=${encodeURIComponent("Produto com custo protegido")}`, { cookie: readSession.cookie });
  assert.equal(readList.body.data[0].acquisitionCost, "4.25");
  const readCannotWrite = await api(base, "PATCH", `/products/${costProduct.publicId}`, { cookie: readSession.cookie, csrf: readSession.csrf, body: {
    acquisitionCost: "3.00", expectedVersion: costProduct.version,
  } });
  assert.equal(readCannotWrite.status, 403, "leitura não concede alteração");
  const noManageWrite = await api(base, "PATCH", `/products/${costProduct.publicId}`, { cookie: costOnlySession.cookie, csrf: costOnlySession.csrf, body: {
    acquisitionCost: "3.00", expectedVersion: costProduct.version,
  } });
  assert.equal(noManageWrite.status, 403, "alteração de custo também exige products.manage");
  const hiddenHistory = await api(base, "GET", `/products/${costProduct.publicId}/history`, { cookie: sessionCookie });
  assert.equal(hiddenHistory.status, 404, "este recorte não expõe histórico administrativo por endpoint");
  const otherFieldUpdate = await api(base, "PATCH", `/products/${costProduct.publicId}`, { cookie: sessionCookie, csrf, body: {
    description: "Descrição sem custo", expectedVersion: costProduct.version,
  } });
  assert.equal(otherFieldUpdate.status, 200);
  assert.equal(Object.hasOwn(otherFieldUpdate.body.data, "acquisitionCost"), false);
  assert.equal((await prisma.product.findUnique({ where: { publicId: costProduct.publicId } })).acquisitionCost.toFixed(2), "4.25", "alterar outros campos preserva custo");
  const writeWithoutRead = await api(base, "PATCH", `/products/${costProduct.publicId}`, { cookie: updateSession.cookie, csrf: updateSession.csrf, body: {
    acquisitionCost: "3.00", expectedVersion: otherFieldUpdate.body.data.version,
  } });
  assert.equal(writeWithoutRead.status, 200);
  assert.equal(Object.hasOwn(writeWithoutRead.body.data, "acquisitionCost"), false);
  assert.equal(Object.hasOwn(writeWithoutRead.body.data, "grossProfitEstimate"), false);
  assert.equal((await prisma.product.findUnique({ where: { publicId: costProduct.publicId } })).acquisitionCost.toFixed(2), "3.00");
  const updateOnlyList = await api(base, "GET", `/products?page=1&pageSize=20&search=${encodeURIComponent("Descrição sem custo")}`, { cookie: updateSession.cookie });
  assert.equal(Object.hasOwn(updateOnlyList.body.data[0], "acquisitionCost"), false);
  assert.equal(Object.hasOwn(updateOnlyList.body.data[0], "grossProfitEstimate"), false);
  const costAudit = await prisma.adminAuditLog.findFirst({ where: { actorUserId: updateSession.user.id, eventCode: "PRODUCT_UPDATED", detailsJson: { path: "$.productPublicId", equals: costProduct.publicId } }, orderBy: { id: "desc" } });
  assert.ok(costAudit.occurredAt instanceof Date, "auditoria usa data/hora do servidor");
  assert.equal(costAudit.actorUserId, updateSession.user.id);
  assert.deepEqual(costAudit.detailsJson.before, { acquisitionCost: "4.25" });
  assert.deepEqual(costAudit.detailsJson.after, { acquisitionCost: "3.00" });

  const adminPassword = randomBytes(24).toString("base64url");
  const adminUser = await prisma.user.create({ data: {
    username: `validacao.products.admin.${suffix.toLowerCase()}`,
    passwordHash: await argon2.hash(adminPassword), isAdmin: true,
  } });
  adminUserId = adminUser.id;
  const adminCsrfContext = await api(base, "GET", "/auth/csrf");
  const adminPreCookie = cookie(adminCsrfContext.response, "gos_pre_auth");
  const adminLogin = await api(base, "POST", "/auth/login", {
    cookie: adminPreCookie, csrf: adminCsrfContext.body.data.csrfToken,
    body: { username: adminUser.username, password: adminPassword },
  });
  assert.ok([200, 201].includes(adminLogin.status));
  const adminSessionCookie = cookie(adminLogin.response, "gos_session");
  const adminIdentity = await api(base, "GET", "/auth/me", { cookie: adminSessionCookie });
  const adminCsrf = adminIdentity.body.data.csrfToken;
  assert.equal(adminIdentity.body.data.isAdmin, true);
  assert.equal((await api(base, "POST", `${stockRoute}/entries`, { cookie: adminSessionCookie, csrf: adminCsrf, body: { quantity: 1 } })).status, 201,
    "Administrador tem permissão efetiva de gestão de estoque sem concessão explícita individual");
  assert.ok(adminIdentity.body.data.permissions.includes("products.cost.read"));
  assert.ok(adminIdentity.body.data.permissions.includes("products.cost.update"));
  const adminCreated = await api(base, "POST", "/products", { cookie: adminSessionCookie, csrf: adminCsrf, body: {
    internalCode: `CUSTO-${suffix}`, description: "Produto custo teste", category: "PART", salePrice: "10.00", acquisitionCost: "2.50",
  } });
  assert.equal(adminCreated.status, 201);
  const adminProduct = adminCreated.body.data;
  productIds.push(adminProduct.publicId);
  assert.equal(adminProduct.acquisitionCost, "2.50");
  assert.equal(adminProduct.grossProfitEstimate, "7.50");
  const negativeCost = await api(base, "PATCH", `/products/${adminProduct.publicId}`, { cookie: adminSessionCookie, csrf: adminCsrf, body: {
    acquisitionCost: "-0.01", expectedVersion: adminProduct.version,
  } });
  assert.equal(negativeCost.status, 400);
  const zeroCost = await api(base, "PATCH", `/products/${adminProduct.publicId}`, { cookie: adminSessionCookie, csrf: adminCsrf, body: {
    acquisitionCost: "0.00", expectedVersion: adminProduct.version,
  } });
  assert.equal(zeroCost.status, 200);
  assert.equal(zeroCost.body.data.acquisitionCost, "0.00");
  assert.equal(zeroCost.body.data.grossProfitEstimate, "10.00");
  const adminUpdated = await api(base, "PATCH", `/products/${adminProduct.publicId}`, { cookie: adminSessionCookie, csrf: adminCsrf, body: {
    acquisitionCost: null, expectedVersion: zeroCost.body.data.version,
  } });
  assert.equal(adminUpdated.status, 200);
  assert.equal(adminUpdated.body.data.acquisitionCost, null);
  assert.equal(adminUpdated.body.data.grossProfitEstimate, null);
  const adminProductLogs = await prisma.adminAuditLog.findMany({ where: { actorUserId: adminUserId, eventCode: { startsWith: "PRODUCT_" } }, orderBy: { id: "asc" } });
  const costLogs = adminProductLogs.filter((log) => log.detailsJson?.productPublicId === adminProduct.publicId && log.detailsJson?.before?.acquisitionCost !== undefined);
  assert.equal(costLogs.length, 2);
  assert.deepEqual(costLogs[0].detailsJson.before, { acquisitionCost: "2.50" });
  assert.deepEqual(costLogs[0].detailsJson.after, { acquisitionCost: "0.00" });
  assert.deepEqual(costLogs[1].detailsJson.before, { acquisitionCost: "0.00" });
  assert.deepEqual(costLogs[1].detailsJson.after, { acquisitionCost: null });

  await api(base, "POST", "/auth/logout", { cookie: adminSessionCookie, csrf: adminCsrf });

  const logs = await prisma.adminAuditLog.findMany({ where: { actorUserId: userId, eventCode: { startsWith: "PRODUCT_" } }, orderBy: { id: "asc" } });
  const productLogs = logs.filter((log) => log.detailsJson?.productPublicId === product.publicId);
  assert.deepEqual(productLogs.map((log) => log.eventCode), ["PRODUCT_CREATED", "PRODUCT_UPDATED", "PRODUCT_UPDATED"]);
  assert.deepEqual(productLogs[1].detailsJson.before, { description: "PLACA MÃE DE TESTE", category: "PART", salePrice: "12.50" });
  assert.deepEqual(productLogs[1].detailsJson.after, { description: "PLACA PRINCIPAL", category: "RESALE_GOOD", salePrice: "0.00" });
  assert.ok(productLogs.every((log) => log.actorUserId === userId));

  const logout = await api(base, "POST", "/auth/logout", { cookie: sessionCookie, csrf });
  assert.equal(logout.status, 204);
  process.stdout.write("Produtos/estoque: autorização independente, CSRF, CRUD, busca, entrada, ajuste negativo, classificação/retorno/descarte, concorrência, saldos derivados, histórico e Log Administrativo passaram.\n");
} finally {
  if (userId !== undefined) {
    await prisma.adminAuditLog.deleteMany({ where: { actorUserId: userId } });
    await prisma.productStockMovement.deleteMany({ where: { product: { publicId: { in: productIds } } } });
    await prisma.product.deleteMany({ where: { publicId: { in: productIds } } });
    await prisma.userSession.deleteMany({ where: { userId } });
    await prisma.userPermission.deleteMany({ where: { userId } });
    await prisma.user.update({ where: { id: userId }, data: { isActive: false } });
    await prisma.user.delete({ where: { id: userId } });
  }
  if (adminUserId !== undefined) {
    await prisma.adminAuditLog.deleteMany({ where: { actorUserId: adminUserId } });
    await prisma.userSession.deleteMany({ where: { userId: adminUserId } });
    await prisma.user.update({ where: { id: adminUserId }, data: { isActive: false } });
    await prisma.user.delete({ where: { id: adminUserId } });
  }
  for (const additionalUserId of additionalUserIds) {
    await prisma.adminAuditLog.deleteMany({ where: { actorUserId: additionalUserId } });
    await prisma.productStockMovement.deleteMany({ where: { product: { publicId: { in: productIds } } } });
    await prisma.userSession.deleteMany({ where: { userId: additionalUserId } });
    await prisma.userPermission.deleteMany({ where: { userId: additionalUserId } });
    await prisma.user.update({ where: { id: additionalUserId }, data: { isActive: false } });
    await prisma.user.delete({ where: { id: additionalUserId } });
  }
  await app.close();
}
