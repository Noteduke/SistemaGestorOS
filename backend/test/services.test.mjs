import assert from "node:assert/strict";
import { test } from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { Prisma } from "../dist/generated/prisma/client.js";
import { cleanServiceName, normalizeServiceName } from "../dist/modules/services/domain/service-name.js";
import { parseCreateServiceDto, parseDeleteServiceQuery, parseServiceListQuery, parseServicePrice, parseUpdateServiceDto } from "../dist/modules/services/dto/service.dto.js";
import { ServicesService } from "../dist/modules/services/services.service.js";
import { parseBudgetMoney, parseBudgetQuantity, parseCreateManualLabor, parseCreateManualPart, parseCreateRegisteredLabor, parseUpdateBudgetItem } from "../dist/modules/service-orders/dto/budget-item.dto.js";
import { sanitizeServiceOrderEventPayload } from "../dist/modules/service-orders/service-order-events-read.service.js";
import { cleanProductCode, cleanProductDescription } from "../dist/modules/products/domain/product-input.js";
import { parseCreateProduct, parseProductListQuery, parseUpdateProduct } from "../dist/modules/products/dto/product.dto.js";
import { ProductsService } from "../dist/modules/products/products.service.js";
import { parseProductStockMovementsQuery, parseStockAdjustmentBody, parseStockDisposalBody, parseStockQuantityBody } from "../dist/modules/products/dto/product-stock.dto.js";
import { movementDeltas, stockBalanceFromDeltas, stockMovementViolation } from "../dist/modules/products/domain/product-stock-ledger.js";

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
    serviceOrderBudgetNameLock: { async upsert() { return {}; } },
    serviceOrderBudgetItem: { async findFirst() { return null; } },
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

test("itens de orçamento validam quantidades, limites decimais e DTOs por allowlist", () => {
  assert.equal(parseBudgetQuantity("1"), 1);
  assert.equal(parseBudgetQuantity("999"), 999);
  for (const value of ["0", "1000", "1.5", "-1", "9007199254740992", null]) {
    assert.throws(() => parseBudgetQuantity(value));
  }
  assert.equal(parseBudgetMoney("0", "Preço"), "0.00");
  assert.equal(parseBudgetMoney("999999.99", "Preço"), "999999.99");
  for (const value of ["1000000", "-0.01", "1.001", 1, "1e3", "1,00"]) assert.throws(() => parseBudgetMoney(value, "Preço"));
  assert.equal(parseBudgetMoney(null, "Custo", true), null);
  assert.deepEqual(parseCreateRegisteredLabor({ servicePublicId: "6a5ccbc1-a7cc-4a12-8f71-65b9f379d910", quantity: 1 }), {
    servicePublicId: "6a5ccbc1-a7cc-4a12-8f71-65b9f379d910", quantity: 1,
  });
  assert.deepEqual(parseCreateManualLabor({ description: "  Mão   de Obra ", unitPrice: "0" }), { description: "Mão de Obra", quantity: 1, unitPrice: "0.00" });
  assert.deepEqual(parseCreateManualPart({ description: "Fonte", unitPrice: "999999.99", unitCost: null }), { description: "Fonte", quantity: 1, unitPrice: "999999.99", unitCost: null });
  assert.throws(() => parseCreateManualPart({ description: "Fonte", unitPrice: "1", extra: true }));
  assert.deepEqual(parseUpdateBudgetItem({ expectedVersion: 1, quantity: "999", unitCost: "0" }), { expectedVersion: 1, quantity: 999, unitCost: "0.00" });
});

test("projeção de eventos de orçamento remove custo estruturado sem permissão", () => {
  const payload = {
    itemPublicId: "6a5ccbc1-a7cc-4a12-8f71-65b9f379d910", itemType: "MANUAL_PART", origin: "MANUAL",
    description: "Fonte", quantity: 2, unitPrice: "10.00", total: "20.00", unitCost: "5.00", totalCost: "10.00",
    changes: [{ field: "quantity", before: 1, after: 2 }, { field: "unitCost", before: "4.00", after: "5.00" }],
  };
  const hidden = sanitizeServiceOrderEventPayload("ITEM_ORCAMENTO_ALTERADO", payload);
  assert.equal(Object.hasOwn(hidden, "unitCost"), false);
  assert.equal(Object.hasOwn(hidden, "totalCost"), false);
  assert.deepEqual(hidden.changes.map(({ field }) => field), ["quantity"]);
  const visible = sanitizeServiceOrderEventPayload("ITEM_ORCAMENTO_ALTERADO", payload, true);
  assert.equal(visible.unitCost, "5.00");
  assert.equal(visible.totalCost, "10.00");
  assert.deepEqual(visible.changes.map(({ field }) => field), ["quantity", "unitCost"]);
});

