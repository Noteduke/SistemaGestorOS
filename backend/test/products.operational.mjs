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
let createdPermission = false;
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

try {
  const selected = await prisma.$queryRaw`SELECT DATABASE() AS selected_database`;
  assert.equal(selected[0]?.selected_database, "gestor_os_opening_test", "Nenhuma escrita pode ocorrer fora do banco isolado.");
  process.stdout.write("DATABASE()=gestor_os_opening_test; validação operacional de Produtos inicia no banco isolado.\n");
  await app.listen(0, "127.0.0.1");

  const permission = await prisma.permission.findUnique({ where: { code: "products.manage" } });
  if (!permission) {
    await prisma.permission.create({ data: { code: "products.manage", description: "Consultar e administrar o Cadastro de Produtos." } });
    createdPermission = true;
  }
  const permissionRow = permission ?? await prisma.permission.findUniqueOrThrow({ where: { code: "products.manage" } });
  const suffix = randomBytes(5).toString("hex").toUpperCase();
  const password = randomBytes(24).toString("base64url");
  const user = await prisma.user.create({ data: {
    username: `validacao.products.${suffix.toLowerCase()}`,
    passwordHash: await argon2.hash(password),
  } });
  userId = user.id;
  const base = `http://127.0.0.1:${app.getHttpServer().address().port}`;

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
  const negativeSale = await api(base, "POST", "/products", { cookie: sessionCookie, csrf, body: {
    description: "Preço negativo rejeitado", category: "PART", salePrice: "-0.01",
  } });
  assert.equal(negativeSale.status, 400);
  assert.equal(product.isActive, true);

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
  process.stdout.write("Produtos: autorização, CSRF, CRUD permitido, busca, categoria, versão, inativação e Log Administrativo passaram.\n");
} finally {
  if (userId !== undefined) {
    await prisma.adminAuditLog.deleteMany({ where: { actorUserId: userId } });
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
  if (createdPermission) {
    const remainingUsers = await prisma.userPermission.count({ where: { permission: { code: "products.manage" } } });
    if (remainingUsers === 0) await prisma.permission.delete({ where: { code: "products.manage" } });
  }
  await app.close();
}
