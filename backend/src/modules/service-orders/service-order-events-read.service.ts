import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "../../generated/prisma/client.js";
import { PrismaService } from "../../infrastructure/prisma/prisma.service.js";
import type { ListServiceOrderEventsQuery } from "./dto/list-service-order-events-query.dto.js";
import { formatServiceOrderNumber } from "./domain/service-order-number-format.js";

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
};

const booleanPayloadKeys = new Set(["numberReleased"]);
const arrayPayloadKeys = new Set(["previousUserPublicIds", "newUserPublicIds", "addedUserPublicIds", "removedUserPublicIds"]);
const publicIdPayloadKeys = new Set([
  "initiatingUserPublicId", "canceledByUserPublicId", "openingPublicId", "serviceOrderPublicId", "equipmentPublicId",
  "customerPublicId", "previousOwnerPublicId", "newOwnerPublicId", "actorUserPublicId",
]);
const publicIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function sanitizeServiceOrderEventPayload(eventType: string, value: Prisma.JsonValue | null): Record<string, unknown> | null {
  const allowed = Object.hasOwn(payloadKeys, eventType) ? payloadKeys[eventType] : undefined;
  if (!allowed || value === null || typeof value !== "object" || Array.isArray(value)) return null;

  const source = value as Record<string, unknown>;
  const sanitized: Record<string, unknown> = {};
  for (const key of allowed) {
    const candidate = source[key];
    if (booleanPayloadKeys.has(key)) {
      if (typeof candidate === "boolean") sanitized[key] = candidate;
    } else if (arrayPayloadKeys.has(key)) {
      if (Array.isArray(candidate) && candidate.every((item) => typeof item === "string" && publicIdPattern.test(item))) sanitized[key] = candidate;
    } else if (publicIdPayloadKeys.has(key)) {
      if (typeof candidate === "string" && publicIdPattern.test(candidate)) sanitized[key] = candidate;
    } else if (typeof candidate === "string") {
      sanitized[key] = candidate;
    }
  }
  return sanitized;
}

function toEventView(event: EventRow) {
  return {
    eventType: event.eventType,
    occurredAt: event.occurredAt,
    visibleNumber: formatServiceOrderNumber(event.numberValue),
    numberValue: event.numberValue.toString(),
    actor: { publicId: event.actor.publicId, username: event.actor.username },
    payload: sanitizeServiceOrderEventPayload(event.eventType, event.payload),
  };
}

@Injectable()
export class ServiceOrderEventsReadService {
  constructor(private readonly prisma: PrismaService) {}

  async list(publicId: string, query: ListServiceOrderEventsQuery) {
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

    return {
      data: events.map(toEventView),
      pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) },
    };
  }
}
