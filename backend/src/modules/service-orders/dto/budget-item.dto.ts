import { BadRequestException } from "@nestjs/common";

export type CreateRegisteredLaborInput = { servicePublicId: string; quantity: number; unitPrice?: string };
export type CreateManualLaborInput = { description: string; quantity: number; unitPrice: string };
export type CreateManualPartInput = { description: string; quantity: number; unitPrice: string; unitCost?: string | null };
export type UpdateBudgetItemInput = { expectedVersion: number; quantity?: number; unitPrice?: string; description?: string; unitCost?: string | null };

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
  const input = object(body); fields(input, ["servicePublicId", "quantity", "unitPrice"]);
  if (typeof input.servicePublicId !== "string" || !publicIdPattern.test(input.servicePublicId)) {
    throw new BadRequestException({ code: "INVALID_PUBLIC_ID", message: "Serviço inválido." });
  }
  const quantity = parseBudgetQuantity(input.quantity ?? 1)!;
  const unitPrice = input.unitPrice === undefined ? undefined : parseBudgetMoney(input.unitPrice, "Valor unitário")!;
  return { servicePublicId: input.servicePublicId, quantity, ...(unitPrice !== undefined ? { unitPrice } : {}) };
}

export function parseCreateManualLabor(body: unknown): CreateManualLaborInput {
  const input = object(body); fields(input, ["description", "quantity", "unitPrice"]);
  return { description: cleanDescription(input.description), quantity: parseBudgetQuantity(input.quantity ?? 1)!, unitPrice: parseBudgetMoney(input.unitPrice, "Valor unitário")! };
}

export function parseCreateManualPart(body: unknown): CreateManualPartInput {
  const input = object(body); fields(input, ["description", "quantity", "unitPrice", "unitCost"]);
  return {
    description: cleanDescription(input.description), quantity: parseBudgetQuantity(input.quantity ?? 1)!,
    unitPrice: parseBudgetMoney(input.unitPrice, "Valor unitário")!,
    ...(Object.hasOwn(input, "unitCost") ? { unitCost: parseBudgetMoney(input.unitCost, "Custo unitário", true) } : {}),
  };
}

export function parseUpdateBudgetItem(body: unknown): UpdateBudgetItemInput {
  const input = object(body); fields(input, ["expectedVersion", "quantity", "unitPrice", "description", "unitCost"]);
  if (!Number.isSafeInteger(input.expectedVersion) || Number(input.expectedVersion) < 1) {
    throw new BadRequestException({ code: "INVALID_VERSION", message: "Versão do item inválida." });
  }
  const result: UpdateBudgetItemInput = { expectedVersion: Number(input.expectedVersion) };
  if (Object.hasOwn(input, "quantity")) result.quantity = parseBudgetQuantity(input.quantity)!;
  if (Object.hasOwn(input, "unitPrice")) result.unitPrice = parseBudgetMoney(input.unitPrice, "Valor unitário")!;
  if (Object.hasOwn(input, "description")) result.description = cleanDescription(input.description);
  if (Object.hasOwn(input, "unitCost")) result.unitCost = parseBudgetMoney(input.unitCost, "Custo unitário", true);
  if (Object.keys(result).length === 1) throw new BadRequestException({ code: "EMPTY_BUDGET_ITEM_UPDATE", message: "Informe ao menos um campo para alterar." });
  return result;
}
