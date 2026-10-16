import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "../../generated/prisma/client.js";
import { PrismaService } from "../../infrastructure/prisma/prisma.service.js";
import type { ListServiceOrderEventsQuery } from "./dto/list-service-order-events-query.dto.js";
import { formatServiceOrderNumber } from "./domain/service-order-number-format.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";

const confirmedWhere = {
  opening: { is: { status: "CONFIRMED" } },
  numberAllocation: { is: { status: "CONFIRMED" } },
} as const satisfies Prisma.ServiceOrderWhereInput;

const eventSelect = {
  eventType: true,
  numberValue: true,
  occurredAt: true,
  payload: true,
  actor: { select: { publicId: true, username: true } },
} as const satisfies Prisma.ServiceOrderEventSelect;

type EventRow = Prisma.ServiceOrderEventGetPayload<{ select: typeof eventSelect }>;

const payloadKeys: Record<string, readonly string[]> = {
  ABERTURA_EM_ANDAMENTO_CRIADA: ["visibleNumber", "initiatingUserPublicId", "action"],
  ABERTURA_CANCELADA: ["visibleNumber", "initiatingUserPublicId", "canceledByUserPublicId", "action", "numberReleased"],
  ABERTURA_CANCELADA_POR_ADMIN: ["visibleNumber", "initiatingUserPublicId", "canceledByUserPublicId", "action", "numberReleased"],
  EQUIPAMENTO_CRIADO_DURANTE_ABERTURA: ["openingPublicId", "serviceOrderPublicId", "equipmentPublicId", "customerPublicId", "visibleNumber"],
  TITULARIDADE_TRANSFERIDA_DURANTE_ABERTURA: ["openingPublicId", "serviceOrderPublicId", "equipmentPublicId", "previousOwnerPublicId", "newOwnerPublicId", "visibleNumber"],
  ABERTURA_CONFIRMADA: ["openingPublicId", "serviceOrderPublicId", "visibleNumber", "customerPublicId", "equipmentPublicId", "macroStatus", "operationalSituation", "snapshotCapturedAt"],
  SITUACAO_OPERACIONAL_ALTERADA: ["previousOperationalStatusPublicId", "previousOperationalStatus", "newOperationalStatusPublicId", "newOperationalStatus", "previousTechnicalCompletion", "newTechnicalCompletion"],
  CONCLUSAO_TECNICA_REGISTRADA: ["previousOperationalStatusPublicId", "previousOperationalStatus", "newOperationalStatusPublicId", "newOperationalStatus", "previousTechnicalCompletion", "newTechnicalCompletion", "technicalCompletedAt", "technicallyCompletedByUserPublicId"],
  RETORNO_AO_ATENDIMENTO: ["previousOperationalStatusPublicId", "previousOperationalStatus", "newOperationalStatusPublicId", "newOperationalStatus", "previousTechnicalCompletion", "newTechnicalCompletion", "previousTechnicalCompletedAt", "previousTechnicalCompletionStatus", "previousTechnicalCompletionActorPublicId"],
  ATRIBUICOES_ALTERADAS: ["previousUserPublicIds", "newUserPublicIds", "addedUserPublicIds", "removedUserPublicIds", "actorUserPublicId"],
  ITEM_ORCAMENTO_CRIADO: ["itemPublicId", "productPublicId", "itemType", "origin", "description", "quantity", "unitPrice", "total", "unitCost", "totalCost", "changes", "totalBefore", "totalAfter"],
  ITEM_ORCAMENTO_ALTERADO: ["itemPublicId", "productPublicId", "itemType", "origin", "description", "quantity", "unitPrice", "total", "unitCost", "totalCost", "changes", "totalBefore", "totalAfter"],
  ITEM_ORCAMENTO_REMOVIDO: ["itemPublicId", "productPublicId", "itemType", "origin", "description", "quantity", "unitPrice", "total", "unitCost", "totalCost", "changes", "totalBefore", "totalAfter"],
  ORCAMENTO_RETIRADO: ["items", "total", "itemCount"],
  PECA_ESTOQUE_APLICADA: ["itemPublicId", "productPublicId", "movementPublicId", "description", "quantity", "appliedBefore", "appliedAfter", "availableBefore", "availableAfter", "unitCostSnapshot"],
  PECA_ESTOQUE_APLICACAO_REVERTIDA: ["itemPublicId", "productPublicId", "description", "quantity", "defectiveQuantity", "appliedBefore", "appliedAfter", "availableBefore", "availableAfter", "defectiveBefore", "defectiveAfter", "reversals"],
  OS_ENCERRADA: ["previousMacroStatus", "newMacroStatus", "outcome", "stockOperations"],
  OS_CANCELADA: ["previousMacroStatus", "newMacroStatus", "outcome", "stockOperations"],
  OS_BAIXA_DEFINITIVA_REVERTIDA: ["serviceOrderPublicId", "originalMovementPublicId", "reversalMovementPublicId", "productPublicId", "itemPublicId", "description", "quantity", "originalQuantity", "remainingBefore", "remainingAfter", "destination", "stockBefore", "stockAfter", "macroStatusUnchanged"],
};

