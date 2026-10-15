import { BadRequestException, ConflictException, ForbiddenException, HttpException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type ProductStockMovement, type ServiceOrderBudgetItem } from "../../generated/prisma/client.js";
import { PrismaService } from "../../infrastructure/prisma/prisma.service.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { stockBalanceFromDeltas } from "../products/domain/product-stock-ledger.js";
import { assertEditControlInTransaction, advanceServiceOrderRevision, assertServiceOrderRevision } from "./service-order-edit-control.service.js";
import type { ReverseStockPartInput } from "./dto/service-order-stock-application.dto.js";

type Tx = Prisma.TransactionClient;
type LockedOrder = { id: number; publicId: string; numberValue: bigint; updatedAt: Date };
type StockItem = Pick<ServiceOrderBudgetItem, "id" | "publicId" | "itemType" | "productId" | "description" | "removedAt"> & { product?: { publicId: string } | null };
const TX_OPTIONS = { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, maxWait: 5_000, timeout: 15_000 } as const;
const MAX_INT = 2_147_483_647;
const MIN_INT = -2_147_483_648;
const PUBLIC_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const CONFIRMED_ORDER = { opening: { is: { status: "CONFIRMED" } }, numberAllocation: { is: { status: "CONFIRMED" } } } as const satisfies Prisma.ServiceOrderWhereInput;

function conflict(code: string, message: string): ConflictException { return new ConflictException({ code, message }); }
function invalidId(): BadRequestException { return new BadRequestException({ code: "INVALID_PUBLIC_ID", message: "Identificador público inválido." }); }
function orderNotFound(): NotFoundException { return new NotFoundException({ code: "SERVICE_ORDER_NOT_FOUND", message: "Ordem de Serviço não encontrada." }); }
function itemNotFound(): NotFoundException { return new NotFoundException({ code: "BUDGET_ITEM_NOT_FOUND", message: "Peça do estoque não encontrada nesta OS." }); }

function hasCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

function isLockConflict(error: unknown): boolean {
  if (!hasCode(error, "P2010") || typeof error !== "object" || error === null || !("meta" in error)) return false;
  const meta = error.meta as { code?: string | number; driverAdapterError?: { cause?: { code?: string | number } } } | undefined;
  const code = meta?.code ?? meta?.driverAdapterError?.cause?.code;
  return code === 1205 || code === 1213 || code === "1205" || code === "1213";
}

function mapWriteError(error: unknown): never {
  if (error instanceof HttpException) throw error;
  if (hasCode(error, "P2034") || hasCode(error, "P2028") || isLockConflict(error)) {
    throw conflict("SERVICE_ORDER_STOCK_CONCURRENCY_CONFLICT", "Outra operação alterou a OS ou o estoque. Consulte os dados atuais e tente novamente.");
  }
  throw error;
}

async function assertOperationPermissions(tx: Tx, actor: AuthenticatedUser): Promise<void> {
  if (actor.isAdmin) return;
  const grants = await tx.userPermission.findMany({
    where: { userId: actor.id, permission: { code: { in: ["service_orders.budget.update", "products.stock.manage"] } } },
    select: { permission: { select: { code: true } } },
  });
  const codes = new Set(grants.map(({ permission }) => permission.code));
  if (!codes.has("service_orders.budget.update") || !codes.has("products.stock.manage")) {
    throw new ForbiddenException({ code: "PERMISSION_DENIED", message: "É necessário ter autorização para editar o orçamento e movimentar o estoque." });
  }
}

async function canReadProductCosts(tx: Tx, actor: AuthenticatedUser): Promise<boolean> {
  if (actor.isAdmin) return true;
  return Boolean(await tx.userPermission.findFirst({
    where: { userId: actor.id, permission: { code: "products.cost.read" } },
    select: { userId: true },
  }));
}

