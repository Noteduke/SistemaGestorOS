import { BadRequestException, ConflictException, ForbiddenException, HttpException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type ServiceOrderBudgetItem } from "../../generated/prisma/client.js";
import { PrismaService } from "../../infrastructure/prisma/prisma.service.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { stockBalanceFromDeltas } from "../products/domain/product-stock-ledger.js";
import { assertEditControlInTransaction, advanceServiceOrderRevision, assertServiceOrderRevision } from "./service-order-edit-control.service.js";
import { ServiceOrderStockApplicationsService } from "./service-order-stock-applications.service.js";
import { formatServiceOrderNumber } from "./domain/service-order-number-format.js";
import type { CloseServiceOrderInput, DefectiveStockPartInput } from "./dto/service-order-closure.dto.js";

type Tx = Prisma.TransactionClient;
type LockedOrder = { id: number; publicId: string; numberValue: bigint; macroStatus: "OPEN"; updatedAt: Date };
type BudgetStockItem = Pick<ServiceOrderBudgetItem, "id" | "publicId" | "productId" | "description" | "quantity" | "removedAt">;
type ApplicationBatch = { movement: { id: number; publicId: string; appliedDelta: number; unitCostSnapshot: Prisma.Decimal | null }; remaining: number };
const TX_OPTIONS = { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, maxWait: 10_000, timeout: 30_000 } as const;
const PUBLIC_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const CONFIRMED_ORDER = { opening: { is: { status: "CONFIRMED" } }, numberAllocation: { is: { status: "CONFIRMED" } } } as const satisfies Prisma.ServiceOrderWhereInput;

function conflict(code: string, message: string, details?: unknown): ConflictException {
  return new ConflictException({ code, message, ...(details === undefined ? {} : { details }) });
}

@Injectable()
export class ServiceOrderClosureService {
  constructor(private readonly prisma: PrismaService, private readonly stockApplications: ServiceOrderStockApplicationsService) {}

  async close(publicId: string, input: CloseServiceOrderInput, actor: AuthenticatedUser, editToken?: string, expectedRevision?: string) {
    return this.run(publicId, actor, editToken, expectedRevision, "os.close", async (tx, order, items) => {
      const batches = await this.readActiveApplications(tx, order, items);
      const discrepancies = items.flatMap((item) => {
        const applied = sumBatches(batches.get(item.id) ?? []);
        const budgeted = item.removedAt === null ? item.quantity : 0;
        return applied === budgeted ? [] : [{ itemPublicId: item.publicId, description: item.description, budgetedQuantity: budgeted, appliedQuantity: applied }];
      });

      if (input.outcome === "REPAIRED") {
        if (discrepancies.length) throw conflict("SERVICE_ORDER_STOCK_RECONCILIATION_REQUIRED", "As quantidades orçadas e aplicadas divergem. Corrija manualmente o orçamento ou as aplicações e consulte a OS antes de encerrar.", { items: discrepancies });
        const hasStock = activeApplicationCount(batches) > 0;
        if (hasStock) await assertStockPermission(tx, actor);
        const stockOperations = await this.consumeAppliedParts(tx, order, items, batches, actor);
        return { macroStatus: "CLOSED" as const, eventType: "OS_ENCERRADA", outcome: "REPAIRED", stockOperations };
      }

      const active = items.map((item) => ({ item, quantity: sumBatches(batches.get(item.id) ?? []) })).filter(({ quantity }) => quantity > 0)
        .sort((a, b) => a.item.productId! - b.item.productId! || a.item.id - b.item.id);
      await assertPhysicalRemoval(input.confirmPhysicalRemoval, active.length > 0);
      const defectiveByItem = validateDefectiveItems(input.defectiveItems, active);
      if (active.length) await assertStockPermission(tx, actor);
      const stockOperations = [];
      for (const { item, quantity } of active) {
        const result = await this.stockApplications.reverseInTransaction(
          tx, order, { ...item, itemType: "STOCK_PART", product: null }, actor, quantity,
          defectiveByItem.get(item.publicId) ?? 0, true, true,
        );
        stockOperations.push({ itemPublicId: item.publicId, productPublicId: await productPublicId(tx, item.productId!), description: item.description,
          quantity, defectiveQuantity: result.defectiveQuantity, operation: "RETURNED" });
      }
      return { macroStatus: "CLOSED" as const, eventType: "OS_ENCERRADA", outcome: "WITHOUT_REPAIR", stockOperations };
    });
  }

