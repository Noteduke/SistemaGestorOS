import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "../../generated/prisma/client.js";
import { PrismaService } from "../../infrastructure/prisma/prisma.service.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import type { ServiceOrderStatusInput } from "./dto/service-order-status.dto.js";

const select = { publicId: true, name: true, technicalCompletion: true, allowsBudgetWithdrawal: true, version: true, createdAt: true, updatedAt: true } as const;
type StatusRow = Prisma.ServiceOrderStatusGetPayload<{ select: typeof select }>;

function view(row: StatusRow) {
  return { publicId: row.publicId, name: row.name, technicalCompletion: row.technicalCompletion,
    allowsBudgetWithdrawal: row.allowsBudgetWithdrawal, version: row.version,
    createdAt: row.createdAt, updatedAt: row.updatedAt };
}

@Injectable()
export class ServiceOrderStatusesService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const rows = await this.prisma.serviceOrderStatus.findMany({ select, orderBy: [{ name: "asc" }, { id: "asc" }] });
    return { data: rows.map(view) };
  }

  async create(input: ServiceOrderStatusInput, actor: AuthenticatedUser) {
    assertAdmin(actor);
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const created = await tx.serviceOrderStatus.create({ data: { name: input.name, technicalCompletion: input.technicalCompletion } });
        await tx.adminAuditLog.create({ data: { eventCode: "SERVICE_ORDER_STATUS_CREATED", actorUserId: actor.id,
          detailsJson: { statusPublicId: created.publicId, name: created.name, technicalCompletion: created.technicalCompletion,
            allowsBudgetWithdrawal: created.allowsBudgetWithdrawal } } });
        return tx.serviceOrderStatus.findUniqueOrThrow({ where: { id: created.id }, select });
      });
      return { data: view(row) };
    } catch (error) { return mapStatusWriteError(error); }
  }

  async update(publicId: string, input: ServiceOrderStatusInput & { expectedVersion: number }, actor: AuthenticatedUser) {
    assertAdmin(actor);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(publicId)) {
      throw new NotFoundException({ code: "SERVICE_ORDER_STATUS_NOT_FOUND", message: "Status não encontrado." });
    }
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const current = await tx.serviceOrderStatus.findUnique({ where: { publicId } });
        if (!current) throw new NotFoundException({ code: "SERVICE_ORDER_STATUS_NOT_FOUND", message: "Status não encontrado." });
        if (current.version !== input.expectedVersion) throw new ConflictException({ code: "SERVICE_ORDER_STATUS_VERSION_CONFLICT", message: "O status foi alterado. Recarregue os dados." });
        const changed = await tx.serviceOrderStatus.updateMany({ where: { id: current.id, version: input.expectedVersion }, data: { name: input.name,
          technicalCompletion: input.technicalCompletion, version: { increment: 1 } } });
        if (changed.count !== 1) throw new ConflictException({ code: "SERVICE_ORDER_STATUS_VERSION_CONFLICT", message: "O status foi alterado. Recarregue os dados." });
        const updated = await tx.serviceOrderStatus.findUniqueOrThrow({ where: { id: current.id } });
        await tx.adminAuditLog.create({ data: { eventCode: "SERVICE_ORDER_STATUS_UPDATED", actorUserId: actor.id,
          detailsJson: { statusPublicId: current.publicId, previous: { name: current.name, technicalCompletion: current.technicalCompletion,
            allowsBudgetWithdrawal: current.allowsBudgetWithdrawal },
            next: { name: updated.name, technicalCompletion: updated.technicalCompletion,
              allowsBudgetWithdrawal: updated.allowsBudgetWithdrawal } } } });
        return tx.serviceOrderStatus.findUniqueOrThrow({ where: { id: updated.id }, select });
      });
      return { data: view(row) };
    } catch (error) { return mapStatusWriteError(error); }
  }
}

function assertAdmin(actor: AuthenticatedUser): void {
  if (!actor.isAdmin) throw new ForbiddenException({ code: "PERMISSION_DENIED", message: "Somente Administradores podem administrar status de OS." });
}

function mapStatusWriteError(error: unknown): never {
  if (error instanceof ConflictException || error instanceof ForbiddenException || error instanceof NotFoundException) throw error;
  if (typeof error === "object" && error !== null && "code" in error) {
    if (error.code === "P2002") throw new ConflictException({ code: "DUPLICATE_SERVICE_ORDER_STATUS_NAME", message: "Já existe um status com esse nome." });
    if (error.code === "P2034" || error.code === "P2028") throw new ConflictException({ code: "SERVICE_ORDER_STATUS_VERSION_CONFLICT", message: "O status foi alterado. Recarregue os dados." });
  }
  throw error;
}
