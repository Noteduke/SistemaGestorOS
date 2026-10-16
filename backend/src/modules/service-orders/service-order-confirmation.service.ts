import { BadRequestException, ConflictException, ForbiddenException, HttpException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "../../generated/prisma/client.js";
import { PrismaService } from "../../infrastructure/prisma/prisma.service.js";
import { AuthPolicyService } from "../auth/auth-policy.service.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import type { ConfirmOpeningInput } from "./dto/confirm-opening.dto.js";
import { parseOpeningPatch } from "./dto/opening-patch.dto.js";
import { formatServiceOrderNumber } from "./domain/service-order-number-format.js";

const PUBLIC_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TRANSACTION_OPTIONS = { isolationLevel: "RepeatableRead" as const, maxWait: 10000, timeout: 15000 };
type Tx = Prisma.TransactionClient;
type OpeningLock = { id: number; public_id: string; status: string; initiated_by_user_id: number; active_for_user_id: number | null; attempted_number_value: bigint };
type AllocationLock = { number_value: bigint; status: string; opening_id: number | null };

@Injectable()
export class ServiceOrderConfirmationService {
  constructor(private readonly prisma: PrismaService, private readonly policy: AuthPolicyService) {}

  async confirm(publicId: string, input: ConfirmOpeningInput, actor: AuthenticatedUser) {
    if (!PUBLIC_ID.test(publicId)) throw invalid("Identificador público de abertura inválido.");
    const target = await this.prisma.serviceOrderOpening.findUnique({ where: { publicId }, select: { id: true, initiatedByUserId: true } });
    if (!target) throw openingNotFound();
    if (target.initiatedByUserId !== actor.id) {
      try { await this.policy.assertAllowed(actor, ["service_orders.opening.manage", "service_orders.create"]); }
      catch (error) { if (error instanceof ForbiddenException) throw openingNotFound(); throw error; }
    } else {
      await this.policy.assertAllowed(actor, ["service_orders.opening.create", "service_orders.create"]);
    }
    if (input.assignedUserPublicIds !== undefined) await this.policy.assertAllowed(actor, ["service_orders.assignment.manage"]);

    try {
      return await this.prisma.$transaction(async (tx) => {
        // A mesma ordem de locks de create/cancel preserva a sequência global.
        const control = await tx.$queryRaw<{ next_number: bigint; highest_reserved_number: bigint }[]>`
          SELECT next_number, highest_reserved_number FROM service_order_number_control WHERE id = 1 FOR UPDATE`;
        if (control.length !== 1) throw inconsistent("Controle de numeração ausente.");
        const locks = await tx.$queryRaw<OpeningLock[]>`
          SELECT id, public_id, status, initiated_by_user_id, active_for_user_id, attempted_number_value
          FROM service_order_openings WHERE id = ${target.id} FOR UPDATE`;
        const locked = locks[0];
        if (!locked || locked.public_id !== publicId || locked.initiated_by_user_id !== target.initiatedByUserId) throw openingNotFound();
        if (locked.status !== "IN_PROGRESS") throw new ConflictException({ code: "OPENING_NOT_IN_PROGRESS", message: "A abertura não está em andamento." });
        if (locked.active_for_user_id !== locked.initiated_by_user_id) throw inconsistent("Marcador ativo da abertura incoerente.");
        if (locked.initiated_by_user_id === actor.id) {
          await assertAllowedInTx(tx, actor, ["service_orders.opening.create", "service_orders.create"]);
        } else {
          try { await assertAllowedInTx(tx, actor, ["service_orders.opening.manage", "service_orders.create"]); }
          catch (error) { if (error instanceof ForbiddenException) throw openingNotFound(); throw error; }
        }
        if (input.assignedUserPublicIds !== undefined) await assertAllowedInTx(tx, actor, ["service_orders.assignment.manage"]);
        const numberValue = BigInt(locked.attempted_number_value);
        const allocations = await tx.$queryRaw<AllocationLock[]>`
          SELECT number_value, status, opening_id FROM service_order_number_allocations
          WHERE number_value = ${numberValue} FOR UPDATE`;
        if (allocations.length !== 1 || allocations[0].status !== "RESERVED" || allocations[0].opening_id !== locked.id ||
            numberValue < 1n || numberValue > BigInt(control[0].highest_reserved_number) || BigInt(control[0].next_number) <= numberValue) {
          throw inconsistent("Reserva do número incoerente.");
        }
        if (await tx.serviceOrder.findFirst({ where: { OR: [{ openingId: locked.id }, { numberValue }] }, select: { id: true } })) {
          throw inconsistent("A abertura ou reserva já possui OS.");
        }

        const opening = await tx.serviceOrderOpening.findUniqueOrThrow({ where: { id: locked.id } });
        if (opening.customerId === null) throw new ConflictException({ code: "CUSTOMER_REQUIRED", message: "Selecione um cliente." });
        if ((opening.equipmentId === null) === (opening.equipmentDraftJson === null)) {
          if (opening.equipmentId === null) throw new ConflictException({ code: "EQUIPMENT_REQUIRED", message: "Selecione um equipamento." });
          throw inconsistent("Seleção de equipamento incoerente.");
        }
        await tx.$queryRaw`SELECT id FROM people WHERE id = ${opening.customerId} FOR UPDATE`;
        const customer = await tx.person.findUnique({
          where: { id: opening.customerId },
          select: { id: true, publicId: true, name: true, document: true, isActive: true,
            roles: { where: { role: "CUSTOMER" }, select: { role: true } },
            phones: { where: { isPrimary: true }, select: { number: true }, take: 1 },
            emails: { where: { isPrimary: true }, select: { address: true }, take: 1 },
            address: { select: { postalCode: true, street: true, number: true, complement: true, district: true, city: true, state: true, country: true } },
          },
        });
        if (!customer?.isActive || customer.roles.length === 0) throw new ConflictException({ code: "CUSTOMER_NOT_ELIGIBLE", message: "Cliente indisponível." });

        let equipmentId: number;
        let equipmentPublicId: string;
        let equipmentType: string;
        let equipmentBrand: string;
        let equipmentModel: string;
        let equipmentSerial: string | null;
        let serialStatus: "IDENTIFIED" | "NOT_IDENTIFIED" | null = null;
        let createdEquipment = false;
        let previousOwnerPublicId: string | null = null;
        let transfer = false;

        if (opening.equipmentId !== null) {
          await tx.$queryRaw`SELECT id FROM equipment WHERE id = ${opening.equipmentId} FOR UPDATE`;
          const equipment = await tx.equipment.findUnique({
            where: { id: opening.equipmentId },
            select: { id: true, publicId: true, ownerId: true, isActive: true, model: true, serialNumber: true,
              type: { select: { name: true } }, brand: { select: { name: true } },
              owner: { select: { publicId: true } },
            },
          });
          if (!equipment?.isActive) throw new ConflictException({ code: "EQUIPMENT_INACTIVE", message: "Equipamento indisponível." });
          equipmentId = equipment.id;
          equipmentPublicId = equipment.publicId;
          equipmentType = equipment.type.name;
          equipmentBrand = equipment.brand.name;
          equipmentModel = equipment.model;
          equipmentSerial = equipment.serialNumber;
          if (equipment.ownerId !== customer.id) {
            if (!opening.transferRequested) throw new ConflictException({ code: "OWNERSHIP_DECISION_REQUIRED", message: "Decisão de titularidade necessária." });
            if (!opening.transferRequestedByUserId || !opening.transferRequestedAt) throw inconsistent("Intenção de transferência incompleta.");
            try { await assertAllowedInTx(tx, actor, ["equipment.transfer_ownership"]); }
            catch (error) {
              if (error instanceof ForbiddenException) throw new ForbiddenException({ code: "TRANSFER_PERMISSION_REQUIRED", message: "Permissão para transferência necessária." });
              throw error;
            }
            transfer = true;
            previousOwnerPublicId = equipment.owner.publicId;
          } else if (opening.transferRequested || opening.transferRequestedByUserId || opening.transferRequestedAt) {
            throw inconsistent("Intenção de transferência sem alteração de titularidade.");
          }
        } else {
          if (opening.transferRequested || opening.transferRequestedByUserId || opening.transferRequestedAt || opening.equipmentDraftVersion !== 1) {
            throw inconsistent("Rascunho de equipamento incoerente.");
          }
          await assertAllowedInTx(tx, actor, ["equipment.create"]);
          let draft;
          try { draft = parseOpeningPatch({ equipmentDraft: opening.equipmentDraftJson }).equipmentDraft; }
          catch { throw inconsistent("Rascunho de equipamento inválido."); }
          if (!draft) throw inconsistent("Rascunho de equipamento ausente.");
          await tx.$queryRaw`SELECT id FROM equipment_types WHERE public_id = ${draft.typePublicId} FOR UPDATE`;
          await tx.$queryRaw`SELECT id FROM equipment_brands WHERE public_id = ${draft.brandPublicId} FOR UPDATE`;
          const type = await tx.equipmentType.findUnique({ where: { publicId: draft.typePublicId }, select: { id: true, name: true } });
          const brand = await tx.equipmentBrand.findUnique({ where: { publicId: draft.brandPublicId }, select: { id: true, name: true } });
          if (!type || !brand) throw new ConflictException({ code: "EQUIPMENT_CATALOG_NOT_FOUND", message: "Tipo ou marca não encontrado." });
          if (draft.serialNumber !== null && await tx.equipment.findFirst({ where: { ownerId: customer.id, serialNumber: draft.serialNumber }, select: { id: true } })) {
            throw new ConflictException({ code: "EQUIPMENT_DUPLICATE", message: "Já existe equipamento deste cliente com a mesma série." });
          }
          const created = await tx.equipment.create({ data: { ownerId: customer.id, typeId: type.id, brandId: brand.id,
            model: draft.model, serialNumber: draft.serialIdentificationStatus === "NOT_IDENTIFIED" ? null : draft.serialNumber } });
          equipmentId = created.id;
          equipmentPublicId = created.publicId;
          equipmentType = type.name;
          equipmentBrand = brand.name;
          equipmentModel = created.model;
          equipmentSerial = created.serialNumber;
          serialStatus = draft.serialIdentificationStatus;
          createdEquipment = true;
        }

        const now = new Date();
        const capturedAt = now.toISOString();
        const customerSnapshot = { snapshotVersion: 1, capturedAt, name: customer.name, document: customer.document,
          primaryPhone: customer.phones[0]?.number ?? null, primaryEmail: customer.emails[0]?.address ?? null,
          address: customer.address ? { ...customer.address } : null };
        const equipmentSnapshot = { snapshotVersion: 1, capturedAt, type: equipmentType, brand: equipmentBrand,
          model: equipmentModel, serialNumber: equipmentSerial,
          mainIdentification: [equipmentType, equipmentBrand, equipmentModel, equipmentSerial].filter(Boolean).join(" / ") };
        const initialStatus = await tx.$queryRaw<Array<{ id: number; is_active: number }>>`SELECT id, is_active FROM service_order_statuses WHERE id = 1 FOR UPDATE`;
        if (initialStatus.length !== 1 || !initialStatus[0].is_active) {
          throw new ConflictException({ code: "INITIAL_SERVICE_ORDER_STATUS_INACTIVE", message: "O status inicial de triagem está inativo e não permite confirmar novas OS." });
        }
        await tx.serviceOrderStatus.update({ where: { id: 1 }, data: { everAssigned: true } });
        const order = await tx.serviceOrder.create({ data: {
          openingId: opening.id, numberValue, customerId: customer.id, equipmentId, createdByUserId: actor.id,
          macroStatus: "OPEN", complaint: opening.complaint,
          intakeObservations: input.intakeObservations ?? null,
          newEquipmentSerialIdentificationStatus: serialStatus,
          customerSnapshotJson: customerSnapshot, equipmentSnapshotJson: equipmentSnapshot,
          snapshotVersion: 1, snapshotCapturedAt: now, openedAt: now,
        } });
        if (transfer) {
          const oldOwnerId = await tx.equipment.findUniqueOrThrow({ where: { id: equipmentId }, select: { ownerId: true } });
          await tx.equipment.update({ where: { id: equipmentId }, data: { ownerId: customer.id } });
          await tx.equipmentOwnership.create({ data: { equipmentId, previousOwnerId: oldOwnerId.ownerId,
            newOwnerId: customer.id, serviceOrderId: order.id, changedByUserId: actor.id, changedAt: now } });
        }
        let assignedUserPublicIds: string[] = [];
        if (input.assignedUserPublicIds?.length) {
          const assignedUsers = new Map<string, number>();
          for (const publicUserId of [...input.assignedUserPublicIds].sort()) {
            const rows = await tx.$queryRaw<{ id: number; is_active: number }[]>`
              SELECT id, is_active FROM users WHERE public_id = ${publicUserId} FOR UPDATE`;
            if (rows.length !== 1 || !rows[0].is_active) throw new ConflictException({ code: "ASSIGNMENT_USER_NOT_ELIGIBLE", message: "Funcionário atribuído indisponível." });
            assignedUsers.set(publicUserId, rows[0].id);
          }
          for (const publicUserId of input.assignedUserPublicIds) {
            await tx.serviceOrderAssignment.create({ data: { serviceOrderId: order.id, userId: assignedUsers.get(publicUserId)!, assignedByUserId: actor.id, assignedAt: now } });
          }
          assignedUserPublicIds = input.assignedUserPublicIds;
        }
        await tx.serviceOrderNumberAllocation.update({ where: { numberValue }, data: { status: "CONFIRMED" } });
        await tx.serviceOrderOpening.update({ where: { id: opening.id }, data: { status: "CONFIRMED", activeForUserId: null,
          confirmedAt: now, equipmentId, equipmentDraftJson: Prisma.DbNull, equipmentDraftVersion: null,
          transferRequested: false, transferRequestedByUserId: null, transferRequestedAt: null } });
        const eventBase = { serviceOrderId: order.id, openingId: opening.id, actorUserId: actor.id,
          initiatingUserId: opening.initiatedByUserId, numberValue, occurredAt: now };
        const visibleNumber = formatServiceOrderNumber(numberValue);
        if (createdEquipment) await tx.serviceOrderEvent.create({ data: { ...eventBase, eventType: "EQUIPAMENTO_CRIADO_DURANTE_ABERTURA",
          payload: { openingPublicId: publicId, serviceOrderPublicId: order.publicId, equipmentPublicId,
            customerPublicId: customer.publicId, visibleNumber } } });
        if (transfer) await tx.serviceOrderEvent.create({ data: { ...eventBase, eventType: "TITULARIDADE_TRANSFERIDA_DURANTE_ABERTURA",
          payload: { openingPublicId: publicId, serviceOrderPublicId: order.publicId, equipmentPublicId,
            previousOwnerPublicId, newOwnerPublicId: customer.publicId, visibleNumber } } });
        await tx.serviceOrderEvent.create({ data: { ...eventBase, eventType: "ABERTURA_CONFIRMADA",
          payload: { openingPublicId: publicId, serviceOrderPublicId: order.publicId, visibleNumber,
            customerPublicId: customer.publicId, equipmentPublicId, macroStatus: "ABERTA",
            operationalSituation: "TRIAGEM", technicalCompletion: "NOT_COMPLETED", snapshotCapturedAt: capturedAt } } });
        if (assignedUserPublicIds.length) await tx.serviceOrderEvent.create({ data: { ...eventBase, eventType: "ATRIBUICOES_ALTERADAS",
          payload: { previousUserPublicIds: [], newUserPublicIds: assignedUserPublicIds, actorUserPublicId: actor.publicId } } });

        return { data: { publicId: order.publicId, openingPublicId: publicId, visibleNumber, numberValue: numberValue.toString(),
          macroStatus: "ABERTA", operationalSituation: "TRIAGEM", operationalStatus: { name: "TRIAGEM", technicalCompletion: "NOT_COMPLETED" },
          technicalCompletion: "NOT_COMPLETED", technicalCompletedAt: null, customer: { publicId: customer.publicId, name: customer.name },
          equipment: { publicId: equipmentPublicId, type: equipmentType, brand: equipmentBrand, model: equipmentModel, serialNumber: equipmentSerial },
          customerSnapshot, equipmentSnapshot, complaint: opening.complaint, intakeObservations: order.intakeObservations,
          assignedUserPublicIds, createdAt: order.createdAt, confirmedAt: now } };
      }, TRANSACTION_OPTIONS);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (hasCode(error, "P2002") || hasCode(error, "P2034") || hasCode(error, "P2028") || isLockConflict(error)) {
        throw new ConflictException({ code: "OPENING_CONCURRENCY_CONFLICT", message: "Conflito concorrente na confirmação. Tente novamente." });
      }
      throw error;
    }
  }
}

function invalid(message: string): BadRequestException { return new BadRequestException({ code: "VALIDATION_ERROR", message }); }
function openingNotFound(): NotFoundException { return new NotFoundException({ code: "OPENING_NOT_FOUND", message: "Abertura não encontrada." }); }
function inconsistent(message: string): ConflictException { return new ConflictException({ code: "OPENING_STATE_INCONSISTENT", message }); }
function hasCode(error: unknown, code: string): boolean { return typeof error === "object" && error !== null && "code" in error && error.code === code; }
async function assertAllowedInTx(tx: Tx, actor: AuthenticatedUser, codes: string[]): Promise<void> {
  if (actor.isAdmin) return;
  const grants = await tx.userPermission.findMany({
    where: { userId: actor.id, permission: { code: { in: codes } } },
    select: { permission: { select: { code: true } } },
  });
  const allowed = new Set(grants.map(({ permission }) => permission.code));
  if (!codes.every((code) => allowed.has(code))) {
    throw new ForbiddenException({ code: "PERMISSION_DENIED", message: "Você não tem permissão para esta operação." });
  }
}
function isLockConflict(error: unknown): boolean {
  if (!hasCode(error, "P2010") || typeof error !== "object" || error === null || !("meta" in error)) return false;
  const meta = error.meta as { code?: string | number; driverAdapterError?: { cause?: { code?: string | number } } } | undefined;
  const code = meta?.code ?? meta?.driverAdapterError?.cause?.code;
  return code === 1205 || code === 1213 || code === "1205" || code === "1213";
}
