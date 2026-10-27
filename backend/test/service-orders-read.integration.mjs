import {configureDisposableTest, PERMISSION_CATALOG, reserveHttpPort} from './disposable-config.mjs';
const disposableUrl = await configureDisposableTest();
import "reflect-metadata";

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import * as argon2 from "argon2";

// A conexão de aplicação é desviada antes de importar o módulo NestJS.
const isolated = disposableUrl;

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
  const requiredPermissionCodes = ["service_orders.opening.create", "service_orders.create", "service_orders.read"];
  assert.equal(await db.permission.count({ where: { code: { in: requiredPermissionCodes } } }), requiredPermissionCodes.length);

  const suffix = randomBytes(5).toString("hex");
  const password = randomBytes(24).toString("base64url");
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const admin = await db.user.create({ data: { username: `read_admin_${suffix}`, passwordHash, isActive: true, isAdmin: true } });
  async function user(label, codes) {
    const created = await db.user.create({ data: { username: `read_${label}_${suffix}`, passwordHash, isActive: true } });
    for (const code of codes) {
      const permission = await db.permission.findUniqueOrThrow({ where: { code } });
      await db.userPermission.create({ data: { userId: created.id, permissionId: permission.id, grantedByUserId: admin.id } });
    }
    return created;
  }
  const writer = await user("writer", ["service_orders.opening.create", "service_orders.create"]);
  const activeWriter = await user("active_writer", ["service_orders.opening.create"]);
  const reader = await user("reader", ["service_orders.read"]);
  const outsider = await user("outsider", []);
  const customer = await db.person.create({ data: { personType: "PF", name: `CLIENTE ${suffix}`, roles: { create: { role: "CUSTOMER" } } } });
  const type = await db.equipmentType.create({ data: { name: `TIPO ${suffix}` } });
  const brand = await db.equipmentBrand.create({ data: { name: `MARCA ${suffix}` } });
  const equipment = await db.equipment.create({ data: { ownerId: customer.id, typeId: type.id, brandId: brand.id,
    model: "MODELO ORIGINAL", serialNumber: `SERIE-${suffix}` } });

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
    const result = await request("POST", "/auth/login", { cookie: cookie(pre.headers, "gos_pre_auth"),
      csrf: pre.body.data.csrfToken, body: { username: account.username, password } });
    assert.equal(result.status, 201);
    return { cookie: cookie(result.headers, "gos_session"), csrf: result.body.data.csrfToken };
  }
  function status(result, expected, label) {
    assert.equal(result.status, expected, `${label}: ${result.status} ${result.body?.code}`);
  }
  const writerSession = await login(writer);
  const activeWriterSession = await login(activeWriter);
  const readerSession = await login(reader);
  const outsiderSession = await login(outsider);
  const adminSession = await login(admin);
  async function opening(session = writerSession) {
    const result = await request("POST", "/service-orders/openings", session);
    status(result, 201, "create opening");
    return result.body.data;
  }

  const canceled = await opening();
  status(await request("POST", `/service-orders/openings/${canceled.publicId}/cancel`, writerSession), 200, "cancel opening");
  const active = await opening(activeWriterSession);
  const pending = await opening();
  status(await request("PATCH", `/service-orders/openings/${pending.publicId}`, {
    ...writerSession, body: { customerPublicId: customer.publicId, equipmentPublicId: equipment.publicId },
  }), 200, "prepare confirmation");
  const confirmation = await request("POST", `/service-orders/openings/${pending.publicId}/confirm`, { ...writerSession, body: {} });
  status(confirmation, 201, "confirm opening");
  const confirmed = confirmation.body.data;

  status(await request("GET", "/service-orders?page=1&pageSize=10"), 401, "anonymous list");
  status(await request("GET", "/service-orders?page=1&pageSize=10", outsiderSession), 403, "unauthorized list");
  status(await request("GET", `/service-orders/${confirmed.publicId}`, outsiderSession), 403, "unauthorized detail");
  status(await request("GET", "/service-orders?page=0&pageSize=10", readerSession), 400, "invalid pagination");
  status(await request("GET", "/service-orders", readerSession), 400, "missing pagination");

  const list = await request("GET", "/service-orders?page=1&pageSize=100", { cookie: readerSession.cookie });
  status(list, 200, "reader list without csrf");
  assert.equal(list.body.pagination.page, 1);
  assert.equal(list.body.pagination.pageSize, 100);
  assert.ok(list.body.data.some((item) => item.publicId === confirmed.publicId));
  assert.equal(list.body.data.some((item) => item.publicId === active.publicId || item.publicId === canceled.publicId), false);
  assert.equal(list.body.data[0].publicId, confirmed.publicId);
  assert.equal(list.body.data[0].visibleNumber, confirmed.visibleNumber);
  assert.equal(list.body.data[0].numberValue, confirmed.numberValue);
  assert.equal(list.body.data[0].macroStatus, "ABERTA");
  assert.equal(list.body.data[0].operationalSituation, "TRIAGEM");
  assert.equal(Object.hasOwn(list.body.data[0], "customerSnapshotJson"), false);
  assert.equal(Object.hasOwn(list.body.data[0], "id"), false);
  status(await request("GET", "/service-orders?page=1&pageSize=1", { cookie: adminSession.cookie }), 200, "admin list");

  await db.person.update({ where: { id: customer.id }, data: { name: `CLIENTE ALTERADO ${suffix}` } });
  await db.equipment.update({ where: { id: equipment.id }, data: { model: "MODELO ALTERADO" } });
  const detail = await request("GET", `/service-orders/${confirmed.publicId}`, { cookie: readerSession.cookie });
  status(detail, 200, "reader detail without csrf");
  assert.equal(detail.body.data.publicId, confirmed.publicId);
  assert.equal(detail.body.data.openingPublicId, pending.publicId);
  assert.equal(detail.body.data.visibleNumber, confirmed.visibleNumber);
  assert.equal(detail.body.data.customer.name, `CLIENTE ALTERADO ${suffix}`);
  assert.equal(detail.body.data.equipment.model, "MODELO ALTERADO");
  assert.equal(detail.body.data.customerSnapshotJson.name, `CLIENTE ${suffix}`);
  assert.equal(detail.body.data.equipmentSnapshotJson.model, "MODELO ORIGINAL");
  assert.equal(detail.body.data.customerSnapshotJson.snapshotVersion, 1);
  assert.equal(detail.body.data.equipmentSnapshotJson.snapshotVersion, 1);
  assert.equal(detail.body.data.customerSnapshotJson.capturedAt, confirmed.customerSnapshot.capturedAt);
  assert.equal(detail.body.data.snapshotVersion, 1);
  assert.equal(detail.body.data.macroStatus, "ABERTA");
  assert.equal(detail.body.data.operationalSituation, "TRIAGEM");
  assert.deepEqual(detail.body.data.assignedUserPublicIds, []);
  for (const forbidden of ["id", "customerId", "equipmentId", "openingId", "createdByUserId", "numberAllocationId"]) {
    assert.equal(Object.hasOwn(detail.body.data, forbidden), false);
  }
  assert.equal(Object.hasOwn(detail.body.data, "events"), false);
  status(await request("GET", `/service-orders/${active.publicId}`, { cookie: readerSession.cookie }), 404, "active opening is not an order");
  status(await request("GET", `/service-orders/${canceled.publicId}`, { cookie: readerSession.cookie }), 404, "canceled opening is not an order");
  const missing = await request("GET", "/service-orders/00000000-0000-4000-8000-000000000000", { cookie: readerSession.cookie });
  status(missing, 404, "missing order");
  assert.equal(missing.body.code, "SERVICE_ORDER_NOT_FOUND");
  console.log("Service order read HTTP/MySQL integration passed on gestor_os_opening_test.");
} finally {
  await app.close();
}
