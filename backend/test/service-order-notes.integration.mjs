import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { test } from "node:test";
import "dotenv/config";
import argon2 from "argon2";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../dist/generated/prisma/client.js";

const enabled = process.env.RUN_NOTES_INTEGRATION === "1";

test("observações manuais por HTTP no banco isolado", { skip: !enabled, timeout: 120_000 }, async () => {
  const connection = new URL(process.env.DATABASE_URL ?? "");
  assert.equal(connection.protocol, "mysql:");
  assert.equal(connection.hostname, "localhost");
  assert.equal(decodeURIComponent(connection.pathname.slice(1)), "gestor_os_opening_test", "Integração proibida fora do banco isolado");
  const prisma = new PrismaClient({ adapter: new PrismaMariaDb({ host: connection.hostname, port: Number(connection.port || 3306), user: decodeURIComponent(connection.username), password: decodeURIComponent(connection.password), database: "gestor_os_opening_test" }) });
  const createdUserIds = [];
  let child;
  try {
    const selected = await prisma.$queryRawUnsafe("SELECT DATABASE() AS selected_database");
    assert.equal(selected[0]?.selected_database, "gestor_os_opening_test");
    const order = await prisma.serviceOrder.findFirst({
      where: { opening: { is: { status: "CONFIRMED" } }, numberAllocation: { is: { status: "CONFIRMED" } } },
      select: { id: true, publicId: true, macroStatus: true, opening: { select: { publicId: true } } },
    });
    const secondOrder = await prisma.serviceOrder.findFirst({ where: { id: { not: order?.id } }, select: { publicId: true } });
    assert.ok(order && secondOrder, "O banco isolado precisa ter duas OS confirmadas de teste");
    const suffix = randomBytes(4).toString("hex");
    const credentials = [];
    const roles = [
      { tag: "a", admin: false, permissions: ["service_orders.read", "service_orders.events.read", "service_orders.update"] },
      { tag: "b", admin: false, permissions: ["service_orders.read", "service_orders.events.read"] },
      { tag: "admin", admin: true, permissions: [] },
    ];
    for (const role of roles) {
      const username = `qa.notes.${suffix}.${role.tag}`;
      const password = randomBytes(24).toString("base64url");
      const user = await prisma.user.create({ data: { username, passwordHash: await argon2.hash(password), isAdmin: role.admin } });
      createdUserIds.push(user.id);
      for (const code of role.permissions) {
        const permission = await prisma.permission.findUniqueOrThrow({ where: { code }, select: { id: true } });
        await prisma.userPermission.create({ data: { userId: user.id, permissionId: permission.id, grantedByUserId: user.id } });
      }
      credentials.push({ username, password, user });
    }

    const port = await new Promise((resolve, reject) => {
      const server = createServer();
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => { const address = server.address(); server.close(() => resolve(address.port)); });
    });
    child = spawn(process.execPath, ["dist/main.js"], {
      cwd: process.cwd(), env: { ...process.env, PORT: String(port), DATABASE_URL: connection.toString() }, stdio: "ignore", windowsHide: true,
    });
    const base = `http://127.0.0.1:${port}/api/v1`;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw Error("Backend de teste encerrou inesperadamente");
      try { const probe = await fetch(`${base}/auth/csrf`); if (probe.ok) break; } catch { /* backend starting */ }
      if (attempt === 99) throw Error("Backend de teste não iniciou");
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const login = async ({ username, password }) => {
      const pre = await fetch(`${base}/auth/csrf`);
      assert.equal(pre.status, 200);
      const preToken = (await pre.json()).data.csrfToken;
      const preCookie = pre.headers.getSetCookie().map((value) => value.split(";", 1)[0]).find((value) => value.startsWith("gos_pre_auth="));
      assert.ok(preCookie);
      const auth = await fetch(`${base}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": preToken, Cookie: preCookie }, body: JSON.stringify({ username, password }) });
      assert.equal(auth.status, 201);
      const cookie = auth.headers.getSetCookie().map((value) => value.split(";", 1)[0]).find((value) => value.startsWith("gos_session="));
      assert.ok(cookie);
      const me = await fetch(`${base}/auth/me`, { headers: { Cookie: cookie } });
      assert.equal(me.status, 200);
      return { cookie, csrfToken: (await me.json()).data.csrfToken };
    };
    const [a, b, admin] = await Promise.all(credentials.map(login));
    const path = `/service-orders/${order.publicId}`;
    const call = async (session, method, suffix, body, withCsrf = true) => {
      const headers = { Cookie: session.cookie, ...(withCsrf ? { "X-CSRF-Token": session.csrfToken } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }) };
      const response = await fetch(`${base}${path}${suffix}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      return { status: response.status, body: await response.json().catch(() => null) };
    };
    assert.equal((await call(b, "POST", "/notes", { text: "sem autorização" })).status, 403);
    assert.equal((await call(a, "POST", "/notes", { text: "sem CSRF" }, false)).status, 403);
    for (const invalid of ["", "  ", "A".repeat(256), "A\rB", "A\nB"]) {
      assert.equal((await call(a, "POST", "/notes", { text: invalid })).status, 400);
    }
    const text = `Cliente autorizou pelo WhatsApp ${suffix}.`;
    const created = await call(a, "POST", "/notes", { text });
    assert.equal(created.status, 201);
    const notePublicId = created.body.data.publicId;
    const historyA = await call(a, "GET", "/history?pageSize=1");
    assert.equal(historyA.status, 200);
    assert.equal(historyA.body.data[0].kind, "MANUAL_NOTE");
    assert.equal(historyA.body.data[0].text, text);
    assert.equal(historyA.body.data[0].canDelete, true);
    assert.equal(historyA.body.hasMore, true);
    const historyB = await call(b, "GET", "/history?pageSize=1");
    assert.equal(historyB.body.data[0].canDelete, false);
    const next = await call(a, "GET", `/history?pageSize=1&cursor=${encodeURIComponent(historyA.body.nextCursor)}`);
    assert.equal(next.status, 200);
    assert.notEqual(next.body.data[0]?.publicId, notePublicId);
    const crossCursor = await fetch(`${base}/service-orders/${secondOrder.publicId}/history?pageSize=1&cursor=${encodeURIComponent(historyA.body.nextCursor)}`, { headers: { Cookie: a.cookie } });
    assert.equal(crossCursor.status, 400);
    const events = await call(a, "GET", "/events?page=1&pageSize=20");
    assert.equal(events.status, 200);
    assert.ok(events.body.data.every((item) => !Object.hasOwn(item, "kind") && !Object.hasOwn(item, "text")));
    assert.ok(!JSON.stringify(events.body).includes(text));
    const provisionalNote = await fetch(`${base}/service-orders/openings/${order.opening.publicId}/notes`, { method: "POST", headers: { Cookie: a.cookie, "X-CSRF-Token": a.csrfToken, "Content-Type": "application/json" }, body: JSON.stringify({ text: "proibida" }) });
    assert.equal(provisionalNote.status, 404);
    assert.equal((await call(b, "DELETE", `/notes/${notePublicId}`)).status, 403);
    assert.equal((await call(a, "DELETE", `/notes/${notePublicId}`, undefined, false)).status, 403);
    const crossOrderDelete = await fetch(`${base}/service-orders/${secondOrder.publicId}/notes/${notePublicId}`, { method: "DELETE", headers: { Cookie: a.cookie, "X-CSRF-Token": a.csrfToken } });
    assert.equal(crossOrderDelete.status, 404);
    assert.equal((await call(a, "PATCH", `/notes/${notePublicId}`, { text: "edit" })).status, 404);
    assert.equal((await call(a, "PUT", `/notes/${notePublicId}`, { text: "edit" })).status, 404);
    assert.equal((await call(a, "DELETE", "/events/1")).status, 404);
    assert.equal((await call(a, "DELETE", `/notes/${notePublicId}`)).status, 200);
    assert.equal((await call(a, "DELETE", `/notes/${notePublicId}`)).status, 404);
    assert.equal((await prisma.serviceOrderNote.count({ where: { publicId: notePublicId } })), 0);
    const audit = await prisma.adminAuditLog.findFirst({ where: { eventCode: "SERVICE_ORDER_NOTE_DELETED", detailsJson: { path: "$.notePublicId", equals: notePublicId } }, orderBy: { id: "desc" } });
    assert.ok(audit);
    assert.equal(audit.detailsJson.text, text);
    assert.equal(audit.detailsJson.serviceOrderPublicId, order.publicId);
    assert.equal(audit.detailsJson.authorUserPublicId, credentials[0].user.publicId);
    assert.equal(audit.detailsJson.deletedByUserPublicId, credentials[0].user.publicId);
    const afterDelete = await call(a, "GET", "/history?pageSize=1");
    assert.equal(afterDelete.body.data.some((item) => item.publicId === notePublicId), false);
    assert.ok(!JSON.stringify(afterDelete.body).includes(text));
    const second = await call(a, "POST", "/notes", { text: "excluir por terceiro autorizado" });
    assert.equal(second.status, 201);
    const permission = await prisma.permission.findUniqueOrThrow({ where: { code: "service_orders.notes.delete_any" }, select: { id: true } });
    await prisma.userPermission.create({ data: { userId: credentials[1].user.id, permissionId: permission.id, grantedByUserId: credentials[1].user.id } });
    assert.equal((await call(b, "GET", "/history?pageSize=1")).body.data[0].canDelete, true);
    assert.equal((await call(b, "DELETE", `/notes/${second.body.data.publicId}`)).status, 200);
    const adminNote = await call(admin, "POST", "/notes", { text: "Nota do administrador" });
    assert.equal(adminNote.status, 201);
    assert.equal((await call(admin, "GET", "/history?pageSize=1")).body.data[0].canDelete, true);
    assert.equal((await call(admin, "DELETE", `/notes/${adminNote.body.data.publicId}`)).status, 200);
    const orderAfter = await prisma.serviceOrder.findUniqueOrThrow({ where: { id: order.id }, select: { macroStatus: true } });
    assert.equal(orderAfter.macroStatus, order.macroStatus);
    console.log("DATABASE(): gestor_os_opening_test; HTTP de notas, auditoria, autorização e cursor: OK");
  } finally {
    if (child) { child.kill(); await new Promise((resolve) => { if (child.exitCode !== null) resolve(); else child.once("exit", resolve); }); }
    if (createdUserIds.length) {
      await prisma.userSession.updateMany({ where: { userId: { in: createdUserIds }, revokedAt: null }, data: { revokedAt: new Date() } });
      await prisma.userPermission.deleteMany({ where: { userId: { in: createdUserIds } } });
      await prisma.user.updateMany({ where: { id: { in: createdUserIds } }, data: { isActive: false, inactivatedAt: new Date() } });
    }
    await prisma.$disconnect();
  }
});
