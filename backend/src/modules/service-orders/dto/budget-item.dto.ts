import { BadRequestException } from "@nestjs/common";

export type CreateRegisteredLaborInput = { servicePublicId: string; quantity: number; unitPrice?: string; compositionToken?: string; compositionConfirmed?: number };
export type CreateManualLaborInput = { description: string; quantity: number; unitPrice: string; compositionToken?: string; compositionConfirmed?: number };
export type CreateManualPartInput = { description: string; quantity: number; unitPrice: string; unitCost?: string | null; compositionToken?: string; compositionConfirmed?: number };
export type BudgetEditableField = "quantity" | "unitPrice" | "description" | "unitCost";
export type UpdateBudgetItemInput = {
  expectedVersion: number;
  snapshotToken?: string;
  original?: Partial<Record<BudgetEditableField, number | string | null>>;
  useMine?: BudgetEditableField[];
  resolvedCurrent?: Partial<Record<BudgetEditableField, number | string | null>>;
  quantity?: number; unitPrice?: string; description?: string; unitCost?: string | null;
};

const publicIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalidBody();
  return value as Record<string, unknown>;
}

function fields(value: Record<string, unknown>, allowed: string[]): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new BadRequestException({ code: "UNSUPPORTED_FIELD", message: "A requisição contém campos não permitidos." });
  }
}

function invalidBody(): BadRequestException {
  return new BadRequestException({ code: "INVALID_BODY", message: "Corpo da requisição inválido." });
}

export function parseBudgetQuantity(value: unknown, optional = false): number | undefined {
  if (value === undefined && optional) return undefined;
  const text = typeof value === "number" ? String(value) : value;
  if (typeof text !== "string" || !/^\d+$/u.test(text) || !Number.isSafeInteger(Number(text)) || Number(text) < 1 || Number(text) > 999) {
    throw new BadRequestException({ code: "INVALID_BUDGET_QUANTITY", message: "Quantidade deve ser um inteiro entre 1 e 999." });
  }
  return Number(text);
}

export function parseBudgetMoney(value: unknown, field: string, nullable = false): string | null {
  if (value === null && nullable) return null;
  if (typeof value !== "string" || !/^(?:0|[1-9]\d{0,5})(?:\.\d{1,2})?$/u.test(value)) {
    throw new BadRequestException({ code: "INVALID_BUDGET_MONEY", message: `${field} deve estar entre 0,00 e 999.999,99, com até duas casas decimais.` });
  }
  const [whole, fraction = ""] = value.split(".");
  return `${whole}.${fraction.padEnd(2, "0")}`;
}

function cleanDescription(value: unknown): string {
  if (typeof value !== "string") throw new BadRequestException({ code: "DESCRIPTION_REQUIRED", message: "Descrição é obrigatória." });
  const description = value.trim().replace(/\s+/gu, " ");
  if (!description) throw new BadRequestException({ code: "DESCRIPTION_REQUIRED", message: "Descrição é obrigatória." });
  if ([...description].length > 255) throw new BadRequestException({ code: "DESCRIPTION_TOO_LONG", message: "Descrição não pode exceder 255 caracteres." });
  return description;
}

export function parseCreateRegisteredLabor(body: unknown): CreateRegisteredLaborInput {
  const input = object(body); fields(input, ["servicePublicId", "quantity", "unitPrice", "compositionToken", "compositionConfirmed"]);
  if (typeof input.servicePublicId !== "string" || !publicIdPattern.test(input.servicePublicId)) {
    throw new BadRequestException({ code: "INVALID_PUBLIC_ID", message: "Serviço inválido." });
  }
  const quantity = parseBudgetQuantity(input.quantity ?? 1)!;
  const unitPrice = input.unitPrice === undefined ? undefined : parseBudgetMoney(input.unitPrice, "Valor unitário")!;
  return { servicePublicId: input.servicePublicId, quantity, ...(unitPrice !== undefined ? { unitPrice } : {}), ...confirmation(input) };
}

function confirmation(input: Record<string, unknown>): { compositionToken?: string; compositionConfirmed?: number } {
  if (input.compositionConfirmed !== undefined && (!Number.isSafeInteger(input.compositionConfirmed) || Number(input.compositionConfirmed) < 1)) throw invalidBody();
  if (input.compositionToken !== undefined && (typeof input.compositionToken !== "string" || input.compositionToken.length > 2048)) throw invalidBody();
  if (input.compositionConfirmed !== undefined && input.compositionToken === undefined) throw invalidBody();
  return { ...(input.compositionToken === undefined ? {} : { compositionToken: input.compositionToken }),
    ...(input.compositionConfirmed === undefined ? {} : { compositionConfirmed: Number(input.compositionConfirmed) }) };
}

