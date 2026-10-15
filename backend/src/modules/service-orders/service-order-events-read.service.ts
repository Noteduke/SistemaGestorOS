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
  SITUACAO_OPERACIONAL_ALTERADA: ["previousOperationalSituation", "newOperationalSituation"],
  ATRIBUICOES_ALTERADAS: ["previousUserPublicIds", "newUserPublicIds", "addedUserPublicIds", "removedUserPublicIds", "actorUserPublicId"],
  ITEM_ORCAMENTO_CRIADO: ["itemPublicId", "productPublicId", "itemType", "origin", "description", "quantity", "unitPrice", "total", "unitCost", "totalCost", "changes", "totalBefore", "totalAfter"],
  ITEM_ORCAMENTO_ALTERADO: ["itemPublicId", "productPublicId", "itemType", "origin", "description", "quantity", "unitPrice", "total", "unitCost", "totalCost", "changes", "totalBefore", "totalAfter"],
  ITEM_ORCAMENTO_REMOVIDO: ["itemPublicId", "productPublicId", "itemType", "origin", "description", "quantity", "unitPrice", "total", "unitCost", "totalCost", "changes", "totalBefore", "totalAfter"],
  ORCAMENTO_RETIRADO: ["items", "total", "itemCount"],
};

const booleanPayloadKeys = new Set(["numberReleased"]);
const arrayPayloadKeys = new Set(["previousUserPublicIds", "newUserPublicIds", "addedUserPublicIds", "removedUserPublicIds"]);
const publicIdPayloadKeys = new Set([
  "initiatingUserPublicId", "canceledByUserPublicId", "openingPublicId", "serviceOrderPublicId", "equipmentPublicId",
  "customerPublicId", "previousOwnerPublicId", "newOwnerPublicId", "actorUserPublicId", "productPublicId",
]);
const publicIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const budgetEventTypes = new Set(["ITEM_ORCAMENTO_CRIADO", "ITEM_ORCAMENTO_ALTERADO", "ITEM_ORCAMENTO_REMOVIDO", "ORCAMENTO_RETIRADO"]);
const budgetSnapshotKeys = ["publicId", "productPublicId", "itemType", "origin", "description", "quantity", "unitPrice", "total", "unitCost", "totalCost"] as const;

export function sanitizeServiceOrderEventPayload(eventType: string, value: Prisma.JsonValue | null, includeCosts = false): Record<string, unknown> | null {
  const allowed = Object.hasOwn(payloadKeys, eventType) ? payloadKeys[eventType] : undefined;
  if (!allowed || value === null || typeof value !== "object" || Array.isArray(value)) return null;

  const source = value as Record<string, unknown>;
  const sanitized: Record<string, unknown> = {};
  for (const key of allowed) {
    const candidate = source[key];
    if (budgetEventTypes.has(eventType) && !includeCosts && (key === "unitCost" || key === "totalCost")) continue;
    if (budgetEventTypes.has(eventType) && (key === "changes" || key === "items")) {
      if (key === "changes" && Array.isArray(candidate)) {
        sanitized.changes = candidate.flatMap((change) => {
          if (!isRecord(change) || typeof change.field !== "string" || !["item", "quantity", "unitPrice", "description", "unitCost"].includes(change.field)) return [];
          if (!includeCosts && change.field === "unitCost") return [];
          return [{ field: change.field, before: sanitizeBudgetSnapshot(change.before, includeCosts), after: sanitizeBudgetSnapshot(change.after, includeCosts) }];
        });
      } else if (key === "items" && Array.isArray(candidate)) {
        sanitized.items = candidate.map((item) => sanitizeBudgetSnapshot(item, includeCosts)).filter((item) => item !== null);
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

function sanitizeBudgetSnapshot(value: unknown, includeCosts: boolean): Record<string, unknown> | null {
  if (value === null) return null;
  if (!isRecord(value)) return null;
  const snapshot: Record<string, unknown> = {};
  for (const key of budgetSnapshotKeys) {
    if (!includeCosts && (key === "unitCost" || key === "totalCost")) continue;
    const candidate = value[key];
    if (typeof candidate === "string" || typeof candidate === "number") snapshot[key] = candidate;
  }
  return snapshot;
}

function toEventView(event: EventRow, includeCosts: boolean) {
  return {
    eventType: event.eventType,
    occurredAt: event.occurredAt,
    visibleNumber: formatServiceOrderNumber(event.numberValue),
    numberValue: event.numberValue.toString(),
    actor: { publicId: event.actor.publicId, username: event.actor.username },
    payload: sanitizeServiceOrderEventPayload(event.eventType, event.payload, includeCosts),
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
    const costGrant = actor.isAdmin || Boolean(await this.prisma.userPermission.findFirst({ where: { userId: actor.id, permission: { code: "service_orders.budget.costs.read" } }, select: { userId: true } }));

    return {
      data: events.map((event: EventRow) => toEventView(event, costGrant)),
      pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) },
    };
  }
}
