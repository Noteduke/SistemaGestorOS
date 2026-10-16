import { BadRequestException } from "@nestjs/common";

export type ServiceOrderConsumptionReversalDestination = "AVAILABLE" | "DEFECTIVE";

export type ReverseServiceOrderConsumptionInput = {
  confirmed: true;
  quantity: number;
  destination: ServiceOrderConsumptionReversalDestination;
};

export function parseReverseServiceOrderConsumption(value: unknown): ReverseServiceOrderConsumptionInput {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw invalid();
  }
  const body = value as Record<string, unknown>;
  if (Object.keys(body).length !== 3 || body.confirmed !== true
    || typeof body.quantity !== "number" || !Number.isSafeInteger(body.quantity) || body.quantity < 1
    || !["AVAILABLE", "DEFECTIVE"].includes(String(body.destination))) throw invalid();
  return { confirmed: true, quantity: body.quantity, destination: body.destination as ServiceOrderConsumptionReversalDestination };
}

function invalid() {
  return new BadRequestException({
    code: "INVALID_STOCK_CONSUMPTION_REVERSAL",
    message: "Informe a quantidade, o destino e confirme explicitamente a reversão da baixa definitiva.",
  });
}