  async cancel(publicId: string, input: Pick<CloseServiceOrderInput, "confirmPhysicalRemoval" | "defectiveItems">, actor: AuthenticatedUser, editToken?: string, expectedRevision?: string) {
    return this.run(publicId, actor, editToken, expectedRevision, "os.cancel", async (tx, order, items) => {
      const batches = await this.readActiveApplications(tx, order, items);
      const active = items.map((item) => ({ item, quantity: sumBatches(batches.get(item.id) ?? []) })).filter(({ quantity }) => quantity > 0)
        .sort((a, b) => a.item.productId! - b.item.productId! || a.item.id - b.item.id);
      await assertPhysicalRemoval(input.confirmPhysicalRemoval, active.length > 0);
      const defectiveByItem = validateDefectiveItems(input.defectiveItems, active);
      if (active.length) await assertStockPermission(tx, actor);
      const stockOperations = [];
      for (const { item, quantity } of active) {
        const result = await this.stockApplications.reverseInTransaction(
          tx, order, { ...item, itemType: "STOCK_PART", product: null }, actor, quantity,
          defectiveByItem.get(item.publicId) ?? 0, true, true,
        );
        stockOperations.push({ itemPublicId: item.publicId, productPublicId: await productPublicId(tx, item.productId!), description: item.description,
          quantity, defectiveQuantity: result.defectiveQuantity, operation: "RETURNED" });
      }
      return { macroStatus: "CANCELED" as const, eventType: "OS_CANCELADA", outcome: "CANCELED", stockOperations };
    });
  }