test("log é criado na mesma transação das mutações", async () => {
  const prisma = fakePrisma();
  const service = new ServicesService(prisma);
  await service.create(parseCreateServiceDto({ name: "Serviço", defaultPrice: "2" }), 9);
  assert.equal(prisma.audits[0].actorUserId, 9);
  assert.equal(prisma.rows.values().next().value.defaultPrice instanceof Prisma.Decimal, true);
});

test("produto limpa os campos aprovados e mantém código interno opcional", () => {
  assert.equal(cleanProductCode("  pç   10 "), "PÇ 10");
  assert.equal(cleanProductCode("   "), null);
  assert.equal(cleanProductCode(null), null);
  assert.equal(cleanProductDescription("  Placa   Mãe "), "PLACA MÃE");
  rejectsCode(() => cleanProductDescription("  "), "PRODUCT_DESCRIPTION_REQUIRED");
  rejectsCode(() => cleanProductCode("A".repeat(65)), "PRODUCT_CODE_TOO_LONG");
  rejectsCode(() => cleanProductDescription("A".repeat(256)), "PRODUCT_DESCRIPTION_TOO_LONG");
});

test("DTO de produto valida categoria, paginação, filtros e allowlist", () => {
  assert.deepEqual(parseCreateProduct({ internalCode: " pç  10 ", description: " Placa   Mãe ", category: "PART" }), {
    internalCode: "PÇ 10", description: "PLACA MÃE", category: "PART", salePrice: null,
  });
  assert.deepEqual(parseCreateProduct({ description: "Memória", category: "RESALE_GOOD" }), {
    internalCode: null, description: "MEMÓRIA", category: "RESALE_GOOD", salePrice: null,
  });
  assert.equal(parseCreateProduct({ description: "Zero", category: "PART", salePrice: "0" }).salePrice, "0.00");
  assert.equal(parseCreateProduct({ description: "Preço", category: "PART", salePrice: "12.3" }).salePrice, "12.30");
  assert.equal(parseCreateProduct({ description: "Custo", category: "PART", acquisitionCost: "0.00" }).acquisitionCost, "0.00");
  assert.equal(parseCreateProduct({ description: "Custo positivo", category: "PART", acquisitionCost: "13.45" }).acquisitionCost, "13.45");
  assert.equal(parseCreateProduct({ description: "NULL", category: "PART", acquisitionCost: null }).acquisitionCost, null);
  for (const invalid of ["-1", "1.234", "1e2", 1, "10000000000000"]) {
    rejectsCode(() => parseCreateProduct({ description: "Inválido", category: "PART", salePrice: invalid }), "INVALID_PRODUCT_MONEY");
    rejectsCode(() => parseCreateProduct({ description: "Inválido", category: "PART", acquisitionCost: invalid }), "INVALID_PRODUCT_MONEY");
  }
  assert.deepEqual(parseProductListQuery({ page: "1", pageSize: "20", search: "  placa   mãe ", category: "PART" }), {
    page: 1, pageSize: 20, status: "active", search: "PLACA MÃE", category: "PART",
  });
  assert.deepEqual(parseUpdateProduct({ expectedVersion: 2, internalCode: null, isActive: false }), {
    expectedVersion: 2, internalCode: null, isActive: false,
  });
  assert.deepEqual(parseUpdateProduct({ expectedVersion: 2, salePrice: null, acquisitionCost: "0" }), {
    expectedVersion: 2, salePrice: null, acquisitionCost: "0.00",
  });
  rejectsCode(() => parseCreateProduct({ description: "X", category: "OTHER" }), "INVALID_PRODUCT_CATEGORY");
  rejectsCode(() => parseCreateProduct({ description: "X", category: "PART", unitCost: "1.00" }), "UNSUPPORTED_FIELD");
  rejectsCode(() => parseProductListQuery({ page: "1", pageSize: "20", status: "deleted" }), "INVALID_FILTER");
  rejectsCode(() => parseUpdateProduct({ expectedVersion: 1 }), "EMPTY_PRODUCT_UPDATE");
});

