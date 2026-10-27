import { BadRequestException } from "@nestjs/common";
import { ServiceOrderTechnicalCompletion } from "../../../generated/prisma/enums.js";

export interface ListServiceOrdersQuery {
  page: number;
  pageSize: number;
  technicalCompletion?: ServiceOrderTechnicalCompletion;
  awaitingPickup?: boolean;
  equipmentPublicId?: string;
  statusPublicId?: string;
  state?: "OPEN" | "CLOSED" | "CANCELED";
  technicianPublicId?: string;
  unassigned?: boolean;
  dateField?: "entry" | "exit";
  dateFrom?: string;
  dateTo?: string;
  dateStart?: Date;
  dateEnd?: Date;
}

function positiveInteger(value: unknown, name: string): number {
  if (typeof value !== "string" || !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) {
    throw new BadRequestException({ code: "INVALID_PAGINATION", message: `${name} deve ser um inteiro positivo.` });
  }
  return Number(value);
}

export function parseListServiceOrdersQuery(query: Record<string, unknown>): ListServiceOrdersQuery {
  const unknown = Object.keys(query).filter((key) => !["page", "pageSize", "technicalCompletion", "awaitingPickup", "equipmentPublicId", "statusPublicId", "state", "technicianPublicId", "unassigned", "dateField", "dateFrom", "dateTo", "warranty"].includes(key));
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
  if (query.equipmentPublicId !== undefined && (typeof query.equipmentPublicId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(query.equipmentPublicId))) throw new BadRequestException({ code: "INVALID_EQUIPMENT", message: "Equipamento inválido." });
  if (awaitingPickup !== undefined && awaitingPickup !== "true" && awaitingPickup !== "false") {
    throw new BadRequestException({ code: "INVALID_AWAITING_PICKUP", message: "awaitingPickup deve ser true ou false." });
  }
  const fail = (message: string): never => { throw new BadRequestException({ code: "INVALID_FILTER", message }); };
  const extra: Partial<ListServiceOrdersQuery> = {};
  for (const key of ["statusPublicId", "technicianPublicId"] as const) if (query[key] !== undefined) {
    if (typeof query[key] !== "string" || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(query[key])) fail("Identificador de filtro inválido.");
    extra[key] = query[key] as string;
  }
  if (query.state !== undefined) { if (!["OPEN", "CLOSED", "CANCELED"].includes(query.state as string)) fail("Estado inválido."); extra.state = query.state as ListServiceOrdersQuery["state"]; }
  if (query.unassigned !== undefined) { if (!["true", "false"].includes(query.unassigned as string)) fail("Filtro de técnico inválido."); extra.unassigned = query.unassigned === "true"; }
  if (extra.unassigned && extra.technicianPublicId) fail("Escolha um técnico ou sem técnico.");
  if (query.warranty !== undefined && query.warranty !== "all") fail("Garantia ainda não possui classificação implementada. Nenhuma cobertura foi presumida.");
  if (query.dateField !== undefined) { if (!["entry", "exit"].includes(query.dateField as string)) fail("Campo de data inválido."); extra.dateField = query.dateField as "entry" | "exit"; }
  for (const key of ["dateFrom", "dateTo"] as const) if (query[key] !== undefined) {
    const value = query[key]; if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000") || !Number.isFinite(Date.parse(value+"T00:00:00Z")) || new Date(value+"T00:00:00Z").toISOString().slice(0,10) !== value) fail("Data inválida.");
    extra[key] = value as string;
  }
  if (extra.dateFrom || extra.dateTo) {
    if (!extra.dateField) fail("Escolha o campo de data.");
    if (extra.dateFrom && extra.dateTo && extra.dateFrom > extra.dateTo) fail("Data inicial deve ser anterior ou igual à final.");
    // São Paulo: IANA resolves historical DST, rather than using an UTC day.
    const midnight = (day: string) => {
      let instant = new Date(day+"T00:00:00Z");
      const fmt = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo", year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23" });
      for (let i=0;i<3;i++) { const local=fmt.format(instant).replace(" ","T"); const offset=Date.parse(local+"Z")-instant.getTime(); instant=new Date(Date.parse(day+"T00:00:00Z")-offset); }
      return instant;
    };
    if (extra.dateFrom) extra.dateStart = midnight(extra.dateFrom);
    if (extra.dateTo) { const next = new Date(extra.dateTo+"T12:00:00Z"); next.setUTCDate(next.getUTCDate()+1); extra.dateEnd = midnight(next.toISOString().slice(0,10)); }
  }
  return { page, pageSize, ...extra, ...(query.equipmentPublicId ? { equipmentPublicId: query.equipmentPublicId as string } : {}), ...(technicalCompletion ? { technicalCompletion: technicalCompletion as ServiceOrderTechnicalCompletion } : {}), ...(awaitingPickup === "true" ? { awaitingPickup: true } : {}) };
}
