import { linkedOpeningCustomer, openingCustomerDetails, editOpeningCustomer } from "./opening-customer-editor.js";
import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { parseCreatePersonDto } from "./dto/create-person.dto.js";
import type { Prisma } from "../../generated/prisma/client.js";
import { PrismaService } from "../../infrastructure/prisma/prisma.service.js";
import { normalizePersonInput } from "./domain/normalize-person-input.js";
import { isNationalBrazilianPhone, isStandardBrazilianPhone, normalizeEmailAddress, normalizePhoneNumber } from "./domain/normalize-person-contact.js";
import type { CreatePersonEmailInput, CreatePersonPhoneInput, PersonContactListQuery } from "./dto/person-contact.dto.js";
import { toPersonResponse } from "./domain/person-response.mapper.js";
import { maskPersonDocument } from "./domain/mask-person-document.js";
import type { ListPeopleQuery } from "./dto/list-people-query.dto.js";
import type { OpeningLookupQuery } from "../shared/dto/opening-lookup-query.dto.js";
import { parseCompletePerson } from "./dto/complete-person.dto.js";

@Injectable()
export class PeopleService {
  constructor(private readonly prisma: PrismaService) {}

  async getOpeningCustomerDetails(openingId: string, actorId: number) {
    return this.prisma.$transaction(async tx => ({ data: openingCustomerDetails(await linkedOpeningCustomer(tx, openingId, actorId)) }));
  }
  async updateOpeningCustomerDetails(openingId: string, actorId: number, body: unknown) {
    try { return await this.prisma.$transaction(tx => editOpeningCustomer(tx, openingId, actorId, body)); }
    catch (error) { if (isPrismaUniqueViolation(error)) throw new ConflictException({ code: "DUPLICATE_DOCUMENT_OR_CONTACT", message: "Documento ou contato duplicado. Revise o cadastro." }); throw error; }
  }

  async createOpeningCustomer(body: unknown, actorUserId: number) {
    return this.createCompletePerson(body, actorUserId, true);
  }

  async createCompletePerson(body: unknown, actorUserId: number, duringOpening = false) {
    const { data, phones, emails, address, openingPublicId } = parseCompletePerson(body);
    if (duringOpening && phones.some(phone => !isNationalBrazilianPhone(phone.number))) throw new BadRequestException({ code: "INVALID_PHONE", message: "Informe telefone brasileiro com DDD." });
    if (phones.some(phone => !phone.standard && !phone.confirmed)) throw new ConflictException({ code: "PHONE_CONFIRMATION_REQUIRED", message: "Confirme o telefone fora do padrão nacional.", details: { field: "phones" } });
    if (duringOpening && !openingPublicId) throw new BadRequestException({ code: "OPENING_REQUIRED", message: "Informe a abertura atual." });
    if (!duringOpening && openingPublicId) throw new BadRequestException({ code: "UNSUPPORTED_FIELDS", message: "Use o cadastro da abertura para vincular cliente." });
    try {
      return await this.prisma.$transaction(async tx => {
        let opening: { id: number; equipmentId: number | null } | undefined;
        if (duringOpening) {
          const rows = await tx.$queryRaw<Array<{ id: number; status: string; initiated_by_user_id: number; customer_created_during_opening: number | boolean; equipment_id: number | null }>>`SELECT id,status,initiated_by_user_id,customer_created_during_opening,equipment_id FROM service_order_openings WHERE public_id=${openingPublicId!} FOR UPDATE`;
          const row = rows[0];
          if (!row || row.initiated_by_user_id !== actorUserId) throw new NotFoundException({ code: "OPENING_NOT_FOUND", message: "Abertura não encontrada." });
          if (row.status !== "IN_PROGRESS") throw new ConflictException({ code: "OPENING_NOT_IN_PROGRESS", message: "A abertura não está em andamento." });
          if (row.customer_created_during_opening) throw new ConflictException({ code: "OPENING_CUSTOMER_ALREADY_CREATED", message: "Um cliente já foi cadastrado neste atendimento. Inicie outra abertura para cadastrar outro." });
          if (!data.isActive) throw new BadRequestException({ code: "CUSTOMER_INACTIVE", message: "O cliente da abertura precisa estar ativo.", details: { field: "isActive" } });
          if (row.equipment_id) throw new ConflictException({ code: "OPENING_EQUIPMENT_LINKED", message: "Retire o equipamento vinculado antes de cadastrar outro cliente." });
          opening = { id: row.id, equipmentId: row.equipment_id };
        }
        if (data.document && await tx.person.findUnique({ where: { document: data.document }, select: { id: true } })) throw new ConflictException({ code: "DUPLICATE_DOCUMENT", message: "Documento já cadastrado. Pesquise e selecione o cliente existente." });
        const duplicateName = !data.document && await tx.person.findFirst({ where: { name: data.name }, select: { id: true } });
        const warnings = duplicateName ? [{ code: "POSSIBLE_DUPLICATE_NAME", message: "Já existe Pessoa com o mesmo nome. Confira o cadastro." }] : [];
        const person = await tx.person.create({ data: { ...data, roles: { create: { role: "CUSTOMER" } } } });
        if (address) await tx.personAddress.create({ data: { personId: person.id, ...address } as Prisma.PersonAddressUncheckedCreateInput });
        for (const phone of phones) {
          const contact = await tx.personPhone.create({ data: { personId: person.id, number: phone.number, isPrimary: phone.isPrimary } });
          await tx.personContactEvent.create({ data: { personId: person.id, phoneId: contact.id, userId: actorUserId, eventType: "PHONE_CREATED", newValue: phone.number } });
          if (phone.isPrimary) await tx.personContactEvent.create({ data: { personId: person.id, phoneId: contact.id, userId: actorUserId, eventType: "PHONE_PRIMARY_CHANGED", newValue: phone.number } });
        }
        for (const email of emails) {
          const shared = await tx.personEmail.findFirst({ where: { address: email.address, personId: { not: person.id } }, select: { id: true } });
          if (shared && !warnings.some(item => item.code === "EMAIL_SHARED_ACROSS_PEOPLE")) warnings.push({ code: "EMAIL_SHARED_ACROSS_PEOPLE", message: "Este e-mail também está cadastrado para outra Pessoa." });
          const contact = await tx.personEmail.create({ data: { personId: person.id, address: email.address, isPrimary: email.isPrimary } });
          await tx.personContactEvent.create({ data: { personId: person.id, emailId: contact.id, userId: actorUserId, eventType: "EMAIL_CREATED", newValue: email.address } });
          if (email.isPrimary) await tx.personContactEvent.create({ data: { personId: person.id, emailId: contact.id, userId: actorUserId, eventType: "EMAIL_PRIMARY_CHANGED", newValue: email.address } });
        }
        if (opening) await tx.serviceOrderOpening.update({ where: { id: opening.id }, data: { customerId: person.id, customerCreatedDuringOpening: true } });
        await tx.adminAuditLog.create({ data: { eventCode: duringOpening ? "CUSTOMER_CREATED_DURING_OPENING" : "PERSON_CREATED", actorUserId, detailsJson: { personPublicId: person.publicId, ...(openingPublicId ? { openingPublicId } : {}) } } });
        return { data: duringOpening ? { publicId: person.publicId, name: person.name, personType: person.personType, documentHint: maskPersonDocument(person.document) } : toPersonResponse(person),
          warnings };
      });
    } catch (error) {
      if (isPrismaUniqueViolation(error)) throw new ConflictException({ code: "DUPLICATE_DOCUMENT", message: "Documento já cadastrado. Pesquise e selecione o cliente existente." });
      throw error;
    }
  }