async function lockOrder(tx: Tx, publicId: string): Promise<LockedOrder> {
  const locks = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM service_orders WHERE public_id = ${publicId} FOR UPDATE`;
  if (!locks[0]) throw orderNotFound();
  const order = await tx.serviceOrder.findFirst({ where: { ...CONFIRMED_ORDER, id: locks[0].id }, select: { id: true, publicId: true, numberValue: true, macroStatus: true, updatedAt: true } });
  if (!order) throw orderNotFound();
  if (order.macroStatus !== "OPEN") throw conflict("SERVICE_ORDER_NOT_OPEN", "A aplicação de peças exige uma OS aberta.");
  return order;
}

async function lockStockItem(tx: Tx, orderId: number, itemPublicId: string): Promise<StockItem> {
  const locks = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM service_order_budget_items WHERE public_id = ${itemPublicId} AND service_order_id = ${orderId} FOR UPDATE`;
  if (!locks[0]) throw itemNotFound();
  const item = await tx.serviceOrderBudgetItem.findUnique({ where: { id: locks[0].id }, select: { id: true, publicId: true, itemType: true, productId: true, description: true, removedAt: true, product: { select: { publicId: true } } } });
  if (!item || item.removedAt !== null || item.itemType !== "STOCK_PART" || item.productId === null) throw itemNotFound();
  return item;
}

