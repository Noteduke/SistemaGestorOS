import { BadRequestException } from "@nestjs/common";

export interface ListServiceOrderHistoryQuery { pageSize: number; cursor?: string }

export function parseListServiceOrderHistoryQuery(query: Record<string, unknown>): ListServiceOrderHistoryQuery {
  const unknown = Object.keys(query).filter((key) => key !== "pageSize" && key !== "cursor");
  if (unknown.length) throw new BadRequestException({ code: "UNSUPPORTED_QUERY", message: "Parâmetro de consulta não permitido.", details: { fields: unknown } });
  if (typeof query.pageSize !== "string" || !/^\d+$/u.test(query.pageSize)) {
    throw invalidPagination();
  }
  const pageSize = Number(query.pageSize);
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) throw invalidPagination();
  if (query.cursor !== undefined && (typeof query.cursor !== "string" || !/^[A-Za-z0-9_-]{1,1024}$/u.test(query.cursor))) {
    throw invalidPagination();
  }
  return { pageSize, ...(query.cursor === undefined ? {} : { cursor: query.cursor as string }) };
}

export function invalidPagination(): BadRequestException {
  return new BadRequestException({ code: "INVALID_PAGINATION", message: "Paginação ou cursor inválido." });
}
