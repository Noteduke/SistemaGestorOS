import { BadRequestException, ConflictException, HttpException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type ProductStockMovementType } from "../../generated/prisma/client.js";
import { PrismaService } from "../../infrastructure/prisma/prisma.service.js";
import { AuthPolicyService } from "../auth/auth-policy.service.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import type { ProductStockMovementsQuery } from "./dto/product-stock.dto.js";
import { movementDeltas, stockBalanceFromDeltas, stockMovementViolation, type StockMovementType } from "./domain/product-stock-ledger.js";

type Tx = Prisma.TransactionClient;
const PUBLIC_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const MAX_INT = 2_147_483_647;
const TX_OPTIONS = { maxWait: 5_000, timeout: 10_000 } as const;

type Deltas = { totalDelta: number; appliedDelta: number; defectiveDelta: number };

function assertPublicId(publicId: string): void {
  if (!PUBLIC_ID.test(publicId)) throw new BadRequestException({ code: "INVALID_PUBLIC_ID", message: "Identificador público inválido." });
}

function notFound(): NotFoundException {
  return new NotFoundException({ code: "PRODUCT_NOT_FOUND", message: "Produto não encontrado." });
}

function assertSafeBalance(values: Array<number | null>): number[] {
  const numbers = values.map((value) => value ?? 0);
  if (!numbers.every(Number.isSafeInteger)) throw new ConflictException({ code: "STOCK_BALANCE_OUT_OF_RANGE", message: "O saldo agregado excede o intervalo numérico seguro." });
  return numbers;
}

function mapViolation(code: string): ConflictException {
  const messages: Record<string, string> = {
    INSUFFICIENT_AVAILABLE_STOCK: "A quantidade disponível não é suficiente para classificar como defeituosa.",
    INSUFFICIENT_DEFECTIVE_STOCK: "A quantidade defeituosa não é suficiente para esta operação.",
    CLASSIFIED_STOCK_PROTECTED: "O ajuste não pode reduzir o total abaixo das quantidades aplicadas ou defeituosas.",
  };
  return new ConflictException({ code, message: messages[code] ?? "Movimentação incompatível com o saldo atual." });
}

function isLockConflict(error: unknown): boolean {
  if (!hasCode(error, "P2010") || typeof error !== "object" || error === null || !("meta" in error)) return false;
  const meta = error.meta as { code?: string | number; driverAdapterError?: { cause?: { code?: string | number } } } | undefined;
  const code = meta?.code ?? meta?.driverAdapterError?.cause?.code;
  return code === 1205 || code === 1213 || code === "1205" || code === "1213";
}

function hasCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

function mapWriteError(error: unknown): never {
  if (error instanceof HttpException) throw error;
  if (hasCode(error, "P2034") || hasCode(error, "P2028") || isLockConflict(error)) {
    throw new ConflictException({ code: "STOCK_CONCURRENCY_CONFLICT", message: "Conflito concorrente no estoque. Consulte o saldo atual e tente novamente." });
  }
  throw error;
}

