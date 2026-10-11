export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  data: T[];
  pagination: Pagination;
}

export interface ServiceOrderSummary {
  publicId: string;
  openingPublicId: string;
  visibleNumber: string;
  numberValue: string;
  macroStatus: string;
  operationalSituation: string;
  customer: { publicId: string; name: string };
  equipment: {
    publicId: string;
    type: string;
    brand: string;
    model: string;
    serialNumber: string | null;
    ownerPublicId: string;
  };
  openedAt: string;
  createdAt: string;
  updatedAt: string;
  confirmedAt: string;
}

export interface ServiceOrderDetail extends ServiceOrderSummary {
  complaint: string | null;
  intakeObservations: string | null;
  newEquipmentSerialIdentificationStatus: string | null;
  createdByUserPublicId: string;
  assignedUserPublicIds: string[];
  snapshotVersion: number;
  snapshotCapturedAt: string;
  customerSnapshotJson: unknown;
  equipmentSnapshotJson: unknown;
}

export interface ServiceOrderEvent {
  eventType: string;
  occurredAt: string;
  visibleNumber: string;
  numberValue: string;
  actor: { publicId: string; username: string } | null;
  payload: Record<string, unknown> | null;
}

export interface AssignableUser {
  publicId: string;
  username: string;
}

export const operationalSituationOptions = [
  { value: "TRIAGE", label: "TRIAGEM" },
  { value: "AWAITING_EVALUATION_BUDGET", label: "AGUARDANDO AVALIAÇÃO/ORÇAMENTO" },
  { value: "AWAITING_BUDGET_APPROVAL", label: "AGUARDANDO APROVAÇÃO DO ORÇAMENTO" },
  { value: "REPAIR_AUTHORIZED", label: "AUTORIZADO REPARO" },
  { value: "AWAITING_PART_PURCHASE", label: "AGUARDANDO COMPRA DE PEÇA" },
  { value: "AWAITING_PART_ARRIVAL", label: "AGUARDANDO CHEGADA DE PEÇA" },
  { value: "READY_TO_NOTIFY_CUSTOMER", label: "PRONTO AVISAR CLIENTE" },
  { value: "READY_CUSTOMER_NOTIFIED", label: "PRONTO CLIENTE AVISADO" },
  { value: "NOT_AUTHORIZED_REASSEMBLE", label: "NÃO AUTORIZADO - REMONTAR EQUIPAMENTO" },
  { value: "NOT_AUTHORIZED_READY_DELIVERY", label: "NÃO AUTORIZADO - PRONTO PRA ENTREGA" },
] as const;

export type OperationalSituation = (typeof operationalSituationOptions)[number]["value"];

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json" },
    signal,
  });

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const responseBody = isRecord(body) ? body : undefined;
    const errorBody = responseBody && isRecord(responseBody.error) ? responseBody.error : responseBody;
    throw new ApiError(
      response.status,
      typeof errorBody?.code === "string" ? errorBody.code : undefined,
      typeof errorBody?.message === "string" ? errorBody.message : "Não foi possível concluir a consulta.",
    );
  }

  return body as T;
}

export async function updateServiceOrderOperationalSituation(
  publicId: string,
  operationalSituation: OperationalSituation,
  csrfToken: string,
): Promise<{ data: ServiceOrderDetail }> {
  const response = await fetch(`/api/v1/service-orders/${encodeURIComponent(publicId)}/operational-situation`, {
    method: "PATCH",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfToken,
    },
    body: JSON.stringify({ operationalSituation }),
  });

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const responseBody = isRecord(body) ? body : undefined;
    const errorBody = responseBody && isRecord(responseBody.error) ? responseBody.error : responseBody;
    throw new ApiError(
      response.status,
      typeof errorBody?.code === "string" ? errorBody.code : undefined,
      typeof errorBody?.message === "string" ? errorBody.message : "Não foi possível alterar a situação operacional.",
    );
  }

  return body as { data: ServiceOrderDetail };
}