  private async run(
    publicId: string, actor: AuthenticatedUser, editToken: string | undefined, expectedRevision: string | undefined, permissionCode: "os.close" | "os.cancel",
    operation: (tx: Tx, order: LockedOrder, items: BudgetStockItem[]) => Promise<{ macroStatus: "CLOSED" | "CANCELED"; eventType: string; outcome: string; stockOperations: Array<Record<string, unknown>> }>,
  ) {
    if (!PUBLIC_ID.test(publicId)) throw new BadRequestException({ code: "INVALID_PUBLIC_ID", message: "Identificador público da OS inválido." });
    try {
      return await this.prisma.$transaction(async (tx) => {
        const locks = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM service_orders WHERE public_id = ${publicId} FOR UPDATE`;
        if (!locks[0]) throw new NotFoundException({ code: "SERVICE_ORDER_NOT_FOUND", message: "Ordem de Serviço não encontrada." });
        const order = await tx.serviceOrder.findFirst({ where: { id: locks[0].id, ...CONFIRMED_ORDER }, select: { id: true, publicId: true, numberValue: true, macroStatus: true, updatedAt: true } });
        if (!order) throw new NotFoundException({ code: "SERVICE_ORDER_NOT_FOUND", message: "Ordem de Serviço não encontrada." });
        if (order.macroStatus !== "OPEN") throw conflict("SERVICE_ORDER_ALREADY_FINAL", "A OS já foi encerrada ou cancelada; nenhuma movimentação adicional foi criada.");
        await assertEditControlInTransaction(tx, order.id, actor, editToken);
        assertServiceOrderRevision(order.updatedAt, expectedRevision);
        await assertPermission(tx, actor, permissionCode);
        const items = await tx.serviceOrderBudgetItem.findMany({ where: { serviceOrderId: order.id, itemType: "STOCK_PART" }, select: { id: true, publicId: true, productId: true, description: true, quantity: true, removedAt: true }, orderBy: [{ id: "asc" }] });
        const result = await operation(tx, { ...order, macroStatus: "OPEN" }, items);
        const now = new Date();
        const revision = await advanceServiceOrderRevision(tx, order.id, order.updatedAt, { macroStatus: result.macroStatus });
        await tx.serviceOrderEvent.create({ data: {
          serviceOrderId: order.id, actorUserId: actor.id, eventType: result.eventType, numberValue: order.numberValue, occurredAt: now,
          payload: { previousMacroStatus: "ABERTA", newMacroStatus: result.macroStatus === "CLOSED" ? "FECHADA" : "CANCELADA", outcome: result.outcome, stockOperations: result.stockOperations } as Prisma.InputJsonValue,
        } });
        await tx.adminAuditLog.create({ data: {
          eventCode: result.macroStatus === "CLOSED" ? "SERVICE_ORDER_CLOSED" : "SERVICE_ORDER_CANCELED", actorUserId: actor.id, occurredAt: now,
          detailsJson: { serviceOrderPublicId: order.publicId, visibleNumber: formatServiceOrderNumber(order.numberValue), previousMacroStatus: "ABERTA", newMacroStatus: result.macroStatus === "CLOSED" ? "FECHADA" : "CANCELADA", outcome: result.outcome, stockOperations: result.stockOperations } as Prisma.InputJsonValue,
        } });
        await releaseEditControl(tx, order.id);
        return { data: { publicId: order.publicId, macroStatus: result.macroStatus === "CLOSED" ? "FECHADA" : "CANCELADA", outcome: result.outcome, stockOperations: result.stockOperations }, serviceOrderRevision: revision.toISOString() };
      }, TX_OPTIONS);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (hasCode(error, "P2034") || hasCode(error, "P2028") || isLockConflict(error)) throw conflict("SERVICE_ORDER_CLOSURE_CONCURRENCY_CONFLICT", "Outra operação alterou a OS ou o estoque. Consulte os dados atuais e tente novamente.");
      throw error;
    }
  }

  private async readActiveApplications(tx: Tx, order: LockedOrder, items: BudgetStockItem[]) {
    const stockIds = items.map(({ id }) => id);
    const movements = stockIds.length ? await tx.productStockMovement.findMany({
      where: { serviceOrderId: order.id, budgetItemId: { in: stockIds }, origin: "SERVICE_ORDER", type: { in: ["SERVICE_ORDER_APPLIED", "SERVICE_ORDER_REVERSED", "SERVICE_ORDER_CONSUMED"] } },
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
      select: { id: true, publicId: true, budgetItemId: true, sourceMovementId: true, type: true, appliedDelta: true, unitCostSnapshot: true },
    }) : [];
    const byItem = new Map<number, ApplicationBatch[]>();
    for (const item of items) byItem.set(item.id, []);
    const applications = movements.filter(({ type }) => type === "SERVICE_ORDER_APPLIED");
    const bySource = new Map<number, number>();
    for (const movement of movements) if ((movement.type === "SERVICE_ORDER_REVERSED" || movement.type === "SERVICE_ORDER_CONSUMED") && movement.sourceMovementId !== null) {
      bySource.set(movement.sourceMovementId, (bySource.get(movement.sourceMovementId) ?? 0) + movement.appliedDelta);
    }
    for (const movement of applications) {
      const remaining = movement.appliedDelta + (bySource.get(movement.id) ?? 0);
      if (remaining < 0) throw conflict("STOCK_LEDGER_INCONSISTENT", "O histórico de aplicações contém uma quantidade revertida acima da aplicada.");
      if (movement.budgetItemId !== null) byItem.get(movement.budgetItemId)?.push({ movement, remaining });
    }
    return byItem;
  }

  private async consumeAppliedParts(tx: Tx, order: LockedOrder, items: BudgetStockItem[], batches: Map<number, ApplicationBatch[]>, actor: AuthenticatedUser) {
    const activeItems = items.map((item) => ({ item, batches: batches.get(item.id) ?? [] })).filter(({ batches: list }) => sumBatches(list) > 0);
    const productIds = [...new Set(activeItems.map(({ item }) => item.productId!))].sort((a, b) => a - b);
    for (const productId of productIds) await tx.$queryRaw<{ id: number }[]>`SELECT id FROM products WHERE id = ${productId} FOR UPDATE`;
    const productViews = new Map<number, { publicId: string }>();
    for (const productId of productIds) productViews.set(productId, await tx.product.findUniqueOrThrow({ where: { id: productId }, select: { id: true, publicId: true } }));
    const operations: Array<Record<string, unknown>> = [];
    for (const { item, batches: itemBatches } of activeItems) {
      const quantity = sumBatches(itemBatches);
      const productId = item.productId!;
      const before = await productStockBalance(tx, productId);
      const after = stockBalanceFromDeltas({ total: before.total - quantity, applied: before.applied - quantity, defective: before.defective });
      assertMysqlStockRange(after.total, after.applied, after.defective);
      const consumptionMovements: Array<{ publicId: string; quantity: number }> = [];
      for (const batch of itemBatches) {
        if (!batch.remaining) continue;
        const consumed = await tx.productStockMovement.create({ data: {
          productId, type: "SERVICE_ORDER_CONSUMED", origin: "SERVICE_ORDER", totalDelta: -batch.remaining, appliedDelta: -batch.remaining, defectiveDelta: 0,
          serviceOrderId: order.id, budgetItemId: item.id, sourceMovementId: batch.movement.id,
          unitCostSnapshot: batch.movement.unitCostSnapshot, actorUserId: actor.id,
        }, select: { publicId: true } });
        consumptionMovements.push({ publicId: consumed.publicId, quantity: batch.remaining });
      }
      const afterLedger = await productStockBalance(tx, productId);
      if (afterLedger.total !== after.total || afterLedger.applied !== after.applied || afterLedger.defective !== after.defective) {
        throw conflict("STOCK_BALANCE_CHANGED", "O saldo mudou durante o encerramento. A operação foi revertida; consulte os dados atuais.");
      }
      await tx.adminAuditLog.create({ data: {
        eventCode: "SERVICE_ORDER_STOCK_CONSUMED", actorUserId: actor.id,
        detailsJson: { serviceOrderPublicId: order.publicId, itemPublicId: item.publicId, productPublicId: productViews.get(productId)!.publicId,
          movementPublicIds: consumptionMovements.map(({ publicId }) => publicId), quantity, operation: "CONSUMED_ON_REPAIR_CLOSURE", before, after },
      } });
      operations.push({ itemPublicId: item.publicId, productPublicId: productViews.get(productId)!.publicId, description: item.description, quantity, consumptionMovements, operation: "CONSUMED" });
    }
    return operations;
  }
}

async function productStockBalance(tx: Tx, productId: number) {
  const rows = await tx.$queryRaw<Array<{ total_delta: number; applied_delta: number; defective_delta: number }>>`
    SELECT total_delta, applied_delta, defective_delta FROM product_stock_movements WHERE product_id = ${productId} FOR UPDATE`;
  const [total, applied, defective] = rows.reduce<[number, number, number]>((sum, row) => [sum[0] + row.total_delta, sum[1] + row.applied_delta, sum[2] + row.defective_delta], [0, 0, 0]);
  if (![total, applied, defective].every(Number.isSafeInteger)) throw conflict("STOCK_BALANCE_OUT_OF_RANGE", "O saldo agregado do estoque excede o intervalo numérico seguro.");
  return stockBalanceFromDeltas({ total, applied, defective });
}

async function productPublicId(tx: Tx, productId: number) { return (await tx.product.findUniqueOrThrow({ where: { id: productId }, select: { publicId: true } })).publicId; }
function sumBatches(batches: ApplicationBatch[]) { return batches.reduce((sum, batch) => sum + batch.remaining, 0); }
function activeApplicationCount(batches: Map<number, ApplicationBatch[]>) { return [...batches.values()].reduce((sum, items) => sum + sumBatches(items), 0); }
function assertPhysicalRemoval(confirmed: boolean, hasAppliedParts: boolean): void {
  if (hasAppliedParts && !confirmed) throw conflict("PHYSICAL_REMOVAL_CONFIRMATION_REQUIRED", "Esta OS possui peças aplicadas. Confirme que foram retiradas do equipamento antes de devolver ao estoque.");
}
function validateDefectiveItems(input: DefectiveStockPartInput[], active: Array<{ item: BudgetStockItem; quantity: number }>) {
  const activeByPublicId = new Map(active.map(({ item, quantity }) => [item.publicId, quantity]));
  const result = new Map<string, number>();
  for (const entry of input) {
    const applied = activeByPublicId.get(entry.itemPublicId);
    if (applied === undefined) throw new BadRequestException({ code: "INVALID_DEFECTIVE_ITEM", message: "O item defeituoso não possui aplicação ativa nesta OS." });
    if (entry.quantity > applied) throw new BadRequestException({ code: "INVALID_DEFECTIVE_QUANTITY", message: "A quantidade defeituosa não pode exceder a quantidade aplicada ainda ativa." });
    result.set(entry.itemPublicId, entry.quantity);
  }
  return result;
}
async function assertPermission(tx: Tx, actor: AuthenticatedUser, code: string) {
  if (actor.isAdmin) return;
  const row = await tx.userPermission.findFirst({ where: { userId: actor.id, permission: { code } }, select: { userId: true } });
  if (!row) throw new ForbiddenException({ code: "PERMISSION_DENIED", message: "Você não tem permissão para esta operação." });
}
async function assertStockPermission(tx: Tx, actor: AuthenticatedUser) { await assertPermission(tx, actor, "products.stock.manage"); }
async function releaseEditControl(tx: Tx, serviceOrderId: number) {
  const control = await tx.serviceOrderEditControl.findUnique({ where: { serviceOrderId }, select: { id: true } });
  if (!control) return;
  const now = new Date();
  await tx.serviceOrderEditControl.update({ where: { id: control.id }, data: { holderUserId: null, holderSessionId: null, contextTokenHash: null, leaseVersion: { increment: 1 }, lastHeartbeatAt: now, expiresAt: now } });
}
function assertMysqlStockRange(total: number, applied: number, defective: number) {
  if ([total, applied, defective].some((value) => value < -2_147_483_648 || value > 2_147_483_647)) throw conflict("STOCK_BALANCE_OUT_OF_RANGE", "O saldo agregado ultrapassa o intervalo inteiro suportado pelo MySQL.");
}
function hasCode(error: unknown, code: string): boolean { return typeof error === "object" && error !== null && "code" in error && error.code === code; }
function isLockConflict(error: unknown): boolean {
  if (!hasCode(error, "P2010") || typeof error !== "object" || error === null || !("meta" in error)) return false;
  const meta = error.meta as { code?: string | number; driverAdapterError?: { cause?: { code?: string | number } } } | undefined;
  const code = meta?.code ?? meta?.driverAdapterError?.cause?.code;
  return code === 1205 || code === 1213 || code === "1205" || code === "1213";
}