function fakeProductsPrisma() {
  const rows = new Map();
  const audits = [];
  let nextId = 1;
  const product = {
    async create({ data }) {
      if (data.internalCode && [...rows.values()].some((row) => row.internalCode === data.internalCode)) throw { code: "P2002" };
      const now = new Date();
      const row = { id: nextId++, publicId: `123e4567-e89b-42d3-a456-42661417400${nextId}`, version: 1, isActive: true, createdAt: now, updatedAt: now, ...data };
      rows.set(row.id, row);
      return row;
    },
    async findUnique({ where }) { return [...rows.values()].find((row) => row.id === where.id || row.publicId === where.publicId) ?? null; },
    async update({ where, data }) {
      const current = rows.get(where.id);
      if (data.internalCode?.set && [...rows.values()].some((row) => row.id !== where.id && row.internalCode === data.internalCode.set)) throw { code: "P2002" };
      const updated = { ...current, ...data, version: current.version + 1, updatedAt: new Date() };
      rows.set(where.id, updated);
      return updated;
    },
    async findMany({ where, orderBy, skip, take }) {
      assert.deepEqual(orderBy, [{ description: "asc" }, { id: "asc" }]);
      return [...rows.values()].filter((row) => matchProduct(row, where)).sort((a, b) => a.description.localeCompare(b.description) || a.id - b.id).slice(skip, skip + take);
    },
    async count({ where }) { return [...rows.values()].filter((row) => matchProduct(row, where)).length; },
  };
  const tx = {
    product,
    serviceOrderBudgetItem: { async findFirst() { return null; } },
    serviceOrderBudgetNameLock: { async upsert() {} },
    adminAuditLog: { async create({ data }) { audits.push(data); } },
    async $queryRaw(_parts, publicId) { const row = [...rows.values()].find((item) => item.publicId === publicId); return row ? [{ id: row.id }] : []; },
  };
  return { rows, audits, product, async $transaction(input) { return typeof input === "function" ? input(tx) : Promise.all(input); } };
}

function fakeProductPolicy() {
  return {
    async hasPermission(user, code) { return user.isAdmin || user.permissions?.includes(code) === true; },
    async assertAllowed(user, required) {
      if (user.isAdmin || required.every((code) => user.permissions?.includes(code))) return;
      throw new ForbiddenException({ code: "PERMISSION_DENIED", message: "Você não tem permissão para esta operação." });
    },
  };
}

function fakeProductStockService() {
  return {
    async summariesForProducts(ids) {
      return new Map(ids.map((id) => [id, { total: 0, applied: 0, defective: 0, available: 0 }]));
    },
  };
}

function matchProduct(row, where) {
  const search = !where.OR || where.OR.some((condition) => Object.entries(condition).some(([field, filter]) => row[field]?.includes(filter.contains)));
  return (where.isActive === undefined || row.isActive === where.isActive)
    && (where.category === undefined || row.category === where.category)
    && search;
}