const booleanPayloadKeys = new Set(["numberReleased"]);
const arrayPayloadKeys = new Set(["previousUserPublicIds", "newUserPublicIds", "addedUserPublicIds", "removedUserPublicIds"]);
const closurePayloadKeys = new Set(["stockOperations"]);
const publicIdPayloadKeys = new Set([
  "initiatingUserPublicId", "canceledByUserPublicId", "openingPublicId", "serviceOrderPublicId", "equipmentPublicId",
  "customerPublicId", "previousOwnerPublicId", "newOwnerPublicId", "actorUserPublicId", "productPublicId", "itemPublicId", "movementPublicId", "originalMovementPublicId", "reversalMovementPublicId",
  "previousOperationalStatusPublicId", "newOperationalStatusPublicId", "technicallyCompletedByUserPublicId", "previousTechnicalCompletionActorPublicId",
]);
const publicIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const budgetEventTypes = new Set(["ITEM_ORCAMENTO_CRIADO", "ITEM_ORCAMENTO_ALTERADO", "ITEM_ORCAMENTO_REMOVIDO", "ORCAMENTO_RETIRADO"]);
const budgetSnapshotKeys = ["publicId", "productPublicId", "itemType", "origin", "description", "quantity", "unitPrice", "total", "unitCost", "totalCost"] as const;

export function sanitizeServiceOrderEventPayload(eventType: string, value: Prisma.JsonValue | null, includeCosts = false, includeProductCosts = includeCosts, visibleNumber?: string): Record<string, unknown> | null {
  const allowed = Object.hasOwn(payloadKeys, eventType) ? payloadKeys[eventType] : undefined;
  if (!allowed || value === null || typeof value !== "object" || Array.isArray(value)) return null;

  const source = value as Record<string, unknown>;
  const sanitized: Record<string, unknown> = {};
  for (const key of allowed) {
    const candidate = source[key];
    if (key === "visibleNumber" && visibleNumber) {
      sanitized[key] = visibleNumber;
      continue;
    }
    if (budgetEventTypes.has(eventType) && !includeCosts && (key === "unitCost" || key === "totalCost")) continue;
    if (key === "unitCostSnapshot") {
      if (includeProductCosts && (candidate === null || typeof candidate === "string")) sanitized[key] = candidate;
      continue;
    }
    if ((budgetEventTypes.has(eventType) || eventType === "ORCAMENTO_RETIRADO") && (key === "changes" || key === "items")) {
      if (key === "changes" && Array.isArray(candidate)) {
        sanitized.changes = candidate.flatMap((change) => {
          if (!isRecord(change) || typeof change.field !== "string" || !["item", "quantity", "unitPrice", "description", "unitCost"].includes(change.field)) return [];
          if (!includeCosts && change.field === "unitCost") return [];
          return [{ field: change.field, before: sanitizeBudgetSnapshot(change.before, includeCosts, includeProductCosts), after: sanitizeBudgetSnapshot(change.after, includeCosts, includeProductCosts) }];
        });
      } else if (key === "items" && Array.isArray(candidate)) {
        sanitized.items = candidate.map((item) => sanitizeBudgetSnapshot(item, includeCosts, includeProductCosts)).filter((item) => item !== null);
      }
      continue;
    }
    if (key === "reversals") {
      if (Array.isArray(candidate)) sanitized.reversals = candidate.flatMap((entry) => {
        if (!isRecord(entry) || typeof entry.sourceApplicationPublicId !== "string" || !publicIdPattern.test(entry.sourceApplicationPublicId)
          || typeof entry.quantity !== "number" || typeof entry.defectiveQuantity !== "number") return [];
        return [{ sourceApplicationPublicId: entry.sourceApplicationPublicId, quantity: entry.quantity, defectiveQuantity: entry.defectiveQuantity,
          ...(includeProductCosts && (typeof entry.unitCostSnapshot === "string" || entry.unitCostSnapshot === null) ? { unitCostSnapshot: entry.unitCostSnapshot } : {}) }];
      });
      continue;
    }
    if (closurePayloadKeys.has(key)) {
      if (Array.isArray(candidate)) sanitized[key] = candidate.flatMap((entry) => {
        if (!isRecord(entry) || typeof entry.itemPublicId !== "string" || !publicIdPattern.test(entry.itemPublicId)
          || typeof entry.productPublicId !== "string" || !publicIdPattern.test(entry.productPublicId)
          || typeof entry.description !== "string" || typeof entry.quantity !== "number"
          || (entry.defectiveQuantity !== undefined && typeof entry.defectiveQuantity !== "number")
          || !["CONSUMED", "RETURNED"].includes(String(entry.operation))) return [];
        return [{ itemPublicId: entry.itemPublicId, productPublicId: entry.productPublicId, description: entry.description, quantity: entry.quantity,
          ...(typeof entry.defectiveQuantity === "number" ? { defectiveQuantity: entry.defectiveQuantity } : {}),
          ...(Array.isArray(entry.consumptionMovements) ? { consumptionMovements: entry.consumptionMovements.flatMap((movement) =>
            isRecord(movement) && typeof movement.publicId === "string" && publicIdPattern.test(movement.publicId)
              && typeof movement.quantity === "number" && Number.isSafeInteger(movement.quantity) && movement.quantity > 0
              ? [{ publicId: movement.publicId, quantity: movement.quantity }] : []) } : {}),
          operation: entry.operation }];
      });
      continue;
    }
    if (key === "destination") {
      if (candidate === "AVAILABLE" || candidate === "DEFECTIVE") sanitized[key] = candidate;
      continue;
    }
    if (key === "stockBefore" || key === "stockAfter") {
      if (isRecord(candidate) && ["total", "applied", "defective", "available"].every((field) => Number.isSafeInteger(candidate[field]))) {
        sanitized[key] = { total: candidate.total, applied: candidate.applied, defective: candidate.defective, available: candidate.available };
      }
      continue;
    }
    if (booleanPayloadKeys.has(key)) {
      if (typeof candidate === "boolean") sanitized[key] = candidate;
    } else if (arrayPayloadKeys.has(key)) {
      if (Array.isArray(candidate) && candidate.every((item) => typeof item === "string" && publicIdPattern.test(item))) sanitized[key] = candidate;
    } else if (publicIdPayloadKeys.has(key)) {
      if (typeof candidate === "string" && publicIdPattern.test(candidate)) sanitized[key] = candidate;
    } else if (typeof candidate === "string" || typeof candidate === "number") {
      sanitized[key] = candidate;
    }
  }
  return sanitized;
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }

