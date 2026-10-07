import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "../../generated/prisma/client.js";
import { PrismaService } from "../../infrastructure/prisma/prisma.service.js";
import { normalizePersonInput } from "./domain/normalize-person-input.js";
import { toPersonResponse } from "./domain/person-response.mapper.js";
import type { ListPeopleQuery } from "./dto/list-people-query.dto.js";

@Injectable()
export class PeopleService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: Record<string, unknown>) {
    const data = normalizePersonInput(input);
    if (data.document) {
      const duplicate = await this.prisma.person.findUnique({ where: { document: data.document }, select: { publicId: true } });
      if (duplicate) {
        throw new ConflictException({ code: "DUPLICATE_DOCUMENT", message: "Já existe uma Pessoa cadastrada com este documento." });
      }
    }

    const possibleDuplicate = data.document
      ? null
      : await this.prisma.person.findFirst({ where: { name: data.name }, select: { publicId: true } });

    try {
      const person = await this.prisma.person.create({ data, });
      return {
        data: toPersonResponse(person),
        warnings: possibleDuplicate ? [{ code: "POSSIBLE_DUPLICATE_NAME", message: "Já existe Pessoa com o mesmo Nome/Razão Social normalizado." }] : [],
      };
    } catch (error) {
      if (isPrismaUniqueViolation(error)) {
        throw new ConflictException({ code: "DUPLICATE_DOCUMENT", message: "Já existe uma Pessoa cadastrada com este documento." });
      }
      throw error;
    }
  }

  async getByPublicId(publicId: string) {
    const person = await this.prisma.person.findUnique({ where: { publicId } });
    if (!person) throw new NotFoundException({ code: "PERSON_NOT_FOUND", message: "Pessoa não encontrada." });
    return { data: toPersonResponse(person) };
  }

  async list(query: ListPeopleQuery) {
    const search = query.search?.toLocaleUpperCase("pt-BR");
    const compactDocumentSearch = search?.replace(/[^A-Z0-9]/g, "");
    const where: Prisma.PersonWhereInput = {
      ...(!query.includeInactive ? { isActive: true } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search } },
              ...(compactDocumentSearch ? [{ document: { contains: compactDocumentSearch } }] : []),
            ],
          }
        : {}),
    };
    const skip = (query.page - 1) * query.pageSize;
    const [people, total] = await this.prisma.$transaction([
      this.prisma.person.findMany({ where, orderBy: { name: "asc" }, skip, take: query.pageSize }),
      this.prisma.person.count({ where }),
    ]);

    return {
      data: people.map(toPersonResponse),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }
}

function isPrismaUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}