test("serviço cria, pesquisa, edita, inativa e registra auditoria com versão", async () => {
  const prisma = fakeProductsPrisma();
  const service = new ProductsService(prisma, fakeProductPolicy(), fakeProductStockService());
  const actor = { id: 7, isAdmin: false, permissions: ["products.manage"] };
  const readOnly = { id: 9, isAdmin: false, permissions: ["products.manage", "products.cost.read"] };
  const updateOnly = { id: 10, isAdmin: false, permissions: ["products.manage", "products.cost.update"] };
  const admin = { id: 8, isAdmin: true };
  const created = (await service.create(parseCreateProduct({ internalCode: "P-1", description: "Placa", category: "PART", salePrice: "10.00" }), actor)).data;
  assert.equal(created.description, "PLACA");
  assert.equal(created.salePrice, "10.00");
  assert.equal(Object.hasOwn(created, "acquisitionCost"), false);
  await assert.rejects(() => service.update(created.publicId, parseUpdateProduct({ expectedVersion: 1, acquisitionCost: "0" }), actor), (error) => codeOf(error) === "PERMISSION_DENIED");
  const adminCreated = (await service.create(parseCreateProduct({ description: "Produto custo", category: "PART", salePrice: "10", acquisitionCost: "0" }), admin)).data;
  assert.equal(adminCreated.acquisitionCost, "0.00");
  assert.equal(adminCreated.grossProfitEstimate, "10.00");
  const adminUpdated = (await service.update(adminCreated.publicId, parseUpdateProduct({ expectedVersion: 1, acquisitionCost: null }), admin)).data;
  assert.equal(adminUpdated.acquisitionCost, null);
  assert.equal(adminUpdated.grossProfitEstimate, null);
  assert.deepEqual(prisma.audits[2].detailsJson.before, { acquisitionCost: "0.00" });
  assert.deepEqual(prisma.audits[2].detailsJson.after, { acquisitionCost: null });
  assert.equal(prisma.audits[0].eventCode, "PRODUCT_CREATED");
  const privateCostProduct = (await service.create(parseCreateProduct({ description: "Produto confidencial", category: "PART", salePrice: "12", acquisitionCost: "4.25" }), admin)).data;
  const hiddenCost = (await service.get(privateCostProduct.publicId, actor)).data;
  assert.equal(Object.hasOwn(hiddenCost, "acquisitionCost"), false);
  assert.equal(Object.hasOwn(hiddenCost, "grossProfitEstimate"), false);
  const visibleCost = (await service.get(privateCostProduct.publicId, readOnly)).data;
  assert.equal(visibleCost.acquisitionCost, "4.25");
  assert.equal(visibleCost.grossProfitEstimate, "7.75");
  await assert.rejects(() => service.update(privateCostProduct.publicId, parseUpdateProduct({ expectedVersion: 1, acquisitionCost: "3.00" }), readOnly), (error) => codeOf(error) === "PERMISSION_DENIED");
  const updatedWithoutRead = (await service.update(privateCostProduct.publicId, parseUpdateProduct({ expectedVersion: 1, acquisitionCost: "3.00" }), updateOnly)).data;
  assert.equal(Object.hasOwn(updatedWithoutRead, "acquisitionCost"), false);
  assert.equal(Object.hasOwn(updatedWithoutRead, "grossProfitEstimate"), false);
  const privateCostRow = [...prisma.rows.values()].find((row) => row.publicId === privateCostProduct.publicId);
  assert.equal(privateCostRow.acquisitionCost.toFixed(2), "3.00");
  const updatedOtherField = (await service.update(privateCostProduct.publicId, parseUpdateProduct({ expectedVersion: 2, description: "Descrição atualizada" }), actor)).data;
  assert.equal(privateCostRow.acquisitionCost.toFixed(2), "3.00", "outros campos não substituem o custo existente");
  assert.equal(Object.hasOwn(updatedOtherField, "acquisitionCost"), false);
  const costAudit = prisma.audits.find((entry) => entry.detailsJson?.productPublicId === privateCostProduct.publicId && entry.detailsJson?.before?.acquisitionCost);
  assert.equal(costAudit.actorUserId, updateOnly.id);
  assert.deepEqual(costAudit.detailsJson.before, { acquisitionCost: "4.25" });
  assert.deepEqual(costAudit.detailsJson.after, { acquisitionCost: "3.00" });
  const found = await service.list(parseProductListQuery({ page: "1", pageSize: "20", search: "p-1" }), actor);
  assert.equal(found.pagination.total, 1);
  const updated = (await service.update(created.publicId, parseUpdateProduct({ expectedVersion: 1, description: "Placa mãe", category: "RESALE_GOOD" }), actor)).data;
  assert.equal(updated.description, "PLACA MÃE");
  assert.equal(updated.category, "RESALE_GOOD");
  assert.deepEqual(prisma.audits.find((entry) => entry.detailsJson?.productPublicId === created.publicId && entry.detailsJson.before)?.detailsJson, {
    productPublicId: created.publicId,
    before: { description: "PLACA", category: "PART" },
    after: { description: "PLACA MÃE", category: "RESALE_GOOD" },
  });
  const inactive = (await service.update(created.publicId, { expectedVersion: 2, isActive: false }, actor)).data;
  assert.equal(inactive.isActive, false);
  assert.equal((await service.list({ page: 1, pageSize: 20, status: "active" }, actor)).pagination.total, 2);
  assert.equal((await service.list({ page: 1, pageSize: 20, status: "inactive" }, actor)).pagination.total, 1);
  await assert.rejects(() => service.update(created.publicId, { expectedVersion: 1, isActive: true }, actor), (error) => codeOf(error) === "PRODUCT_VERSION_CONFLICT");
  await assert.rejects(() => service.create(parseCreateProduct({ internalCode: "P-1", description: "Duplicado", category: "PART" }), actor), (error) => codeOf(error) === "DUPLICATE_PRODUCT_CODE");
  assert.deepEqual(prisma.audits.filter((entry) => entry.detailsJson?.productPublicId === created.publicId).map((entry) => entry.eventCode), ["PRODUCT_CREATED", "PRODUCT_UPDATED", "PRODUCT_UPDATED"]);
});

