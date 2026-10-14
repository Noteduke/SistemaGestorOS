import { BadRequestException } from "@nestjs/common";
import { cleanProductCode, cleanProductDescription } from "../domain/product-input.js";

export type ProductCategory = "PART" | "RESALE_GOOD";
export type ProductListQuery = {
  page: number;
  pageSize: number;
  status: "active" | "inactive" | "all";
  search?: string;
  category?: ProductCategory;
};
export type CreateProductInput = { internalCode: string | null; description: string; category: ProductCategory };
export type UpdateProductInput = {
  expectedVersion: number;
  internalCode?: string | null;
  description?: string;
  category?: ProductCategory;
  isActive?: boolean;
};

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BadRequestException({ code: "INVALID_BODY", message: "Corpo da requisição inválido." });
  }
  return value as Record<string, unknown>;
}

function onlyFields(value: Record<string, unknown>, allowed: string[]): void {
  const unknown = Object.keys(value).filter((field) => !allowed.includes(field));
  if (unknown.length) throw new BadRequestException({ code: "UNSUPPORTED_FIELD", message: "Campo não permitido.", details: { fields: unknown } });
}

function positiveInteger(value: unknown, field: string): number {
  if ((typeof value !== "string" && typeof value !== "number") || !/^\d+$/u.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) {
    throw new BadRequestException({ code: "INVALID_PAGINATION", message: `${field} deve ser inteiro positivo.` });
  }
  return Number(value);
}

function parseCategory(value: unknown): ProductCategory {
  if (value !== "PART" && value !== "RESALE_GOOD") {
    throw new BadRequestException({ code: "INVALID_PRODUCT_CATEGORY", message: "Categoria deve ser PART ou RESALE_GOOD." });
  }
  return value;
}

export function parseProductListQuery(query: Record<string, unknown>): ProductListQuery {
  onlyFields(query, ["page", "pageSize", "status", "search", "category"]);
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
  const search = typeof query.search === "string" ? query.search.trim().replace(/\s+/gu, " ").toLocaleUpperCase("pt-BR") : "";
  if (search.length > 120) throw new BadRequestException({ code: "INVALID_SEARCH", message: "Busca não pode exceder 120 caracteres." });
  return {
    page, pageSize, status: status as ProductListQuery["status"],
    ...(search ? { search } : {}),
    ...(query.category !== undefined ? { category: parseCategory(query.category) } : {}),
  };
}

export function parseCreateProduct(body: unknown): CreateProductInput {
  const input = object(body);
  onlyFields(input, ["internalCode", "description", "category"]);
  return {
    internalCode: cleanProductCode(input.internalCode),
    description: cleanProductDescription(input.description),
    category: parseCategory(input.category),
  };
}

export function parseUpdateProduct(body: unknown): UpdateProductInput {
  const input = object(body);
  onlyFields(input, ["expectedVersion", "internalCode", "description", "category", "isActive"]);
  const expectedVersion = positiveInteger(input.expectedVersion, "expectedVersion");
  const result: UpdateProductInput = { expectedVersion };
  if (Object.hasOwn(input, "internalCode")) result.internalCode = cleanProductCode(input.internalCode);
  if (Object.hasOwn(input, "description")) result.description = cleanProductDescription(input.description);
  if (Object.hasOwn(input, "category")) result.category = parseCategory(input.category);
  if (Object.hasOwn(input, "isActive")) {
    if (typeof input.isActive !== "boolean") throw new BadRequestException({ code: "INVALID_PRODUCT_STATUS", message: "isActive deve ser booleano." });
    result.isActive = input.isActive;
  }
  if (Object.keys(result).length === 1) throw new BadRequestException({ code: "EMPTY_PRODUCT_UPDATE", message: "Informe ao menos um campo para alterar." });
  return result;
}
