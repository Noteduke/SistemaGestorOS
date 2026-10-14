import { BadRequestException, ConflictException, HttpException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type ServiceCatalog } from "../../generated/prisma/client.js";
import { PrismaService } from "../../infrastructure/prisma/prisma.service.js";
import type { CreateServiceDto, ServiceListQuery, UpdateServiceDto } from "./dto/service.dto.js";

type Tx = Prisma.TransactionClient;
const PUBLIC_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const TRANSACTION_OPTIONS = { maxWait: 5_000, timeout: 10_000 } as const;

function assertPublicId(publicId: string): void {
  if (!PUBLIC_ID.test(publicId)) {
    throw new BadRequestException({ code: "INVALID_PUBLIC_ID", message: "Identificador público inválido." });
  }
}

function view(service: ServiceCatalog) {
  return {
    publicId: service.publicId,
    name: service.name,
    defaultPrice: service.defaultPrice.toFixed(2),
    isActive: service.isActive,
    version: service.version,
    createdAt: service.createdAt,
    updatedAt: service.updatedAt,
  };
}

function notFound(): NotFoundException {
  return new NotFoundException({ code: "SERVICE_NOT_FOUND", message: "Serviço não encontrado." });
}

function staleVersion(): ConflictException {
  return new ConflictException({ code: "SERVICE_VERSION_CONFLICT", message: "O serviço foi alterado por outra operação. Recarregue os dados." });
}

function hasCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

function mapWriteError(error: unknown): never {
  if (error instanceof HttpException) throw error;
  if (hasCode(error, "P2002")) {
    throw new ConflictException({ code: "DUPLICATE_SERVICE_NAME", message: "Já existe um serviço cadastrado com esse nome." });
  }
  if (hasCode(error, "P2003")) {
    throw new ConflictException({ code: "SERVICE_ALREADY_USED", message: "Serviço já associado a uma OS não pode ser excluído." });
  }
  if (hasCode(error, "P2034") || hasCode(error, "P2028") || isLockConflict(error)) {
    throw new ConflictException({ code: "SERVICE_CONCURRENCY_CONFLICT", message: "Conflito concorrente. Recarregue os dados e tente novamente." });
  }
  throw error;
}

function isLockConflict(error: unknown): boolean {
  if (!hasCode(error, "P2010") || typeof error !== "object" || error === null || !("meta" in error)) return false;
  const meta = error.meta as { code?: string | number; driverAdapterError?: { cause?: { code?: string | number } } } | undefined;
  const code = meta?.code ?? meta?.driverAdapterError?.cause?.code;
  return code === 1205 || code === 1213 || code === "1205" || code === "1213";
}

async function lockService(tx: Tx, publicId: string): Promise<ServiceCatalog> {
  const locks = await tx.$queryRaw<{ id: number }[]>`
    SELECT id FROM service_catalog WHERE public_id = ${publicId} FOR UPDATE`;
  const locked = locks[0];
  if (!locked) throw notFound();
  const service = await tx.serviceCatalog.findUnique({ where: { id: locked.id } });
  if (!service) throw notFound();
  return service;
}

@Injectable()
export class ServicesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ServiceListQuery) {
    const where: Prisma.ServiceCatalogWhereInput = {
      ...(query.status === "active" ? { isActive: true } : {}),
      ...(query.status === "inactive" ? { isActive: false } : {}),
      ...(query.search ? { normalizedName: { contains: query.search } } : {}),
    };
    const [services, total] = await this.prisma.$transaction([
      this.prisma.serviceCatalog.findMany({
        where,
        orderBy: [{ name: "asc" }, { id: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.serviceCatalog.count({ where }),
    ]);
    return {
      data: services.map(view),
      pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) },
    };
  }

  async get(publicId: string) {
    assertPublicId(publicId);
    const service = await this.prisma.serviceCatalog.findUnique({ where: { publicId } });
    if (!service) throw notFound();
    return { data: view(service) };
  }

  async create(input: CreateServiceDto, actorUserId: number) {
    try {
      const service = await this.prisma.$transaction(async (tx) => {
        const created = await tx.serviceCatalog.create({
          data: {
            name: input.name,
            normalizedName: input.normalizedName,
            defaultPrice: new Prisma.Decimal(input.defaultPrice),
            createdByUserId: actorUserId,
            updatedByUserId: actorUserId,
          },
        });
        await tx.adminAuditLog.create({
          data: {
            eventCode: "SERVICE_CREATED",
            actorUserId,
            detailsJson: { servicePublicId: created.publicId, name: created.name, defaultPrice: created.defaultPrice.toFixed(2) },
          },
        });
        return created;
      }, TRANSACTION_OPTIONS);
      return { data: view(service) };
    } catch (error) {
      return mapWriteError(error);
    }
  }

  async update(publicId: string, input: UpdateServiceDto, actorUserId: number) {
    assertPublicId(publicId);
    try {
      const service = await this.prisma.$transaction(async (tx) => {
        const current = await lockService(tx, publicId);
        if (current.version !== input.expectedVersion) throw staleVersion();

        if (input.defaultPrice !== undefined) {
          if (current.defaultPrice.toFixed(2) === input.defaultPrice) return current;
          const updated = await tx.serviceCatalog.update({
            where: { id: current.id },
            data: { defaultPrice: new Prisma.Decimal(input.defaultPrice), updatedByUserId: actorUserId, version: { increment: 1 } },
          });
          await tx.adminAuditLog.create({
            data: {
              eventCode: "SERVICE_PRICE_CHANGED", actorUserId,
              detailsJson: {
                servicePublicId: current.publicId, name: current.name,
                previousPrice: current.defaultPrice.toFixed(2), newPrice: updated.defaultPrice.toFixed(2),
              },
            },
          });
          return updated;
        }

        if (current.isActive === input.isActive) return current;
        const updated = await tx.serviceCatalog.update({
          where: { id: current.id },
          data: { isActive: input.isActive, updatedByUserId: actorUserId, version: { increment: 1 } },
        });
        await tx.adminAuditLog.create({
          data: {
            eventCode: input.isActive ? "SERVICE_ENABLED" : "SERVICE_DISABLED", actorUserId,
            detailsJson: { servicePublicId: current.publicId, name: current.name, previousIsActive: current.isActive, newIsActive: updated.isActive },
          },
        });
        return updated;
      }, TRANSACTION_OPTIONS);
      return { data: view(service) };
    } catch (error) {
      return mapWriteError(error);
    }
  }

  async remove(publicId: string, expectedVersion: number, actorUserId: number) {
    assertPublicId(publicId);
    try {
      await this.prisma.$transaction(async (tx) => {
        const current = await lockService(tx, publicId);
        if (current.version !== expectedVersion) throw staleVersion();
        // When budget items exist, check every historical association here; the future FK must also use RESTRICT.
        await tx.adminAuditLog.create({
          data: {
            eventCode: "SERVICE_DELETED", actorUserId,
            detailsJson: { servicePublicId: current.publicId, name: current.name, defaultPrice: current.defaultPrice.toFixed(2), wasActive: current.isActive },
          },
        });
        await tx.serviceCatalog.delete({ where: { id: current.id } });
      }, TRANSACTION_OPTIONS);
      return { data: { deleted: true, publicId } };
    } catch (error) {
      return mapWriteError(error);
    }
  }
}
