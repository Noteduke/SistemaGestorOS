import { BadRequestException } from "@nestjs/common";

const MAX_INT = 2_147_483_647;

export type ApplyStockPartInput = { quantity: number };
export type ReverseStockPartInput = { quantity: number; defectiveQuantity: number };
export type RemoveBudgetItemInput = { confirmed: boolean; defectiveQuantity: number };

function bodyObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalidBody();
  return value as Record<string, unknown>;
}

function invalidBody(): BadRequestException {
  return new BadRequestException({ code: "INVALID_BODY", message: "Corpo da requisição inválido." });
}

function quantity(value: unknown, field: string, allowZero = false): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" && /^\d+$/u.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(parsed) || parsed > MAX_INT || parsed < (allowZero ? 0 : 1)) {
    throw new BadRequestException({ code: "INVALID_STOCK_QUANTITY", message: `${field} deve ser um inteiro ${allowZero ? "não negativo" : "positivo"} dentro do limite permitido.` });
  }
  return parsed;
}

export function parseApplyStockPart(body: unknown): ApplyStockPartInput {
  const input = bodyObject(body);
  if (Object.keys(input).some((key) => key !== "quantity")) throw new BadRequestException({ code: "UNSUPPORTED_FIELD", message: "A requisição contém campos não permitidos." });
  return { quantity: quantity(input.quantity, "Quantidade") };
}

export function parseReverseStockPart(body: unknown): ReverseStockPartInput {
  const input = bodyObject(body);
  if (Object.keys(input).some((key) => !["quantity", "defectiveQuantity"].includes(key))) throw new BadRequestException({ code: "UNSUPPORTED_FIELD", message: "A requisição contém campos não permitidos." });
  const amount = quantity(input.quantity, "Quantidade");
  const defective = input.defectiveQuantity === undefined ? 0 : quantity(input.defectiveQuantity, "Quantidade defeituosa", true);
  if (defective > amount) throw new BadRequestException({ code: "INVALID_DEFECTIVE_QUANTITY", message: "A quantidade defeituosa não pode exceder a quantidade revertida." });
  return { quantity: amount, defectiveQuantity: defective };
}

export function parseRemoveBudgetItem(body: unknown): RemoveBudgetItemInput {
  if (body === undefined) return { confirmed: false, defectiveQuantity: 0 };
  const input = bodyObject(body);
  if (Object.keys(input).some((key) => !["confirmed", "defectiveQuantity"].includes(key))) throw new BadRequestException({ code: "UNSUPPORTED_FIELD", message: "A requisição contém campos não permitidos." });
  if (input.confirmed !== undefined && input.confirmed !== true) throw invalidBody();
  const defectiveQuantity = input.defectiveQuantity === undefined ? 0 : quantity(input.defectiveQuantity, "Quantidade defeituosa", true);
  return { confirmed: input.confirmed === true, defectiveQuantity };
}
