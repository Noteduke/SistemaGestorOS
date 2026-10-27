import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "../../generated/prisma/client.js";
import { PrismaService } from "../../infrastructure/prisma/prisma.service.js";
import { AuthPolicyService } from "../auth/auth-policy.service.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import type { OpeningPatchInput } from "./dto/opening-patch.dto.js";
import { formatServiceOrderNumber } from "./domain/service-order-number-format.js";
import { toOpeningResponse } from "./domain/opening-response.js";

const MAX_SIGNED_BIGINT = 9223372036854775807n;
const PUBLIC_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TRANSACTION_OPTIONS = { isolationLevel: "ReadCommitted" as const, maxWait: 10000, timeout: 15000 };
const OPENING_EQUIPMENT_RESPONSE_SELECT = {
  updatedAt: true,
  publicId: true,
  model: true,
  serialNumber: true,
  type: { select: { publicId: true, name: true } },
  brand: { select: { publicId: true, name: true } },
  owner: { select: { publicId: true, name: true, document: true } },
} as const;

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
  async options() {
    const initial = await this.prisma.serviceOrderStatus.findUnique({ where: { id: 1 }, select: { publicId: true, name: true, isActive: true, technicalCompletion: true } });
    return { data: { initialStatus: initial && initial.isActive && initial.technicalCompletion === "NOT_COMPLETED" ? { publicId: initial.publicId, name: initial.name } : null } };
  }
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
        customer: { select: { publicId: true, name: true, document: true } },
        equipment: { select: OPENING_EQUIPMENT_RESPONSE_SELECT },
        transferRequester: { select: { publicId: true } },
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
        customer: { select: { publicId: true, name: true, document: true } },
        equipment: { select: OPENING_EQUIPMENT_RESPONSE_SELECT },
        transferRequester: { select: { publicId: true } },
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

  async update(publicId: string, patch: OpeningPatchInput, actor: AuthenticatedUser) {
    assertPublicId(publicId);
    const target = await this.prisma.serviceOrderOpening.findUnique({
      where: { publicId },
      select: { id: true, initiatedByUserId: true },
    });
    if (!target) throw openingNotFound();
    if (target.initiatedByUserId === actor.id) {
      await this.authPolicy.assertAllowed(actor, ["service_orders.opening.create"]);
    } else {
      await this.assertCanManageOrHide(actor);
    }
    if (patch.equipmentDraft) await this.authPolicy.assertAllowed(actor, ["equipment.create"]);
    if (patch.ownershipDecision === "TRANSFER_TO_CUSTOMER") {
      await this.authPolicy.assertAllowed(actor, ["equipment.transfer_ownership"]);
    }

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const locked = await lockOpening(tx, target.id);
        if (!locked || locked.public_id !== publicId || locked.initiated_by_user_id !== target.initiatedByUserId) throw openingNotFound();
        if (locked.status !== "IN_PROGRESS") {
          throw new ConflictException({ code: "OPENING_NOT_IN_PROGRESS", message: "A abertura não está em andamento." });
        }
        const opening = await tx.serviceOrderOpening.findUniqueOrThrow({
          where: { id: target.id },
          include: { numberAllocation: { select: { numberValue: true, status: true, openingId: true } } },
        });
        assertActiveOpening(opening);
        if (await tx.serviceOrder.findFirst({ where: { openingId: opening.id }, select: { id: true } })) {
          throw inconsistentState("A abertura já possui uma OS vinculada.");
        }

        let customerId = opening.customerId;
        let equipmentId = opening.equipmentId;
        let draft = opening.equipmentDraftJson;
        let draftVersion = opening.equipmentDraftVersion;
        let transferRequested = opening.transferRequested;
        let transferRequestedByUserId = opening.transferRequestedByUserId;
        let transferRequestedAt = opening.transferRequestedAt;
        let selectionChanged = false;

        if (patch.customerPublicId !== undefined) {
          customerId = patch.customerPublicId === null ? null : await eligibleCustomerId(tx, patch.customerPublicId);
          selectionChanged ||= customerId !== opening.customerId;
        }
        if (patch.equipmentPublicId !== undefined) {
          if (patch.equipmentPublicId === null) {
            selectionChanged ||= equipmentId !== null;
            equipmentId = null;
          }
          else {
            const equipment = await tx.equipment.findUnique({ where: { publicId: patch.equipmentPublicId }, select: { id: true, isActive: true } });
            if (!equipment) throw new NotFoundException({ code: "EQUIPMENT_NOT_FOUND", message: "Equipamento não encontrado." });
            if (!equipment.isActive) throw new ConflictException({ code: "EQUIPMENT_INACTIVE", message: "Equipamento inativo." });
            selectionChanged ||= equipmentId !== equipment.id || draft !== null;
            equipmentId = equipment.id;
            draft = null;
            draftVersion = null;
          }
        }
        if (patch.equipmentDraft !== undefined) {
          if (patch.equipmentDraft === null) {
            selectionChanged ||= draft !== null;
            draft = null;
            draftVersion = null;
          } else {
            const [type, brand] = await Promise.all([
              tx.equipmentType.findUnique({ where: { publicId: patch.equipmentDraft.typePublicId }, select: { id: true } }),
              tx.equipmentBrand.findUnique({ where: { publicId: patch.equipmentDraft.brandPublicId }, select: { id: true } }),
            ]);
            if (!type || !brand) throw new NotFoundException({ code: "EQUIPMENT_CATALOG_NOT_FOUND", message: "Tipo ou marca não encontrado." });
            selectionChanged = true;
            draft = patch.equipmentDraft as unknown as Prisma.JsonObject;
            draftVersion = 1;
            equipmentId = null;
          }
        }
        if (equipmentId !== null && draft !== null) {
          throw new BadRequestException({ code: "VALIDATION_ERROR", message: "Seleção de equipamento incoerente." });
        }
        if (selectionChanged || patch.ownershipDecision === null) {
          transferRequested = false;
          transferRequestedByUserId = null;
          transferRequestedAt = null;
        }
        if (patch.ownershipDecision === "CANCEL_SELECTION") {
          equipmentId = null;
          draft = null;
          draftVersion = null;
        }

        const equipment = equipmentId === null ? null : await tx.equipment.findUnique({
          where: { id: equipmentId }, select: { id: true, ownerId: true, isActive: true },
        });
        if (equipmentId !== null && (!equipment || !equipment.isActive)) {
          throw new ConflictException({ code: "EQUIPMENT_INACTIVE", message: "Equipamento selecionado indisponível." });
        }
        if (patch.ownershipDecision === "USE_CURRENT_OWNER") {
          if (!equipment) throw new BadRequestException({ code: "VALIDATION_ERROR", message: "Selecione um equipamento existente." });
          const owner = await tx.person.findUnique({ where: { id: equipment.ownerId }, select: { publicId: true } });
          if (!owner) throw inconsistentState("Proprietário do equipamento ausente.");
          customerId = await eligibleCustomerId(tx, owner.publicId);
          transferRequested = false;
          transferRequestedByUserId = null;
          transferRequestedAt = null;
        }
        if (customerId !== null) {
          const customer = await tx.person.findUnique({
            where: { id: customerId }, select: { isActive: true, roles: { where: { role: "CUSTOMER" }, select: { role: true } } },
          });
          if (!customer?.isActive || customer.roles.length === 0) {
            throw new ConflictException({ code: "CUSTOMER_NOT_ELIGIBLE", message: "Cliente indisponível para a abertura." });
          }
        }
        if (patch.ownershipDecision === "TRANSFER_TO_CUSTOMER") {
          if (!equipment || customerId === null || equipment.ownerId === customerId) {
            throw new BadRequestException({ code: "VALIDATION_ERROR", message: "A intenção exige cliente e equipamento existente de outro proprietário." });
          }
          transferRequested = true;
          transferRequestedByUserId = actor.id;
          transferRequestedAt = new Date();
        }
        if (equipment && customerId !== null && equipment.ownerId !== customerId && !transferRequested) {
          throw new ConflictException({ code: "OWNERSHIP_DECISION_REQUIRED", message: "Informe a decisão de titularidade." });
        }
        if (transferRequested && (!equipment || customerId === null || equipment.ownerId === customerId || !transferRequestedByUserId || !transferRequestedAt)) {
          throw inconsistentState("Intenção de transferência incoerente.");
        }

        const saved = await tx.serviceOrderOpening.update({
          where: { id: opening.id },
          data: {
            customerId, equipmentId,
            equipmentDraftJson: draft === null ? Prisma.DbNull : draft as Prisma.InputJsonValue,
            equipmentDraftVersion: draftVersion,
            transferRequested, transferRequestedByUserId, transferRequestedAt,
            complaint: patch.complaint === undefined ? opening.complaint : patch.complaint,
            ...(patch.intakeData ? { intakeDataJson: patch.intakeData as unknown as Prisma.InputJsonValue } : {}),
          },
          include: {
            customer: { select: { publicId: true, name: true, document: true } },
            equipment: { select: OPENING_EQUIPMENT_RESPONSE_SELECT },
            transferRequester: { select: { publicId: true } },
          },
        });
        if (actor.id !== opening.initiatedByUserId) {
          await tx.adminAuditLog.create({
            data: {
              eventCode: "OS_OPENING_UPDATED_BY_ADMIN",
              actorUserId: actor.id,
              targetUserId: opening.initiatedByUserId,
              detailsJson: { openingPublicId: publicId, changedFields: Object.keys(patch) },
            },
          });
        }
        return saved;
      }, TRANSACTION_OPTIONS);
      const initiator = await this.prisma.user.findUniqueOrThrow({ where: { id: target.initiatedByUserId }, select: { publicId: true } });
      return { data: toOpeningResponse(updated, initiator.publicId) };
    } catch (error) {
      throw mapTransactionError(error);
    }
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
          include: {
            customer: { select: { publicId: true, name: true, document: true } },
            equipment: { select: OPENING_EQUIPMENT_RESPONSE_SELECT },
            transferRequester: { select: { publicId: true } },
          },
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

async function eligibleCustomerId(tx: Prisma.TransactionClient, publicId: string): Promise<number> {
  const customer = await tx.person.findUnique({
    where: { publicId },
    select: { id: true, isActive: true, roles: { where: { role: "CUSTOMER" }, select: { role: true } } },
  });
  if (!customer) throw new NotFoundException({ code: "CUSTOMER_NOT_FOUND", message: "Cliente não encontrado." });
  if (!customer.isActive || customer.roles.length === 0) {
    throw new ConflictException({ code: "CUSTOMER_NOT_ELIGIBLE", message: "Pessoa não está ativa como Cliente." });
  }
  return customer.id;
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
