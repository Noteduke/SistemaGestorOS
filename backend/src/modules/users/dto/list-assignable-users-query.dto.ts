import { BadRequestException } from "@nestjs/common";

export interface ListAssignableUsersQuery {
  page: number;
  pageSize: number;
  search?: string;
}

function positiveInteger(value: unknown, name: string): number {
  if (typeof value !== "string" || !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) {
    throw new BadRequestException({ code: "INVALID_PAGINATION", message: `${name} deve ser um inteiro positivo.` });
  }
  return Number(value);
}

export function parseListAssignableUsersQuery(query: Record<string, unknown>): ListAssignableUsersQuery {
  const allowed = new Set(["page", "pageSize", "search"]);
  const unknown = Object.keys(query).filter((key) => !allowed.has(key));
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
  if (query.search !== undefined && typeof query.search !== "string") {
    throw new BadRequestException({ code: "INVALID_SEARCH", message: "search deve ser texto." });
  }

  const search = typeof query.search === "string" ? query.search.trim().toLowerCase() : "";
  if (search.length > 50) {
    throw new BadRequestException({ code: "INVALID_SEARCH", message: "search não pode exceder 50 caracteres." });
  }

  return { page, pageSize, ...(search ? { search } : {}) };
}
