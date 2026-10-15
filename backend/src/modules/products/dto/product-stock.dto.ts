import { BadRequestException } from "@nestjs/common";

const MAX_MOVEMENT_QUANTITY = 2_147_483_647;

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

function integer(value: unknown, field: string, allowNegative = false): number {
  if ((typeof value !== "string" && typeof value !== "number") || !/^-?\d+$/u.test(String(value))) {
    throw new BadRequestException({ code: "INVALID_STOCK_QUANTITY", message: `${field} deve ser uma quantidade inteira.` });
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || Math.abs(parsed) > MAX_MOVEMENT_QUANTITY || (!allowNegative && parsed < 1) || (allowNegative && parsed === 0)) {
    throw new BadRequestException({ code: "INVALID_STOCK_QUANTITY", message: `${field} deve estar dentro do intervalo permitido e não pode ser zero.` });
  }
  return parsed;
}

export function parseStockQuantityBody(body: unknown): { quantity: number } {
  const input = object(body);
  onlyFields(input, ["quantity"]);
  return { quantity: integer(input.quantity, "quantity") };
}

export function parseStockAdjustmentBody(body: unknown): { quantityDelta: number } {
  const input = object(body);
  onlyFields(input, ["quantityDelta"]);
  return { quantityDelta: integer(input.quantityDelta, "quantityDelta", true) };
}

export function parseStockDisposalBody(body: unknown): { quantity: number; confirmed: true } {
  const input = object(body);
  onlyFields(input, ["quantity", "confirmed"]);
  if (input.confirmed !== true) {
    throw new BadRequestException({ code: "STOCK_DISPOSAL_CONFIRMATION_REQUIRED", message: "Confirme o descarte definitivo antes de continuar." });
  }
  return { quantity: integer(input.quantity, "quantity"), confirmed: true };
}

export type ProductStockMovementsQuery = { page: number; pageSize: number };

export function parseProductStockMovementsQuery(query: Record<string, unknown>): ProductStockMovementsQuery {
  onlyFields(query, ["page", "pageSize"]);
  const page = Number(query.page);
  const pageSize = Number(query.pageSize);
  if (!/^\d+$/u.test(String(query.page)) || !Number.isSafeInteger(page) || page < 1
    || !/^\d+$/u.test(String(query.pageSize)) || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100
    || !Number.isSafeInteger((page - 1) * pageSize)) {
    throw new BadRequestException({ code: "INVALID_PAGINATION", message: "Paginação fora do intervalo permitido." });
  }
  return { page, pageSize };
}
