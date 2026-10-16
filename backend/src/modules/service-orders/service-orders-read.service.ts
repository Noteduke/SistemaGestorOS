import { Injectable, NotFoundException } from "@nestjs/common";
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
  complaint: true,
  intakeObservations: true,
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
    complaint: order.complaint,
    intakeObservations: order.intakeObservations,
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
    const where: Prisma.ServiceOrderWhereInput = { ...confirmedWhere,
      ...(query.technicalCompletion ? { technicalCompletion: query.technicalCompletion } : {}),
      ...(query.awaitingPickup ? { macroStatus: "OPEN", technicalCompletion: { in: ["COMPLETED_WITH_REPAIR", "COMPLETED_WITHOUT_REPAIR"] } } : {}),
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

  async getByPublicId(publicId: string) {
    const order = await this.prisma.serviceOrder.findFirst({
      where: { ...confirmedWhere, publicId },
      select: serviceOrderDetailSelect,
    });
    if (!order) throw new NotFoundException({ code: "SERVICE_ORDER_NOT_FOUND", message: "Ordem de Serviço não encontrada." });
    return { data: toServiceOrderDetailView(order) };
  }
}
