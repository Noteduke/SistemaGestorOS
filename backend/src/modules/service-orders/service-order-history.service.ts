import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "../../generated/prisma/client.js";
import { PrismaService } from "../../infrastructure/prisma/prisma.service.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import type { ListServiceOrderHistoryQuery } from "./dto/list-service-order-history-query.dto.js";
import { decodeHistoryCursor, encodeHistoryCursor, type HistoryKind, type HistoryPosition } from "./domain/history-cursor.js";
import { formatServiceOrderNumber } from "./domain/service-order-number-format.js";
import { sanitizeServiceOrderEventPayload } from "./service-order-events-read.service.js";

const confirmedWhere = { opening: { is: { status: "CONFIRMED" } }, numberAllocation: { is: { status: "CONFIRMED" } } } as const satisfies Prisma.ServiceOrderWhereInput;
const publicIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const eventSelect = {
  id: true, eventType: true, occurredAt: true, numberValue: true, payload: true,
  actor: { select: { publicId: true, username: true } },
} as const satisfies Prisma.ServiceOrderEventSelect;
const noteSelect = {
  id: true, publicId: true, text: true, createdAt: true, authorUserId: true,
  author: { select: { publicId: true, username: true } },
} as const satisfies Prisma.ServiceOrderNoteSelect;
type Event = Prisma.ServiceOrderEventGetPayload<{ select: typeof eventSelect }>;
type Note = Prisma.ServiceOrderNoteGetPayload<{ select: typeof noteSelect }>;
type Row = { kind: "SYSTEM_EVENT"; position: HistoryPosition; event: Event }
  | { kind: "MANUAL_NOTE"; position: HistoryPosition; note: Note };

function eventCursorWhere(cursor: HistoryPosition | null): Prisma.ServiceOrderEventWhereInput | undefined {
  if (!cursor) return undefined;
  if (cursor.kind === "MANUAL_NOTE") return { occurredAt: { lt: cursor.occurredAt } };
  return { OR: [{ occurredAt: { lt: cursor.occurredAt } }, { occurredAt: cursor.occurredAt, id: { lt: cursor.id } }] };
}

function noteCursorWhere(cursor: HistoryPosition | null): Prisma.ServiceOrderNoteWhereInput | undefined {
  if (!cursor) return undefined;
  if (cursor.kind === "SYSTEM_EVENT") return { createdAt: { lte: cursor.occurredAt } };
  return { OR: [{ createdAt: { lt: cursor.occurredAt } }, { createdAt: cursor.occurredAt, id: { lt: cursor.id } }] };
}

function compareRows(left: Row, right: Row): number {
  const time = right.position.occurredAt.getTime() - left.position.occurredAt.getTime();
  if (time !== 0) return time;
  const rank = (right.kind === "SYSTEM_EVENT" ? 1 : 0) - (left.kind === "SYSTEM_EVENT" ? 1 : 0);
  return rank || right.position.id - left.position.id;
}

@Injectable()
export class ServiceOrderHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async list(publicId: string, query: ListServiceOrderHistoryQuery, actor: AuthenticatedUser) {
    if (!publicIdPattern.test(publicId)) throw new BadRequestException({ code: "INVALID_PUBLIC_ID", message: "Identificador público inválido." });
    const cursor = decodeHistoryCursor(query.cursor, publicId);
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.serviceOrder.findFirst({ where: { ...confirmedWhere, publicId }, select: { id: true, openingId: true } });
      if (!order) throw new NotFoundException({ code: "SERVICE_ORDER_NOT_FOUND", message: "Ordem de Serviço não encontrada." });
      const eventWhere: Prisma.ServiceOrderEventWhereInput = {
        AND: [
          { OR: [{ serviceOrderId: order.id }, { openingId: order.openingId }] },
          ...(eventCursorWhere(cursor) ? [eventCursorWhere(cursor)!] : []),
        ],
      };
      const noteWhere: Prisma.ServiceOrderNoteWhereInput = {
        serviceOrderId: order.id,
        ...(noteCursorWhere(cursor) ? { AND: [noteCursorWhere(cursor)!] } : {}),
      };
      const [events, notes, canDeleteAny, canReadBudgetCosts, canReadProductCosts] = await Promise.all([
        tx.serviceOrderEvent.findMany({ where: eventWhere, select: eventSelect, orderBy: [{ occurredAt: "desc" }, { id: "desc" }], take: query.pageSize + 1 }),
        tx.serviceOrderNote.findMany({ where: noteWhere, select: noteSelect, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: query.pageSize + 1 }),
        actor.isAdmin ? Promise.resolve(true) : tx.userPermission.findFirst({ where: { userId: actor.id, permission: { code: "service_orders.notes.delete_any" } }, select: { userId: true } }).then(Boolean),
        actor.isAdmin ? Promise.resolve(true) : tx.userPermission.findFirst({ where: { userId: actor.id, permission: { code: "service_orders.budget.costs.read" } }, select: { userId: true } }).then(Boolean),
        actor.isAdmin ? Promise.resolve(true) : tx.userPermission.findFirst({ where: { userId: actor.id, permission: { code: "products.cost.read" } }, select: { userId: true } }).then(Boolean),
      ]);
      const rows: Row[] = [
        ...events.map((event) => ({ kind: "SYSTEM_EVENT" as const, position: { occurredAt: event.occurredAt, kind: "SYSTEM_EVENT" as const, id: event.id }, event })),
        ...notes.map((note) => ({ kind: "MANUAL_NOTE" as const, position: { occurredAt: note.createdAt, kind: "MANUAL_NOTE" as const, id: note.id }, note })),
      ];
      rows.sort(compareRows);
      const hasMore = rows.length > query.pageSize;
      const page = rows.slice(0, query.pageSize);
      return {
        data: page.map((row) => row.kind === "SYSTEM_EVENT" ? {
          kind: "SYSTEM_EVENT" as HistoryKind,
          occurredAt: row.event.occurredAt,
          actor: row.event.actor,
          eventType: row.event.eventType,
          serviceOrderNumber: formatServiceOrderNumber(row.event.numberValue),
          payload: sanitizeServiceOrderEventPayload(row.event.eventType, row.event.payload, canReadBudgetCosts, canReadProductCosts),
        } : {
          kind: "MANUAL_NOTE" as HistoryKind,
          publicId: row.note.publicId,
          occurredAt: row.note.createdAt,
          actor: row.note.author,
          text: row.note.text,
          canDelete: row.note.authorUserId === actor.id || canDeleteAny,
        }),
        nextCursor: hasMore && page.length ? encodeHistoryCursor(publicId, page[page.length - 1].position) : null,
        hasMore,
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, maxWait: 5_000, timeout: 10_000 });
  }
}
