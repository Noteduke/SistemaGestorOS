import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { NestFactory } from "@nestjs/core";
import argon2 from "argon2";
import dotenv from "dotenv";
import { AppModule } from "../dist/app.module.js";
import { PrismaService } from "../dist/infrastructure/prisma/prisma.service.js";
import { ServicesService } from "../dist/modules/services/services.service.js";

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
const services = app.get(ServicesService);
let userId;
const createdIds = [];

function cookie(response, name) {
  const entry = response.headers.getSetCookie().find((value) => value.startsWith(`${name}=`));
  assert.ok(entry, `Cookie ${name} ausente.`);
  return entry.split(";", 1)[0];
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
  await app.listen(0, "127.0.0.1");
  const current = await prisma.$queryRaw`SELECT DATABASE() AS selected_database, VERSION() AS server_version`;
  assert.equal(current[0]?.selected_database, "gestor_os_opening_test");
  process.stdout.write(`DATABASE()=${current[0].selected_database}; VERSION()=${current[0].server_version}\n`);

  const permission = await prisma.permission.findUnique({ where: { code: "services.manage" } })
    ?? await prisma.permission.create({ data: { code: "services.manage", description: "Administrar o Cadastro de Serviços." } });
  const marker = randomBytes(4).toString("hex");
  const username = `validacao.services.${marker}`;
  const password = randomBytes(24).toString("base64url");
  const user = await prisma.user.create({ data: { username, passwordHash: await argon2.hash(password), isAdmin: false } });
  userId = user.id;
  const address = app.getHttpServer().address();
  const base = `http://127.0.0.1:${address.port}`;

  const csrfContext = await api(base, "GET", "/auth/csrf");
  assert.equal(csrfContext.status, 200);
  const preCookie = cookie(csrfContext.response, "gos_pre_auth");
  const login = await api(base, "POST", "/auth/login", {
    cookie: preCookie, csrf: csrfContext.body.data.csrfToken, body: { username, password },
  });
  assert.ok(login.status === 200 || login.status === 201);
  const sessionCookie = cookie(login.response, "gos_session");
  const beforeGrant = await api(base, "GET", "/services?page=1&pageSize=20", { cookie: sessionCookie });
  assert.equal(beforeGrant.status, 403);
  await prisma.userPermission.create({ data: { userId, permissionId: permission.id } });
  const identity = await api(base, "GET", "/auth/me", { cookie: sessionCookie });
  assert.equal(identity.status, 200);
  assert.ok(identity.body.data.permissions.includes("services.manage"));
  const csrf = identity.body.data.csrfToken;

  const unauthenticated = await api(base, "GET", "/services?page=1&pageSize=20");
  assert.equal(unauthenticated.status, 401);
  const noCsrf = await api(base, "POST", "/services", { cookie: sessionCookie, body: { name: "Sem token", defaultPrice: "0.00" } });
  assert.equal(noCsrf.status, 403);

  const name = `Formatação ${marker}`;
  const created = await api(base, "POST", "/services", { cookie: sessionCookie, csrf, body: { name: `  ${name}  `, defaultPrice: "0.00" } });
  assert.equal(created.status, 201);
  assert.equal(created.body.data.name, name);
  assert.equal(created.body.data.defaultPrice, "0.00");
  assert.equal(created.body.data.isActive, true);
  createdIds.push(created.body.data.publicId);
  let record = created.body.data;
  const list = await api(base, "GET", `/services?page=1&pageSize=20&search=formatacao%20${marker}`, { cookie: sessionCookie });
  assert.equal(list.status, 200);
  assert.ok(list.body.data.some((row) => row.publicId === record.publicId));
  const detail = await api(base, "GET", `/services/${record.publicId}`, { cookie: sessionCookie });
  assert.equal(detail.status, 200);
  assert.equal(detail.body.data.name, name);
  process.stdout.write(`Criado e consultado: ${name}; busca sem acento passou.\n`);

  const changed = await api(base, "PATCH", `/services/${record.publicId}`, {
    cookie: sessionCookie, csrf, body: { defaultPrice: "12.50", expectedVersion: record.version },
  });
  assert.equal(changed.status, 200);
  record = changed.body.data;
  assert.equal(record.defaultPrice, "12.50");

  const disabled = await api(base, "PATCH", `/services/${record.publicId}`, {
    cookie: sessionCookie, csrf, body: { isActive: false, expectedVersion: record.version },
  });
  assert.equal(disabled.status, 200);
  record = disabled.body.data;
  assert.equal(record.isActive, false);
  const activeList = await api(base, "GET", `/services?page=1&pageSize=20&status=active&search=${marker}`, { cookie: sessionCookie });
  const inactiveList = await api(base, "GET", `/services?page=1&pageSize=20&status=inactive&search=${marker}`, { cookie: sessionCookie });
  const allList = await api(base, "GET", `/services?page=1&pageSize=20&status=all&search=${marker}`, { cookie: sessionCookie });
  assert.equal(activeList.body.data.some((row) => row.publicId === record.publicId), false);
  assert.equal(inactiveList.body.data.some((row) => row.publicId === record.publicId), true);
  assert.equal(allList.body.data.some((row) => row.publicId === record.publicId), true);

  for (const duplicate of [`formatacao ${marker}`, `FORMATAÇÃO ${marker}`, `  Formatação   ${marker}  `]) {
    const attempt = await api(base, "POST", "/services", { cookie: sessionCookie, csrf, body: { name: duplicate, defaultPrice: "1.00" } });
    assert.equal(attempt.status, 409);
    assert.equal(attempt.body.code ?? attempt.body.error?.code, "DUPLICATE_SERVICE_NAME");
  }
  const changedDisabled = await api(base, "PATCH", `/services/${record.publicId}`, {
    cookie: sessionCookie, csrf, body: { defaultPrice: "15.00", expectedVersion: record.version },
  });
  assert.equal(changedDisabled.status, 200);
  record = changedDisabled.body.data;
  assert.equal(record.isActive, false);
  const enabled = await api(base, "PATCH", `/services/${record.publicId}`, {
    cookie: sessionCookie, csrf, body: { isActive: true, expectedVersion: record.version },
  });
  assert.equal(enabled.status, 200);
  record = enabled.body.data;
  assert.equal(record.isActive, true);
  process.stdout.write("Filtros, preço em desabilitado, reabilitação e duplicidade por caixa/acento/espaços passaram.\n");

  for (const variant of [`Instalação / Configuração ${marker}`, `Instalação Configuração ${marker}`]) {
    const item = await api(base, "POST", "/services", { cookie: sessionCookie, csrf, body: { name: variant, defaultPrice: "1.00" } });
    assert.equal(item.status, 201);
    createdIds.push(item.body.data.publicId);
  }
  assert.equal(createdIds.length, 3);
  process.stdout.write("Pontuação significativa: duas grafias distintas cadastradas.\n");

  const concurrentName = `Concorrente ${marker}`;
  const parallel = await Promise.all([
    api(base, "POST", "/services", { cookie: sessionCookie, csrf, body: { name: concurrentName, defaultPrice: "3.00" } }),
    api(base, "POST", "/services", { cookie: sessionCookie, csrf, body: { name: `  CONCORRENTE   ${marker}  `, defaultPrice: "4.00" } }),
  ]);
  assert.deepEqual(parallel.map((item) => item.status).sort(), [201, 409]);
  createdIds.push(parallel.find((item) => item.status === 201).body.data.publicId);
  assert.equal(await prisma.serviceCatalog.count({ where: { normalizedName: `CONCORRENTE ${marker.toUpperCase()}` } }), 1);
  process.stdout.write("Criação concorrente com nome equivalente: um cadastro e um conflito.\n");

  const deleted = await api(base, "DELETE", `/services/${record.publicId}?expectedVersion=${record.version}`, { cookie: sessionCookie, csrf });
  assert.equal(deleted.status, 200);
  assert.equal(deleted.body.data.deleted, true);
  const audit = await prisma.adminAuditLog.findMany({ where: { actorUserId: userId, eventCode: { startsWith: "SERVICE_" } }, orderBy: { id: "asc" } });
  const events = audit.filter((entry) => entry.detailsJson?.servicePublicId === record.publicId).map((entry) => entry.eventCode);
  assert.deepEqual(events, ["SERVICE_CREATED", "SERVICE_PRICE_CHANGED", "SERVICE_DISABLED", "SERVICE_PRICE_CHANGED", "SERVICE_ENABLED", "SERVICE_DELETED"]);
  const deletion = audit.find((entry) => entry.eventCode === "SERVICE_DELETED" && entry.detailsJson?.servicePublicId === record.publicId);
  assert.equal(deletion.detailsJson.name, name);
  assert.equal(deletion.detailsJson.defaultPrice, "15.00");
  assert.equal(deletion.actorUserId, userId);
  const recreated = await api(base, "POST", "/services", { cookie: sessionCookie, csrf, body: { name: `formatacao ${marker}`, defaultPrice: "2.00" } });
  assert.equal(recreated.status, 201);
  createdIds.push(recreated.body.data.publicId);
  process.stdout.write("Exclusão física, recriação do nome e Log Administrativo passaram.\n");

  const logout = await api(base, "POST", "/auth/logout", { cookie: sessionCookie, csrf });
  assert.equal(logout.status, 204);
  process.stdout.write(`Conta temporária: ${username}; logout concluído.\n`);
} finally {
  if (userId !== undefined) {
    for (const publicId of createdIds) {
      const remainingService = await prisma.serviceCatalog.findUnique({ where: { publicId } });
      if (remainingService) await services.remove(publicId, remainingService.version, userId);
    }
    await prisma.userSession.deleteMany({ where: { userId } });
    await prisma.userPermission.deleteMany({ where: { userId } });
    await prisma.user.update({ where: { id: userId }, data: { isActive: false } });
    const remaining = await prisma.userSession.count({ where: { userId } });
    const grants = await prisma.userPermission.count({ where: { userId } });
    const leftoverServices = await prisma.serviceCatalog.count({ where: { publicId: { in: createdIds } } });
    assert.equal(remaining, 0);
    assert.equal(grants, 0);
    assert.equal(leftoverServices, 0);
    process.stdout.write("Conta temporária inativa, sem sessões nem permissões; serviços descartáveis removidos com auditoria.\n");
  }
  await app.close();
}
