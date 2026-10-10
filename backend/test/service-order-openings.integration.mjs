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
  assert.equal(permissionCount, 32, "Seed de permissões ausente no banco isolado");
  const initialOrders = await prisma.serviceOrder.count();
  assert.equal(initialOrders, 0, "O banco isolado contém OS confirmada inesperada");

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
  expectStatus(await request("POST", "/service-orders/openings", { ...outsiderSession }), 403, "Criar sem permissão");
  const ownedOpening = await request("POST", "/service-orders/openings", { ...ownerSession });
  expectStatus(ownedOpening, 201, "Criar abertura usuário comum");
  assert.equal(ownedOpening.body.data.numberValue, adminOpening.body.data.numberValue, "Número liberado não foi reutilizado");
  const ownedPath = `/service-orders/openings/${ownedOpening.body.data.publicId}`;
  expectStatus(await request("GET", ownedPath, { cookie: outsiderSession.cookie }), 404, "Consulta alheia sem permissão");
  expectStatus(await request("POST", `${ownedPath}/cancel`, { ...outsiderSession }), 404, "Cancelamento alheio sem permissão");
  expectStatus(await request("GET", ownedPath, { cookie: managerSession.cookie }), 200, "Consulta alheia com manage");
  const managerCancel = await request("POST", `${ownedPath}/cancel`, { ...managerSession });
  expectStatus(managerCancel, 200, "Cancelamento alheio com manage");
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
  assert.equal(await prisma.serviceOrder.count(), 0);
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
