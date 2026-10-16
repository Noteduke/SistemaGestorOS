import { BadRequestException, ConflictException, ForbiddenException, HttpException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type ProductStockMovement } from "../../generated/prisma/client.js";
import { PrismaService } from "../../infrastructure/prisma/prisma.service.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { stockBalanceFromDeltas } from "../products/domain/product-stock-ledger.js";
import type { ReverseServiceOrderConsumptionInput } from "./dto/service-order-consumption-reversal.dto.js";

type Tx = Prisma.TransactionClient;
const TX_OPTIONS = { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, maxWait: 10_000, timeout: 30_000 } as const;
const PUBLIC_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const CONFIRMED_ORDER = { opening: { is: { status: "CONFIRMED" } }, numberAllocation: { is: { status: "CONFIRMED" } } } as const satisfies Prisma.ServiceOrderWhereInput;

function conflict(code: string, message: string) { return new ConflictException({ code, message }); }
function hasCode(error: unknown, code: string): boolean { return typeof error === "object" && error !== null && "code" in error && error.code === code; }

@Injectable()
export class ServiceOrderConsumptionReversalService {
  constructor(private readonly prisma: PrismaService) {}

  async reverse(orderPublicId: string, movementPublicId: string, input: ReverseServiceOrderConsumptionInput, actor: AuthenticatedUser) {
    if (!PUBLIC_ID.test(orderPublicId) || !PUBLIC_ID.test(movementPublicId)) {
      throw new BadRequestException({ code: "INVALID_PUBLIC_ID", message: "Identificador público inválido." });
    }
    if (input.confirmed !== true) throw new BadRequestException({ code: "REVERSAL_CONFIRMATION_REQUIRED", message: "Confirme explicitamente a reversão." });

    try {
      return await this.prisma.$transaction(async (tx) => {
        const orderLocks = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM service_orders WHERE public_id = ${orderPublicId} FOR UPDATE`;
        if (!orderLocks[0]) throw new NotFoundException({ code: "SERVICE_ORDER_NOT_FOUND", message: "Ordem de Serviço não encontrada." });
        const order = await tx.serviceOrder.findFirst({
          where: { id: orderLocks[0].id, ...CONFIRMED_ORDER },
          select: { id: true, publicId: true, numberValue: true, macroStatus: true },
        });
        if (!order) throw new NotFoundException({ code: "SERVICE_ORDER_NOT_FOUND", message: "Ordem de Serviço não encontrada." });
        if (order.macroStatus !== "CLOSED") throw conflict("SERVICE_ORDER_NOT_CLOSED", "A reversão da baixa definitiva só se aplica a uma OS fechada.");
        await assertStockPermission(tx, actor);

        const movementLocks = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM product_stock_movements WHERE public_id = ${movementPublicId} FOR UPDATE`;
        if (!movementLocks[0]) throw new NotFoundException({ code: "STOCK_CONSUMPTION_NOT_FOUND", message: "Baixa definitiva não encontrada." });
        const original = await tx.productStockMovement.findFirst({
          where: { id: movementLocks[0].id, publicId: movementPublicId, serviceOrderId: order.id, origin: "SERVICE_ORDER", type: "SERVICE_ORDER_CONSUMED" },
          include: { product: { select: { publicId: true } }, budgetItem: { select: { publicId: true, description: true } } },
        });
        if (!original || original.totalDelta >= 0 || original.appliedDelta !== original.totalDelta || original.defectiveDelta !== 0) {
          throw new NotFoundException({ code: "STOCK_CONSUMPTION_NOT_FOUND", message: "A baixa definitiva não pertence a esta OS ou não é reversível." });
        }
        const quantity = -original.totalDelta;
        if (!Number.isSafeInteger(quantity) || quantity < 1) throw conflict("STOCK_LEDGER_INCONSISTENT", "A quantidade da baixa definitiva é inválida.");
        if (await tx.productStockMovement.findUnique({ where: { reversesMovementId: original.id }, select: { id: true } })) {
          throw conflict("STOCK_CONSUMPTION_ALREADY_REVERSED", "Esta baixa definitiva já foi revertida.");
        }

        await tx.$queryRaw<{ id: number }[]>`SELECT id FROM products WHERE id = ${original.productId} FOR UPDATE`;
        const before = await balanceForProduct(tx, original.productId);
        const after = stockBalanceFromDeltas({ total: before.total + quantity, applied: before.applied, defective: before.defective });
        assertMysqlStockRange(after.total, after.applied, after.defective);
        const reversal = await tx.productStockMovement.create({
          data: {
            productId: original.productId,
            type: "SERVICE_ORDER_CONSUMPTION_REVERSED",
            origin: "SERVICE_ORDER",
            totalDelta: quantity,
            appliedDelta: 0,
            defectiveDelta: 0,
            serviceOrderId: order.id,
            budgetItemId: original.budgetItemId,
            reversesMovementId: original.id,
            unitCostSnapshot: original.unitCostSnapshot,
            actorUserId: actor.id,
          },
          select: { publicId: true, occurredAt: true },
        });
        const afterLedger = await balanceForProduct(tx, original.productId);
        if (afterLedger.total !== after.total || afterLedger.applied !== after.applied || afterLedger.defective !== after.defective) {
          throw conflict("STOCK_BALANCE_CHANGED", "O saldo mudou durante a reversão. A operação foi revertida; consulte os dados atuais.");
        }
        const eventPayload = {
          serviceOrderPublicId: order.publicId,
          originalMovementPublicId: original.publicId,
          reversalMovementPublicId: reversal.publicId,
          productPublicId: original.product.publicId,
          ...(original.budgetItem ? { itemPublicId: original.budgetItem.publicId, description: original.budgetItem.description } : {}),
          quantity,
          macroStatusUnchanged: "FECHADA",
        } as Prisma.InputJsonValue;
        await tx.serviceOrderEvent.create({ data: {
          serviceOrderId: order.id,
          actorUserId: actor.id,
          eventType: "OS_BAIXA_DEFINITIVA_REVERTIDA",
          numberValue: order.numberValue,
          payload: eventPayload,
        } });
        await tx.adminAuditLog.create({ data: {
          eventCode: "SERVICE_ORDER_STOCK_CONSUMPTION_REVERSED",
          actorUserId: actor.id,
          detailsJson: {
            serviceOrderPublicId: order.publicId,
            originalMovementPublicId: original.publicId,
            reversalMovementPublicId: reversal.publicId,
            productPublicId: original.product.publicId,
            ...(original.budgetItem ? { itemPublicId: original.budgetItem.publicId } : {}),
            quantity,
            stockBefore: before,
            stockAfter: after,
            serviceOrderMacroStatusUnchanged: order.macroStatus,
            occurredAt: reversal.occurredAt.toISOString(),
          } as Prisma.InputJsonValue,
        } });
        return { data: {
          serviceOrderPublicId: order.publicId,
          originalMovementPublicId: original.publicId,
          reversalMovementPublicId: reversal.publicId,
          productPublicId: original.product.publicId,
          ...(original.budgetItem ? { itemPublicId: original.budgetItem.publicId, description: original.budgetItem.description } : {}),
          quantity,
          stock: after,
          macroStatus: "FECHADA",
          occurredAt: reversal.occurredAt,
        } };
      }, TX_OPTIONS);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (hasCode(error, "P2002")) throw conflict("STOCK_CONSUMPTION_ALREADY_REVERSED", "Esta baixa definitiva já foi revertida.");
      if (hasCode(error, "P2034") || hasCode(error, "P2028") || isLockConflict(error)) {
        throw conflict("STOCK_REVERSAL_CONCURRENCY_CONFLICT", "Outra operação alterou o estoque. Consulte os dados atuais e tente novamente.");
      }
      throw error;
    }
  }
}

