import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "../../generated/prisma/client.js";
import { PrismaService } from "../../infrastructure/prisma/prisma.service.js";
import { AuthPolicyService } from "../auth/auth-policy.service.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { formatServiceOrderNumber } from "./domain/service-order-number-format.js";
import { toOpeningResponse } from "./domain/opening-response.js";

const MAX_SIGNED_BIGINT = 9223372036854775807n;
const PUBLIC_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TRANSACTION_OPTIONS = { isolationLevel: "ReadCommitted" as const, maxWait: 10000, timeout: 15000 };

interface NumberControlRow {
  id: number;
  next_number: bigint;
  highest_reserved_number: bigint;
}

interface OpeningLockRow {
  id: number;
  public_id: string;
  status: "IN_PROGRESS" | "CONFIRMED" | "CANCELED";
  initiated_by_user_id: number;
  active_for_user_id: number | null;
  attempted_number_value: bigint;
}

interface AllocationLockRow {
  number_value: bigint;
  status: "RESERVED" | "CONFIRMED" | "CONSUMED" | "RELEASED";
  opening_id: number | null;
}

@Injectable()
export class ServiceOrderOpeningsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authPolicy: AuthPolicyService,
  ) {}

  async create(actor: AuthenticatedUser) {
    try {
      const opened = await this.prisma.$transaction(async (tx) => {
        const control = await lockNumberControl(tx);
        const existing = await tx.serviceOrderOpening.findUnique({
          where: { activeForUserId: actor.id },
          select: { publicId: true, attemptedNumberValue: true },
        });
        if (existing) throw openingAlreadyExists(existing);

        const numberValue = BigInt(control.next_number);
        const highestReservedNumber = BigInt(control.highest_reserved_number);
        if (numberValue < 1n || numberValue > highestReservedNumber + 1n) {
          throw inconsistentState("O contador de OS está inconsistente.");
        }
        if (numberValue >= MAX_SIGNED_BIGINT) {
          throw new ConflictException({
            code: "NUMBER_STORAGE_CAPACITY_EXHAUSTED",
            message: "A capacidade técnica da numeração de OS foi atingida.",
          });
        }

        const opening = await tx.serviceOrderOpening.create({
          data: {
            status: "IN_PROGRESS",
            initiatedByUserId: actor.id,
            activeForUserId: actor.id,
            attemptedNumberValue: numberValue,
          },
        });

        // A linha singleton serializa todas as alterações de numeração; a linha de alocação é bloqueada em seguida.
        const allocation = await lockAllocation(tx, numberValue);
        if (allocation) {
          if (
            numberValue !== highestReservedNumber ||
            allocation.status !== "RELEASED" ||
            allocation.opening_id !== null ||
            await tx.serviceOrder.findUnique({ where: { numberValue }, select: { id: true } })
          ) {
            throw inconsistentState("O número disponível possui uma alocação incompatível.");
          }
          await tx.serviceOrderNumberAllocation.update({
            where: { numberValue },
            data: { status: "RESERVED", openingId: opening.id },
          });
        } else {
          if (numberValue !== highestReservedNumber + 1n) {
            throw inconsistentState("O próximo número não corresponde à próxima reserva inédita.");
          }
          await tx.serviceOrderNumberAllocation.create({
            data: { numberValue, status: "RESERVED", openingId: opening.id },
          });
        }

        await tx.serviceOrderNumberControl.update({
          where: { id: 1 },
          data: {
            nextNumber: numberValue + 1n,
            highestReservedNumber: numberValue > highestReservedNumber ? numberValue : highestReservedNumber,
          },
        });
        await tx.serviceOrderEvent.create({
          data: {
            openingId: opening.id,
            actorUserId: actor.id,
            initiatingUserId: actor.id,
            eventType: "ABERTURA_EM_ANDAMENTO_CRIADA",
            numberValue,
            payload: {
              visibleNumber: formatServiceOrderNumber(numberValue),
              initiatingUserPublicId: actor.publicId,
              action: "CREATE_OPENING",
            },
          },
        });
        return opening;
      }, TRANSACTION_OPTIONS);
      return { data: toOpeningResponse(opened, actor.publicId) };
    } catch (error) {
      if (hasPrismaCode(error, "P2002")) {
        const existing = await this.prisma.serviceOrderOpening.findUnique({
          where: { activeForUserId: actor.id },
          select: { publicId: true, attemptedNumberValue: true },
        });
        if (existing) throw openingAlreadyExists(existing);
      }
      throw mapTransactionError(error);
    }
  }

  async current(actor: AuthenticatedUser) {
    const opening = await this.prisma.serviceOrderOpening.findUnique({
      where: { activeForUserId: actor.id },
      include: {
        initiator: { select: { publicId: true } },
        numberAllocation: { select: { numberValue: true, status: true, openingId: true } },
      },
    });
    if (!opening) throw openingNotFound();
    assertActiveOpening(opening);
    return { data: toOpeningResponse(opening, opening.initiator.publicId) };
  }

  async getByPublicId(publicId: string, actor: AuthenticatedUser) {
    assertPublicId(publicId);
    const opening = await this.prisma.serviceOrderOpening.findUnique({
      where: { publicId },
      include: {
        initiator: { select: { publicId: true } },
        numberAllocation: { select: { numberValue: true, status: true, openingId: true } },
      },
    });
    if (!opening) throw openingNotFound();

    if (opening.initiatedByUserId === actor.id && opening.status === "IN_PROGRESS") {
      await this.authPolicy.assertAllowed(actor, ["service_orders.opening.read"]);
      assertActiveOpening(opening);
    } else {
      await this.assertCanManageOrHide(actor);
      if (opening.status === "IN_PROGRESS") assertActiveOpening(opening);
    }
    return { data: toOpeningResponse(opening, opening.initiator.publicId) };
  }

  async cancel(publicId: string, actor: AuthenticatedUser) {
    assertPublicId(publicId);
    const target = await this.prisma.serviceOrderOpening.findUnique({
      where: { publicId },
      select: { id: true, initiatedByUserId: true, initiator: { select: { publicId: true } } },
    });
    if (!target) throw openingNotFound();
    if (target.initiatedByUserId === actor.id) {
      await this.authPolicy.assertAllowed(actor, ["service_orders.opening.create"]);
    } else {
      await this.assertCanManageOrHide(actor);
    }

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const control = await lockNumberControl(tx);
        const opening = await lockOpening(tx, target.id);
        if (!opening || opening.public_id !== publicId || opening.initiated_by_user_id !== target.initiatedByUserId) {
          throw openingNotFound();
        }
        if (opening.status !== "IN_PROGRESS") {
          throw new ConflictException({ code: "OPENING_NOT_IN_PROGRESS", message: "A abertura não está em andamento." });
        }
        if (opening.active_for_user_id !== opening.initiated_by_user_id) {
          throw inconsistentState("O marcador de abertura ativa está inconsistente.");
        }

        const numberValue = BigInt(opening.attempted_number_value);
        const allocation = await lockAllocation(tx, numberValue);
        if (!allocation || allocation.status !== "RESERVED" || allocation.opening_id !== opening.id) {
          throw inconsistentState("A reserva de número da abertura está inconsistente.");
        }
        const linkedOrder = await tx.serviceOrder.findFirst({
          where: { OR: [{ numberValue }, { openingId: opening.id }] },
          select: { id: true },
        });
        if (linkedOrder) throw inconsistentState("A abertura ou reserva já possui uma OS vinculada.");

        const highestReservedNumber = BigInt(control.highest_reserved_number);
        const nextNumber = BigInt(control.next_number);
        if (numberValue > highestReservedNumber) {
          throw inconsistentState("A reserva supera o maior número registrado.");
        }
        const numberReleased = numberValue === highestReservedNumber;
        if (numberReleased && nextNumber !== numberValue + 1n) {
          throw inconsistentState("O próximo número não corresponde à reserva de ponta.");
        }

        const canceledAt = new Date();
        const canceled = await tx.serviceOrderOpening.update({
          where: { id: opening.id },
          data: { status: "CANCELED", activeForUserId: null, canceledAt },
        });
        await tx.serviceOrderNumberAllocation.update({
          where: { numberValue },
          data: numberReleased
            ? { status: "RELEASED", openingId: null }
            : { status: "CONSUMED" },
        });
        if (numberReleased) {
          await tx.serviceOrderNumberControl.update({
            where: { id: 1 },
            data: { nextNumber: numberValue },
          });
        }
        const cancellationPayload = {
          visibleNumber: formatServiceOrderNumber(numberValue),
          initiatingUserPublicId: target.initiator.publicId,
          canceledByUserPublicId: actor.publicId,
          action: "CANCEL_OPENING",
          numberReleased,
        };
        await tx.serviceOrderEvent.create({
          data: {
            openingId: opening.id,
            actorUserId: actor.id,
            initiatingUserId: opening.initiated_by_user_id,
            eventType: "ABERTURA_CANCELADA",
            numberValue,
            payload: cancellationPayload,
          },
        });
        if (actor.id !== opening.initiated_by_user_id) {
          await tx.serviceOrderEvent.create({
            data: {
              openingId: opening.id,
              actorUserId: actor.id,
              initiatingUserId: opening.initiated_by_user_id,
              eventType: "ABERTURA_CANCELADA_POR_ADMIN",
              numberValue,
              payload: cancellationPayload,
            },
          });
        }
        return { canceled, numberReleased };
      }, TRANSACTION_OPTIONS);
      return { data: toOpeningResponse(result.canceled, target.initiator.publicId, result.numberReleased) };
    } catch (error) {
      throw mapTransactionError(error);
    }
  }

  private async assertCanManageOrHide(actor: AuthenticatedUser): Promise<void> {
    try {
      await this.authPolicy.assertAllowed(actor, ["service_orders.opening.manage"]);
    } catch (error) {
      if (error instanceof ForbiddenException) throw openingNotFound();
      throw error;
    }
  }
}

