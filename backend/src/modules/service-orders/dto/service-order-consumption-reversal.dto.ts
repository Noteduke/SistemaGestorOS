import { BadRequestException } from "@nestjs/common";

export type ReverseServiceOrderConsumptionInput = { confirmed: true };

export function parseReverseServiceOrderConsumption(value: unknown): ReverseServiceOrderConsumptionInput {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw invalid();
  }
  const body = value as Record<string, unknown>;
  if (Object.keys(body).length !== 1 || body.confirmed !== true) throw invalid();
  return { confirmed: true };
}

function invalid() {
  return new BadRequestException({
    code: "INVALID_STOCK_CONSUMPTION_REVERSAL",
    message: "Confirme explicitamente a reversão integral da baixa definitiva.",
  });
}
