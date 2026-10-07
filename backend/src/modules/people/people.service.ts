import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "../../generated/prisma/client.js";
import { PrismaService } from "../../infrastructure/prisma/prisma.service.js";
import { normalizePersonInput } from "./domain/normalize-person-input.js";
import { isStandardBrazilianPhone, normalizeEmailAddress, normalizePhoneNumber } from "./domain/normalize-person-contact.js";
import type { CreatePersonEmailInput, CreatePersonPhoneInput, PersonContactListQuery } from "./dto/person-contact.dto.js";
import { toPersonResponse } from "./domain/person-response.mapper.js";
import type { ListPeopleQuery } from "./dto/list-people-query.dto.js";

@Injectable()
export class PeopleService {
  constructor(private readonly prisma: PrismaService) {}

  async createPhone(publicId: string, input: CreatePersonPhoneInput) {
    requirePersonChangeConfirmation(input.confirmPersonChange);
    const number = normalizePhoneNumber(input.number);
    const standard = isStandardBrazilianPhone(number);
    if (!standard && !input.confirmNonstandardPhone) {
      throw new ConflictException({
        code: "PHONE_CONFIRMATION_REQUIRED",
        message: "O formato não corresponde aos padrões nacionais comuns. Confirme o telefone para continuar.",
        data: { number },
        warnings: [{ code: "PHONE_NONSTANDARD_FORMAT", message: "O telefone não corresponde aos padrões nacionais comuns." }],
      });
    }

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const person = await lockActivePerson(tx, publicId);
        const previous = input.isPrimary
          ? await tx.personPhone.findFirst({
              where: { personId: person.id, isPrimary: true },
              orderBy: [{ createdAt: "desc" }, { id: "desc" }],
              select: { id: true, publicId: true, number: true },
            })
          : null;

        if (previous) {
          await tx.personPhone.update({ where: { id: previous.id }, data: { isPrimary: false } });
        }

        const phone = await tx.personPhone.create({
          data: { personId: person.id, number, isPrimary: input.isPrimary },
          select: { id: true, publicId: true, number: true, isPrimary: true, createdAt: true },
        });
        await tx.personContactEvent.create({
          data: { personId: person.id, phoneId: phone.id, eventType: "PHONE_CREATED", newValue: number },
        });

        if (input.isPrimary) {
          await tx.personContactEvent.create({
            data: {
              personId: person.id,
              phoneId: phone.id,
              eventType: "PHONE_PRIMARY_CHANGED",
              previousContactPublicId: previous?.publicId ?? null,
              previousValue: previous?.number ?? null,
              newValue: number,
            },
          });
        }

        return phone;
      });

      return {
        data: toContactResponse(created),
        warnings: standard ? [] : [{ code: "PHONE_NONSTANDARD_FORMAT", message: "O telefone foi aceito após confirmação por estar fora dos padrões nacionais comuns." }],
      };
    } catch (error) {
      throw mapContactConstraintError(error);
    }
  }

  async createEmail(publicId: string, input: CreatePersonEmailInput) {
    requirePersonChangeConfirmation(input.confirmPersonChange);
    const address = normalizeEmailAddress(input.address);

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const person = await lockActivePerson(tx, publicId);
        const duplicate = await tx.personEmail.findUnique({
          where: { personId_address: { personId: person.id, address } },
          select: { id: true },
        });
        if (duplicate) {
          throw new ConflictException({ code: "DUPLICATE_PERSON_EMAIL", message: "Este e-mail já está cadastrado para esta Pessoa." });
        }

        const shared = await tx.personEmail.findFirst({
          where: { address, personId: { not: person.id } },
          select: { id: true },
        });
        const previous = input.isPrimary
          ? await tx.personEmail.findFirst({
              where: { personId: person.id, isPrimary: true },
              orderBy: [{ createdAt: "desc" }, { id: "desc" }],
              select: { id: true, publicId: true, address: true },
            })
          : null;

        if (previous) {
          await tx.personEmail.update({ where: { id: previous.id }, data: { isPrimary: false } });
        }

        const email = await tx.personEmail.create({
          data: { personId: person.id, address, isPrimary: input.isPrimary },
          select: { id: true, publicId: true, address: true, isPrimary: true, createdAt: true },
        });
        await tx.personContactEvent.create({
          data: { personId: person.id, emailId: email.id, eventType: "EMAIL_CREATED", newValue: address },
        });

        if (input.isPrimary) {
          await tx.personContactEvent.create({
            data: {
              personId: person.id,
              emailId: email.id,
              eventType: "EMAIL_PRIMARY_CHANGED",
              previousContactPublicId: previous?.publicId ?? null,
              previousValue: previous?.address ?? null,
              newValue: address,
            },
          });
        }

        return { email, shared: Boolean(shared) };
      });

      return {
        data: toContactResponse(result.email),
        warnings: result.shared
          ? [{ code: "EMAIL_SHARED_ACROSS_PEOPLE", message: "Este e-mail também está cadastrado para outra Pessoa." }]
          : [],
      };
    } catch (error) {
      throw mapContactConstraintError(error);
    }
  }

  async listPhones(publicId: string, query: PersonContactListQuery) {
    return this.listContacts(publicId, query, "phone");
  }

  async listEmails(publicId: string, query: PersonContactListQuery) {
    return this.listContacts(publicId, query, "email");
  }

  private async listContacts(publicId: string, query: PersonContactListQuery, kind: "phone" | "email") {
    const person = await this.prisma.person.findUnique({ where: { publicId }, select: { id: true } });
    if (!person) throw new NotFoundException({ code: "PERSON_NOT_FOUND", message: "Pessoa não encontrada." });

    const skip = (query.page - 1) * query.pageSize;
    const [contacts, total] = await this.prisma.$transaction([
      kind === "phone"
        ? this.prisma.personPhone.findMany({
            where: { personId: person.id },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            skip,
            take: query.pageSize,
            select: { publicId: true, number: true, isPrimary: true, createdAt: true },
          })
        : this.prisma.personEmail.findMany({
            where: { personId: person.id },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            skip,
            take: query.pageSize,
            select: { publicId: true, address: true, isPrimary: true, createdAt: true },
          }),
      kind === "phone"
        ? this.prisma.personPhone.count({ where: { personId: person.id } })
        : this.prisma.personEmail.count({ where: { personId: person.id } }),
    ]);

    return {
      data: contacts.map(toContactResponse),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }

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
        const target = error.meta?.target;
        if ((Array.isArray(target) && target.length === 1 && target[0] === "document") || target === "people_document_key") {
          throw new ConflictException({ code: "DUPLICATE_DOCUMENT", message: "Já existe uma Pessoa cadastrada com este documento." });
        }
        throw new ConflictException({ code: "UNIQUE_CONFLICT", message: "Conflito de unicidade ao cadastrar Pessoa." });
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
      this.prisma.person.findMany({ where, orderBy: [{ name: "asc" }, { id: "asc" }], skip, take: query.pageSize }),
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

function isPrismaUniqueViolation(error: unknown): error is { code: "P2002"; meta?: { target?: unknown } } {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

async function lockActivePerson(tx: Prisma.TransactionClient, publicId: string): Promise<{ id: number }> {
  const people = await tx.$queryRaw<Array<{ id: number; is_active: number }>>`
    SELECT id, is_active FROM people WHERE public_id = ${publicId} FOR UPDATE
  `;
  const person = people[0];
  if (!person) throw new NotFoundException({ code: "PERSON_NOT_FOUND", message: "Pessoa não encontrada." });
  if (!person.is_active) {
    throw new ConflictException({ code: "PERSON_INACTIVE", message: "Não é possível adicionar contato a uma Pessoa inativa." });
  }
  return { id: person.id };
}

function requirePersonChangeConfirmation(confirmed: boolean): void {
  if (!confirmed) {
    throw new ConflictException({
      code: "PERSON_CHANGE_CONFIRMATION_REQUIRED",
      message: "Confirme a alteração da Pessoa para cadastrar este contato.",
    });
  }
}

function toContactResponse<T extends { publicId: string; isPrimary: boolean; createdAt: Date }>(contact: T) {
  const value = contact as T & { number?: string; address?: string };
  return {
    publicId: contact.publicId,
    ...(value.number !== undefined ? { number: value.number } : {}),
    ...(value.address !== undefined ? { address: value.address } : {}),
    isPrimary: contact.isPrimary,
    createdAt: contact.createdAt,
  };
}

function mapContactConstraintError(error: unknown): unknown {
  if (error instanceof ConflictException || error instanceof NotFoundException) return error;
  if (isPrismaUniqueViolation(error)) {
    const target = error.meta?.target;
    const targetName = Array.isArray(target) ? target.join(" ") : String(target ?? "");
    if (targetName.includes("address") || targetName.includes("person_emails_person_id_address_key")) {
      return new ConflictException({ code: "DUPLICATE_PERSON_EMAIL", message: "Este e-mail já está cadastrado para esta Pessoa." });
    }
    if (targetName.includes("one_primary_per_person")) {
      return new ConflictException({ code: "PRIMARY_CONTACT_CONFLICT", message: "Não foi possível definir o contato principal. Tente novamente." });
    }
  }

  const details = error instanceof Error ? error.message : String(error);
  if (
    details.includes("person_phones_one_primary_per_person_uq") ||
    details.includes("person_emails_one_primary_per_person_uq")
  ) {
    return new ConflictException({ code: "PRIMARY_CONTACT_CONFLICT", message: "Não foi possível definir o contato principal. Tente novamente." });
  }
  return error;
}
