import { BadRequestException, ConflictException, ForbiddenException, HttpException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "../../generated/prisma/client.js";
import { PrismaService } from "../../infrastructure/prisma/prisma.service.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import type { AssignmentsPutInput } from "./dto/assignments-put.dto.js";
import { serviceOrderDetailSelect, toServiceOrderDetailView } from "./service-orders-read.service.js";
import { assertEditControlInTransaction } from "./service-order-edit-control.service.js";

const PUBLIC_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TRANSACTION_OPTIONS = { isolationLevel: "RepeatableRead" as const, maxWait: 10000, timeout: 15000 };
type Tx = Prisma.TransactionClient;
type UserLock = { id: number; public_id: string; is_active: number };

@Injectable()
export class ServiceOrderAssignmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async replace(publicId: string, input: AssignmentsPutInput, actor: AuthenticatedUser, editToken?: string) {
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
        await assertAssignmentPermission(tx, actor);

        const requestedIds = [...input.userPublicIds].sort((left, right) => left.localeCompare(right));
        const resolvedUsers = new Map<string, UserLock>();
        for (const userPublicId of requestedIds) {
          const rows = await tx.$queryRaw<UserLock[]>`
            SELECT id, public_id, is_active FROM users WHERE public_id = ${userPublicId} FOR UPDATE`;
          const user = rows[0];
          if (!user || !user.is_active) {
            throw new ConflictException({ code: "USER_NOT_ELIGIBLE", message: "Um dos usuários atribuídos não existe ou está inativo." });
          }
          resolvedUsers.set(user.public_id, user);
        }

        const currentUserIds = new Set(current.assignments.map(({ userId }) => userId));
        const requestedUserIds = new Set([...resolvedUsers.values()].map(({ id }) => id));
        if (sameSet(currentUserIds, requestedUserIds)) return { data: toServiceOrderDetailView(current) };

        const previousUserPublicIds = current.assignments.map(({ user }) => user.publicId).sort();
        const newUserPublicIds = [...resolvedUsers.values()].map(({ public_id }) => public_id).sort();
        const previousById = new Map(current.assignments.map(({ userId, user }) => [userId, user.publicId]));
        const newById = new Map([...resolvedUsers.values()].map(({ id, public_id }) => [id, public_id]));
        const removedUserPublicIds = [...currentUserIds].filter((id) => !requestedUserIds.has(id)).map((id) => previousById.get(id)!).sort();
        const addedUserPublicIds = [...requestedUserIds].filter((id) => !currentUserIds.has(id)).map((id) => newById.get(id)!).sort();
        const now = new Date();

        if (removedUserPublicIds.length) {
          const removedIds = [...currentUserIds].filter((id) => !requestedUserIds.has(id));
          await tx.serviceOrderAssignment.deleteMany({ where: { serviceOrderId: locked.id, userId: { in: removedIds } } });
        }
        if (addedUserPublicIds.length) {
          const addedIds = [...requestedUserIds].filter((id) => !currentUserIds.has(id));
          await tx.serviceOrderAssignment.createMany({
            data: addedIds.map((userId) => ({ serviceOrderId: locked.id, userId, assignedByUserId: actor.id, assignedAt: now })),
          });
        }
        await tx.serviceOrder.update({ where: { id: locked.id }, data: { updatedAt: now } });
        await tx.serviceOrderEvent.create({
          data: {
            serviceOrderId: locked.id,
            actorUserId: actor.id,
            eventType: "ATRIBUICOES_ALTERADAS",
            numberValue: current.numberValue,
            occurredAt: now,
            payload: {
              previousUserPublicIds,
              newUserPublicIds,
              addedUserPublicIds,
              removedUserPublicIds,
              actorUserPublicId: actor.publicId,
            },
          },
        });

        const updated = await tx.serviceOrder.findUniqueOrThrow({ where: { id: locked.id }, select: serviceOrderDetailSelect });
        return { data: toServiceOrderDetailView(updated) };
      }, TRANSACTION_OPTIONS);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (hasCode(error, "P2034") || hasCode(error, "P2028") || isLockConflict(error)) {
        throw new ConflictException({ code: "SERVICE_ORDER_CONCURRENCY_CONFLICT", message: "Conflito concorrente ao alterar as atribuições. Tente novamente." });
      }
      throw error;
    }
  }
}

async function assertAssignmentPermission(tx: Tx, actor: AuthenticatedUser): Promise<void> {
  if (actor.isAdmin) return;
  const grants = await tx.userPermission.findMany({
    where: { userId: actor.id, permission: { code: "service_orders.assignment.manage" } },
    select: { permission: { select: { code: true } } },
  });
  if (!grants.some(({ permission }) => permission.code === "service_orders.assignment.manage")) {
    throw new ForbiddenException({ code: "PERMISSION_DENIED", message: "Você não tem permissão para esta operação." });
  }
}

function serviceOrderNotFound(): NotFoundException {
  return new NotFoundException({ code: "SERVICE_ORDER_NOT_FOUND", message: "Ordem de Serviço não encontrada." });
}

function sameSet(left: Set<number>, right: Set<number>): boolean {
  return left.size === right.size && [...left].every((value) => right.has(value));
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
