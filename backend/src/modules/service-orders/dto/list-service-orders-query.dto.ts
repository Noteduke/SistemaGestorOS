import { BadRequestException } from "@nestjs/common";
import { ServiceOrderTechnicalCompletion } from "../../../generated/prisma/enums.js";

export interface ListServiceOrdersQuery {
  page: number;
  pageSize: number;
  technicalCompletion?: ServiceOrderTechnicalCompletion;
  awaitingPickup?: boolean;
}

function positiveInteger(value: unknown, name: string): number {
  if (typeof value !== "string" || !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) {
    throw new BadRequestException({ code: "INVALID_PAGINATION", message: `${name} deve ser um inteiro positivo.` });
  }
  return Number(value);
}

export function parseListServiceOrdersQuery(query: Record<string, unknown>): ListServiceOrdersQuery {
  const unknown = Object.keys(query).filter((key) => !["page", "pageSize", "technicalCompletion", "awaitingPickup"].includes(key));
  if (unknown.length) {
    throw new BadRequestException({ code: "UNSUPPORTED_QUERY", message: "Parâmetro de consulta não permitido.", details: { fields: unknown } });
  }
  const page = positiveInteger(query.page, "page");
  const pageSize = positiveInteger(query.pageSize, "pageSize");
  if (pageSize > 100) {
    throw new BadRequestException({ code: "INVALID_PAGINATION", message: "pageSize não pode exceder 100." });
  }
  if (!Number.isSafeInteger((page - 1) * pageSize)) {
    throw new BadRequestException({ code: "INVALID_PAGINATION", message: "A página excede o intervalo permitido." });
  }
  const technicalCompletion = query.technicalCompletion;
  if (technicalCompletion !== undefined && !Object.values(ServiceOrderTechnicalCompletion).includes(technicalCompletion as ServiceOrderTechnicalCompletion)) {
    throw new BadRequestException({ code: "INVALID_TECHNICAL_COMPLETION", message: "Conclusão técnica inválida." });
  }
  const awaitingPickup = query.awaitingPickup;
  if (awaitingPickup !== undefined && awaitingPickup !== "true" && awaitingPickup !== "false") {
    throw new BadRequestException({ code: "INVALID_AWAITING_PICKUP", message: "awaitingPickup deve ser true ou false." });
  }
  return { page, pageSize, ...(technicalCompletion ? { technicalCompletion: technicalCompletion as ServiceOrderTechnicalCompletion } : {}), ...(awaitingPickup === "true" ? { awaitingPickup: true } : {}) };
}
