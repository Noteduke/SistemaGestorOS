import { BadRequestException } from "@nestjs/common";

export interface ListServiceOrderEventsQuery {
  page: number;
  pageSize: number;
}

function positiveInteger(value: unknown, name: string): number {
  if (typeof value !== "string" || !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) {
    throw new BadRequestException({ code: "INVALID_PAGINATION", message: `${name} deve ser um inteiro positivo.` });
  }
  return Number(value);
}

export function parseListServiceOrderEventsQuery(query: Record<string, unknown>): ListServiceOrderEventsQuery {
  const unknown = Object.keys(query).filter((key) => key !== "page" && key !== "pageSize");
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
  return { page, pageSize };
}
