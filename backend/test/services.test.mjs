import assert from "node:assert/strict";
import { test } from "node:test";
import { Prisma } from "../dist/generated/prisma/client.js";
import { cleanServiceName, normalizeServiceName } from "../dist/modules/services/domain/service-name.js";
import { parseCreateServiceDto, parseDeleteServiceQuery, parseServiceListQuery, parseServicePrice, parseUpdateServiceDto } from "../dist/modules/services/dto/service.dto.js";
import { ServicesService } from "../dist/modules/services/services.service.js";

function codeOf(error) { return error.getResponse()?.code; }
function rejectsCode(fn, code) { assert.throws(fn, (error) => codeOf(error) === code); }

test("limpeza preserva grafia, acento e pontuação e limita 120 após limpeza", () => {
  assert.equal(cleanServiceName("  Reparo   de Placa-Mãe  "), "Reparo de Placa-Mãe");
  assert.equal(cleanServiceName(` ${"A".repeat(120)} `).length, 120);
  rejectsCode(() => cleanServiceName("A".repeat(121)), "SERVICE_NAME_TOO_LONG");
  rejectsCode(() => cleanServiceName(" \t "), "SERVICE_NAME_REQUIRED");
});

test("unicidade canônica ignora caixa, acento e espaços, mas considera pontuação", () => {
  assert.equal(normalizeServiceName(cleanServiceName("Formatação")), normalizeServiceName(cleanServiceName(" formatacao ")));
  assert.equal(normalizeServiceName(cleanServiceName("Reparo   de Placa")), normalizeServiceName(cleanServiceName("reparo de placa")));
  assert.notEqual(normalizeServiceName(cleanServiceName("Instalação / Configuração")), normalizeServiceName(cleanServiceName("Instalação Configuração")));
});

test("preço exige texto decimal não negativo, até duas casas e limite DECIMAL(15,2)", () => {
  assert.equal(parseServicePrice("0"), "0.00");
  assert.equal(parseServicePrice("1.2"), "1.20");
  assert.equal(parseServicePrice("9999999999999.99"), "9999999999999.99");
  for (const invalid of [undefined, null, 0, -1, "", "-1.00", "1.234", "1e2", "10000000000000", "1,00"]) {
    rejectsCode(() => parseServicePrice(invalid), "INVALID_SERVICE_PRICE");
  }
});

test("DTOs rejeitam campos comerciais, renomeação, atividade na criação e versões inválidas", () => {
  assert.deepEqual(parseCreateServiceDto({ name: " Reparo   de Placa ", defaultPrice: "0.00" }), {
    name: "Reparo de Placa", normalizedName: "REPARO DE PLACA", defaultPrice: "0.00",
  });
  rejectsCode(() => parseCreateServiceDto({ name: "X", defaultPrice: "0", isActive: false }), "UNSUPPORTED_FIELD");
  rejectsCode(() => parseCreateServiceDto({ name: "X" }), "INVALID_SERVICE_PRICE");
  rejectsCode(() => parseUpdateServiceDto({ expectedVersion: 1, name: "Y" }), "UNSUPPORTED_FIELD");
  rejectsCode(() => parseUpdateServiceDto({ expectedVersion: 1, defaultPrice: "1", isActive: false }), "INVALID_SERVICE_UPDATE");
  rejectsCode(() => parseUpdateServiceDto({ expectedVersion: 0, isActive: true }), "INVALID_PAGINATION");
  assert.deepEqual(parseUpdateServiceDto({ expectedVersion: 2, defaultPrice: "3.5" }), { expectedVersion: 2, defaultPrice: "3.50" });
  assert.deepEqual(parseUpdateServiceDto({ expectedVersion: 2, isActive: false }), { expectedVersion: 2, isActive: false });
  assert.equal(parseDeleteServiceQuery({ expectedVersion: "2" }), 2);
});

test("listagem usa ativos como padrão, busca normalizada e paginação segura", () => {
  assert.deepEqual(parseServiceListQuery({ page: "1", pageSize: "20" }), { page: 1, pageSize: 20, status: "active" });
  assert.deepEqual(parseServiceListQuery({ page: "2", pageSize: "10", status: "all", search: "  revisão   técnica " }), {
    page: 2, pageSize: 10, status: "all", search: "REVISAO TECNICA",
  });
  rejectsCode(() => parseServiceListQuery({ page: "1", pageSize: "101" }), "INVALID_PAGINATION");
  rejectsCode(() => parseServiceListQuery({ page: "9007199254740991", pageSize: "100" }), "INVALID_PAGINATION");
  rejectsCode(() => parseServiceListQuery({ page: "1", pageSize: "20", status: "hidden" }), "INVALID_FILTER");
});