async function lockNumberControl(tx: Prisma.TransactionClient): Promise<NumberControlRow> {
  const rows = await tx.$queryRaw<NumberControlRow[]>`
    SELECT id, next_number, highest_reserved_number
    FROM service_order_number_control
    WHERE id = 1 FOR UPDATE
  `;
  if (rows.length !== 1) throw inconsistentState("O controle de numeração de OS não está disponível.");
  return rows[0];
}

async function lockOpening(tx: Prisma.TransactionClient, id: number): Promise<OpeningLockRow | null> {
  const rows = await tx.$queryRaw<OpeningLockRow[]>`
    SELECT id, public_id, status, initiated_by_user_id, active_for_user_id, attempted_number_value
    FROM service_order_openings WHERE id = ${id} FOR UPDATE
  `;
  return rows[0] ?? null;
}

async function lockAllocation(tx: Prisma.TransactionClient, numberValue: bigint): Promise<AllocationLockRow | null> {
  const rows = await tx.$queryRaw<AllocationLockRow[]>`
    SELECT number_value, status, opening_id
    FROM service_order_number_allocations WHERE number_value = ${numberValue} FOR UPDATE
  `;
  return rows[0] ?? null;
}

function assertActiveOpening(opening: {
  id: number;
  status: string;
  initiatedByUserId: number;
  activeForUserId: number | null;
  attemptedNumberValue: bigint;
  numberAllocation: { numberValue: bigint; status: string; openingId: number | null } | null;
}): void {
  const allocation = opening.numberAllocation;
  if (
    opening.status !== "IN_PROGRESS" ||
    opening.activeForUserId !== opening.initiatedByUserId ||
    !allocation ||
    allocation.status !== "RESERVED" ||
    allocation.openingId !== opening.id ||
    allocation.numberValue !== opening.attemptedNumberValue
  ) {
    throw inconsistentState("A abertura em andamento não possui uma reserva coerente.");
  }
}

