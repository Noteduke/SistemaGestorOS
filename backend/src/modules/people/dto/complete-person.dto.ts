import { BadRequestException } from "@nestjs/common";
import { parseCreatePersonDto } from "./create-person.dto.js";
import { normalizePersonInput, normalizeGeneralText } from "../domain/normalize-person-input.js";
import { normalizePhoneNumber, normalizeEmailAddress, isStandardBrazilianPhone } from "../domain/normalize-person-contact.js";

export function parseCompletePerson(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new BadRequestException({ code: "INVALID_BODY", message: "Cadastro inválido." });
  const { phones, emails, address, phone, email, confirmNonstandardPhone, openingPublicId, ...input } = body as Record<string, unknown>;
  const data = normalizePersonInput({ personType: "PF", ...parseCreatePersonDto(input) });
  const fail = (field: string): never => { throw new BadRequestException({ code: "INVALID_FIELD", message: `Revise ${field}.`, details: { field } }); };
  const collection = (value: unknown, field: string): Record<string, unknown>[] => {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.length > 50 || value.some(x => !x || typeof x !== "object" || Array.isArray(x))) return fail(field);
    const rows = value as Record<string, unknown>[];
    if (rows.some(x => x.isPrimary !== undefined && typeof x.isPrimary !== "boolean") || rows.filter(x => x.isPrimary === true).length > 1) return fail(field);
    return rows;
  };
  if (phones !== undefined && phone !== undefined || emails !== undefined && email !== undefined) fail("contacts");
  if (phone !== undefined && typeof phone !== "string" || email !== undefined && typeof email !== "string" || confirmNonstandardPhone !== undefined && typeof confirmNonstandardPhone !== "boolean") fail("contacts");
  const normalizedPhones = collection(phones ?? (phone ? [{ number: phone, isPrimary: true, confirmNonstandardPhone }] : undefined), "phones").map(row => {
    if (Object.keys(row).some(key => !["number", "isPrimary", "confirmNonstandardPhone"].includes(key)) || typeof row.number !== "string" || row.confirmNonstandardPhone !== undefined && typeof row.confirmNonstandardPhone !== "boolean") fail("phones");
    const number = normalizePhoneNumber(row.number as string);
    return { number, isPrimary: row.isPrimary === true, confirmed: row.confirmNonstandardPhone === true, standard: isStandardBrazilianPhone(number) };
  });
  const normalizedEmails = collection(emails ?? (email ? [{ address: email, isPrimary: true }] : undefined), "emails").map(row => {
    if (Object.keys(row).some(key => !["address", "isPrimary"].includes(key)) || typeof row.address !== "string") fail("emails");
    return { address: normalizeEmailAddress(row.address as string), isPrimary: row.isPrimary === true };
  });
  if (new Set(normalizedEmails.map(x => x.address)).size !== normalizedEmails.length) fail("emails");
  let normalizedAddress: Record<string, string | null> | undefined;
  if (address !== undefined && address !== null) {
    if (typeof address !== "object" || Array.isArray(address)) fail("address");
    const fields: Record<string, number> = { postalCode: 16, street: 191, number: 32, complement: 100, district: 100, city: 100, state: 2, country: 2 };
    normalizedAddress = {};
    for (const [key, value] of Object.entries(address as Record<string, unknown>)) {
      if (!Object.hasOwn(fields, key) || value !== null && typeof value !== "string") fail(`address.${key}`);
      const text = typeof value === "string" ? (key === "postalCode" ? value.replace(/\D/g, "") : normalizeGeneralText(value)) : "";
      if (text.length > fields[key] || (key === "state" || key === "country") && text && !/^[A-Z]{2}$/.test(text)) fail(`address.${key}`);
      normalizedAddress[key] = text || null;
    }
    if (!Object.entries(normalizedAddress).some(([key, value]) => key !== "country" && Boolean(value))) normalizedAddress = undefined;
    else normalizedAddress.country ||= "BR";
  }
  if (openingPublicId !== undefined && (typeof openingPublicId !== "string" || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(openingPublicId))) fail("openingPublicId");
  return { data, phones: normalizedPhones, emails: normalizedEmails, address: normalizedAddress, openingPublicId: openingPublicId as string | undefined };
}
