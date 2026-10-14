import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "../../generated/prisma/client.js";
import { PrismaService } from "../../infrastructure/prisma/prisma.service.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import type { CreateServiceOrderNoteInput } from "./dto/service-order-note.dto.js";
import { formatServiceOrderNumber } from "./domain/service-order-number-format.js";

const publicIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const confirmedWhere = { opening: { is: { status: "CONFIRMED" } }, numberAllocation: { is: { status: "CONFIRMED" } } } as const satisfies Prisma.ServiceOrderWhereInput;
const transactionOptions = { maxWait: 5_000, timeout: 10_000 } as const;

function assertPublicId(value: string): void {
  if (!publicIdPattern.test(value)) throw new BadRequestException({ code: "INVALID_PUBLIC_ID", message: "Identificador público inválido." });
}

function orderNotFound(): NotFoundException {
  return new NotFoundException({ code: "SERVICE_ORDER_NOT_FOUND", message: "Ordem de Serviço não encontrada." });
}

@Injectable()
export class ServiceOrderNotesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(orderPublicId: string, input: CreateServiceOrderNoteInput, actor: AuthenticatedUser) {
    assertPublicId(orderPublicId);
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.serviceOrder.findFirst({ where: { ...confirmedWhere, publicId: orderPublicId }, select: { id: true } });
      if (!order) throw orderNotFound();
      if (!actor.isAdmin) {
        const grant = await tx.userPermission.findFirst({ where: { userId: actor.id, permission: { code: "service_orders.update" } }, select: { userId: true } });
        if (!grant) throw new ForbiddenException({ code: "PERMISSION_DENIED", message: "Você não tem permissão para criar observações." });
      }
      const note = await tx.serviceOrderNote.create({ data: { serviceOrderId: order.id, authorUserId: actor.id, text: input.text } });
      return { data: { publicId: note.publicId, occurredAt: note.createdAt, actor: { publicId: actor.publicId, username: actor.username }, text: note.text, canDelete: true, kind: "MANUAL_NOTE" as const } };
    }, transactionOptions);
  }

  async remove(orderPublicId: string, notePublicId: string, actor: AuthenticatedUser) {
    assertPublicId(orderPublicId);
    assertPublicId(notePublicId);
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.serviceOrder.findFirst({ where: { ...confirmedWhere, publicId: orderPublicId }, select: { id: true, numberValue: true } });
      if (!order) throw orderNotFound();
      const locked = await tx.$queryRaw<{ id: number }[]>`
        SELECT id FROM service_order_notes WHERE public_id = ${notePublicId} AND service_order_id = ${order.id} FOR UPDATE`;
      if (!locked[0]) throw new NotFoundException({ code: "SERVICE_ORDER_NOTE_NOT_FOUND", message: "Observação não encontrada nesta OS." });
      const note = await tx.serviceOrderNote.findUniqueOrThrow({
        where: { id: locked[0].id },
        include: { author: { select: { publicId: true, username: true } } },
      });
      if (note.authorUserId !== actor.id && !actor.isAdmin) {
        const grant = await tx.userPermission.findFirst({ where: { userId: actor.id, permission: { code: "service_orders.notes.delete_any" } }, select: { userId: true } });
        if (!grant) throw new ForbiddenException({ code: "PERMISSION_DENIED", message: "Você não pode excluir esta observação." });
      }
      const deletedAt = new Date();
      await tx.adminAuditLog.create({
        data: {
          eventCode: "SERVICE_ORDER_NOTE_DELETED",
          occurredAt: deletedAt,
          actorUserId: actor.id,
          targetUserId: note.authorUserId,
          detailsJson: {
            action: "DELETE_SERVICE_ORDER_NOTE",
            notePublicId: note.publicId,
            text: note.text,
            serviceOrderPublicId: orderPublicId,
            serviceOrderNumber: formatServiceOrderNumber(order.numberValue),
            authorUserPublicId: note.author.publicId,
            authorUsername: note.author.username,
            createdAt: note.createdAt.toISOString(),
            deletedByUserPublicId: actor.publicId,
            deletedByUsername: actor.username,
            deletedAt: deletedAt.toISOString(),
          },
        },
      });
      await tx.serviceOrderNote.delete({ where: { id: note.id } });
      return { data: { deleted: true, publicId: notePublicId } };
    }, transactionOptions);
  }
}
