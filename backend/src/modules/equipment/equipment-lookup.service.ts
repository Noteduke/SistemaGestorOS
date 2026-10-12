import { Injectable } from "@nestjs/common";
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
      data: equipment.map(({ publicId, model, serialNumber, type, brand, owner }) => ({
        publicId,
        type: { publicId: type.publicId, name: type.name },
        brand: { publicId: brand.publicId, name: brand.name },
        model,
        serialNumber,
        serialIdentificationStatus: serialNumber === null ? "NOT_IDENTIFIED" : "IDENTIFIED",
        owner: { publicId: owner.publicId, name: owner.name },
      })),
      pagination: pagination(query, total),
    };
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
