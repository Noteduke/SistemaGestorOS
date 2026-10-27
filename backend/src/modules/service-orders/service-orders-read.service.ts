import { Injectable, NotFoundException, ConflictException } from "@nestjs/common";
import type { Prisma, ServiceOrderMacroStatus } from "../../generated/prisma/client.js";
import { PrismaService } from "../../infrastructure/prisma/prisma.service.js";
import type { ListServiceOrdersQuery } from "./dto/list-service-orders-query.dto.js";
import { formatServiceOrderNumber } from "./domain/service-order-number-format.js";

const confirmedWhere = {
  opening: { is: { status: "CONFIRMED" } },
  numberAllocation: { is: { status: "CONFIRMED" } },
} as const satisfies Prisma.ServiceOrderWhereInput;

const summarySelect = {
  publicId: true,
  numberValue: true,
  macroStatus: true,
  operationalStatusId: true,
  technicalCompletion: true,
  technicalCompletedAt: true,
  operationalStatus: { select: { publicId: true, name: true, technicalCompletion: true } },
  openedAt: true,
  createdAt: true,
  updatedAt: true,
  opening: { select: { publicId: true, confirmedAt: true } },
  customer: { select: { publicId: true, name: true } },
  equipment: { select: {
    publicId: true, model: true, serialNumber: true,
    type: { select: { name: true } },
    brand: { select: { name: true } },
    owner: { select: { publicId: true } },
  } },
} as const satisfies Prisma.ServiceOrderSelect;

export const serviceOrderDetailSelect = {
  ...summarySelect,
  customer: { select: { publicId: true, name: true, personType: true, document: true, tradeName: true, contactName: true,
    phones: { select: { number: true }, orderBy: [{ isPrimary: "desc" }, { id: "asc" }] },
    emails: { select: { address: true }, orderBy: [{ isPrimary: "desc" }, { id: "asc" }] },
    address: { select: { street: true, number: true, complement: true, district: true, city: true, state: true, postalCode: true, country: true } },
  } },
  complaint: true,
  intakeObservations: true,
  intakeDataJson: true,
  newEquipmentSerialIdentificationStatus: true,
  customerSnapshotJson: true,
  equipmentSnapshotJson: true,
  snapshotVersion: true,
  snapshotCapturedAt: true,
  createdBy: { select: { publicId: true } },
  technicalCompletedBy: { select: { publicId: true, username: true } },
  technicalConclusionStatus: { select: { publicId: true, name: true } },
  assignments: { select: { userId: true, user: { select: { publicId: true } } }, orderBy: { userId: "asc" } },
} as const satisfies Prisma.ServiceOrderSelect;

type SummaryOrder = Prisma.ServiceOrderGetPayload<{ select: typeof summarySelect }>;
type DetailOrder = Prisma.ServiceOrderGetPayload<{ select: typeof serviceOrderDetailSelect }>;

const macroLabels: Record<ServiceOrderMacroStatus, string> = { OPEN: "ABERTA", CLOSED: "FECHADA", CANCELED: "CANCELADA" };
function toSummary(order: SummaryOrder) {
  return {
    publicId: order.publicId,
    openingPublicId: order.opening.publicId,
    visibleNumber: formatServiceOrderNumber(order.numberValue),
    numberValue: order.numberValue.toString(),
    macroStatus: macroLabels[order.macroStatus],
    operationalSituation: order.operationalStatus.name,
    operationalStatus: { publicId: order.operationalStatus.publicId, name: order.operationalStatus.name,
      technicalCompletion: order.technicalCompletion },
    technicalCompletion: order.technicalCompletion,
    technicalCompletedAt: order.technicalCompletedAt,
    customer: { publicId: order.customer.publicId, name: order.customer.name },
    equipment: {
      publicId: order.equipment.publicId,
      type: order.equipment.type.name,
      brand: order.equipment.brand.name,
      model: order.equipment.model,
      serialNumber: order.equipment.serialNumber,
      ownerPublicId: order.equipment.owner.publicId,
    },
    openedAt: order.openedAt,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    confirmedAt: order.opening.confirmedAt,
  };
}