function fakePrisma() {
  const rows = new Map();
  const audits = [];
  let nextId = 1;
  const catalog = {
    async create({ data }) {
      if ([...rows.values()].some((row) => row.normalizedName === data.normalizedName)) throw { code: "P2002" };
      const now = new Date();
      const row = { id: nextId++, publicId: "123e4567-e89b-42d3-a456-426614174000", version: 1, isActive: true, createdAt: now, updatedAt: now, ...data };
      rows.set(row.id, row);
      return row;
    },
    async findUnique({ where }) { return [...rows.values()].find((row) => row.id === where.id || row.publicId === where.publicId) ?? null; },
    async update({ where, data }) {
      const row = rows.get(where.id);
      const updated = { ...row, ...data, version: row.version + 1, updatedAt: new Date() };
      rows.set(where.id, updated);
      return updated;
    },
    async delete({ where }) { rows.delete(where.id); },
    async findMany({ where, orderBy, skip, take }) {
      assert.deepEqual(orderBy, [{ name: "asc" }, { id: "asc" }]);
      return [...rows.values()].filter((row) => match(row, where)).sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id).slice(skip, skip + take);
    },
    async count({ where }) { return [...rows.values()].filter((row) => match(row, where)).length; },
  };
  const tx = {
    serviceCatalog: catalog,
    adminAuditLog: { async create({ data }) { audits.push(data); } },
    async $queryRaw(_parts, publicId) { const row = [...rows.values()].find((item) => item.publicId === publicId); return row ? [{ id: row.id }] : []; },
  };
  return {
    rows, audits,
    serviceCatalog: catalog,
    async $transaction(input) { return typeof input === "function" ? input(tx) : Promise.all(input); },
  };
}

function match(row, where) {
  return (where.isActive === undefined || row.isActive === where.isActive)
    && (!where.normalizedName || row.normalizedName.includes(where.normalizedName.contains));
}

test("ciclo de cadastro audita criação, preço desabilitado, habilitação e exclusão física", async () => {
  const prisma = fakePrisma();
  const service = new ServicesService(prisma);
  const created = (await service.create(parseCreateServiceDto({ name: " Formatação ", defaultPrice: "0.00" }), 7)).data;
  assert.equal(created.isActive, true);
  assert.equal(created.defaultPrice, "0.00");
  assert.equal(prisma.audits[0].eventCode, "SERVICE_CREATED");
  const inactive = (await service.update(created.publicId, { expectedVersion: 1, isActive: false }, 7)).data;
  assert.equal(inactive.isActive, false);
  assert.equal((await service.list({ page: 1, pageSize: 20, status: "active" })).pagination.total, 0);
  assert.equal((await service.list({ page: 1, pageSize: 20, status: "inactive" })).pagination.total, 1);
  assert.equal((await service.list({ page: 1, pageSize: 20, status: "all" })).pagination.total, 1);
  await assert.rejects(() => service.create(parseCreateServiceDto({ name: "formatacao", defaultPrice: "1.00" }), 7), (error) => codeOf(error) === "DUPLICATE_SERVICE_NAME");
  const changed = (await service.update(created.publicId, { expectedVersion: 2, defaultPrice: "5.00" }, 7)).data;
  assert.equal(changed.isActive, false);
  assert.equal(changed.defaultPrice, "5.00");
  assert.deepEqual(prisma.audits[2].detailsJson, {
    servicePublicId: created.publicId, name: "Formatação", previousPrice: "0.00", newPrice: "5.00",
  });
  const active = (await service.update(created.publicId, { expectedVersion: 3, isActive: true }, 7)).data;
  assert.equal(active.isActive, true);
  await assert.rejects(() => service.update(created.publicId, { expectedVersion: 1, defaultPrice: "4.00" }, 7), (error) => codeOf(error) === "SERVICE_VERSION_CONFLICT");
  const beforeNoop = prisma.audits.length;
  await service.update(created.publicId, { expectedVersion: 4, isActive: true }, 7);
  assert.equal(prisma.audits.length, beforeNoop);
  await service.remove(created.publicId, 4, 7);
  assert.equal(prisma.audits.at(-1).eventCode, "SERVICE_DELETED");
  assert.equal(prisma.audits.at(-1).detailsJson.name, "Formatação");
  assert.equal(prisma.audits.at(-1).detailsJson.defaultPrice, "5.00");
  assert.equal(prisma.rows.size, 0);
  await service.create(parseCreateServiceDto({ name: "formatação", defaultPrice: "1.00" }), 7);
  assert.equal(prisma.rows.size, 1);
});

test("log é criado na mesma transação das mutações", async () => {
  const prisma = fakePrisma();
  const service = new ServicesService(prisma);
  await service.create(parseCreateServiceDto({ name: "Serviço", defaultPrice: "2" }), 9);
  assert.equal(prisma.audits[0].actorUserId, 9);
  assert.equal(prisma.rows.values().next().value.defaultPrice instanceof Prisma.Decimal, true);
});
