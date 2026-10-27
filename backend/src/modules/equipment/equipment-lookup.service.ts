import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { parseOpeningPatch } from "../service-orders/dto/opening-patch.dto.js";
import type { Prisma } from "../../generated/prisma/client.js";
import { PrismaService } from "../../infrastructure/prisma/prisma.service.js";
import type { OpeningEquipmentSearchQuery } from "./dto/opening-equipment-search-query.dto.js";

@Injectable()
export class EquipmentLookupService {
  constructor(private readonly prisma: PrismaService) {}

  async searchForOpening(query: OpeningEquipmentSearchQuery) {
    const search = query.search?.toLocaleUpperCase("pt-BR");
    const where: Prisma.EquipmentWhereInput = {
      isActive: true,
      ...(query.ownerPublicId ? { owner: { publicId: query.ownerPublicId } } : {}),
      ...(search
        ? {
            OR: [
              { model: { contains: search } },
              { type: { name: { contains: search } } },
              { brand: { name: { contains: search } } },
              { owner: { name: { contains: search } } },
              { serialNumber: { contains: search } },
            ],
          }
        : {}),
    };
    const [equipment, total] = await this.prisma.$transaction([
      this.prisma.equipment.findMany({
        where,
        select: {
          id: true,
          publicId: true,
          model: true,
          serialNumber: true,
          updatedAt: true,
          type: { select: { publicId: true, name: true } },
          brand: { select: { publicId: true, name: true } },
          owner: { select: { publicId: true, name: true } },
        },
        orderBy: [{ model: "asc" }, { id: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.equipment.count({ where }),
    ]);

    return {
      data: equipment.map(({ publicId, model, serialNumber, updatedAt, type, brand, owner }) => ({
        publicId,
        type: { publicId: type.publicId, name: type.name },
        brand: { publicId: brand.publicId, name: brand.name },
        model,
        serialNumber,
        ...(updatedAt ? { updatedAt } : {}),
        serialIdentificationStatus: serialNumber === null ? "NOT_IDENTIFIED" : "IDENTIFIED",
        owner: { publicId: owner.publicId, name: owner.name },
      })),
      pagination: pagination(query, total),
    };
  }

  async createCatalog(kind: "type" | "brand", body: unknown, actorUserId: number) {
    const input = body as { name?: unknown } | null;
    if (!input || typeof input !== "object" || Object.keys(input).some(key => key !== "name") || typeof input.name !== "string" || !input.name.trim() || input.name.trim().length > 191) throw new BadRequestException({ code: "VALIDATION_ERROR", message: "Informe um nome de até 191 caracteres." });
    const name = input.name.trim().replace(/\s+/g, " ").toLocaleUpperCase("pt-BR");
    return this.prisma.$transaction(async tx => {
      const row = kind === "type"
        ? await tx.equipmentType.upsert({ where: { name }, create: { name }, update: {} })
        : await tx.equipmentBrand.upsert({ where: { name }, create: { name }, update: {} });
      await tx.adminAuditLog.create({ data: { eventCode: "EQUIPMENT_CATALOG_SELECTED_OR_CREATED", actorUserId, detailsJson: { kind, publicId: row.publicId } } });
      return { data: { publicId: row.publicId, name: row.name } };
    });
  }

  async updateEquipment(publicId: string, body: unknown, actorUserId: number) {
    const input = body as Record<string, unknown> | null;
    if (!input || input.confirmEquipmentChange !== true || typeof input.expectedUpdatedAt !== "string" || !Number.isFinite(Date.parse(input.expectedUpdatedAt)) || Object.keys(input).some(key => !["equipmentDraft", "expectedUpdatedAt", "confirmEquipmentChange"].includes(key))) throw new BadRequestException({ code: "VALIDATION_ERROR", message: "Confirme a alteração dos dados permanentes." });
    const draft = parseOpeningPatch({ equipmentDraft: input.equipmentDraft }).equipmentDraft;
    if (!draft) throw new BadRequestException({ code: "VALIDATION_ERROR", message: "Informe os dados do equipamento." });
    return this.prisma.$transaction(async tx => {
      const target = await tx.equipment.findUnique({ where: { publicId }, select: { id: true, ownerId: true } });
      if (!target) throw new NotFoundException({ code: "EQUIPMENT_NOT_FOUND", message: "Equipamento não encontrado." });
      await tx.$queryRaw`SELECT id FROM people WHERE id=${target.ownerId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM equipment WHERE id=${target.id} FOR UPDATE`;
      const current = await tx.equipment.findUniqueOrThrow({ where: { id: target.id } });
      if (!current.isActive || current.ownerId !== target.ownerId || current.updatedAt.toISOString() !== input.expectedUpdatedAt) throw new ConflictException({ code: "EQUIPMENT_VERSION_CONFLICT", message: "O equipamento mudou. Pesquise novamente antes de editar." });
      const type = await tx.equipmentType.findUnique({ where: { publicId: draft.typePublicId } });
      const brand = await tx.equipmentBrand.findUnique({ where: { publicId: draft.brandPublicId } });
      if (!type || !brand) throw new NotFoundException({ code: "EQUIPMENT_CATALOG_NOT_FOUND", message: "Tipo ou marca indisponível." });
      if (draft.serialNumber && await tx.equipment.findFirst({ where: { ownerId: target.ownerId, serialNumber: draft.serialNumber, NOT: { id: target.id } }, select: { id: true } })) throw new ConflictException({ code: "EQUIPMENT_DUPLICATE", message: "Já existe equipamento deste cliente com a mesma série." });
      const saved = await tx.equipment.update({ where: { id: target.id }, data: { typeId: type.id, brandId: brand.id, model: draft.model, serialNumber: draft.serialNumber } });
      await tx.adminAuditLog.create({ data: { eventCode: "EQUIPMENT_UPDATED", actorUserId, detailsJson: { equipmentPublicId: publicId,
        previous: { typeId: current.typeId, brandId: current.brandId, model: current.model, serialNumber: current.serialNumber },
        next: { typeId: saved.typeId, brandId: saved.brandId, model: saved.model, serialNumber: saved.serialNumber } } } });
      return { data: { publicId: saved.publicId, updatedAt: saved.updatedAt } };
    });
  }

  async listTypes(query: OpeningEquipmentSearchQuery) {
    const where: Prisma.EquipmentTypeWhereInput = query.search
      ? { name: { contains: query.search.toLocaleUpperCase("pt-BR") } }
      : {};
    const [types, total] = await this.prisma.$transaction([
      this.prisma.equipmentType.findMany({
        where,
        select: { id: true, publicId: true, name: true },
        orderBy: [{ name: "asc" }, { id: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.equipmentType.count({ where }),
    ]);
    return { data: types.map(({ publicId, name }) => ({ publicId, name })), pagination: pagination(query, total) };
  }

  async listBrands(query: OpeningEquipmentSearchQuery) {
    const where: Prisma.EquipmentBrandWhereInput = query.search
      ? { name: { contains: query.search.toLocaleUpperCase("pt-BR") } }
      : {};
    const [brands, total] = await this.prisma.$transaction([
      this.prisma.equipmentBrand.findMany({
        where,
        select: { id: true, publicId: true, name: true },
        orderBy: [{ name: "asc" }, { id: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.equipmentBrand.count({ where }),
    ]);
    return { data: brands.map(({ publicId, name }) => ({ publicId, name })), pagination: pagination(query, total) };
  }
}

function pagination(query: OpeningEquipmentSearchQuery, total: number) {
  return {
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.ceil(total / query.pageSize),
  };
}