export function listAssignableUsers(page: number, pageSize: number, search = "", signal?: AbortSignal) {
  const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (search.trim()) query.set("search", search.trim());
  return get<Paginated<AssignableUser>>(`/api/v1/users/assignable?${query}`, signal);
}

export async function replaceServiceOrderAssignments(
  publicId: string,
  userPublicIds: string[],
  csrfToken: string,
): Promise<{ data: ServiceOrderDetail }> {
  const response = await fetch(`/api/v1/service-orders/${encodeURIComponent(publicId)}/assignments`, {
    method: "PUT",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfToken,
    },
    body: JSON.stringify({ userPublicIds }),
  });

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const responseBody = isRecord(body) ? body : undefined;
    const errorBody = responseBody && isRecord(responseBody.error) ? responseBody.error : responseBody;
    throw new ApiError(
      response.status,
      typeof errorBody?.code === "string" ? errorBody.code : undefined,
      typeof errorBody?.message === "string" ? errorBody.message : "Não foi possível alterar os responsáveis da OS.",
    );
  }

  return body as { data: ServiceOrderDetail };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function listServiceOrders(page: number, pageSize: number, signal?: AbortSignal) {
  const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  return get<Paginated<ServiceOrderSummary>>(`/api/v1/service-orders?${query}`, signal);
}

export function getServiceOrder(publicId: string, signal?: AbortSignal) {
  return get<{ data: ServiceOrderDetail }>(`/api/v1/service-orders/${encodeURIComponent(publicId)}`, signal);
}

export function listServiceOrderEvents(publicId: string, page: number, pageSize: number, signal?: AbortSignal) {
  const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  return get<Paginated<ServiceOrderEvent>>(
    `/api/v1/service-orders/${encodeURIComponent(publicId)}/events?${query}`,
    signal,
  );
}

export function errorMessage(error: unknown, context: "list" | "detail" | "events"): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Sua sessão é necessária para consultar as Ordens de Serviço.";
    if (error.status === 403) return "Seu usuário não tem permissão para consultar estas informações.";
    if (error.status === 404 && context !== "list") return "Ordem de Serviço não encontrada.";
    if (error.status === 400 && error.code === "INVALID_PAGINATION") return "A paginação solicitada é inválida.";
    return error.message;
  }
  return "Não foi possível conectar ao serviço. Tente novamente.";
}

export function operationalSituationErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Sua sessão expirou ou não está autenticada. Entre novamente para alterar a situação.";
    if (error.status === 403) return "Você não tem permissão para alterar a situação operacional.";
    if (error.status === 404) return "Ordem de Serviço não encontrada.";
    if (error.status === 400 || error.status === 422) return "A situação selecionada é inválida.";
    return error.message;
  }
  return "Não foi possível conectar ao serviço. Tente novamente.";
}

export function assignmentsErrorMessage(error: unknown, context: "list" | "update"): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return context === "list"
      ? "Sua sessão expirou ou não está autenticada. Entre novamente para consultar responsáveis."
      : "Sua sessão expirou ou não está autenticada. Entre novamente para alterar responsáveis.";
    if (error.status === 403) return context === "list"
      ? "Você não tem permissão para consultar usuários atribuíveis e alterar responsáveis da OS."
      : "Você não tem permissão para alterar os responsáveis da OS.";
    if (error.status === 404) return "Ordem de Serviço não encontrada.";
    if (error.status === 400 || error.status === 422) return "A lista de responsáveis é inválida. Revise a seleção e tente novamente.";
    if (error.status === 409) return "Um usuário selecionado não existe mais ou está inativo. Remova-o da seleção e tente novamente.";
    return context === "list" ? "Não foi possível carregar os usuários atribuíveis." : "Não foi possível salvar os responsáveis da OS.";
  }
  return "Não foi possível conectar ao serviço. Tente novamente.";
}