  async createPhone(publicId: string, input: CreatePersonPhoneInput, actorUserId?: number) {
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
          data: { personId: person.id, phoneId: phone.id, userId: actorUserId ?? null, eventType: "PHONE_CREATED", newValue: number },
        });

        if (input.isPrimary) {
          await tx.personContactEvent.create({
            data: {
              personId: person.id,
              phoneId: phone.id,
              userId: actorUserId ?? null,
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

  async createEmail(publicId: string, input: CreatePersonEmailInput, actorUserId?: number) {
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
          data: { personId: person.id, emailId: email.id, userId: actorUserId ?? null, eventType: "EMAIL_CREATED", newValue: address },
        });

        if (input.isPrimary) {
          await tx.personContactEvent.create({
            data: {
              personId: person.id,
              emailId: email.id,
              userId: actorUserId ?? null,
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
    const person = await this.prisma.person.findUnique({ where: { publicId }, include: { address: { select: { postalCode: true, street: true, number: true, complement: true, district: true, city: true, state: true, country: true } } } });
    if (!person) throw new NotFoundException({ code: "PERSON_NOT_FOUND", message: "Pessoa não encontrada." });
    return { data: { ...toPersonResponse(person), address: person.address } };
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

  async listOpeningCustomers(query: OpeningLookupQuery) {
    const search = query.search?.toLocaleUpperCase("pt-BR");
    const compactSearch = search?.replace(/[^A-Z0-9]/g, "");
    const phoneSearch = search?.replace(/\D/g, "");
    const where: Prisma.PersonWhereInput = {
      isActive: true,
      roles: { some: { role: "CUSTOMER" } },
      ...(search
        ? {
            OR: [
              { name: { contains: search } },
              ...(compactSearch ? [{ document: { contains: compactSearch } }] : []),
              ...(phoneSearch ? [{ phones: { some: { number: { contains: phoneSearch } } } }] : []),
            ],
          }
        : {}),
    };
    const [people, total] = await this.prisma.$transaction([
      this.prisma.person.findMany({
        where,
        select: { id: true, publicId: true, personType: true, name: true, document: true },
        orderBy: [{ name: "asc" }, { id: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.person.count({ where }),
    ]);

    return {
      data: people.map(({ publicId, personType, name, document }) => ({
        publicId,
        personType,
        name,
        documentHint: maskPersonDocument(document),
      })),
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