function sanitizeBudgetSnapshot(value: unknown, includeCosts: boolean, includeProductCosts: boolean): Record<string, unknown> | null {
  if (value === null) return null;
  if (!isRecord(value)) return null;
  const snapshot: Record<string, unknown> = {};
  for (const key of budgetSnapshotKeys) {
    if (!includeCosts && (key === "unitCost" || key === "totalCost")) continue;
    const candidate = value[key];
    if (typeof candidate === "string" || typeof candidate === "number") snapshot[key] = candidate;
  }
  const reversals = value.stockApplicationsReversed;
  if (Array.isArray(reversals)) snapshot.stockApplicationsReversed = reversals.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.sourceApplicationPublicId !== "string" || !publicIdPattern.test(entry.sourceApplicationPublicId)
      || typeof entry.quantity !== "number" || typeof entry.defectiveQuantity !== "number") return [];
    return [{ sourceApplicationPublicId: entry.sourceApplicationPublicId, quantity: entry.quantity, defectiveQuantity: entry.defectiveQuantity,
      ...(includeProductCosts && (typeof entry.unitCostSnapshot === "string" || entry.unitCostSnapshot === null) ? { unitCostSnapshot: entry.unitCostSnapshot } : {}) }];
  });
  return snapshot;
}

function toEventView(event: EventRow, includeCosts: boolean, includeProductCosts: boolean) {
  return {
    eventType: event.eventType,
    occurredAt: event.occurredAt,
    visibleNumber: formatServiceOrderNumber(event.numberValue),
    numberValue: event.numberValue.toString(),
    actor: { publicId: event.actor.publicId, username: event.actor.username },
    payload: sanitizeServiceOrderEventPayload(event.eventType, event.payload, includeCosts, includeProductCosts, formatServiceOrderNumber(event.numberValue)),
  };
}

@Injectable()
export class ServiceOrderEventsReadService {
  constructor(private readonly prisma: PrismaService) {}

  async list(publicId: string, query: ListServiceOrderEventsQuery, actor: AuthenticatedUser) {
    const order = await this.prisma.serviceOrder.findFirst({
      where: { ...confirmedWhere, publicId },
      select: { id: true, openingId: true },
    });
    if (!order) throw new NotFoundException({ code: "SERVICE_ORDER_NOT_FOUND", message: "Ordem de Serviço não encontrada." });

    const where: Prisma.ServiceOrderEventWhereInput = {
      OR: [{ serviceOrderId: order.id }, { openingId: order.openingId }],
    };
    const [events, total] = await this.prisma.$transaction([
      this.prisma.serviceOrderEvent.findMany({
        where,
        select: eventSelect,
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.serviceOrderEvent.count({ where }),
    ]);
    const grants = actor.isAdmin ? [] : await this.prisma.userPermission.findMany({ where: { userId: actor.id, permission: { code: { in: ["service_orders.budget.costs.read", "products.cost.read"] } } }, select: { permission: { select: { code: true } } } });
    const grantCodes = new Set(grants.map(({ permission }) => permission.code));
    const canReadBudgetCosts = actor.isAdmin || grantCodes.has("service_orders.budget.costs.read");
    const canReadProductCosts = actor.isAdmin || grantCodes.has("products.cost.read");

    return {
      data: events.map((event: EventRow) => toEventView(event, canReadBudgetCosts, canReadProductCosts)),
      pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) },
    };
  }
}
