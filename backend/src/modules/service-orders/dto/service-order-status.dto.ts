import { BadRequestException } from "@nestjs/common";
import { ServiceOrderTechnicalCompletion } from "../../../generated/prisma/enums.js";

export interface ServiceOrderStatusInput {
  name: string;
  technicalCompletion: ServiceOrderTechnicalCompletion;
}

export function parseServiceOrderStatusInput(body: unknown): ServiceOrderStatusInput {
  if (!isRecord(body) || Object.keys(body).some((key) => !["name", "technicalCompletion"].includes(key))) {
    throw new BadRequestException({ code: "INVALID_SERVICE_ORDER_STATUS", message: "Informe os dados válidos do status." });
  }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 191 || !Object.values(ServiceOrderTechnicalCompletion).includes(body.technicalCompletion as ServiceOrderTechnicalCompletion)) {
    throw new BadRequestException({ code: "INVALID_SERVICE_ORDER_STATUS", message: "Nome, conclusão técnica ou retirada do orçamento inválidos." });
  }
  return { name, technicalCompletion: body.technicalCompletion as ServiceOrderTechnicalCompletion };
}

export function parseServiceOrderStatusPatch(body: unknown): ServiceOrderStatusInput & { expectedVersion: number } {
  if (!isRecord(body) || !Number.isSafeInteger(body.expectedVersion) || Number(body.expectedVersion) < 1) {
    throw new BadRequestException({ code: "INVALID_SERVICE_ORDER_STATUS_VERSION", message: "Informe a versão atual do status." });
  }
  return { ...parseServiceOrderStatusInput({ name: body.name, technicalCompletion: body.technicalCompletion }), expectedVersion: Number(body.expectedVersion) };
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