export function parseCreateManualLabor(body: unknown): CreateManualLaborInput {
  const input = object(body); fields(input, ["description", "quantity", "unitPrice", "compositionToken", "compositionConfirmed"]);
  return { description: cleanDescription(input.description), quantity: parseBudgetQuantity(input.quantity ?? 1)!, unitPrice: parseBudgetMoney(input.unitPrice, "Valor unitário")!, ...confirmation(input) };
}

export function parseCreateManualPart(body: unknown): CreateManualPartInput {
  const input = object(body); fields(input, ["description", "quantity", "unitPrice", "unitCost", "compositionToken", "compositionConfirmed"]);
  return {
    description: cleanDescription(input.description), quantity: parseBudgetQuantity(input.quantity ?? 1)!,
    unitPrice: parseBudgetMoney(input.unitPrice, "Valor unitário")!,
    ...(Object.hasOwn(input, "unitCost") ? { unitCost: parseBudgetMoney(input.unitCost, "Custo unitário", true) } : {}),
    ...confirmation(input),
  };
}

export function parseUpdateBudgetItem(body: unknown): UpdateBudgetItemInput {
  const input = object(body); fields(input, ["expectedVersion", "snapshotToken", "original", "useMine", "resolvedCurrent", "quantity", "unitPrice", "description", "unitCost"]);
  if (!Number.isSafeInteger(input.expectedVersion) || Number(input.expectedVersion) < 1) {
    throw new BadRequestException({ code: "INVALID_VERSION", message: "Versão do item inválida." });
  }
  const result: UpdateBudgetItemInput = { expectedVersion: Number(input.expectedVersion) };
  if (input.snapshotToken !== undefined) {
    if (typeof input.snapshotToken !== "string" || input.snapshotToken.length > 2048) throw invalidBody();
    result.snapshotToken = input.snapshotToken;
  }
  if (Object.hasOwn(input, "quantity")) result.quantity = parseBudgetQuantity(input.quantity)!;
  if (Object.hasOwn(input, "unitPrice")) result.unitPrice = parseBudgetMoney(input.unitPrice, "Valor unitário")!;
  if (Object.hasOwn(input, "description")) result.description = cleanDescription(input.description);
  if (Object.hasOwn(input, "unitCost")) result.unitCost = parseBudgetMoney(input.unitCost, "Custo unitário", true);
  const changed = (["quantity", "unitPrice", "description", "unitCost"] as const).filter((key) => Object.hasOwn(result, key));
  if (!changed.length) throw new BadRequestException({ code: "EMPTY_BUDGET_ITEM_UPDATE", message: "Informe ao menos um campo para alterar." });
  if (input.original !== undefined && input.snapshotToken === undefined) throw invalidBody();
  if (input.original !== undefined) {
    const original = object(input.original);
    fields(original, changed);
    if (Object.keys(original).length !== changed.length || changed.some((key) => !Object.hasOwn(original, key))) throw invalidBody();
    result.original = {};
    if (Object.hasOwn(original, "quantity")) result.original.quantity = parseBudgetQuantity(original.quantity)!;
    if (Object.hasOwn(original, "unitPrice")) result.original.unitPrice = parseBudgetMoney(original.unitPrice, "Valor unitário")!;
    if (Object.hasOwn(original, "description")) result.original.description = cleanDescription(original.description);
    if (Object.hasOwn(original, "unitCost")) result.original.unitCost = parseBudgetMoney(original.unitCost, "Custo unitário", true);
  }
  if (input.useMine !== undefined) {
    if (!result.original || !Array.isArray(input.useMine) || input.useMine.some((key) => typeof key !== "string" || !changed.includes(key as BudgetEditableField)) || new Set(input.useMine).size !== input.useMine.length) throw invalidBody();
    result.useMine = input.useMine as BudgetEditableField[];
  }
  if (input.resolvedCurrent !== undefined) {
    if (!result.useMine) throw invalidBody();
    const observed = object(input.resolvedCurrent);
    fields(observed, result.useMine);
    if (Object.keys(observed).length !== result.useMine.length || result.useMine.some((key) => !Object.hasOwn(observed, key))) throw invalidBody();
    result.resolvedCurrent = {};
    if (Object.hasOwn(observed, "quantity")) result.resolvedCurrent.quantity = parseBudgetQuantity(observed.quantity)!;
    if (Object.hasOwn(observed, "unitPrice")) result.resolvedCurrent.unitPrice = parseBudgetMoney(observed.unitPrice, "Valor unitário")!;
    if (Object.hasOwn(observed, "description")) result.resolvedCurrent.description = cleanDescription(observed.description);
    if (Object.hasOwn(observed, "unitCost")) result.resolvedCurrent.unitCost = parseBudgetMoney(observed.unitCost, "Custo unitário", true);
  }
  if (result.useMine?.length && !result.resolvedCurrent) throw invalidBody();
  return result;
}
