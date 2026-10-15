import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import argon2 from "argon2";
import dotenv from "dotenv";
import mariadb from "mariadb";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { Prisma, PrismaClient } from "../dist/generated/prisma/client.js";
import { balanceForProduct } from "../dist/modules/service-orders/service-order-stock-applications.service.js";

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = dotenv.parse(fs.readFileSync(path.join(backendDir, ".env")));
const databaseUrl = new URL(envFile.DATABASE_URL);
databaseUrl.pathname = "/gestor_os_opening_test";
assert.ok(["localhost", "127.0.0.1"].includes(databaseUrl.hostname), "A validação só aceita MySQL local.");
assert.equal(databaseUrl.pathname, "/gestor_os_opening_test", "O alvo tem que ser exclusivamente gestor_os_opening_test.");

const prisma = new PrismaClient({ adapter: new PrismaMariaDb({
  host: databaseUrl.hostname,
  port: Number(databaseUrl.port || 3306),
  user: decodeURIComponent(databaseUrl.username),
  password: decodeURIComponent(databaseUrl.password),
  database: "gestor_os_opening_test",
}) });
const nonce = randomBytes(5).toString("hex");
const username = `budgettest_${nonce}`;
const password = randomBytes(32).toString("base64url");
const catalogName = `Serviço validação ${nonce}`;
const inactiveName = `Mão de obra ${nonce}`;
const normalizedNames = [catalogName, inactiveName, `Diagnóstico ${nonce}`, `Diagnóstico alterado ${nonce}`, `Peça sem custo ${nonce}`, `PEÇA ESTOQUE ${nonce}`, `PEÇA ZERO ${nonce}`, `PEÇA SEM PREÇO ${nonce}`, `PEÇA INATIVA ${nonce}`]
  .map((value) => value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleUpperCase("pt-BR").replace(/\s+/gu, " ").trim());
let userId;
let order;
let previousSituation;
let previousMacroStatus;
let server;
let cookie;
let csrfToken;
let editToken;
const createdServiceIds = [];
const createdProductIds = [];
const createdItemIds = [];
const results = [];

function cookiePair(response, name) {
  const entries = response.headers.getSetCookie?.() ?? [];
  const entry = entries.find((value) => value.startsWith(`${name}=`));
  return entry?.split(";", 1)[0] ?? "";
}

async function responseJson(response) {
  return response.status === 204 ? null : response.json().catch(() => null);
}

