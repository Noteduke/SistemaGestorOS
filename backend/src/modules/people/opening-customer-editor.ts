import { isNationalBrazilianPhone } from "./domain/normalize-person-contact.js";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import type { Prisma } from "../../generated/prisma/client.js";
import { parseCompletePerson } from "./dto/complete-person.dto.js";
import { toPersonResponse } from "./domain/person-response.mapper.js";

export const customerInclude = { address: true, phones: { orderBy: { id: "asc" as const } }, emails: { orderBy: { id: "asc" as const } } };
type Customer = Prisma.PersonGetPayload<{ include: typeof customerInclude }>;
export function openingCustomerDetails(person: Customer) {
  return { ...toPersonResponse(person), address: person.address ? Object.fromEntries(["postalCode", "street", "number", "complement", "district", "city", "state", "country"].map(key => [key, person.address![key as keyof typeof person.address] ?? ""])) : null, phones: person.phones.map(p => ({ publicId: p.publicId, number: p.number, isPrimary: p.isPrimary, confirmNonstandardPhone: false })), emails: person.emails.map(e => ({ publicId: e.publicId, address: e.address, isPrimary: e.isPrimary })) };
}
export async function linkedOpeningCustomer(tx: Prisma.TransactionClient, openingId: string, actorId: number) {
  const rows = await tx.$queryRaw<Array<{ customer_id: number | null; status: string; initiated_by_user_id: number }>>`SELECT customer_id,status,initiated_by_user_id FROM service_order_openings WHERE public_id=${openingId} FOR UPDATE`;
  const row = rows[0];
  if (!row || row.initiated_by_user_id !== actorId) throw new NotFoundException({ code: "OPENING_NOT_FOUND", message: "Abertura não encontrada." });
  if (row.status !== "IN_PROGRESS" || !row.customer_id) throw new ConflictException({ code: "OPENING_NOT_IN_PROGRESS", message: "Selecione um cliente na abertura em andamento." });
  await tx.$queryRaw`SELECT id FROM people WHERE id=${row.customer_id} FOR UPDATE`;
  const person = await tx.person.findUnique({ where: { id: row.customer_id }, include: customerInclude });
  if (!person) throw new NotFoundException({ code: "PERSON_NOT_FOUND", message: "Cliente não encontrado." });
  return person;
}
export async function editOpeningCustomer(tx: Prisma.TransactionClient, openingId: string, actorId: number, body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new BadRequestException({ code: "INVALID_BODY", message: "Cadastro inválido." });
  const { expectedUpdatedAt, confirmPersonChange, ...input } = body as Record<string, unknown>;
  if (confirmPersonChange !== true) throw new ConflictException({ code: "PERSON_CHANGE_CONFIRMATION_REQUIRED", message: "Confirme a alteração do cadastro." });
  const previous = await linkedOpeningCustomer(tx, openingId, actorId);
  if (typeof expectedUpdatedAt !== "string" || previous.updatedAt.toISOString() !== expectedUpdatedAt) throw new ConflictException({ code: "PERSON_CONCURRENCY_CONFLICT", message: "O cliente foi alterado. Recarregue o cadastro antes de salvar." });
  const rawPhones = Array.isArray(input.phones) ? input.phones : [];
  const rawEmails = Array.isArray(input.emails) ? input.emails : [];
  const stripId = (item: unknown) => { if (!item || typeof item !== "object") return item; const { publicId: _id, ...value } = item as Record<string, unknown>; return value; };
  const parsed = parseCompletePerson({ ...input, phones: rawPhones.map(stripId), emails: rawEmails.map(stripId) });
  // These protected fields have their own authorization. Do not silently clear
  // them, country or hidden PF registrations when editing unrelated fields.
  if (parsed.data.isActive !== previous.isActive || parsed.data.warning !== previous.warning) throw new BadRequestException({ code: "PROTECTED_PERSON_FIELDS", message: "Situação e aviso devem ser preservados nesta edição." });
  const ids = (items: unknown[]) => items.map(item => (item as Record<string, unknown>)?.publicId);
  const phoneIds = ids(rawPhones), emailIds = ids(rawEmails);
  for (const [old, supplied] of [[previous.phones, phoneIds], [previous.emails, emailIds]] as const) {
    if (old.some(item => !supplied.includes(item.publicId)) || supplied.filter(Boolean).some((id, index, all) => typeof id !== "string" || all.indexOf(id) !== index || !old.some(item => item.publicId === id))) throw new BadRequestException({ code: "CONTACT_HISTORY_PRESERVED", message: "Preserve os contatos existentes; exclusão não está disponível nesta edição." });
  }
  parsed.phones.forEach((phone, i) => {
    const old = previous.phones.find(p => p.publicId === phoneIds[i]);
    if ((!old || old.number !== phone.number) && !isNationalBrazilianPhone(phone.number)) throw new BadRequestException({ code: "INVALID_PHONE", message: "Informe telefone brasileiro com DDD." });
  });
  await tx.person.update({ where: { id: previous.id }, data: { ...parsed.data, updatedAt: new Date(Math.max(Date.now(), previous.updatedAt.getTime() + 1)),
    stateRegistration: parsed.data.personType === "PF" ? previous.stateRegistration : parsed.data.stateRegistration,
    municipalRegistration: parsed.data.personType === "PF" ? previous.municipalRegistration : parsed.data.municipalRegistration,
  } });
  if (parsed.address) await tx.personAddress.upsert({ where: { personId: previous.id }, create: { personId: previous.id, ...parsed.address }, update: { ...parsed.address, country: previous.address?.country ?? parsed.address.country ?? "BR" } });
  // Clear primary flags first, preserving functional uniqueness throughout.
  await tx.personPhone.updateMany({ where: { personId: previous.id }, data: { isPrimary: false } });
  await tx.personEmail.updateMany({ where: { personId: previous.id }, data: { isPrimary: false } });
  for (let i = 0; i < parsed.phones.length; i++) {
    const p = parsed.phones[i], old = previous.phones.find(x => x.publicId === phoneIds[i]);
    if (old) await tx.personPhone.update({ where: { id: old.id }, data: { number: p.number, isPrimary: p.isPrimary } });
    else {
      const created = await tx.personPhone.create({ data: { personId: previous.id, number: p.number, isPrimary: p.isPrimary } });
      await tx.personContactEvent.create({ data: { personId: previous.id, phoneId: created.id, userId: actorId, eventType: "PHONE_CREATED", newValue: p.number } });
    }
    const prior = previous.phones.find(x => x.isPrimary);
    if (old && p.isPrimary && prior?.publicId !== old.publicId) await tx.personContactEvent.create({ data: { personId: previous.id, phoneId: old.id, userId: actorId, eventType: "PHONE_PRIMARY_CHANGED", previousContactPublicId: prior?.publicId ?? null, previousValue: prior?.number ?? null, newValue: p.number } });
  }
  // Temporary unique addresses avoid collisions when two existing values swap.
  for (const email of previous.emails) await tx.personEmail.update({ where: { id: email.id }, data: { address: `${email.publicId}@editing.invalid` } });
  for (let i = 0; i < parsed.emails.length; i++) {
    const e = parsed.emails[i], old = previous.emails.find(x => x.publicId === emailIds[i]);
    if (old) await tx.personEmail.update({ where: { id: old.id }, data: { address: e.address, isPrimary: e.isPrimary } });
    else {
      const created = await tx.personEmail.create({ data: { personId: previous.id, address: e.address, isPrimary: e.isPrimary } });
      await tx.personContactEvent.create({ data: { personId: previous.id, emailId: created.id, userId: actorId, eventType: "EMAIL_CREATED", newValue: e.address } });
    }
    const prior = previous.emails.find(x => x.isPrimary);
    if (old && e.isPrimary && prior?.publicId !== old.publicId) await tx.personContactEvent.create({ data: { personId: previous.id, emailId: old.id, userId: actorId, eventType: "EMAIL_PRIMARY_CHANGED", previousContactPublicId: prior?.publicId ?? null, previousValue: prior?.address ?? null, newValue: e.address } });
  }
  const current = await tx.person.findUniqueOrThrow({ where: { id: previous.id }, include: customerInclude });
  await tx.adminAuditLog.create({ data: { eventCode: "CUSTOMER_UPDATED_DURING_OPENING", actorUserId: actorId, detailsJson: { openingPublicId: openingId, personPublicId: current.publicId, previous: JSON.parse(JSON.stringify(openingCustomerDetails(previous))), current: JSON.parse(JSON.stringify(openingCustomerDetails(current))) } } });
  return { data: openingCustomerDetails(current) };
}