test("DTOs de estoque aceitam unidades inteiras e exigem confirmação de descarte", () => {
  assert.deepEqual(parseStockQuantityBody({ quantity: 3 }), { quantity: 3 });
  assert.deepEqual(parseStockAdjustmentBody({ quantityDelta: -2 }), { quantityDelta: -2 });
  assert.deepEqual(parseStockDisposalBody({ quantity: "1", confirmed: true }), { quantity: 1, confirmed: true });
  assert.deepEqual(parseProductStockMovementsQuery({ page: "1", pageSize: "20" }), { page: 1, pageSize: 20 });
  for (const value of [0, -1, 1.5, "1.5", "1e2", 2_147_483_648]) {
    assert.throws(() => parseStockQuantityBody({ quantity: value }));
  }
  assert.throws(() => parseStockAdjustmentBody({ quantityDelta: 0 }));
  assert.throws(() => parseStockDisposalBody({ quantity: 1, confirmed: false }));
  assert.throws(() => parseProductStockMovementsQuery({ page: "1", pageSize: "101" }));
});

test("razão de estoque deriva os saldos e protege quantidades classificadas", () => {
  const initial = stockBalanceFromDeltas({ total: 0, applied: 0, defective: 0 });
  assert.deepEqual(initial, { total: 0, applied: 0, defective: 0, available: 0 });
  const negative = stockBalanceFromDeltas(movementDeltas("MANUAL_ADJUSTMENT", -2));
  assert.deepEqual(negative, { total: -2, applied: 0, defective: 0, available: -2 });
  assert.equal(stockMovementViolation("MANUAL_ADJUSTMENT", -2, initial), undefined,
    "ajuste pode levar saldo total/disponível a negativo quando não há quantidades classificadas");

  const before = stockBalanceFromDeltas({ total: 5, applied: 1, defective: 1 });
  assert.equal(before.available, 3);
  assert.deepEqual(movementDeltas("MANUAL_ADJUSTMENT", -3), { total: -3, applied: 0, defective: 0 },
    "ajuste manual altera somente o total e preserva as quantidades aplicadas/defeituosas");
  assert.deepEqual(stockBalanceFromDeltas({
    total: before.total - 3,
    applied: before.applied + movementDeltas("MANUAL_ADJUSTMENT", -3).applied,
    defective: before.defective + movementDeltas("MANUAL_ADJUSTMENT", -3).defective,
  }), { total: 2, applied: 1, defective: 1, available: 0 });
  assert.equal(stockMovementViolation("DEFECTIVE_CLASSIFIED", 3, before), undefined);
  assert.equal(stockMovementViolation("DEFECTIVE_CLASSIFIED", 4, before), "INSUFFICIENT_AVAILABLE_STOCK");
  assert.equal(stockMovementViolation("DEFECTIVE_RETURNED", 2, before), "INSUFFICIENT_DEFECTIVE_STOCK");
  assert.equal(stockMovementViolation("DEFECTIVE_DISCARDED", 2, before), "INSUFFICIENT_DEFECTIVE_STOCK");
  assert.equal(stockMovementViolation("MANUAL_ADJUSTMENT", -4, before), "CLASSIFIED_STOCK_PROTECTED");
  assert.equal(stockMovementViolation("MANUAL_ADJUSTMENT", -3, before), undefined);
  assert.deepEqual(movementDeltas("DEFECTIVE_DISCARDED", 1), { total: -1, applied: 0, defective: -1 });
});
