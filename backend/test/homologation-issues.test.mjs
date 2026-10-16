import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
const buildDir = process.env.GOS_TEST_BUILD_DIR ?? path.resolve("dist");
const { HomologationIssuesService } = await import(pathToFileURL(path.join(buildDir, "modules/homologation/homologation-issues.service.js")));

const admin = { id: 7, isAdmin: true };
const staff = { id: 8, isAdmin: false };
const config = (values = {}) => ({ get: (key) => values[key] });
const input = { description: "Botão não responde", attemptedAction: "Salvar OS", observedResult: "Erro visível", screenReference: "Resumo da OS" };

test("registra um problema autenticado com hora do servidor e versão configurada", async () => {
  let captured;
  const prisma = { serviceOrder: { findUnique: async () => null }, homologationIssue: { create: async ({ data }) => { captured = data; return { publicId: "issue-id", status: "PENDING", systemVersion: data.systemVersion, createdAt: new Date() }; } } };
  const result = await new HomologationIssuesService(prisma, config({ GOS_DEPLOYMENT_ENV: "homologation", GOS_SYSTEM_VERSION: "h1-test" })).create(input, undefined, staff);
  assert.equal(captured.reportedByUserId, staff.id); assert.equal(captured.systemVersion, "h1-test");
  assert.equal(result.data.status, "PENDENTE"); assert.ok(result.data.createdAt instanceof Date);
});

test("bloqueia criação fora de homologação e restringe consulta e situação a Administrador", async () => {
  const service = new HomologationIssuesService({}, config({ GOS_DEPLOYMENT_ENV: "production" }));
  await assert.rejects(service.create(input, undefined, staff), { status: 404 });
  const homol = new HomologationIssuesService({}, config({ GOS_DEPLOYMENT_ENV: "homologation" }));
  await assert.rejects(homol.list(staff), { status: 403 });
  await assert.rejects(homol.updateStatus("id", { status: "VALIDADO" }, staff), { status: 403 });
});

test("Administrador altera somente uma das quatro situações publicadas", async () => {
  let update;
  const prisma = { homologationIssue: { update: async (value) => { update = value; return { publicId: value.where.publicId, status: value.data.status, updatedAt: new Date() }; } } };
  const service = new HomologationIssuesService(prisma, config({ GOS_DEPLOYMENT_ENV: "homologation" }));
  const result = await service.updateStatus("issue-id", { status: "EM CORREÇÃO" }, admin);
  assert.equal(update.data.status, "IN_PROGRESS"); assert.equal(update.data.updatedByUserId, admin.id);
  assert.equal(result.data.status, "EM CORREÇÃO");
  await assert.rejects(service.updateStatus("issue-id", { status: "IGNORAR" }, admin), { status: 400 });
});

test("aceita captura PNG pelo conteúdo e limita-a ao diretório isolado", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "gos-homologation-test-"));
  try {
    const prisma = { serviceOrder: { findUnique: async () => null }, homologationIssue: { create: async ({ data }) => ({ publicId: "issue-id", status: "PENDING", systemVersion: data.systemVersion, createdAt: new Date() }) } };
    const service = new HomologationIssuesService(prisma, config({ GOS_DEPLOYMENT_ENV: "homologation", GOS_HOMOLOGATION_FILES_DIR: root }));
    const buffer = Buffer.from([137,80,78,71,13,10,26,10,0]);
    await service.create(input, { buffer, mimetype: "image/png", size: buffer.length }, staff);
    const files = (await import("node:fs/promises")).readdir(root);
    const [filename] = await files;
    assert.match(filename, /^[0-9a-f-]+\.png$/u); assert.ok((await stat(path.join(root, filename))).isFile());
    await assert.rejects(service.create(input, { buffer: Buffer.from("not image"), mimetype: "image/png", size: 9 }, staff), { status: 400 });
  } finally { await rm(root, { recursive: true, force: true }); }
});
