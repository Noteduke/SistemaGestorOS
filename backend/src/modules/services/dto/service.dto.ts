import { BadRequestException } from "@nestjs/common";
import { cleanServiceName, normalizeServiceName } from "../domain/service-name.js";

export interface ServiceListQuery {
  page: number;
  pageSize: number;
  search?: string;
  status: "active" | "inactive" | "all";
}

export interface CreateServiceDto {
  name: string;
  normalizedName: string;
  defaultPrice: string;
}

export type UpdateServiceDto =
  | { expectedVersion: number; defaultPrice: string; isActive?: never }
  | { expectedVersion: number; isActive: boolean; defaultPrice?: never };

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BadRequestException({ code: "INVALID_BODY", message: "Corpo da requisição inválido." });
  }
  return value as Record<string, unknown>;
}

function onlyFields(value: Record<string, unknown>, allowed: string[]): void {
  const fields = Object.keys(value).filter((key) => !allowed.includes(key));
  if (fields.length) {
    throw new BadRequestException({ code: "UNSUPPORTED_FIELD", message: "Campo não permitido.", details: { fields } });
  }
}

function positiveInteger(value: unknown, field: string): number {
  if (typeof value !== "string" && typeof value !== "number") {
    throw new BadRequestException({ code: "INVALID_PAGINATION", message: `${field} deve ser inteiro positivo.` });
  }
  const text = String(value);
  if (!/^\d+$/u.test(text) || !Number.isSafeInteger(Number(text)) || Number(text) < 1) {
    throw new BadRequestException({ code: "INVALID_PAGINATION", message: `${field} deve ser inteiro positivo.` });
  }
  return Number(text);
}

export function parseServicePrice(value: unknown): string {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d{0,12})(?:\.\d{1,2})?$/u.test(value)) {
    throw new BadRequestException({ code: "INVALID_SERVICE_PRICE", message: "Preço deve ser decimal não negativo com até duas casas." });
  }
  const [whole, fraction = ""] = value.split(".");
  return `${whole}.${fraction.padEnd(2, "0")}`;
}

export function parseServiceListQuery(query: Record<string, unknown>): ServiceListQuery {
  onlyFields(query, ["page", "pageSize", "search", "status"]);
  const page = positiveInteger(query.page, "page");
  const pageSize = positiveInteger(query.pageSize, "pageSize");
  if (pageSize > 100 || !Number.isSafeInteger((page - 1) * pageSize)) {
    throw new BadRequestException({ code: "INVALID_PAGINATION", message: "Paginação fora do intervalo permitido." });
  }
  const status = query.status ?? "active";
  if (status !== "active" && status !== "inactive" && status !== "all") {
    throw new BadRequestException({ code: "INVALID_FILTER", message: "status deve ser active, inactive ou all." });
  }
  if (query.search !== undefined && typeof query.search !== "string") {
    throw new BadRequestException({ code: "INVALID_SEARCH", message: "search deve ser texto." });
  }
  const search = typeof query.search === "string" ? query.search.trim().replace(/\s+/gu, " ") : "";
  if (search.length > 120) {
    throw new BadRequestException({ code: "INVALID_SEARCH", message: "Busca não pode exceder 120 caracteres." });
  }
  return { page, pageSize, status, ...(search ? { search: normalizeServiceName(search) } : {}) };
}

export function parseCreateServiceDto(body: unknown): CreateServiceDto {
  const input = object(body);
  onlyFields(input, ["name", "defaultPrice"]);
  const name = cleanServiceName(input.name);
  const normalizedName = normalizeServiceName(name);
  if (normalizedName.length > 191) {
    throw new BadRequestException({ code: "SERVICE_NAME_TOO_LONG", message: "Nome normalizado excede o limite permitido." });
  }
  return { name, normalizedName, defaultPrice: parseServicePrice(input.defaultPrice) };
}

export function parseUpdateServiceDto(body: unknown): UpdateServiceDto {
  const input = object(body);
  onlyFields(input, ["expectedVersion", "defaultPrice", "isActive"]);
  const expectedVersion = positiveInteger(input.expectedVersion, "expectedVersion");
  const hasPrice = Object.hasOwn(input, "defaultPrice");
  const hasActive = Object.hasOwn(input, "isActive");
  if (hasPrice === hasActive) {
    throw new BadRequestException({ code: "INVALID_SERVICE_UPDATE", message: "Informe somente preço ou situação de atividade." });
  }
  if (hasPrice) return { expectedVersion, defaultPrice: parseServicePrice(input.defaultPrice) };
  if (typeof input.isActive !== "boolean") {
    throw new BadRequestException({ code: "INVALID_SERVICE_STATUS", message: "isActive deve ser booleano." });
  }
  return { expectedVersion, isActive: input.isActive };
}

export function parseDeleteServiceQuery(query: Record<string, unknown>): number {
  onlyFields(query, ["expectedVersion"]);
  return positiveInteger(query.expectedVersion, "expectedVersion");
}
