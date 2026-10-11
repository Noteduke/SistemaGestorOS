import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, ServiceOrderMacroStatus, ServiceOrderOperationalSituation } from "../../generated/prisma/client.js";
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
  operationalSituation: true,
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

const detailSelect = {
  ...summarySelect,
  complaint: true,
  intakeObservations: true,
  newEquipmentSerialIdentificationStatus: true,
  customerSnapshotJson: true,
  equipmentSnapshotJson: true,
  snapshotVersion: true,
  snapshotCapturedAt: true,
  createdBy: { select: { publicId: true } },
  assignments: { select: { user: { select: { publicId: true } } }, orderBy: { userId: "asc" } },
} as const satisfies Prisma.ServiceOrderSelect;

type SummaryOrder = Prisma.ServiceOrderGetPayload<{ select: typeof summarySelect }>;

const macroLabels: Record<ServiceOrderMacroStatus, string> = { OPEN: "ABERTA" };
const situationLabels: Record<ServiceOrderOperationalSituation, string> = {
  TRIAGE: "TRIAGEM",
  AWAITING_EVALUATION_BUDGET: "AGUARDANDO AVALIAÇÃO/ORÇAMENTO",
  AWAITING_BUDGET_APPROVAL: "AGUARDANDO APROVAÇÃO DO ORÇAMENTO",
  REPAIR_AUTHORIZED: "AUTORIZADO REPARO",
  AWAITING_PART_PURCHASE: "AGUARDANDO COMPRA DE PEÇA",
  AWAITING_PART_ARRIVAL: "AGUARDANDO CHEGADA DE PEÇA",
  READY_TO_NOTIFY_CUSTOMER: "PRONTO AVISAR CLIENTE",
  READY_CUSTOMER_NOTIFIED: "PRONTO CLIENTE AVISADO",
  NOT_AUTHORIZED_REASSEMBLE: "NÃO AUTORIZADO - REMONTAR EQUIPAMENTO",
  NOT_AUTHORIZED_READY_DELIVERY: "NÃO AUTORIZADO - PRONTO PRA ENTREGA",
};

function toSummary(order: SummaryOrder) {
  return {
    publicId: order.publicId,
    openingPublicId: order.opening.publicId,
    visibleNumber: formatServiceOrderNumber(order.numberValue),
    numberValue: order.numberValue.toString(),
    macroStatus: macroLabels[order.macroStatus],
    operationalSituation: situationLabels[order.operationalSituation],
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

@Injectable()
export class ServiceOrdersReadService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListServiceOrdersQuery) {
    const [orders, total] = await this.prisma.$transaction([
      this.prisma.serviceOrder.findMany({
        where: confirmedWhere,
        select: summarySelect,
        orderBy: [{ numberValue: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.serviceOrder.count({ where: confirmedWhere }),
    ]);
    return {
      data: orders.map(toSummary),
      pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) },
    };
  }

  async getByPublicId(publicId: string) {
    const order = await this.prisma.serviceOrder.findFirst({
      where: { ...confirmedWhere, publicId },
      select: detailSelect,
    });
    if (!order) throw new NotFoundException({ code: "SERVICE_ORDER_NOT_FOUND", message: "Ordem de Serviço não encontrada." });
    return { data: {
      ...toSummary(order),
      complaint: order.complaint,
      intakeObservations: order.intakeObservations,
      newEquipmentSerialIdentificationStatus: order.newEquipmentSerialIdentificationStatus,
      createdByUserPublicId: order.createdBy.publicId,
      assignedUserPublicIds: order.assignments.map(({ user }) => user.publicId),
      snapshotVersion: order.snapshotVersion,
      snapshotCapturedAt: order.snapshotCapturedAt,
      customerSnapshotJson: order.customerSnapshotJson,
      equipmentSnapshotJson: order.equipmentSnapshotJson,
    } };
  }
}
