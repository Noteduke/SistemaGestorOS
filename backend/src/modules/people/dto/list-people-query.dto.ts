import { BadRequestException } from "@nestjs/common";

export interface ListPeopleQuery {
  page: number;
  pageSize: number;
  search?: string;
  includeInactive: boolean;
}

function positiveInteger(value: string | undefined, name: string): number {
  if (!value || !/^\d+$/.test(value) || Number(value) < 1) {
    throw new BadRequestException({ code: "INVALID_PAGINATION", message: `${name} deve ser um inteiro positivo.` });
  }
  return Number(value);
}

export function parseListPeopleQuery(query: Record<string, unknown>): ListPeopleQuery {
  const allowed = new Set(["page", "pageSize", "search", "includeInactive"]);
  const unknown = Object.keys(query).filter((key) => !allowed.has(key));
  if (unknown.length) {
    throw new BadRequestException({ code: "UNSUPPORTED_QUERY", message: "Parâmetro de consulta não permitido.", details: { fields: unknown } });
  }

  const page = positiveInteger(typeof query.page === "string" ? query.page : undefined, "page");
  const pageSize = positiveInteger(typeof query.pageSize === "string" ? query.pageSize : undefined, "pageSize");
  if (pageSize > 100) {
    throw new BadRequestException({ code: "INVALID_PAGINATION", message: "pageSize não pode exceder 100." });
  }
  if (query.search !== undefined && typeof query.search !== "string") {
    throw new BadRequestException({ code: "INVALID_SEARCH", message: "search deve ser texto." });
  }
  if (query.includeInactive !== undefined && query.includeInactive !== "true" && query.includeInactive !== "false") {
    throw new BadRequestException({ code: "INVALID_FILTER", message: "includeInactive deve ser true ou false." });
  }

  return {
    page,
    pageSize,
    ...(typeof query.search === "string" && query.search.trim() ? { search: query.search.trim() } : {}),
    includeInactive: query.includeInactive === "true",
  };
}
