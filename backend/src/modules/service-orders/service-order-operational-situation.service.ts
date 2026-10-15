import { BadRequestException, ConflictException, ForbiddenException, HttpException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "../../generated/prisma/client.js";
import { PrismaService } from "../../infrastructure/prisma/prisma.service.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import type { OperationalSituationPatchInput } from "./dto/operational-situation-patch.dto.js";
import { serviceOrderDetailSelect, toServiceOrderDetailView } from "./service-orders-read.service.js";
import { ServiceOrderBudgetItemsService } from "./service-order-budget-items.service.js";
import { advanceServiceOrderRevision, assertEditControlInTransaction, assertServiceOrderRevision } from "./service-order-edit-control.service.js";

const PUBLIC_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TRANSACTION_OPTIONS = { isolationLevel: "RepeatableRead" as const, maxWait: 10000, timeout: 15000 };
type Tx = Prisma.TransactionClient;

@Injectable()
export class ServiceOrderOperationalSituationService {
  constructor(private readonly prisma: PrismaService, private readonly budgetItems: ServiceOrderBudgetItemsService) {}

  async update(publicId: string, input: OperationalSituationPatchInput, actor: AuthenticatedUser, editToken?: string, expectedRevision?: string) {
    if (!PUBLIC_ID.test(publicId)) {
      throw new BadRequestException({ code: "INVALID_PUBLIC_ID", message: "Identificador público inválido." });
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const locks = await tx.$queryRaw<{ id: number }[]>`
          SELECT id FROM service_orders WHERE public_id = ${publicId} FOR UPDATE`;
        const locked = locks[0];
        if (!locked) throw serviceOrderNotFound();

        const current = await tx.serviceOrder.findFirst({
          where: {
            id: locked.id,
            opening: { is: { status: "CONFIRMED" } },
            numberAllocation: { is: { status: "CONFIRMED" } },
          },
          select: serviceOrderDetailSelect,
        });
        if (!current) throw serviceOrderNotFound();
        await assertEditControlInTransaction(tx, locked.id, actor, editToken);
        assertServiceOrderRevision(current.updatedAt, expectedRevision);
        if (current.macroStatus !== "OPEN") {
          throw new ConflictException({ code: "SERVICE_ORDER_NOT_OPEN", message: "A situação só pode ser alterada em uma OS aberta." });
        }
        if (current.operationalSituation === input.operationalSituation && input.withdrawBudget) {
          throw new ConflictException({ code: "BUDGET_WITHDRAWAL_REQUIRES_SITUATION_CHANGE", message: "A retirada integral só pode acompanhar uma mudança para situação de não autorização." });
        }

        await assertSituationPermission(tx, actor, input.withdrawBudget === true);
        if (current.operationalSituation === input.operationalSituation) {
          return { data: toServiceOrderDetailView(current) };
        }

        const now = new Date();
        if (input.withdrawBudget) await this.budgetItems.withdrawAllInTransaction(tx, { id: locked.id, publicId: current.publicId, numberValue: current.numberValue }, actor);
        await advanceServiceOrderRevision(tx, locked.id, current.updatedAt, { operationalSituation: input.operationalSituation });
        await tx.serviceOrderEvent.create({
          data: {
            serviceOrderId: locked.id,
            actorUserId: actor.id,
            eventType: "SITUACAO_OPERACIONAL_ALTERADA",
            numberValue: current.numberValue,
            occurredAt: now,
            payload: {
              previousOperationalSituation: current.operationalSituation,
              newOperationalSituation: input.operationalSituation,
            },
          },
        });

        const updated = await tx.serviceOrder.findUniqueOrThrow({
          where: { id: locked.id },
          select: serviceOrderDetailSelect,
        });
        return { data: toServiceOrderDetailView(updated) };
      }, TRANSACTION_OPTIONS);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (hasCode(error, "P2034") || hasCode(error, "P2028") || isLockConflict(error)) {
        throw new ConflictException({ code: "SERVICE_ORDER_CONCURRENCY_CONFLICT", message: "Conflito concorrente ao alterar a situação. Tente novamente." });
      }
      throw error;
    }
  }
}

async function assertSituationPermission(tx: Tx, actor: AuthenticatedUser, withdrawingBudget: boolean): Promise<void> {
  if (actor.isAdmin) return;
  const grants = await tx.userPermission.findMany({
    where: { userId: actor.id, permission: { code: { in: withdrawingBudget ? ["service_orders.situation.update", "service_orders.budget.update"] : ["service_orders.situation.update"] } } },
    select: { permission: { select: { code: true } } },
  });
  const codes = new Set(grants.map(({ permission }) => permission.code));
  if (!codes.has("service_orders.situation.update") || withdrawingBudget && !codes.has("service_orders.budget.update")) {
    throw new ForbiddenException({ code: "PERMISSION_DENIED", message: "Você não tem permissão para esta operação." });
  }
}

function serviceOrderNotFound(): NotFoundException {
  return new NotFoundException({ code: "SERVICE_ORDER_NOT_FOUND", message: "Ordem de Serviço não encontrada." });
}

function hasCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

function isLockConflict(error: unknown): boolean {
  if (!hasCode(error, "P2010") || typeof error !== "object" || error === null || !("meta" in error)) return false;
  const meta = error.meta as { code?: string | number; driverAdapterError?: { cause?: { code?: string | number } } } | undefined;
  const code = meta?.code ?? meta?.driverAdapterError?.cause?.code;
  return code === 1205 || code === 1213 || code === "1205" || code === "1213";
}