function assertPublicId(publicId: string): void {
  if (!PUBLIC_ID_PATTERN.test(publicId)) {
    throw new BadRequestException({ code: "VALIDATION_ERROR", message: "Identificador público de abertura inválido." });
  }
}

function openingNotFound(): NotFoundException {
  return new NotFoundException({ code: "OPENING_NOT_FOUND", message: "Abertura não encontrada." });
}

function openingAlreadyExists(opening: { publicId: string; attemptedNumberValue: bigint }): ConflictException {
  return new ConflictException({
    code: "OPENING_ALREADY_EXISTS",
    message: "Você já possui uma abertura em andamento.",
    details: { publicId: opening.publicId, visibleNumber: formatServiceOrderNumber(opening.attemptedNumberValue) },
  });
}

function inconsistentState(message: string): ConflictException {
  return new ConflictException({ code: "OPENING_STATE_INCONSISTENT", message });
}

function hasPrismaCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

function mapTransactionError(error: unknown): unknown {
  if (error instanceof HttpException) return error;
  if (hasPrismaCode(error, "P2002") || hasPrismaCode(error, "P2034") || hasPrismaCode(error, "P2028")) {
    return new ConflictException({
      code: "OPENING_CONCURRENCY_CONFLICT",
      message: "Conflito concorrente ao processar a abertura. Tente novamente.",
    });
  }
  if (hasPrismaCode(error, "P2010") && typeof error === "object" && error !== null && "meta" in error) {
    const meta = error.meta as { code?: string | number } | undefined;
    if (meta?.code === 1205 || meta?.code === 1213 || meta?.code === "1205" || meta?.code === "1213") {
      return new ConflictException({
        code: "OPENING_CONCURRENCY_CONFLICT",
        message: "Conflito de bloqueio ao processar a abertura. Tente novamente.",
      });
    }
  }
  return error;
}