async function lockProduct(tx: Tx, productId: number): Promise<{ id: number; publicId: string; acquisitionCost: Prisma.Decimal | null }> {
  const locks = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM products WHERE id = ${productId} FOR UPDATE`;
  if (!locks[0]) throw conflict("STOCK_PRODUCT_UNAVAILABLE", "O produto vinculado não está disponível.");
  return tx.product.findUniqueOrThrow({ where: { id: productId }, select: { id: true, publicId: true, acquisitionCost: true } });
}

export async function balanceForProduct(tx: Tx, productId: number) {
  // The product row is locked before this call. Use a locking/current read here:
  // a normal Prisma aggregate could reuse a REPEATABLE READ snapshot created by
  // lockOrder() before this transaction waited for the product lock.
  const movements = await tx.$queryRaw<Array<{ total_delta: number; applied_delta: number; defective_delta: number }>>`
    SELECT total_delta, applied_delta, defective_delta
    FROM product_stock_movements
    WHERE product_id = ${productId}
    FOR UPDATE
  `;
  const result = movements.reduce<[number, number, number]>((sum, movement) => [
    sum[0] + movement.total_delta,
    sum[1] + movement.applied_delta,
    sum[2] + movement.defective_delta,
  ], [0, 0, 0]);
  if (!result.every(Number.isSafeInteger)) throw conflict("STOCK_BALANCE_OUT_OF_RANGE", "O saldo agregado excede o intervalo numérico seguro.");
  try { return stockBalanceFromDeltas({ total: result[0], applied: result[1], defective: result[2] }); }
  catch { throw conflict("STOCK_BALANCE_OUT_OF_RANGE", "O saldo agregado excede o intervalo numérico seguro."); }
}

function assertQuantity(quantity: number): void {
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_INT) {
    throw new BadRequestException({ code: "INVALID_STOCK_QUANTITY", message: "A quantidade deve ser um inteiro positivo dentro do limite permitido." });
  }
}

function applyView(row: ProductStockMovement, reversedQuantity: number, canReadCosts: boolean) {
  const quantity = row.appliedDelta;
  return {
    publicId: row.publicId,
    quantity,
    reversedQuantity,
    remainingQuantity: quantity - reversedQuantity,
    occurredAt: row.occurredAt,
    ...(canReadCosts ? { unitCostSnapshot: row.unitCostSnapshot?.toFixed(2) ?? null } : {}),
  };
}

@Injectable()
export class ServiceOrderStockApplicationsService {
  constructor(private readonly prisma: PrismaService) {}

  async listForItems(tx: Tx, orderId: number, items: Array<Pick<ServiceOrderBudgetItem, "id" | "itemType">>, actor: AuthenticatedUser) {
    const stockItems = items.filter((item) => item.itemType === "STOCK_PART");
    if (!stockItems.length) return new Map<number, { appliedQuantity: number; applications: ReturnType<typeof applyView>[] }>();
    const canReadCosts = actor.isAdmin || Boolean(await tx.userPermission.findFirst({ where: { userId: actor.id, permission: { code: "products.cost.read" } }, select: { userId: true } }));
    const rows = await tx.productStockMovement.findMany({
      where: { serviceOrderId: orderId, budgetItemId: { in: stockItems.map(({ id }) => id) }, origin: "SERVICE_ORDER" },
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
    });
    const applications = rows.filter((row) => row.type === "SERVICE_ORDER_APPLIED");
    const reversals = rows.filter((row) => row.type === "SERVICE_ORDER_REVERSED");
    const reversedBySource = new Map<number, number>();
    for (const row of reversals) if (row.sourceMovementId !== null) reversedBySource.set(row.sourceMovementId, (reversedBySource.get(row.sourceMovementId) ?? 0) - row.appliedDelta);
    const result = new Map<number, { appliedQuantity: number; applications: ReturnType<typeof applyView>[] }>();
    for (const item of stockItems) {
      const itemApplications = applications.filter((row) => row.budgetItemId === item.id);
      const views = itemApplications.map((row) => applyView(row, reversedBySource.get(row.id) ?? 0, canReadCosts));
      const appliedQuantity = views.reduce((sum, row) => sum + row.remainingQuantity, 0);
      if (!Number.isSafeInteger(appliedQuantity)) throw conflict("STOCK_BALANCE_OUT_OF_RANGE", "A quantidade aplicada excede o intervalo numérico seguro.");
      result.set(item.id, { appliedQuantity, applications: views });
    }
    return result;
  }

  async apply(orderPublicId: string, itemPublicId: string, quantity: number, actor: AuthenticatedUser, editToken?: string, expectedRevision?: string) {
    if (!PUBLIC_ID.test(orderPublicId) || !PUBLIC_ID.test(itemPublicId)) throw invalidId();
    assertQuantity(quantity);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const order = await lockOrder(tx, orderPublicId);
        await assertEditControlInTransaction(tx, order.id, actor, editToken);
        assertServiceOrderRevision(order.updatedAt, expectedRevision);
        await assertOperationPermissions(tx, actor);
        const item = await lockStockItem(tx, order.id, itemPublicId);
        const product = await lockProduct(tx, item.productId!);
        const before = await balanceForProduct(tx, product.id);
        const after = stockBalanceFromDeltas({ ...before, applied: before.applied + quantity });
        assertMysqlStockRange(after.total, after.applied, after.defective);
        const movement = await tx.productStockMovement.create({ data: {
          productId: product.id, type: "SERVICE_ORDER_APPLIED", origin: "SERVICE_ORDER", totalDelta: 0,
          appliedDelta: quantity, defectiveDelta: 0, serviceOrderId: order.id, budgetItemId: item.id,
          unitCostSnapshot: product.acquisitionCost, actorUserId: actor.id,
        } });
        await tx.serviceOrderEvent.create({ data: {
          serviceOrderId: order.id, actorUserId: actor.id, eventType: "PECA_ESTOQUE_APLICADA", numberValue: order.numberValue,
          payload: { itemPublicId: item.publicId, productPublicId: product.publicId, movementPublicId: movement.publicId,
            description: item.description, quantity, appliedBefore: before.applied, appliedAfter: after.applied,
            availableBefore: before.available, availableAfter: after.available,
            unitCostSnapshot: product.acquisitionCost?.toFixed(2) ?? null },
        } });
        await tx.adminAuditLog.create({ data: {
          eventCode: "SERVICE_ORDER_STOCK_APPLIED", actorUserId: actor.id,
          detailsJson: { serviceOrderPublicId: order.publicId, itemPublicId: item.publicId, productPublicId: product.publicId,
            movementPublicId: movement.publicId, quantity, before, after, costSnapshotCaptured: product.acquisitionCost !== null },
        } });
        const revision = await advanceServiceOrderRevision(tx, order.id, order.updatedAt);
        return { data: { movementPublicId: movement.publicId, quantity, stock: after }, serviceOrderRevision: revision.toISOString() };
      }, TX_OPTIONS);
    } catch (error) { return mapWriteError(error); }
  }

  async reverse(orderPublicId: string, itemPublicId: string, input: ReverseStockPartInput, actor: AuthenticatedUser, editToken?: string, expectedRevision?: string) {
    if (!PUBLIC_ID.test(orderPublicId) || !PUBLIC_ID.test(itemPublicId)) throw invalidId();
    assertQuantity(input.quantity);
    if (!Number.isSafeInteger(input.defectiveQuantity) || input.defectiveQuantity < 0 || input.defectiveQuantity > input.quantity) {
      throw new BadRequestException({ code: "INVALID_DEFECTIVE_QUANTITY", message: "A quantidade defeituosa não pode exceder a quantidade revertida." });
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const order = await lockOrder(tx, orderPublicId);
        await assertEditControlInTransaction(tx, order.id, actor, editToken);
        assertServiceOrderRevision(order.updatedAt, expectedRevision);
        await assertOperationPermissions(tx, actor);
        const item = await lockStockItem(tx, order.id, itemPublicId);
        const result = await this.reverseInTransaction(tx, order, item, actor, input.quantity, input.defectiveQuantity, true);
        const canReadCosts = await canReadProductCosts(tx, actor);
        const reversals = canReadCosts ? result.reversals : result.reversals.map(({ unitCostSnapshot: _unitCostSnapshot, ...reversal }) => reversal);
        const revision = await advanceServiceOrderRevision(tx, order.id, order.updatedAt);
        return { data: { ...result, reversals }, serviceOrderRevision: revision.toISOString() };
      }, TX_OPTIONS);
    } catch (error) { return mapWriteError(error); }
  }

  async reverseAllInTransaction(tx: Tx, order: LockedOrder | { id: number; publicId?: string; numberValue: bigint }, item: StockItem, actor: AuthenticatedUser) {
    const applicationRows = await tx.productStockMovement.findMany({ where: { serviceOrderId: order.id, budgetItemId: item.id, type: "SERVICE_ORDER_APPLIED" }, select: { appliedDelta: true } });
    const reversalRows = await tx.productStockMovement.findMany({ where: { serviceOrderId: order.id, budgetItemId: item.id, type: "SERVICE_ORDER_REVERSED" }, select: { appliedDelta: true } });
    const remaining = applicationRows.reduce((sum, row) => sum + row.appliedDelta, 0) + reversalRows.reduce((sum, row) => sum + row.appliedDelta, 0);
    if (remaining <= 0) return null;
    return this.reverseInTransaction(tx, order, item, actor, remaining, 0, false);
  }

  async reverseInTransaction(
    tx: Tx,
    order: LockedOrder | { id: number; publicId?: string; numberValue: bigint },
    item: StockItem,
    actor: AuthenticatedUser,
    quantity: number,
    defectiveQuantity: number,
    createEvent: boolean,
  ) {
    if (quantity < 1) return { quantity: 0, defectiveQuantity: 0, reversals: [] as Array<Record<string, unknown>> };
    await assertOperationPermissions(tx, actor);
    const product = await lockProduct(tx, item.productId!);
    const applications = await tx.productStockMovement.findMany({
      where: { serviceOrderId: order.id, budgetItemId: item.id, type: "SERVICE_ORDER_APPLIED" },
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
    });
    const appIds = applications.map(({ id }) => id);
    const reversalRows = appIds.length ? await tx.productStockMovement.findMany({ where: { sourceMovementId: { in: appIds }, type: "SERVICE_ORDER_REVERSED" }, select: { sourceMovementId: true, appliedDelta: true } }) : [];
    const reversedBySource = new Map<number, number>();
    for (const reversal of reversalRows) if (reversal.sourceMovementId !== null) reversedBySource.set(reversal.sourceMovementId, (reversedBySource.get(reversal.sourceMovementId) ?? 0) - reversal.appliedDelta);
    const batches = applications.map((application) => ({ application, remaining: application.appliedDelta - (reversedBySource.get(application.id) ?? 0) }));
    const availableToReverse = batches.reduce((sum, batch) => sum + batch.remaining, 0);
    if (quantity > availableToReverse) throw conflict("STOCK_APPLICATION_QUANTITY_CONFLICT", "A quantidade a desfazer excede a aplicação ainda ativa. Recarregue a OS.");

    const before = await balanceForProduct(tx, product.id);
    const after = stockBalanceFromDeltas({ total: before.total, applied: before.applied - quantity, defective: before.defective + defectiveQuantity });
    assertMysqlStockRange(after.total, after.applied, after.defective);
    let left = quantity;
    let defectiveLeft = defectiveQuantity;
    const reversals: Array<Record<string, unknown>> = [];
    const createdMovementIds: string[] = [];
    for (const batch of batches) {
      if (left === 0) break;
      if (batch.remaining <= 0) continue;
      const take = Math.min(left, batch.remaining);
      const defective = Math.min(defectiveLeft, take);
      const movement = await tx.productStockMovement.create({ data: {
        productId: product.id, type: "SERVICE_ORDER_REVERSED", origin: "SERVICE_ORDER", totalDelta: 0,
        appliedDelta: -take, defectiveDelta: defective, serviceOrderId: order.id, budgetItemId: item.id,
        sourceMovementId: batch.application.id, unitCostSnapshot: batch.application.unitCostSnapshot, actorUserId: actor.id,
      } });
      createdMovementIds.push(movement.publicId);
      reversals.push({ sourceApplicationPublicId: batch.application.publicId, quantity: take, defectiveQuantity: defective,
        unitCostSnapshot: batch.application.unitCostSnapshot?.toFixed(2) ?? null });
      left -= take;
      defectiveLeft -= defective;
    }
    if (left !== 0 || defectiveLeft !== 0) throw conflict("STOCK_APPLICATION_QUANTITY_CONFLICT", "Não foi possível distribuir a reversão pelas aplicações existentes.");

    if (createEvent) await tx.serviceOrderEvent.create({ data: {
      serviceOrderId: order.id, actorUserId: actor.id, eventType: "PECA_ESTOQUE_APLICACAO_REVERTIDA", numberValue: order.numberValue,
      payload: { itemPublicId: item.publicId, productPublicId: product.publicId, description: item.description, quantity, defectiveQuantity,
        appliedBefore: before.applied, appliedAfter: after.applied, availableBefore: before.available, availableAfter: after.available,
        defectiveBefore: before.defective, defectiveAfter: after.defective, reversals } as Prisma.InputJsonValue,
    } });
    await tx.adminAuditLog.create({ data: {
      eventCode: "SERVICE_ORDER_STOCK_REVERSED", actorUserId: actor.id,
      detailsJson: { serviceOrderPublicId: order.publicId ?? null, itemPublicId: item.publicId, productPublicId: product.publicId,
        movementPublicIds: createdMovementIds, quantity, defectiveQuantity, before, after },
    } });
    return { quantity, defectiveQuantity, reversals, stock: after };
  }
}

function assertMysqlStockRange(total: number, applied: number, defective: number): void {
  if ([total, applied, defective].some((value) => value < MIN_INT || value > MAX_INT)) {
    throw conflict("STOCK_BALANCE_OUT_OF_RANGE", "A quantidade agregada ultrapassa o intervalo inteiro suportado pelo MySQL.");
  }
}