export function toServiceOrderDetailView(order: DetailOrder) {
  return {
    ...toSummary(order),
    customerPrint: { name: order.customer.name, personType: order.customer.personType, document: order.customer.document,
      tradeName: order.customer.tradeName, contactName: order.customer.contactName,
      phones: order.customer.phones?.map(phone => phone.number) ?? [], emails: order.customer.emails?.map(email => email.address) ?? [], address: order.customer.address ?? null },
    complaint: order.complaint,
    intakeObservations: order.intakeObservations,
    intakeData: order.intakeDataJson ?? null,
    newEquipmentSerialIdentificationStatus: order.newEquipmentSerialIdentificationStatus,
    createdByUserPublicId: order.createdBy.publicId,
    assignedUserPublicIds: order.assignments.map(({ user }) => user.publicId),
    technicalCompletedByUserPublicId: order.technicalCompletedBy?.publicId ?? null,
    technicalCompletedByUsername: order.technicalCompletedBy?.username ?? null,
    technicalConclusionStatus: order.technicalConclusionStatus ? { publicId: order.technicalConclusionStatus.publicId, name: order.technicalConclusionStatus.name } : null,
    snapshotVersion: order.snapshotVersion,
    snapshotCapturedAt: order.snapshotCapturedAt,
    customerSnapshotJson: order.customerSnapshotJson,
    equipmentSnapshotJson: order.equipmentSnapshotJson,
  };
}

@Injectable()
export class ServiceOrdersReadService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListServiceOrdersQuery) {
    const range = { ...(query.dateStart ? { gte: query.dateStart } : {}), ...(query.dateEnd ? { lt: query.dateEnd } : {}) };
    const where: Prisma.ServiceOrderWhereInput = { ...confirmedWhere,
      ...(query.statusPublicId ? { operationalStatus: { publicId: query.statusPublicId } } : {}),
      ...(query.state ? { macroStatus: query.state } : {}),
      ...(query.technicianPublicId ? { assignments: { some: { user: { publicId: query.technicianPublicId } } } } : query.unassigned ? { assignments: { none: {} } } : {}),
      ...(query.dateStart || query.dateEnd ? query.dateField === "exit" ? { events: { some: { eventType: "OS_ENCERRADA", occurredAt: range } } } : { openedAt: range } : {}),
      ...(query.equipmentPublicId ? { equipment: { publicId: query.equipmentPublicId } } : {}),
      ...(query.technicalCompletion ? { technicalCompletion: query.technicalCompletion } : {}),
      ...(query.awaitingPickup ? { AND: [{ macroStatus: "OPEN" }, { technicalCompletion: { in: ["COMPLETED_WITH_REPAIR", "COMPLETED_WITHOUT_REPAIR"] } }] } : {}),
    };
    const [orders, total] = await this.prisma.$transaction([
      this.prisma.serviceOrder.findMany({
        where,
        select: summarySelect,
        orderBy: [{ numberValue: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.serviceOrder.count({ where }),
    ]);
    return {
      data: orders.map(toSummary),
      pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) },
    };
  }

  async filterTechnicians() {
    return { data: await this.prisma.user.findMany({ where: { OR: [{ isActive: true }, { serviceOrderAssignments: { some: {} } }] }, select: { publicId: true, username: true }, orderBy: [{ username: "asc" }, { id: "asc" }] }) };
  }

  async getExitPrintData(publicId: string) {
    const result = await this.getByPublicId(publicId);
    if (!["FECHADA", "CANCELADA"].includes(result.data.macroStatus)) throw new ConflictException({ code: "EXIT_PRINT_REQUIRES_CLOSURE", message: "A impressão de saída somente é permitida após o encerramento ou cancelamento da OS." });
    const closure = await this.prisma.serviceOrderEvent.findFirst({ where: { serviceOrder: { publicId }, eventType: { in: ["OS_ENCERRADA", "OS_CANCELADA"] } }, orderBy: [{ occurredAt: "desc" }, { id: "desc" }], select: { eventType: true, occurredAt: true, payloadJson: true } });
    const payload: unknown = closure?.payloadJson;
    const outcome = payload && typeof payload === "object" && !Array.isArray(payload) && "outcome" in payload ? payload.outcome : null;
    return { data: { ...result.data, closureEvent: closure ? { eventType: closure.eventType, occurredAt: closure.occurredAt, outcome: typeof outcome === "string" ? outcome : null } : null } };
  }

  async getByPublicId(publicId: string) {
    const order = await this.prisma.serviceOrder.findFirst({
      where: { ...confirmedWhere, publicId },
      select: serviceOrderDetailSelect,
    });
    if (!order) throw new NotFoundException({ code: "SERVICE_ORDER_NOT_FOUND", message: "Ordem de Serviço não encontrada." });
    return { data: toServiceOrderDetailView(order) };
  }
}