async function api(pathname, { method = "GET", body, auth = true, csrf = true, expectedRevision } = {}) {
  const headers = { Accept: "application/json", Origin: "http://127.0.0.1:5173" };
  if (auth) {
    headers.Cookie = cookie;
    if (csrf) headers["X-CSRF-Token"] = csrfToken;
  }
  if (editToken) headers["X-Service-Order-Edit-Token"] = editToken;
  const revisionTarget = pathname.match(/^\/service-orders\/([0-9a-f-]+)\/(?:assignments|operational-situation|close|cancel|budget-items(?:\/|$))/iu);
  if (revisionTarget && ["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    const current = await prisma.serviceOrder.findUnique({ where: { publicId: revisionTarget[1] }, select: { updatedAt: true } });
    if (current) headers["X-Service-Order-Revision"] = expectedRevision ?? current.updatedAt.toISOString();
  }
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`http://127.0.0.1:3137/api/v1${pathname}`, {
    method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: await responseJson(response) };
}

function errorCode(result) {
  return result.body?.error?.code ?? result.body?.code;
}

async function expectFailure(pathname, method, body, status, code, options = {}) {
  const result = await api(pathname, { method, body, ...options });
  assert.equal(result.status, status, JSON.stringify(result.body));
  if (code) assert.equal(errorCode(result), code, JSON.stringify(result.body));
  return result;
}

async function executeIsolatedDdl(sql) {
  assert.equal(databaseUrl.pathname, "/gestor_os_opening_test", "DDL só pode ser executada no banco isolado.");
  const connection = await mariadb.createConnection({
    host: databaseUrl.hostname, port: Number(databaseUrl.port || 3306),
    user: decodeURIComponent(databaseUrl.username), password: decodeURIComponent(databaseUrl.password),
    database: "gestor_os_opening_test",
  });
  try {
    const [selected] = await connection.query("SELECT DATABASE() AS db");
    assert.equal(selected.db, "gestor_os_opening_test", "A conexão DDL precisa permanecer no banco isolado.");
    await connection.query(sql);
  } finally {
    await connection.end();
  }
}

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Backend de teste encerrou antes de ficar pronto (exit ${server.exitCode}).`);
    try {
      const response = await fetch("http://127.0.0.1:3137/api/v1/auth/csrf");
      if (response.ok) return;
    } catch { /* process is still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("Backend isolado não ficou pronto em 10 segundos.");
}

try {
  const selectedDatabase = await prisma.$queryRawUnsafe("SELECT DATABASE() AS db, VERSION() AS version");
  assert.equal(selectedDatabase[0].db, "gestor_os_opening_test");
  assert.match(selectedDatabase[0].version, /^8\.0\.46/u);
  order = await prisma.serviceOrder.findFirst({
    where: { opening: { is: { status: "CONFIRMED" } }, numberAllocation: { is: { status: "CONFIRMED" } } },
    orderBy: { id: "asc" },
    select: { id: true, publicId: true, numberValue: true, macroStatus: true, operationalSituation: true, updatedAt: true },
  });
  assert.ok(order, "O banco de teste precisa conter ao menos uma OS confirmada.");
  assert.equal(order.macroStatus, "OPEN", "A OS de teste precisa estar aberta.");
  previousMacroStatus = order.macroStatus;
  previousSituation = order.operationalSituation;

  const hash = await argon2.hash(password, { type: argon2.argon2id });
  const user = await prisma.user.create({ data: { username, passwordHash: hash } });
  userId = user.id;
  const permissionCodes = [
    "service_orders.read", "service_orders.events.read", "service_orders.update", "service_orders.situation.update",
    "service_orders.budget.update", "service_orders.budget.costs.read", "service_orders.budget.costs.update", "services.manage", "products.manage", "products.stock.manage", "products.cost.read", "os.close", "os.cancel",
  ];
  const permissionRows = await prisma.permission.findMany({ where: { code: { in: permissionCodes } }, select: { id: true, code: true } });
  assert.equal(permissionRows.length, permissionCodes.length, "Execute seed-permissions no banco de teste antes deste roteiro.");
  const productManagePermission = permissionRows.find(({ code }) => code === "products.manage");
  const stockManagePermission = permissionRows.find(({ code }) => code === "products.stock.manage");
  const productCostReadPermission = permissionRows.find(({ code }) => code === "products.cost.read");
  await prisma.userPermission.createMany({ data: permissionRows.filter(({ code }) => code !== "products.manage").map(({ id }) => ({ userId, permissionId: id })) });

  server = spawn(process.execPath, ["dist/main.js"], {
    cwd: backendDir,
    windowsHide: true,
    env: { ...process.env, DATABASE_URL: databaseUrl.toString(), PORT: "3137", NODE_ENV: "development" },
    stdio: "ignore",
  });
  await waitForServer();

  const stockProduct = await prisma.product.create({ data: {
    internalCode: `OS-${nonce}`, description: `PEÇA ESTOQUE ${nonce}`.toLocaleUpperCase("pt-BR"), category: "PART",
    salePrice: new Prisma.Decimal("12.40"), acquisitionCost: new Prisma.Decimal("7.10"), createdByUserId: userId, updatedByUserId: userId,
  } });
  const zeroPriceProduct = await prisma.product.create({ data: {
    internalCode: `ZERO-${nonce}`, description: `PEÇA ZERO ${nonce}`.toLocaleUpperCase("pt-BR"), category: "PART",
    salePrice: new Prisma.Decimal("0.00"), acquisitionCost: null, createdByUserId: userId, updatedByUserId: userId,
  } });
  const noPriceProduct = await prisma.product.create({ data: {
    internalCode: `SEM-PRECO-${nonce}`, description: `PEÇA SEM PREÇO ${nonce}`.toLocaleUpperCase("pt-BR"), category: "PART",
    salePrice: null, acquisitionCost: new Prisma.Decimal("3.00"), createdByUserId: userId, updatedByUserId: userId,
  } });
  const inactiveProduct = await prisma.product.create({ data: {
    internalCode: `INATIVO-${nonce}`, description: `PEÇA INATIVA ${nonce}`.toLocaleUpperCase("pt-BR"), category: "PART",
    salePrice: new Prisma.Decimal("9.00"), isActive: false, createdByUserId: userId, updatedByUserId: userId,
  } });
  createdProductIds.push(stockProduct.publicId, zeroPriceProduct.publicId, noPriceProduct.publicId, inactiveProduct.publicId);

  const preAuth = await fetch("http://127.0.0.1:3137/api/v1/auth/csrf");
  const preAuthCookie = cookiePair(preAuth, "gos_pre_auth");
  const preAuthBody = await preAuth.json();
  assert.ok(preAuthCookie && preAuthBody.data?.csrfToken, "Contexto CSRF pré-login não foi criado.");
  const login = await fetch("http://127.0.0.1:3137/api/v1/auth/login", {
    method: "POST", headers: {
      "Content-Type": "application/json", Accept: "application/json", Origin: "http://127.0.0.1:5173",
      Cookie: preAuthCookie, "X-CSRF-Token": preAuthBody.data.csrfToken,
    }, body: JSON.stringify({ username, password }),
  });
  const loginBody = await responseJson(login);
  assert.equal(login.status, 201, JSON.stringify(loginBody));
  cookie = cookiePair(login, "gos_session");
  csrfToken = loginBody.data.csrfToken;
  assert.ok(cookie && csrfToken);

  editToken = randomUUID();
  const acquiredControl = await api(`/service-orders/${order.publicId}/edit-control`, { method: "POST" });
  assert.equal(acquiredControl.status, 201, JSON.stringify(acquiredControl.body));

  const initial = await api(`/service-orders/${order.publicId}/budget-items`);
  assert.equal(initial.status, 200);
  assert.equal(initial.body.total, "0.00");
  assert.equal(initial.body.data.length, 0, "A OS escolhida deve começar sem itens de teste existentes.");
  results.push("GET composição vazia, total decimal e leitura autenticada");

  const available = await api("/services/available-for-order");
  assert.equal(available.status, 200);
  assert.deepEqual(available.body.data, []);

  const availableProducts = await api(`/products/available-for-order?page=1&pageSize=20&search=${nonce}`);
  assert.equal(availableProducts.status, 200, JSON.stringify(availableProducts.body));
  assert.equal(availableProducts.body.data.length, 3, "lookup de orçamento inclui somente produtos ativos");
  const lookupProduct = availableProducts.body.data.find((row) => row.publicId === stockProduct.publicId);
  assert.deepEqual(lookupProduct, { publicId: stockProduct.publicId, internalCode: stockProduct.internalCode, description: stockProduct.description, defaultPrice: "12.40" });
  assert.equal(JSON.stringify(availableProducts.body).includes("acquisitionCost"), false);
  assert.equal(JSON.stringify(availableProducts.body).includes("available"), false, "lookup não expõe saldo rejeitado como parte da seleção");
  assert.equal(availableProducts.body.data.some((row) => row.publicId === inactiveProduct.publicId), false);

  const concurrentProduct = await prisma.product.create({ data: {
    internalCode: `CONCORRENTE-${nonce}`, description: `PEÇA CONCORRENTE ${nonce}`, category: "PART",
    createdByUserId: userId, updatedByUserId: userId,
  } });
  createdProductIds.push(concurrentProduct.publicId);
  let signalProductLocked;
  const productLocked = new Promise((resolve) => { signalProductLocked = resolve; });
  let allowConcurrentMovement;
  const concurrentMovementAllowed = new Promise((resolve) => { allowConcurrentMovement = resolve; });
  const concurrentWriter = prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM products WHERE id = ${concurrentProduct.id} FOR UPDATE`;
    signalProductLocked();
    await concurrentMovementAllowed;
    await tx.productStockMovement.create({ data: {
      productId: concurrentProduct.id, type: "MANUAL_ENTRY", origin: "MANUAL",
      totalDelta: 5, appliedDelta: 0, defectiveDelta: 0, actorUserId: userId,
    } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, maxWait: 5_000, timeout: 15_000 });
  await productLocked;
  const currentBalanceAfterWait = await prisma.$transaction(async (tx) => {
    await tx.productStockMovement.aggregate({ where: { productId: concurrentProduct.id }, _sum: { totalDelta: true } });
    allowConcurrentMovement();
    await concurrentWriter;
    await tx.$queryRaw`SELECT id FROM products WHERE id = ${concurrentProduct.id} FOR UPDATE`;
    return balanceForProduct(tx, concurrentProduct.id);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, maxWait: 5_000, timeout: 15_000 });
  assert.equal(currentBalanceAfterWait.total, 5, "leitura do livro após esperar a trava precisa enxergar movimentos commitados depois do snapshot Repeatable Read");
  results.push("Aplicação concorrente lê o saldo atual do livro após adquirir a trava do Produto");
  await expectFailure("/products", "POST", { description: `CADASTRO NEGADO ${nonce}`, category: "PART", salePrice: "1.00" }, 403, "PERMISSION_DENIED");
  await expectFailure(`/service-orders/${order.publicId}/budget-items/stock-part`, "POST", { productPublicId: inactiveProduct.publicId, quantity: 1 }, 409, "PRODUCT_INACTIVE");
  await expectFailure(`/service-orders/${order.publicId}/budget-items/stock-part`, "POST", { productPublicId: noPriceProduct.publicId, quantity: 1 }, 400, "PRODUCT_PRICE_REQUIRED");
  await expectFailure(`/service-orders/${order.publicId}/budget-items/stock-part`, "POST", { productPublicId: stockProduct.publicId, quantity: 1000 }, 400, "INVALID_BUDGET_QUANTITY");
  await expectFailure(`/service-orders/${order.publicId}/budget-items/stock-part`, "POST", { productPublicId: stockProduct.publicId, quantity: 1, unitPrice: "-1.00" }, 400, "INVALID_BUDGET_MONEY");

  const movementCountBeforeBudget = await prisma.productStockMovement.count({ where: { productId: { in: [stockProduct.id, zeroPriceProduct.id, noPriceProduct.id] } } });
  const stockPart = await api(`/service-orders/${order.publicId}/budget-items/stock-part`, {
    method: "POST", body: { productPublicId: stockProduct.publicId, quantity: 4 },
  });
  assert.equal(stockPart.status, 201, JSON.stringify(stockPart.body));
  assert.equal(stockPart.body.data.itemType, "STOCK_PART");
  assert.equal(stockPart.body.data.origin, "PRODUCT_CATALOG");
  assert.equal(stockPart.body.data.productPublicId, stockProduct.publicId);
  assert.equal(stockPart.body.data.description, stockProduct.description);
  assert.equal(stockPart.body.data.quantity, 4);
  assert.equal(stockPart.body.data.unitPrice, "12.40");
  assert.equal(stockPart.body.data.total, "49.60");
  assert.equal(stockPart.body.data.unitCost, null);
  createdItemIds.push(stockPart.body.data.publicId);
  const zeroStockPart = await api(`/service-orders/${order.publicId}/budget-items/stock-part`, {
    method: "POST", body: { productPublicId: zeroPriceProduct.publicId, quantity: 1 },
  });
  assert.equal(zeroStockPart.status, 201, JSON.stringify(zeroStockPart.body));
  assert.equal(zeroStockPart.body.data.unitPrice, "0.00", "preço padrão zero é preservado");
  createdItemIds.push(zeroStockPart.body.data.publicId);
  const manuallyPriced = await api(`/service-orders/${order.publicId}/budget-items/stock-part`, {
    method: "POST", body: { productPublicId: noPriceProduct.publicId, quantity: 2, unitPrice: "8.35" },
  });
  assert.equal(manuallyPriced.status, 201, JSON.stringify(manuallyPriced.body));
  assert.equal(manuallyPriced.body.data.unitPrice, "8.35");
  createdItemIds.push(manuallyPriced.body.data.publicId);
  const duplicateStockPart = await expectFailure(`/service-orders/${order.publicId}/budget-items/stock-part`, "POST", { productPublicId: stockProduct.publicId, quantity: 1 }, 409, "BUDGET_ITEM_DUPLICATE");
  assert.equal(duplicateStockPart.body.details.existingItemPublicId, stockPart.body.data.publicId);
  for (const description of [stockProduct.description, inactiveProduct.description, stockProduct.description.toLocaleLowerCase("pt-BR").replace(" ", "   ")]) {
    const allowedManualPart = await api(`/service-orders/${order.publicId}/budget-items/manual-part`, {
      method: "POST", body: { description, unitPrice: "1.00" },
    });
    assert.equal(allowedManualPart.status, 201, JSON.stringify(allowedManualPart.body));
    createdItemIds.push(allowedManualPart.body.data.publicId);
    const removed = await api(`/service-orders/${order.publicId}/budget-items/${allowedManualPart.body.data.publicId}`, { method: "DELETE" });
    assert.equal(removed.status, 200, JSON.stringify(removed.body));
  }
  const linked = await api(`/service-orders/${order.publicId}/budget-items`);
  const linkedView = linked.body.data.find((row) => row.publicId === stockPart.body.data.publicId);
  assert.equal(linkedView.productPublicId, stockProduct.publicId);
  assert.equal(await prisma.productStockMovement.count({ where: { productId: { in: [stockProduct.id, zeroPriceProduct.id, noPriceProduct.id] } } }), movementCountBeforeBudget);
  assert.deepEqual((await prisma.productStockMovement.aggregate({ where: { productId: stockProduct.id }, _sum: { totalDelta: true, appliedDelta: true, defectiveDelta: true } }))._sum,
    { totalDelta: null, appliedDelta: null, defectiveDelta: null }, "inclusão no orçamento não altera o ledger nem reserva saldo");
  const createdBudgetEvent = await prisma.serviceOrderEvent.findFirst({ where: { serviceOrderId: order.id, actorUserId: userId, eventType: "ITEM_ORCAMENTO_CRIADO", payload: { path: "$.itemPublicId", equals: stockPart.body.data.publicId } } });
  assert.equal(createdBudgetEvent.payload.productPublicId, stockProduct.publicId);
  await prisma.product.update({ where: { id: stockProduct.id }, data: { description: `${stockProduct.description} ATUALIZADO`, salePrice: new Prisma.Decimal("99.00") } });
  const snapshotAfterCatalogChange = await api(`/service-orders/${order.publicId}/budget-items`);
  const unchangedSnapshot = snapshotAfterCatalogChange.body.data.find((row) => row.publicId === stockPart.body.data.publicId);
  assert.equal(unchangedSnapshot.description, stockProduct.description);
  assert.equal(unchangedSnapshot.unitPrice, "12.40", "mudanças futuras no cadastro não alteram a fotografia da OS");
  const revisedStockPart = await api(`/service-orders/${order.publicId}/budget-items/${stockPart.body.data.publicId}`, {
    method: "PATCH", body: { expectedVersion: 1, quantity: 5, unitPrice: "0.00" },
  });
  assert.equal(revisedStockPart.status, 200, JSON.stringify(revisedStockPart.body));
  assert.equal(revisedStockPart.body.data.description, stockProduct.description);
  assert.equal(revisedStockPart.body.data.total, "0.00");
  assert.equal((await prisma.product.findUnique({ where: { id: stockProduct.id } })).salePrice.toFixed(2), "99.00", "editar preço na OS não altera o preço do cadastro");
  assert.equal(await prisma.productStockMovement.count({ where: { productId: stockProduct.id } }), movementCountBeforeBudget);
  const applicationItemPublicId = manuallyPriced.body.data.publicId;
  const applicationProduct = noPriceProduct;
  await prisma.product.update({ where: { id: applicationProduct.id }, data: { acquisitionCost: null } });
  const staleStockRevision = order.updatedAt.toISOString();
  await prisma.userPermission.delete({ where: { userId_permissionId: { userId, permissionId: stockManagePermission.id } } });
  await expectFailure(`/service-orders/${order.publicId}/budget-items/${applicationItemPublicId}/applications`, "POST", { quantity: 1 }, 403, "PERMISSION_DENIED");
  await prisma.userPermission.create({ data: { userId, permissionId: stockManagePermission.id } });
  const firstApplication = await api(`/service-orders/${order.publicId}/budget-items/${applicationItemPublicId}/applications`, {
    method: "POST", body: { quantity: 6 },
  });
  assert.equal(firstApplication.status, 201, JSON.stringify(firstApplication.body));
  assert.equal(firstApplication.body.data.stock.total, 0);
  assert.equal(firstApplication.body.data.stock.applied, 6);
  assert.equal(firstApplication.body.data.stock.available, -6, "a aplicação acima do orçado pode produzir saldo disponível negativo");
  const appliedMovement = await prisma.productStockMovement.findUnique({ where: { publicId: firstApplication.body.data.movementPublicId } });
  assert.equal(appliedMovement.type, "SERVICE_ORDER_APPLIED");
  assert.equal(appliedMovement.serviceOrderId, order.id);
  assert.equal(appliedMovement.budgetItemId, (await prisma.serviceOrderBudgetItem.findUnique({ where: { publicId: applicationItemPublicId }, select: { id: true } })).id);
  assert.equal(appliedMovement.unitCostSnapshot, null, "NULL cadastral é preservado no snapshot histórico");
  const staleApplication = await api(`/service-orders/${order.publicId}/budget-items/${applicationItemPublicId}/applications`, {
    method: "POST", expectedRevision: staleStockRevision, body: { quantity: 1 },
  });
  assert.equal(staleApplication.status, 409, JSON.stringify(staleApplication.body));
  assert.equal(errorCode(staleApplication), "SERVICE_ORDER_DATA_CONFLICT");
  await prisma.product.update({ where: { id: applicationProduct.id }, data: { acquisitionCost: new Prisma.Decimal("9.99") } });
  const secondApplication = await api(`/service-orders/${order.publicId}/budget-items/${applicationItemPublicId}/applications`, {
    method: "POST", body: { quantity: 1 },
  });
  assert.equal(secondApplication.status, 201, JSON.stringify(secondApplication.body));
  const secondAppliedMovement = await prisma.productStockMovement.findUnique({ where: { publicId: secondApplication.body.data.movementPublicId } });
  assert.equal(secondAppliedMovement.unitCostSnapshot.toFixed(2), "9.99");
  const validEditToken = editToken;
  editToken = randomUUID();
  const movementsBeforeLostControl = await prisma.productStockMovement.count({ where: { serviceOrderId: order.id, budgetItemId: appliedMovement.budgetItemId } });
  await expectFailure(`/service-orders/${order.publicId}/budget-items/${applicationItemPublicId}/applications`, "POST", { quantity: 1 }, 409, "SERVICE_ORDER_EDIT_CONTROL_LOST");
  assert.equal(await prisma.productStockMovement.count({ where: { serviceOrderId: order.id, budgetItemId: appliedMovement.budgetItemId } }), movementsBeforeLostControl, "contexto sem controle não pode gravar aplicação");
  editToken = validEditToken;
  await prisma.userPermission.delete({ where: { userId_permissionId: { userId, permissionId: productCostReadPermission.id } } });
  const costsHidden = await api(`/service-orders/${order.publicId}/budget-items`);
  const hiddenApplication = costsHidden.body.data.find((item) => item.publicId === applicationItemPublicId).applications[0];
  assert.equal(Object.hasOwn(hiddenApplication, "unitCostSnapshot"), false);
  const hiddenStockEvents = await api(`/service-orders/${order.publicId}/events?page=1&pageSize=100`);
  const hiddenApplicationEvent = hiddenStockEvents.body.data.find((event) => event.eventType === "PECA_ESTOQUE_APLICADA");
  assert.equal(Object.hasOwn(hiddenApplicationEvent.payload, "unitCostSnapshot"), false);
  const visibleBudgetHistory = await api(`/service-orders/${order.publicId}/history?pageSize=100`);
  const hiddenApplicationHistory = visibleBudgetHistory.body.data.find((entry) => entry.eventType === "PECA_ESTOQUE_APLICADA");
  assert.equal(Object.hasOwn(hiddenApplicationHistory.payload, "unitCostSnapshot"), false);
  const normalReversal = await api(`/service-orders/${order.publicId}/budget-items/${applicationItemPublicId}/applications/reversals`, {
    method: "POST", body: { quantity: 2 },
  });
  assert.equal(normalReversal.status, 201, JSON.stringify(normalReversal.body));
  assert.equal(normalReversal.body.data.stock.available, -5);
  assert.ok(normalReversal.body.data.reversals.length > 0);
  assert.equal(normalReversal.body.data.reversals.some((reversal) => Object.hasOwn(reversal, "unitCostSnapshot")), false,
    "resposta da reversão não expõe snapshot de custo sem products.cost.read");
  await prisma.userPermission.create({ data: { userId, permissionId: productCostReadPermission.id } });
  const costSnapshotVisible = await api(`/service-orders/${order.publicId}/budget-items`);
  const visibleApplicationSnapshots = costSnapshotVisible.body.data.find((item) => item.publicId === applicationItemPublicId).applications.map((application) => application.unitCostSnapshot);
  assert.deepEqual(visibleApplicationSnapshots, [null, "9.99"], "NULL permanece distinto de custo conhecido, e cada aplicação mantém seu snapshot");
  const visibleStockEvents = await api(`/service-orders/${order.publicId}/events?page=1&pageSize=100`);
  const visibleApplicationCosts = visibleStockEvents.body.data.filter((event) => event.eventType === "PECA_ESTOQUE_APLICADA").map((event) => event.payload.unitCostSnapshot);
  assert.ok(visibleApplicationCosts.includes(null) && visibleApplicationCosts.includes("9.99"));
  const defectiveReversal = await api(`/service-orders/${order.publicId}/budget-items/${applicationItemPublicId}/applications/reversals`, {
    method: "POST", body: { quantity: 1, defectiveQuantity: 1 },
  });
  assert.equal(defectiveReversal.status, 201, JSON.stringify(defectiveReversal.body));
  assert.equal(defectiveReversal.body.data.stock.applied, 4);
  assert.equal(defectiveReversal.body.data.stock.defective, 1);
  assert.equal(defectiveReversal.body.data.stock.available, -5, "unidades classificadas como defeituosas não voltam às disponíveis");
  const manualAdjustment = await api(`/products/${applicationProduct.publicId}/stock/adjustments`, { method: "POST", body: { quantityDelta: 2 } });
  assert.equal(manualAdjustment.status, 201, JSON.stringify(manualAdjustment.body));
  assert.deepEqual(manualAdjustment.body.data.stock, { total: 2, applied: 4, defective: 1, available: -3 }, "ajuste manual altera o total e preserva aplicações/defeituosas");
  const excessiveReversal = await expectFailure(`/service-orders/${order.publicId}/budget-items/${applicationItemPublicId}/applications/reversals`, "POST", { quantity: 5 }, 409, "STOCK_APPLICATION_QUANTITY_CONFLICT");
  assert.equal(excessiveReversal.status, 409);
  await prisma.product.update({ where: { id: applicationProduct.id }, data: { isActive: false } });
  const inactiveApplication = await api(`/service-orders/${order.publicId}/budget-items/${applicationItemPublicId}/applications`, {
    method: "POST", body: { quantity: 1 },
  });
  assert.equal(inactiveApplication.status, 201, JSON.stringify(inactiveApplication.body));
  const inactiveReversal = await api(`/service-orders/${order.publicId}/budget-items/${applicationItemPublicId}/applications/reversals`, {
    method: "POST", body: { quantity: 1 },
  });
  assert.equal(inactiveReversal.status, 201, JSON.stringify(inactiveReversal.body));
  const movementsBeforeRemove = await prisma.productStockMovement.count({ where: { serviceOrderId: order.id, budgetItemId: appliedMovement.budgetItemId } });
  const removeNeedsConfirmation = await expectFailure(`/service-orders/${order.publicId}/budget-items/${applicationItemPublicId}`, "DELETE", undefined, 409, "STOCK_APPLICATION_CONFIRMATION_REQUIRED");
  assert.equal(removeNeedsConfirmation.body.details.appliedQuantity, 4);
  assert.equal(await prisma.productStockMovement.count({ where: { serviceOrderId: order.id, budgetItemId: appliedMovement.budgetItemId } }), movementsBeforeRemove);
  const removedAppliedPart = await api(`/service-orders/${order.publicId}/budget-items/${applicationItemPublicId}`, {
    method: "DELETE", body: { confirmed: true, defectiveQuantity: 1 },
  });
  assert.equal(removedAppliedPart.status, 200, JSON.stringify(removedAppliedPart.body));
  assert.equal(await prisma.serviceOrderBudgetItem.findUnique({ where: { publicId: applicationItemPublicId }, select: { removedAt: true } }).then((row) => row.removedAt !== null), true);
  const afterStockItemRemoval = (await prisma.productStockMovement.aggregate({ where: { productId: applicationProduct.id }, _sum: { totalDelta: true, appliedDelta: true, defectiveDelta: true } }))._sum;
  assert.deepEqual(afterStockItemRemoval, { totalDelta: 2, appliedDelta: 0, defectiveDelta: 2 }, "remoção reverte aplicações, classifica defeituosas e preserva o total ajustado");
  const removalEvent = await prisma.serviceOrderEvent.findFirst({ where: { serviceOrderId: order.id, actorUserId: userId, eventType: "ITEM_ORCAMENTO_REMOVIDO" }, orderBy: { id: "desc" } });
  assert.equal(removalEvent.payload.itemPublicId, applicationItemPublicId);
  assert.ok(await prisma.adminAuditLog.findFirst({ where: { actorUserId: userId, eventCode: "SERVICE_ORDER_STOCK_REVERSED" } }));
  const concurrentRevision = (await prisma.serviceOrder.findUnique({ where: { id: order.id }, select: { updatedAt: true } })).updatedAt.toISOString();
  const concurrentApplications = await Promise.all([0, 1].map(() => api(`/service-orders/${order.publicId}/budget-items/${zeroStockPart.body.data.publicId}/applications`, {
    method: "POST", expectedRevision: concurrentRevision, body: { quantity: 1 },
  })));
  assert.deepEqual(concurrentApplications.map(({ status }) => status).sort(), [201, 409], "duas aplicações com a mesma revisão não podem ambas gravar");
  assert.equal(errorCode(concurrentApplications.find(({ status }) => status === 409)), "SERVICE_ORDER_DATA_CONFLICT");
  const concurrentMovementCount = await prisma.productStockMovement.count({ where: { serviceOrderId: order.id, budgetItemId: (await prisma.serviceOrderBudgetItem.findUnique({ where: { publicId: zeroStockPart.body.data.publicId }, select: { id: true } })).id, type: "SERVICE_ORDER_APPLIED" } });
  assert.equal(concurrentMovementCount, 1);
  const concurrentReverse = await api(`/service-orders/${order.publicId}/budget-items/${zeroStockPart.body.data.publicId}/applications/reversals`, { method: "POST", body: { quantity: 1 } });
  assert.equal(concurrentReverse.status, 201, JSON.stringify(concurrentReverse.body));
  assert.equal(concurrentReverse.body.data.stock.applied, 0);
  results.push("Aplicação e reversão normal/defeituosa, snapshot do custo e sigilo, revisão/permissão, controle exclusivo, concorrência, Produto inativo e remoção lógica transacional");
  results.push("Lookup ativo autorizado por edição do orçamento, preço/snapshot, sem custo/saldo, sem movimento ou reserva do estoque");

  const serviceCreate = await api("/services", { method: "POST", body: { name: catalogName, defaultPrice: "123.45" } });
  assert.equal(serviceCreate.status, 201, JSON.stringify(serviceCreate.body));
  const service = serviceCreate.body.data;
  createdServiceIds.push(service.publicId);
  const registered = await api(`/service-orders/${order.publicId}/budget-items/service`, {
    method: "POST", body: { servicePublicId: service.publicId },
  });
  assert.equal(registered.status, 201, JSON.stringify(registered.body));
  assert.equal(registered.body.data.quantity, 1);
  assert.equal(registered.body.data.unitPrice, "123.45");
  assert.equal(registered.body.data.description, catalogName);
  createdItemIds.push(registered.body.data.publicId);
  const duplicateService = await expectFailure(`/service-orders/${order.publicId}/budget-items/service`, "POST", { servicePublicId: service.publicId }, 409, "BUDGET_ITEM_DUPLICATE");
  assert.equal(duplicateService.body.details.existingItemPublicId, registered.body.data.publicId);
  const changedDefault = await api(`/services/${service.publicId}`, { method: "PATCH", body: { expectedVersion: 1, defaultPrice: "200.00" } });
  assert.equal(changedDefault.status, 200, JSON.stringify(changedDefault.body));
  const unchangedItemPrice = await api(`/service-orders/${order.publicId}/budget-items`);
  assert.equal(unchangedItemPrice.body.data.find((item) => item.publicId === registered.body.data.publicId).unitPrice, "123.45");
  const disabled = await api(`/services/${service.publicId}`, { method: "PATCH", body: { expectedVersion: 2, isActive: false } });
  assert.equal(disabled.status, 200, JSON.stringify(disabled.body));
  await expectFailure(`/service-orders/${order.publicId}/budget-items/service`, "POST", { servicePublicId: service.publicId }, 409, "SERVICE_INACTIVE");
  const editInactiveItem = await api(`/service-orders/${order.publicId}/budget-items/${registered.body.data.publicId}`, { method: "PATCH", body: { expectedVersion: 1, quantity: 2 } });
  assert.equal(editInactiveItem.status, 200, JSON.stringify(editInactiveItem.body));
  assert.equal(editInactiveItem.body.data.unitPrice, "123.45");
  const reenabled = await api(`/services/${service.publicId}`, { method: "PATCH", body: { expectedVersion: 3, isActive: true } });
  assert.equal(reenabled.status, 200, JSON.stringify(reenabled.body));
  await expectFailure(`/services/${service.publicId}?expectedVersion=4`, "DELETE", undefined, 409, "SERVICE_ALREADY_USED");
  results.push("Serviço cadastrado, cópia do preço padrão, duplicidade e proteção contra exclusão física");

  const inactiveCreate = await api("/services", { method: "POST", body: { name: inactiveName, defaultPrice: "0.00" } });
  assert.equal(inactiveCreate.status, 201, JSON.stringify(inactiveCreate.body));
  const inactive = inactiveCreate.body.data;
  createdServiceIds.push(inactive.publicId);
  await api(`/services/${inactive.publicId}`, { method: "PATCH", body: { expectedVersion: 1, isActive: false } }).then((r) => assert.equal(r.status, 200));
  await expectFailure(`/service-orders/${order.publicId}/budget-items/manual-labor`, "POST", { description: inactiveName, quantity: 1, unitPrice: "0" }, 409, "MANUAL_LABOR_MATCHES_CATALOG");
  await expectFailure(`/service-orders/${order.publicId}/budget-items/manual-labor`, "POST", { description: catalogName, quantity: 1, unitPrice: "0" }, 409, "MANUAL_LABOR_MATCHES_CATALOG");

  const labor = await api(`/service-orders/${order.publicId}/budget-items/manual-labor`, { method: "POST", body: { description: `Diagnóstico ${nonce}`, unitPrice: "0" } });
  assert.equal(labor.status, 201, JSON.stringify(labor.body));
  createdItemIds.push(labor.body.data.publicId);
  const part = await api(`/service-orders/${order.publicId}/budget-items/manual-part`, {
    method: "POST", body: { description: `Diagnóstico ${nonce}`, quantity: 999, unitPrice: "10.00", unitCost: "0.00" },
  });
  assert.equal(part.status, 201, JSON.stringify(part.body));
  createdItemIds.push(part.body.data.publicId);
  assert.equal(part.body.data.total, "9990.00");
  const partMatchingCatalog = await api(`/service-orders/${order.publicId}/budget-items/${part.body.data.publicId}`, {
    method: "PATCH", body: { expectedVersion: 1, description: inactiveProduct.description.toLocaleLowerCase("pt-BR").replace(" ", "   ") },
  });
  assert.equal(partMatchingCatalog.status, 200, JSON.stringify(partMatchingCatalog.body));
  const partRestored = await api(`/service-orders/${order.publicId}/budget-items/${part.body.data.publicId}`, {
    method: "PATCH", body: { expectedVersion: 2, description: `Diagnóstico ${nonce}` },
  });
  assert.equal(partRestored.status, 200, JSON.stringify(partRestored.body));
  await prisma.userPermission.create({ data: { userId, permissionId: productManagePermission.id } });
  const productMatchingPart = await api("/products", { method: "POST", body: { description: part.body.data.description, category: "PART", salePrice: "1.00" } });
  assert.equal(productMatchingPart.status, 201, JSON.stringify(productMatchingPart.body));
  createdProductIds.push(productMatchingPart.body.data.publicId);
  const renamedProduct = await api(`/products/${stockProduct.publicId}`, { method: "PATCH", body: { expectedVersion: 1, description: part.body.data.description } });
  assert.equal(renamedProduct.status, 200, JSON.stringify(renamedProduct.body));
  await prisma.userPermission.delete({ where: { userId_permissionId: { userId, permissionId: productManagePermission.id } } });
  const duplicatePart = await api(`/service-orders/${order.publicId}/budget-items/manual-part`, { method: "POST", body: {
    description: `  diagnostico   ${nonce}  `, unitPrice: "1.00",
  } });
  assert.equal(duplicatePart.status, 201, JSON.stringify(duplicatePart.body));
  createdItemIds.push(duplicatePart.body.data.publicId);
  const duplicatePartRemoval = await api(`/service-orders/${order.publicId}/budget-items/${duplicatePart.body.data.publicId}`, { method: "DELETE" });
  assert.equal(duplicatePartRemoval.status, 200, JSON.stringify(duplicatePartRemoval.body));
  await expectFailure(`/service-orders/${order.publicId}/budget-items/manual-part`, "POST", { description: "Quantidade inválida", quantity: 1000, unitPrice: "1.00" }, 400, "INVALID_BUDGET_QUANTITY");
  await expectFailure(`/service-orders/${order.publicId}/budget-items/manual-part`, "POST", { description: "Preço inválido", unitPrice: "1000000.00" }, 400, "INVALID_BUDGET_MONEY");
  results.push("Mão de obra avulsa mantém restrições de catálogo/duplicidade; Peça avulsa aceita descrições iguais a Produtos e a outras peças");

  const csrfFailure = await expectFailure(`/service-orders/${order.publicId}/budget-items/manual-part`, "POST", { description: "Sem CSRF", unitPrice: "1.00" }, 403, "CSRF_TOKEN_INVALID", { csrf: false });
  assert.equal(csrfFailure.status, 403);
  results.push("Proteção CSRF nas mutações");

  const eventsBeforeUpdate = await prisma.serviceOrderEvent.count({ where: { serviceOrderId: order.id, actorUserId: userId } });
  const update = await api(`/service-orders/${order.publicId}/budget-items/${part.body.data.publicId}`, {
    method: "PATCH", body: { expectedVersion: 3, quantity: 2, unitPrice: "11.25", description: `Diagnóstico alterado ${nonce}`, unitCost: "5.50" },
  });
  assert.equal(update.status, 200, JSON.stringify(update.body));
  const eventsAfterUpdate = await prisma.serviceOrderEvent.count({ where: { serviceOrderId: order.id, actorUserId: userId } });
  assert.equal(eventsAfterUpdate, eventsBeforeUpdate + 1, "Um salvamento deve gerar exatamente um evento.");
  assert.equal(update.body.data.total, "22.50");
  const changedEvent = await prisma.serviceOrderEvent.findFirst({ where: { serviceOrderId: order.id, actorUserId: userId, eventType: "ITEM_ORCAMENTO_ALTERADO" }, orderBy: { id: "desc" } });
  assert.deepEqual(changedEvent.payload.changes.map(({ field }) => field).sort(), ["description", "quantity", "unitCost", "unitPrice"]);
  results.push("Edição consolidada em um evento, com valores antes/depois e total calculado no Backend");

  const staleRevision = (await prisma.serviceOrder.findUnique({ where: { id: order.id }, select: { updatedAt: true } })).updatedAt.toISOString();
  const concurrentDraft = await api(`/service-orders/${order.publicId}/budget-items/manual-labor`, {
    method: "POST", body: { description: `Rascunho concorrente ${nonce}`, unitPrice: "2.00" },
  });
  assert.equal(concurrentDraft.status, 201, JSON.stringify(concurrentDraft.body));
  createdItemIds.push(concurrentDraft.body.data.publicId);
  normalizedNames.push(`Rascunho concorrente ${nonce}`.normalize("NFD").replace(/\p{M}/gu, "").toLocaleUpperCase("pt-BR"));
  const beforeStaleSave = await prisma.serviceOrderBudgetItem.findUnique({ where: { publicId: part.body.data.publicId } });
  const eventsBeforeStaleSave = await prisma.serviceOrderEvent.count({ where: { serviceOrderId: order.id, actorUserId: userId } });
  const staleSave = await api(`/service-orders/${order.publicId}/budget-items/${part.body.data.publicId}`, {
    method: "PATCH", expectedRevision: staleRevision, body: { expectedVersion: beforeStaleSave.version, quantity: 4 },
  });
  assert.equal(staleSave.status, 409, JSON.stringify(staleSave.body));
  assert.equal(errorCode(staleSave), "SERVICE_ORDER_DATA_CONFLICT");
  const afterStaleSave = await prisma.serviceOrderBudgetItem.findUnique({ where: { publicId: part.body.data.publicId } });
  assert.equal(afterStaleSave.quantity, beforeStaleSave.quantity, "A gravação desatualizada não pode modificar o item.");
  assert.equal(afterStaleSave.version, beforeStaleSave.version);
  assert.equal(await prisma.serviceOrderEvent.count({ where: { serviceOrderId: order.id, actorUserId: userId } }), eventsBeforeStaleSave, "A recusa não deve criar evento.");

  const currentBudget = await api(`/service-orders/${order.publicId}/budget-items`);
  assert.equal(currentBudget.status, 200);
  assert.ok(currentBudget.body.data.some((item) => item.publicId === concurrentDraft.body.data.publicId));
  const currentRevision = (await prisma.serviceOrder.findUnique({ where: { id: order.id }, select: { updatedAt: true } })).updatedAt.toISOString();
  const manuallyReapplied = await api(`/service-orders/${order.publicId}/budget-items/${part.body.data.publicId}`, {
    method: "PATCH", expectedRevision: currentRevision,
    body: { expectedVersion: afterStaleSave.version, quantity: 4 },
  });
  assert.equal(manuallyReapplied.status, 200, JSON.stringify(manuallyReapplied.body));
  assert.equal(manuallyReapplied.body.data.quantity, 4);
  results.push("Revisão global recusa salvamento antigo sem gravar item/evento; consulta atual e reaplicação manual com revisão e versão atuais funcionam");

  const costReadPermission = permissionRows.find(({ code }) => code === "service_orders.budget.costs.read");
  await prisma.userPermission.delete({ where: { userId_permissionId: { userId, permissionId: costReadPermission.id } } });
  await prisma.userPermission.delete({ where: { userId_permissionId: { userId, permissionId: productCostReadPermission.id } } });
  const hidden = await api(`/service-orders/${order.publicId}/budget-items`);
  assert.equal(hidden.status, 200);
  assert.equal(Object.hasOwn(hidden.body.data.find((item) => item.publicId === part.body.data.publicId), "unitCost"), false);
  await expectFailure(`/service-orders/${order.publicId}/budget-items/${part.body.data.publicId}`, "PATCH", { expectedVersion: 5, unitCost: "9.00" }, 403, "PERMISSION_DENIED");
  const quantityOnly = await api(`/service-orders/${order.publicId}/budget-items/${part.body.data.publicId}`, { method: "PATCH", body: { expectedVersion: 5, quantity: 3 } });
  assert.equal(quantityOnly.status, 200);
  const stored = await prisma.serviceOrderBudgetItem.findUnique({ where: { publicId: part.body.data.publicId } });
  assert.equal(stored.unitCost.toFixed(2), "5.50", "Edição sem leitura de custo preserva o valor interno.");
  const historyHidden = await api(`/service-orders/${order.publicId}/history?pageSize=100`);
  assert.equal(historyHidden.status, 200);
  const budgetHistory = historyHidden.body.data.filter((entry) => entry.kind === "SYSTEM_EVENT" && entry.eventType.startsWith("ITEM_ORCAMENTO_"));
  assert.ok(budgetHistory.length);
  assert.equal(JSON.stringify(budgetHistory).includes("unitCost"), false);
  const eventsHidden = await api(`/service-orders/${order.publicId}/events?page=1&pageSize=100`);
  const budgetEventsHidden = eventsHidden.body.data.filter((entry) => entry.eventType.startsWith("ITEM_ORCAMENTO_"));
  assert.equal(JSON.stringify(budgetEventsHidden).includes("unitCost"), false);
  assert.ok(budgetEventsHidden.some((entry) => entry.payload.productPublicId === stockProduct.publicId), "histórico mantém a referência pública do Produto");
  await prisma.userPermission.create({ data: { userId, permissionId: costReadPermission.id } });
  await prisma.userPermission.create({ data: { userId, permissionId: productCostReadPermission.id } });
  results.push("Custo oculto na composição e no histórico; alteração negada sem permissão e custo preservado em edição comum");

  const nullCost = await api(`/service-orders/${order.publicId}/budget-items/manual-part`, { method: "POST", body: { description: `Peça sem custo ${nonce}`, unitPrice: "0.00" } });
  assert.equal(nullCost.status, 201, JSON.stringify(nullCost.body));
  createdItemIds.push(nullCost.body.data.publicId);
  assert.equal(nullCost.body.data.unitCost, null);
  const removed = await api(`/service-orders/${order.publicId}/budget-items/${labor.body.data.publicId}`, { method: "DELETE" });
  assert.equal(removed.status, 200, JSON.stringify(removed.body));
  const relaunch = await api(`/service-orders/${order.publicId}/budget-items/manual-labor`, { method: "POST", body: { description: `Diagnóstico ${nonce}`, unitPrice: "1.00" } });
  assert.equal(relaunch.status, 201, JSON.stringify(relaunch.body));
  createdItemIds.push(relaunch.body.data.publicId);
  const removedRow = await prisma.serviceOrderBudgetItem.findUnique({ where: { publicId: labor.body.data.publicId } });
  assert.ok(removedRow.removedAt && removedRow.removedByUserId === userId);
  results.push("Custo NULL preservado como desconhecido, remoção lógica e relançamento com novo item");

  const concurrentCreate = await api("/services", { method: "POST", body: { name: `Concorrente ${nonce}`, defaultPrice: "2.00" } });
  assert.equal(concurrentCreate.status, 201, JSON.stringify(concurrentCreate.body));
  normalizedNames.push(`CONCORRENTE ${nonce}`);
  createdServiceIds.push(concurrentCreate.body.data.publicId);
  const concurrentAdds = await Promise.all([0, 1].map(() => api(`/service-orders/${order.publicId}/budget-items/service`, {
    method: "POST", body: { servicePublicId: concurrentCreate.body.data.publicId },
  })));
  assert.deepEqual(concurrentAdds.map(({ status }) => status).sort(), [201, 409]);
  const successAdd = concurrentAdds.find(({ status }) => status === 201);
  createdItemIds.push(successAdd.body.data.publicId);
  results.push("Inclusões concorrentes do mesmo serviço são serializadas e deixam uma única linha ativa");

  const bulkApplied = await api(`/service-orders/${order.publicId}/budget-items/${zeroStockPart.body.data.publicId}/applications`, { method: "POST", body: { quantity: 2 } });
  assert.equal(bulkApplied.status, 201, JSON.stringify(bulkApplied.body));
  const targetSituation = previousSituation === "NOT_AUTHORIZED_READY_DELIVERY" ? "NOT_AUTHORIZED_REASSEMBLE" : "NOT_AUTHORIZED_READY_DELIVERY";
  const withdrawal = await api(`/service-orders/${order.publicId}/operational-situation`, { method: "PATCH", body: { operationalSituation: targetSituation, withdrawBudget: true } });
  assert.equal(withdrawal.status, 200, JSON.stringify(withdrawal.body));
  const afterWithdrawal = await api(`/service-orders/${order.publicId}/budget-items`);
  assert.equal(afterWithdrawal.status, 200);
  assert.equal(afterWithdrawal.body.data.length, 0);
  assert.equal(afterWithdrawal.body.total, "0.00");
  const withdrawnEvent = await prisma.serviceOrderEvent.findFirst({ where: { serviceOrderId: order.id, actorUserId: userId, eventType: "ORCAMENTO_RETIRADO" }, orderBy: { id: "desc" } });
  assert.ok(withdrawnEvent);
  const withdrawnStockSnapshot = withdrawnEvent.payload.items.find((item) => item.publicId === zeroStockPart.body.data.publicId);
  assert.equal(withdrawnStockSnapshot.stockApplicationsReversed[0].quantity, 2);
  const bulkBalance = (await prisma.productStockMovement.aggregate({ where: { productId: zeroPriceProduct.id }, _sum: { totalDelta: true, appliedDelta: true, defectiveDelta: true } }))._sum;
  assert.deepEqual(bulkBalance, { totalDelta: 0, appliedDelta: 0, defectiveDelta: 0 }, "retirada integral reverte aplicações sem alterar o total");
  results.push("Retirada integral em NÃO AUTORIZADO reverte aplicação ativa no mesmo histórico e transação");
  await expectFailure(`/services/${service.publicId}?expectedVersion=4`, "DELETE", undefined, 409, "SERVICE_ALREADY_USED");
  results.push("Retirada integral somente junto da situação NÃO AUTORIZADO, com snapshot e total histórico");

  const restored = await api(`/service-orders/${order.publicId}/operational-situation`, { method: "PATCH", body: { operationalSituation: previousSituation } });
  assert.equal(restored.status, 200, JSON.stringify(restored.body));
  const clean = await api(`/service-orders/${order.publicId}/budget-items`);
  assert.equal(clean.body.data.length, 0);

  async function reopenForClosureTest() {
    await prisma.serviceOrder.update({ where: { id: order.id }, data: { macroStatus: "OPEN", updatedAt: new Date() } });
    const control = await api(`/service-orders/${order.publicId}/edit-control`, { method: "POST" });
    assert.equal(control.status, 201, JSON.stringify(control.body));
    const composition = await api(`/service-orders/${order.publicId}/budget-items`);
    assert.equal(composition.status, 200, JSON.stringify(composition.body));
    for (const item of composition.body.data) {
      const removed = await api(`/service-orders/${order.publicId}/budget-items/${item.publicId}`, { method: "DELETE", body: { confirmed: true } });
      assert.equal(removed.status, 200, JSON.stringify(removed.body));
    }
  }

  const closureProduct = await prisma.product.create({ data: {
    internalCode: `CLOSE-${nonce}`, description: `PEÇA ENCERRAMENTO ${nonce}`, category: "PART", salePrice: new Prisma.Decimal("10.00"), acquisitionCost: new Prisma.Decimal("7.10"), createdByUserId: userId, updatedByUserId: userId,
  } });
  createdProductIds.push(closureProduct.publicId);
  assert.equal((await api(`/products/${closureProduct.publicId}/stock/entries`, { method: "POST", body: { quantity: 1 } })).status, 201);
  const closureItem = await api(`/service-orders/${order.publicId}/budget-items/stock-part`, { method: "POST", body: { productPublicId: closureProduct.publicId, quantity: 2 } });
  assert.equal(closureItem.status, 201, JSON.stringify(closureItem.body));
  createdItemIds.push(closureItem.body.data.publicId);
  const closureItemId = closureItem.body.data.publicId;
  assert.equal((await api(`/service-orders/${order.publicId}/budget-items/${closureItemId}/applications`, { method: "POST", body: { quantity: 1 } })).status, 201);
  await expectFailure(`/service-orders/${order.publicId}/close`, "POST", { outcome: "REPAIRED" }, 409, "SERVICE_ORDER_STOCK_RECONCILIATION_REQUIRED");
  assert.equal((await prisma.serviceOrder.findUniqueOrThrow({ where: { id: order.id }, select: { macroStatus: true } })).macroStatus, "OPEN");
  assert.equal(await prisma.productStockMovement.count({ where: { serviceOrderId: order.id, type: "SERVICE_ORDER_CONSUMED" } }), 0);
  const manuallyRegularized = await api(`/service-orders/${order.publicId}/budget-items/${closureItemId}/applications`, { method: "POST", body: { quantity: 1 } });
  assert.equal(manuallyRegularized.status, 201, JSON.stringify(manuallyRegularized.body));
  const secondClosureProduct = await prisma.product.create({ data: {
    internalCode: `CLOSE-2-${nonce}`, description: `SEGUNDA PEÇA ENCERRAMENTO ${nonce}`, category: "PART", salePrice: new Prisma.Decimal("5.00"), acquisitionCost: null, createdByUserId: userId, updatedByUserId: userId,
  } });
  createdProductIds.push(secondClosureProduct.publicId);
  await api(`/products/${secondClosureProduct.publicId}/stock/entries`, { method: "POST", body: { quantity: 2 } });
  const secondClosureItem = await api(`/service-orders/${order.publicId}/budget-items/stock-part`, { method: "POST", body: { productPublicId: secondClosureProduct.publicId, quantity: 1 } });
  assert.equal(secondClosureItem.status, 201, JSON.stringify(secondClosureItem.body));
  createdItemIds.push(secondClosureItem.body.data.publicId);
  await api(`/service-orders/${order.publicId}/budget-items/${secondClosureItem.body.data.publicId}/applications`, { method: "POST", body: { quantity: 1 } });

  const unavailableAuditTable = `admin_audit_log_test_fail_${nonce}`;
  await executeIsolatedDdl(`RENAME TABLE \`admin_audit_log\` TO \`${unavailableAuditTable}\``);
  try {
    const beforeFailure = await prisma.productStockMovement.aggregate({ where: { productId: closureProduct.id }, _sum: { totalDelta: true, appliedDelta: true, defectiveDelta: true } });
    const failedClosure = await api(`/service-orders/${order.publicId}/close`, { method: "POST", body: { outcome: "REPAIRED" } });
    assert.equal(failedClosure.status, 500, JSON.stringify(failedClosure.body));
    assert.equal((await prisma.serviceOrder.findUniqueOrThrow({ where: { id: order.id }, select: { macroStatus: true } })).macroStatus, "OPEN", "falha no Log Administrativo reverte o status");
    assert.equal(await prisma.productStockMovement.count({ where: { serviceOrderId: order.id, type: "SERVICE_ORDER_CONSUMED" } }), 0, "falha no Log Administrativo reverte as baixas");
    const afterFailure = await prisma.productStockMovement.aggregate({ where: { productId: closureProduct.id }, _sum: { totalDelta: true, appliedDelta: true, defectiveDelta: true } });
    assert.deepEqual(afterFailure._sum, beforeFailure._sum, "falha no fechamento não deixa movimento parcial");
  } finally {
    await executeIsolatedDdl(`RENAME TABLE \`${unavailableAuditTable}\` TO \`admin_audit_log\``);
  }
  const repairedClose = await api(`/service-orders/${order.publicId}/close`, { method: "POST", body: { outcome: "REPAIRED" } });
  assert.equal(repairedClose.status, 201, JSON.stringify(repairedClose.body));
  assert.equal(repairedClose.body.data.macroStatus, "FECHADA");
  const consumedRows = await prisma.productStockMovement.findMany({ where: { serviceOrderId: order.id, budgetItem: { is: { publicId: closureItemId } }, type: "SERVICE_ORDER_CONSUMED" } });
  assert.equal(consumedRows.reduce((sum, movement) => sum + movement.totalDelta, 0), -2);
  assert.equal(consumedRows.reduce((sum, movement) => sum + movement.appliedDelta, 0), -2);
  assert.ok(consumedRows.every((movement) => movement.unitCostSnapshot?.toFixed(2) === "7.10"), "cada movimento de baixa preserva o snapshot histórico da aplicação de origem");
  const repairedBalance = await prisma.productStockMovement.aggregate({ where: { productId: closureProduct.id }, _sum: { totalDelta: true, appliedDelta: true, defectiveDelta: true } });
  assert.deepEqual(repairedBalance._sum, { totalDelta: -1, appliedDelta: 0, defectiveDelta: 0 }, "a baixa aceita estoque negativo e reduz total/aplicado igualmente, preservando disponibilidade");
  const secondConsumed = await prisma.productStockMovement.findFirstOrThrow({ where: { serviceOrderId: order.id, budgetItem: { is: { publicId: secondClosureItem.body.data.publicId } }, type: "SERVICE_ORDER_CONSUMED" } });
  assert.equal(secondConsumed.totalDelta, -1, "baixa itens diferentes dentro da mesma operação");
  const closedEvent = await prisma.serviceOrderEvent.findFirstOrThrow({ where: { serviceOrderId: order.id, eventType: "OS_ENCERRADA", actorUserId: userId }, orderBy: { id: "desc" } });
  assert.equal(JSON.stringify(closedEvent.payload).includes("unitCostSnapshot"), false, "o evento não expõe o custo histórico");
  results.push("Encerramento reparado reconcilia quantidades, preserva disponibilidade e custo histórico e reverte integralmente sob falha no Log Administrativo");

  await reopenForClosureTest();
  const noRepairProduct = await prisma.product.create({ data: { internalCode: `NO-REPAIR-${nonce}`, description: `DEVOLUÇÃO ${nonce}`, category: "PART", createdByUserId: userId, updatedByUserId: userId } });
  createdProductIds.push(noRepairProduct.publicId);
  await api(`/products/${noRepairProduct.publicId}/stock/entries`, { method: "POST", body: { quantity: 4 } });
  const noRepairItem = await api(`/service-orders/${order.publicId}/budget-items/stock-part`, { method: "POST", body: { productPublicId: noRepairProduct.publicId, quantity: 2, unitPrice: "4.00" } });
  assert.equal(noRepairItem.status, 201, JSON.stringify(noRepairItem.body));
  createdItemIds.push(noRepairItem.body.data.publicId);
  await api(`/service-orders/${order.publicId}/budget-items/${noRepairItem.body.data.publicId}/applications`, { method: "POST", body: { quantity: 2 } });
  await expectFailure(`/service-orders/${order.publicId}/close`, "POST", { outcome: "WITHOUT_REPAIR" }, 409, "PHYSICAL_REMOVAL_CONFIRMATION_REQUIRED");
  const noRepairClose = await api(`/service-orders/${order.publicId}/close`, { method: "POST", body: { outcome: "WITHOUT_REPAIR", confirmPhysicalRemoval: true, defectiveItems: [{ itemPublicId: noRepairItem.body.data.publicId, quantity: 1 }] } });
  assert.equal(noRepairClose.status, 201, JSON.stringify(noRepairClose.body));
  const returnedBalance = await prisma.productStockMovement.aggregate({ where: { productId: noRepairProduct.id }, _sum: { totalDelta: true, appliedDelta: true, defectiveDelta: true } });
  assert.deepEqual(returnedBalance._sum, { totalDelta: 4, appliedDelta: 0, defectiveDelta: 1 }, "uma unidade normal volta à disponibilidade e a defeituosa permanece separada");
  results.push("Encerramento sem reparo exige confirmação de retirada e devolve unidades normais, mantendo defeituosas indisponíveis");

  await reopenForClosureTest();
  const cancelProduct = await prisma.product.create({ data: { internalCode: `CANCEL-${nonce}`, description: `CANCELAMENTO ${nonce}`, category: "PART", createdByUserId: userId, updatedByUserId: userId } });
  createdProductIds.push(cancelProduct.publicId);
  await api(`/products/${cancelProduct.publicId}/stock/entries`, { method: "POST", body: { quantity: 2 } });
  const cancelItem = await api(`/service-orders/${order.publicId}/budget-items/stock-part`, { method: "POST", body: { productPublicId: cancelProduct.publicId, quantity: 1, unitPrice: "3.00" } });
  assert.equal(cancelItem.status, 201, JSON.stringify(cancelItem.body));
  createdItemIds.push(cancelItem.body.data.publicId);
  await api(`/service-orders/${order.publicId}/budget-items/${cancelItem.body.data.publicId}/applications`, { method: "POST", body: { quantity: 1 } });
  const cancelPermission = permissionRows.find(({ code }) => code === "os.cancel");
  await prisma.userPermission.delete({ where: { userId_permissionId: { userId, permissionId: cancelPermission.id } } });
  await expectFailure(`/service-orders/${order.publicId}/cancel`, "POST", { confirmPhysicalRemoval: true, defectiveItems: [] }, 403, "PERMISSION_DENIED");
  await prisma.userPermission.create({ data: { userId, permissionId: cancelPermission.id } });
  await prisma.userPermission.delete({ where: { userId_permissionId: { userId, permissionId: stockManagePermission.id } } });
  await expectFailure(`/service-orders/${order.publicId}/cancel`, "POST", { confirmPhysicalRemoval: true, defectiveItems: [] }, 403, "PERMISSION_DENIED");
  assert.equal((await prisma.productStockMovement.count({ where: { serviceOrderId: order.id, budgetItem: { is: { publicId: cancelItem.body.data.publicId } }, type: "SERVICE_ORDER_REVERSED" } })), 0, "sem products.stock.manage não há reversão parcial");
  await prisma.userPermission.create({ data: { userId, permissionId: stockManagePermission.id } });
  const cancelRevision = (await prisma.serviceOrder.findUniqueOrThrow({ where: { id: order.id }, select: { updatedAt: true } })).updatedAt.toISOString();
  const concurrentCancel = await Promise.all([0, 1].map(() => api(`/service-orders/${order.publicId}/cancel`, {
    method: "POST", body: { confirmPhysicalRemoval: true, defectiveItems: [{ itemPublicId: cancelItem.body.data.publicId, quantity: 1 }] }, expectedRevision: cancelRevision,
  })));
  assert.equal(concurrentCancel.filter(({ status }) => status === 201).length, 1, JSON.stringify(concurrentCancel));
  assert.equal(concurrentCancel.filter(({ status }) => status === 409).length, 1, JSON.stringify(concurrentCancel));
  assert.equal((await prisma.productStockMovement.aggregate({ where: { productId: cancelProduct.id }, _sum: { totalDelta: true, appliedDelta: true, defectiveDelta: true } }))._sum.defectiveDelta, 1, "tentativas concorrentes não duplicam a classificação ou reversão");
  assert.equal((await prisma.serviceOrder.findUniqueOrThrow({ where: { id: order.id }, select: { macroStatus: true } })).macroStatus, "CANCELED");
  results.push("Cancelamento com peças exige retirada, classifica defeito e duas solicitações simultâneas não duplicam movimentos");

  await reopenForClosureTest();
  await prisma.userPermission.delete({ where: { userId_permissionId: { userId, permissionId: stockManagePermission.id } } });
  const noPartsClose = await api(`/service-orders/${order.publicId}/close`, { method: "POST", body: { outcome: "REPAIRED" } });
  assert.equal(noPartsClose.status, 201, JSON.stringify(noPartsClose.body), "OS sem peças aplicadas pode ser encerrada sem permissão de estoque");
  await prisma.userPermission.create({ data: { userId, permissionId: stockManagePermission.id } });
  results.push("OS sem aplicações fecha sem exigir privilégio de movimentar estoque");
} finally {
  if (server && server.exitCode === null && editToken && cookie && order) {
    await api(`/service-orders/${order.publicId}/edit-control`, { method: "DELETE" }).catch(() => undefined);
  }
  if (server && server.exitCode === null) {
    const stopped = new Promise((resolve) => server.once("exit", resolve));
    server.kill();
    await Promise.race([stopped, new Promise((resolve) => setTimeout(resolve, 2_000))]);
  }
  try {
    if (userId && order) {
      await prisma.$transaction(async (tx) => {
        await tx.productStockMovement.deleteMany({ where: { actorUserId: userId, type: "SERVICE_ORDER_REVERSED" } });
        await tx.productStockMovement.deleteMany({ where: { actorUserId: userId, type: "SERVICE_ORDER_CONSUMED" } });
        await tx.productStockMovement.deleteMany({ where: { actorUserId: userId, type: "SERVICE_ORDER_APPLIED" } });
        await tx.productStockMovement.deleteMany({ where: { actorUserId: userId } });
        await tx.serviceOrderEvent.deleteMany({ where: { serviceOrderId: order.id, actorUserId: userId } });
        await tx.serviceOrderBudgetItem.deleteMany({ where: { serviceOrderId: order.id, OR: [{ createdByUserId: userId }, { updatedByUserId: userId }, { removedByUserId: userId }] } });
        await tx.product.deleteMany({ where: { publicId: { in: createdProductIds } } });
        await tx.serviceCatalog.deleteMany({ where: { createdByUserId: userId } });
        await tx.adminAuditLog.deleteMany({ where: { actorUserId: userId } });
        await tx.userSession.deleteMany({ where: { userId } });
        await tx.userPermission.deleteMany({ where: { userId } });
        await tx.user.deleteMany({ where: { id: userId } });
        if (previousSituation !== undefined) await tx.serviceOrder.update({ where: { id: order.id }, data: { macroStatus: previousMacroStatus ?? "OPEN", operationalSituation: previousSituation, updatedAt: order.updatedAt } });
        await tx.serviceOrderBudgetNameLock.deleteMany({ where: { normalizedName: { in: normalizedNames } } });
      });
    }
  } finally {
    await prisma.$disconnect();
  }
}

console.log(`Validação HTTP concluída somente em gestor_os_opening_test (${results.length} grupos):`);
for (const result of results) console.log(`- ${result}`);
