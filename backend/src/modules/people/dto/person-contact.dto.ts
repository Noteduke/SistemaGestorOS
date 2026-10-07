import { BadRequestException } from "@nestjs/common";

export interface CreatePersonPhoneInput {
  number: string;
  isPrimary: boolean;
  confirmPersonChange: boolean;
  confirmNonstandardPhone: boolean;
}

export interface CreatePersonEmailInput {
  address: string;
  isPrimary: boolean;
  confirmPersonChange: boolean;
}

export interface PersonContactListQuery {
  page: number;
  pageSize: number;
}

function invalid(message: string): never {
  throw new BadRequestException({ code: "INVALID_CONTACT_INPUT", message });
}

function objectInput(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    invalid("O corpo da requisição deve ser um objeto.");
  }
  return value as Record<string, unknown>;
}

function strictBoolean(value: unknown, field: string, fallback = false): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") invalid(`O campo ${field} deve ser booleano.`);
  return value;
}

export function parseCreatePersonPhone(value: unknown): CreatePersonPhoneInput {
  const input = objectInput(value);
  const allowed = new Set(["number", "isPrimary", "confirmPersonChange", "confirmNonstandardPhone"]);
  if (Object.keys(input).some((key) => !allowed.has(key))) invalid("O corpo contém campos não permitidos.");
  if (typeof input.number !== "string") invalid("O telefone deve ser informado como texto.");

  return {
    number: input.number,
    isPrimary: strictBoolean(input.isPrimary, "isPrimary"),
    confirmPersonChange: strictBoolean(input.confirmPersonChange, "confirmPersonChange"),
    confirmNonstandardPhone: strictBoolean(input.confirmNonstandardPhone, "confirmNonstandardPhone"),
  };
}

export function parseCreatePersonEmail(value: unknown): CreatePersonEmailInput {
  const input = objectInput(value);
  const allowed = new Set(["address", "isPrimary", "confirmPersonChange"]);
  if (Object.keys(input).some((key) => !allowed.has(key))) invalid("O corpo contém campos não permitidos.");
  if (typeof input.address !== "string") invalid("O e-mail deve ser informado como texto.");

  return {
    address: input.address,
    isPrimary: strictBoolean(input.isPrimary, "isPrimary"),
    confirmPersonChange: strictBoolean(input.confirmPersonChange, "confirmPersonChange"),
  };
}

export function parsePersonContactListQuery(query: Record<string, unknown>): PersonContactListQuery {
  const allowed = new Set(["page", "pageSize"]);
  if (Object.keys(query).some((key) => !allowed.has(key))) invalid("A consulta contém parâmetros não permitidos.");

  const page = parsePositiveInteger(query.page, "page", Number.MAX_SAFE_INTEGER);
  const pageSize = parsePositiveInteger(query.pageSize, "pageSize", 100);
  const offset = (page - 1) * pageSize;
  if (!Number.isSafeInteger(offset)) invalid("A paginação está fora do intervalo permitido.");
  return { page, pageSize };
}

function parsePositiveInteger(value: unknown, field: string, maximum: number): number {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) invalid(`O parâmetro ${field} deve ser um inteiro positivo.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > maximum) invalid(`O parâmetro ${field} está fora do intervalo permitido.`);
  return parsed;
}
