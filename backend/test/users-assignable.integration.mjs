import {configureDisposableTest, PERMISSION_CATALOG, reserveHttpPort} from './disposable-config.mjs';
const disposableUrl = await configureDisposableTest();
import "reflect-metadata";

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import * as argon2 from "argon2";

// Só redireciona uma URL local explicitamente configurada para o banco descartável.
const isolated = disposableUrl;

const { NestFactory } = await import("@nestjs/core");
const { AppModule } = await import("../dist/app.module.js");
const { PrismaService } = await import("../dist/infrastructure/prisma/prisma.service.js");
const app = await NestFactory.create(AppModule, { logger: false });
app.setGlobalPrefix("api/v1");

let db;
let databaseVerified = false;
let testUserIds = [];
const suffix = randomBytes(5).toString("hex");
const testUserAgent = `users-assignable-integration-${suffix}`;

try {
  await app.init();
  db = app.get(PrismaService);

  // Nenhuma escrita de preparação ocorre até confirmar o schema isolado.
  const selected = await db.$queryRaw`SELECT DATABASE() AS name`;
  assert.equal(selected[0]?.name, "gestor_os_opening_test");
  databaseVerified = true;

  const password = randomBytes(24).toString("base64url");
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const admin = await db.user.create({ data: { username: `assignadmin_${suffix}`, passwordHash, isActive: true, isAdmin: true } });
  testUserIds.push(admin.id);

  async function createUser(label, options = {}) {
    const user = await db.user.create({
      data: {
        username: `assign_${label}_${suffix}`,
        passwordHash,
        isActive: options.active ?? true,
        isAdmin: options.admin ?? false,
      },
    });
    testUserIds.push(user.id);
    if (options.permission) {
      const permission = await db.permission.findUniqueOrThrow({ where: { code: "service_orders.assignment.manage" } });
      await db.userPermission.create({ data: { userId: user.id, permissionId: permission.id, grantedByUserId: admin.id } });
    }
    return user;
  }

  const manager = await createUser("manager", { permission: true });
  const noPermission = await createUser("noperm");
  const inactive = await createUser("inactive", { active: false, permission: true });
  const activeZ = await createUser("zulu", { permission: true });
  const activeA = await createUser("alpha", { permission: true });

  await app.listen(0, "127.0.0.1");
  const base = `http://127.0.0.1:${app.getHttpServer().address().port}/api/v1`;
  async function request(method, path, options = {}) {
    const headers = { "user-agent": testUserAgent };
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
    const result = await request("POST", "/auth/login", {
      cookie: cookie(pre.headers, "gos_pre_auth"),
      csrf: pre.body.data.csrfToken,
      body: { username: account.username, password },
    });
    assert.equal(result.status, 201);
    return { cookie: cookie(result.headers, "gos_session"), csrf: result.body.data.csrfToken };
  }
  function status(result, expected, label) {
    assert.equal(result.status, expected, `${label}: ${result.status} ${result.body?.code}`);
  }

  const adminSession = await login(admin);
  const managerSession = await login(manager);
  const noPermissionSession = await login(noPermission);
  const before = {
    users: await db.user.count(),
    permissions: await db.userPermission.count(),
    auditLogs: await db.adminAuditLog.count(),
    orders: await db.serviceOrder.count(),
    assignments: await db.serviceOrderAssignment.count(),
    events: await db.serviceOrderEvent.count(),
  };

  status(await request("GET", "/users/assignable?page=1&pageSize=20"), 401, "anonymous request");
  status(await request("GET", "/users/assignable?page=1&pageSize=20", noPermissionSession), 403, "missing permission");
  status(await request("GET", "/users/assignable", managerSession), 400, "missing pagination");
  status(await request("GET", "/users/assignable?page=0&pageSize=20", managerSession), 400, "invalid pagination");
  status(await request("GET", "/users/assignable?page=1&pageSize=20&isAdmin=true", managerSession), 400, "unsupported filter");

  const managerList = await request("GET", `/users/assignable?page=1&pageSize=20&search=${suffix}`, managerSession);
  status(managerList, 200, "manager list");
  assert.equal(managerList.body.pagination.page, 1);
  assert.equal(managerList.body.pagination.pageSize, 20);
  assert.equal(managerList.body.pagination.total, 5);
  const returnedUsers = managerList.body.data;
  assert.ok(returnedUsers.some((user) => user.publicId === admin.publicId), "active Admin remains assignable");
  assert.ok(returnedUsers.some((user) => user.publicId === manager.publicId));
  assert.ok(returnedUsers.some((user) => user.publicId === noPermission.publicId), "assignment eligibility is based on active account status");
  assert.ok(returnedUsers.some((user) => user.publicId === activeA.publicId));
  assert.ok(returnedUsers.some((user) => user.publicId === activeZ.publicId));
  assert.equal(returnedUsers.some((user) => user.publicId === inactive.publicId), false);
  assert.deepEqual(returnedUsers.map((user) => user.username), [...returnedUsers.map((user) => user.username)].sort((a, b) => a.localeCompare(b)));
  for (const user of returnedUsers) {
    assert.deepEqual(Object.keys(user).sort(), ["publicId", "username"]);
    for (const forbidden of ["id", "passwordHash", "isAdmin", "isActive", "permissions", "sessions", "tokenHash"]) {
      assert.equal(Object.hasOwn(user, forbidden), false, `response exposed ${forbidden}`);
    }
  }

  const adminList = await request("GET", "/users/assignable?page=1&pageSize=1", adminSession);
  status(adminList, 200, "Admin bypass");
  assert.equal(adminList.body.data.length, 1);
  assert.equal(adminList.body.pagination.pageSize, 1);
  assert.ok(adminList.body.pagination.total >= 5);

  const search = await request("GET", `/users/assignable?page=1&pageSize=20&search=${encodeURIComponent(`  ${activeA.username.toUpperCase()}  `)}`, managerSession);
  status(search, 200, "search");
  assert.deepEqual(search.body.data.map((user) => user.publicId), [activeA.publicId]);

  const after = {
    users: await db.user.count(),
    permissions: await db.userPermission.count(),
    auditLogs: await db.adminAuditLog.count(),
    orders: await db.serviceOrder.count(),
    assignments: await db.serviceOrderAssignment.count(),
    events: await db.serviceOrderEvent.count(),
  };
  assert.deepEqual(after, before, "assignable lookup must not write user, permission, audit, or OS data");
  console.log("Assignable users HTTP/MySQL integration passed on gestor_os_opening_test.");
} finally {
  if (databaseVerified && db) {
    // Limpa somente os artefatos criados por este teste no banco isolado.
    const ids = testUserIds;
    if (ids.length) {
      await db.adminAuditLog.deleteMany({ where: { OR: [{ actorUserId: { in: ids } }, { targetUserId: { in: ids } }] } });
      await db.userSession.deleteMany({ where: { userId: { in: ids } } });
      await db.userPermission.deleteMany({ where: { userId: { in: ids } } });
      await db.user.deleteMany({ where: { id: { in: ids } } });
      assert.equal(await db.user.count({ where: { id: { in: ids } } }), 0);
      assert.equal(await db.adminAuditLog.count({ where: { OR: [{ actorUserId: { in: ids } }, { targetUserId: { in: ids } }] } }), 0);
    }
    await db.preAuthCsrfContext.deleteMany({ where: { userAgent: testUserAgent } });
    assert.equal(await db.preAuthCsrfContext.count({ where: { userAgent: testUserAgent } }), 0);
  }
  await app.close();
}