async function lockProduct(tx: Tx, publicId: string): Promise<number> {
  const rows = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM products WHERE public_id = ${publicId} FOR UPDATE`;
  if (!rows[0]) throw notFound();
  return rows[0].id;
}

async function balanceForProduct(tx: Tx, productId: number) {
  const aggregate = await tx.productStockMovement.aggregate({
    where: { productId },
    _sum: { totalDelta: true, appliedDelta: true, defectiveDelta: true },
  });
  const [total, applied, defective] = assertSafeBalance([
    aggregate._sum.totalDelta, aggregate._sum.appliedDelta, aggregate._sum.defectiveDelta,
  ]);
  try {
    return stockBalanceFromDeltas({ total, applied, defective });
  } catch {
    throw new ConflictException({ code: "STOCK_BALANCE_OUT_OF_RANGE", message: "O saldo agregado excede o intervalo numérico seguro." });
  }
}

function movementView(movement: {
  publicId: string;
  type: ProductStockMovementType;
  origin: string;
  totalDelta: number;
  appliedDelta: number;
  defectiveDelta: number;
  reversalDestination?: string | null;
  occurredAt: Date;
  actor: { username: string };
  serviceOrder?: { publicId: string } | null;
  sourceMovement?: { publicId: string } | null;
  reversesMovement?: { publicId: string } | null;
}) {
  const quantity = Math.max(Math.abs(movement.totalDelta), Math.abs(movement.appliedDelta), Math.abs(movement.defectiveDelta));
  return {
    publicId: movement.publicId,
    type: movement.type,
    origin: movement.origin,
    quantity,
    totalDelta: movement.totalDelta,
    appliedDelta: movement.appliedDelta,
    defectiveDelta: movement.defectiveDelta,
    ...(movement.reversalDestination ? { reversalDestination: movement.reversalDestination } : {}),
    occurredAt: movement.occurredAt,
    actor: { username: movement.actor.username },
    ...(movement.serviceOrder ? { serviceOrderPublicId: movement.serviceOrder.publicId } : {}),
    ...(movement.sourceMovement ? { sourceMovementPublicId: movement.sourceMovement.publicId } : {}),
    ...(movement.reversesMovement ? { reversesMovementPublicId: movement.reversesMovement.publicId } : {}),
  };
}

@Injectable()
export class ProductStockService {
  constructor(private readonly prisma: PrismaService, private readonly policy: AuthPolicyService) {}

  async summariesForProducts(productIds: number[]) {
    if (productIds.length === 0) return new Map<number, ReturnType<typeof stockBalanceFromDeltas>>();
    const grouped = await this.prisma.productStockMovement.groupBy({
      by: ["productId"], where: { productId: { in: productIds } },
      _sum: { totalDelta: true, appliedDelta: true, defectiveDelta: true },
    });
    const result = new Map<number, ReturnType<typeof stockBalanceFromDeltas>>();
    for (const row of grouped) {
      const [total, applied, defective] = assertSafeBalance([row._sum.totalDelta, row._sum.appliedDelta, row._sum.defectiveDelta]);
      try {
        result.set(row.productId, stockBalanceFromDeltas({ total, applied, defective }));
      } catch {
        throw new ConflictException({ code: "STOCK_BALANCE_OUT_OF_RANGE", message: "O saldo agregado excede o intervalo numérico seguro." });
      }
    }
    return result;
  }

  async summary(publicId: string) {
    assertPublicId(publicId);
    const product = await this.prisma.product.findUnique({ where: { publicId }, select: { id: true } });
    if (!product) throw notFound();
    const stock = (await this.summariesForProducts([product.id])).get(product.id)
      ?? stockBalanceFromDeltas({ total: 0, applied: 0, defective: 0 });
    return { data: { productPublicId: publicId, stock } };
  }

  async movements(publicId: string, query: ProductStockMovementsQuery) {
    assertPublicId(publicId);
    const product = await this.prisma.product.findUnique({ where: { publicId }, select: { id: true } });
    if (!product) throw notFound();
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.productStockMovement.findMany({
        where: { productId: product.id }, orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * query.pageSize, take: query.pageSize,
        include: {
          actor: { select: { username: true } },
          serviceOrder: { select: { publicId: true } },
          sourceMovement: { select: { publicId: true } },
          reversesMovement: { select: { publicId: true } },
        },
      }),
      this.prisma.productStockMovement.count({ where: { productId: product.id } }),
    ]);
    return {
      data: rows.map(movementView),
      pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) },
    };
  }

  async entry(publicId: string, quantity: number, actor: AuthenticatedUser) {
    return this.record(publicId, "MANUAL_ENTRY", quantity, actor);
  }

  async adjustment(publicId: string, quantityDelta: number, actor: AuthenticatedUser) {
    return this.record(publicId, "MANUAL_ADJUSTMENT", quantityDelta, actor);
  }

  async classifyDefective(publicId: string, quantity: number, actor: AuthenticatedUser) {
    return this.record(publicId, "DEFECTIVE_CLASSIFIED", quantity, actor);
  }

  async returnDefective(publicId: string, quantity: number, actor: AuthenticatedUser) {
    return this.record(publicId, "DEFECTIVE_RETURNED", quantity, actor);
  }

  async disposeDefective(publicId: string, quantity: number, actor: AuthenticatedUser) {
    return this.record(publicId, "DEFECTIVE_DISCARDED", quantity, actor);
  }

  private async record(publicId: string, type: StockMovementType, amount: number, actor: AuthenticatedUser) {
    assertPublicId(publicId);
    await this.policy.assertAllowed(actor, ["products.stock.manage"]);
    if (!Number.isSafeInteger(amount) || Math.abs(amount) > MAX_INT || amount === 0
      || (type !== "MANUAL_ADJUSTMENT" && amount < 1)) {
      throw new BadRequestException({ code: "INVALID_STOCK_QUANTITY", message: "Quantidade fora do intervalo permitido." });
    }
    const deltas = movementDeltas(type, amount);
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const productId = await lockProduct(tx, publicId);
        const before = await balanceForProduct(tx, productId);
        let violation: string | undefined;
        let after: ReturnType<typeof stockBalanceFromDeltas>;
        try {
          violation = stockMovementViolation(type, amount, before);
          after = stockBalanceFromDeltas({
            total: before.total + deltas.total,
            applied: before.applied + deltas.applied,
            defective: before.defective + deltas.defective,
          });
        } catch {
          throw new ConflictException({ code: "STOCK_BALANCE_OUT_OF_RANGE", message: "O saldo agregado excede o intervalo numérico seguro." });
        }
        if (violation) throw mapViolation(violation);
        const movement = await tx.productStockMovement.create({
          data: {
            productId, type, origin: "MANUAL", totalDelta: deltas.total,
            appliedDelta: deltas.applied, defectiveDelta: deltas.defective, actorUserId: actor.id,
          },
        });
        await tx.adminAuditLog.create({
          data: {
            eventCode: `PRODUCT_STOCK_${type}`,
            actorUserId: actor.id,
            detailsJson: {
              productPublicId: publicId,
              movementPublicId: movement.publicId,
              type,
              origin: "MANUAL",
              quantity: Math.abs(amount),
              before,
              after,
            },
          },
        });
        return { movement, stock: after };
      }, TX_OPTIONS);
      return { data: { movement: movementView({ ...result.movement, actor: { username: actor.username } }), stock: result.stock } };
    } catch (error) {
      return mapWriteError(error);
    }
  }
}