async function assertStockPermission(tx: Tx, actor: AuthenticatedUser) {
  if (actor.isAdmin) return;
  const permission = await tx.userPermission.findFirst({
    where: { userId: actor.id, permission: { code: "products.stock.manage" } },
    select: { userId: true },
  });
  if (!permission) throw new ForbiddenException({ code: "PERMISSION_DENIED", message: "Você não tem permissão para reverter baixas definitivas do estoque." });
}

async function balanceForProduct(tx: Tx, productId: number) {
  const rows = await tx.$queryRaw<Array<{ total_delta: number; applied_delta: number; defective_delta: number }>>`
    SELECT total_delta, applied_delta, defective_delta FROM product_stock_movements WHERE product_id = ${productId} FOR UPDATE`;
  const [total, applied, defective] = rows.reduce<[number, number, number]>((sum, row) => [sum[0] + row.total_delta, sum[1] + row.applied_delta, sum[2] + row.defective_delta], [0, 0, 0]);
  if (![total, applied, defective].every(Number.isSafeInteger)) throw conflict("STOCK_BALANCE_OUT_OF_RANGE", "O saldo agregado do estoque excede o intervalo numérico seguro.");
  return stockBalanceFromDeltas({ total, applied, defective });
}

function assertMysqlStockRange(total: number, applied: number, defective: number) {
  if ([total, applied, defective].some((value) => value < -2_147_483_648 || value > 2_147_483_647)) {
    throw conflict("STOCK_BALANCE_OUT_OF_RANGE", "O saldo agregado ultrapassa o intervalo inteiro suportado pelo MySQL.");
  }
}

function isLockConflict(error: unknown): boolean {
  if (!hasCode(error, "P2010") || typeof error !== "object" || error === null || !("meta" in error)) return false;
  const meta = error.meta as { code?: string | number; driverAdapterError?: { cause?: { code?: string | number } } } | undefined;
  const code = meta?.code ?? meta?.driverAdapterError?.cause?.code;
  return code === 1205 || code === 1213 || code === "1205" || code === "1213";
}
