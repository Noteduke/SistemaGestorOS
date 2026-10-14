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

export interface ServiceOrderBudgetItem {
  publicId: string;
  itemType: "SERVICE_LABOR" | "MANUAL_PART";
  origin: "REGISTERED" | "MANUAL";
  servicePublicId: string | null;
  description: string;
  quantity: number;
  unitPrice: string;
  total: string;
  unitCost?: string | null;
  totalCost?: string | null;
  version: number;
  createdAt: string;
}

export interface AvailableCatalogService { publicId: string; name: string; defaultPrice: string }
export interface ServiceOrderBudget { data: ServiceOrderBudgetItem[]; total: string; canReadCosts: boolean }

export interface ServiceOrderOpeningConfirmation {
  publicId: string;
  visibleNumber: string;
  macroStatus: "ABERTA";
  operationalSituation: "TRIAGEM";
}

export interface ServiceOrderEvent {
  eventType: string;
  occurredAt: string;
  visibleNumber: string;
  numberValue: string;
  actor: { publicId: string; username: string } | null;
  payload: Record<string, unknown> | null;
}

export type ServiceOrderHistoryItem =
  | { kind: "SYSTEM_EVENT"; occurredAt: string; actor: { publicId: string; username: string }; eventType: string; serviceOrderNumber: string; payload: Record<string, unknown> | null }
  | { kind: "MANUAL_NOTE"; publicId: string; occurredAt: string; actor: { publicId: string; username: string }; text: string; canDelete: boolean };

export interface ServiceOrderHistoryPage { data: ServiceOrderHistoryItem[]; nextCursor: string | null; hasMore: boolean }

export interface AssignableUser {
  publicId: string;
  username: string;
}

export interface OpeningCustomer {
  publicId: string;
  personType: "PF" | "PJ";
  name: string;
  documentHint: string | null;
}

export interface OpeningEquipment {
  publicId: string;
  type: { publicId: string; name: string };
  brand: { publicId: string; name: string };
  model: string;
  serialNumber: string | null;
  serialIdentificationStatus: "IDENTIFIED" | "NOT_IDENTIFIED";
  owner: { publicId: string; name: string; documentHint?: string | null };
}

export interface OpeningCatalogOption {
  publicId: string;
  name: string;
}

export interface OpeningEquipmentDraft {
  typePublicId: string;
  brandPublicId: string;
  model: string;
  serialIdentificationStatus: "IDENTIFIED" | "NOT_IDENTIFIED";
  serialNumber: string | null;
}

export type OpeningOwnershipDecision = "CANCEL_SELECTION" | "USE_CURRENT_OWNER" | "TRANSFER_TO_CUSTOMER";

export interface OpeningOwnershipPatch {
  customerPublicId?: string;
  equipmentPublicId?: string;
  ownershipDecision: OpeningOwnershipDecision;
}

export interface ServiceOrderOpening {
  publicId: string;
  visibleNumber: string;
  numberValue: string;
  status: "IN_PROGRESS" | "CANCELED" | "CONFIRMED";
  initiatedByUserPublicId: string;
  createdBy: string;
  customerPublicId: string | null;
  customer?: Pick<OpeningCustomer, "publicId" | "name" | "documentHint"> | null;
  equipmentPublicId: string | null;
  equipment?: OpeningEquipment | null;
  equipmentDraft: OpeningEquipmentDraft | null;
  equipmentDraftVersion: number | null;
  transferRequested: boolean;
  transferRequestedByUserPublicId: string | null;
  complaint: string | null;
  createdAt: string;
  updatedAt: string;
  numberReleased?: boolean;
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

export interface ServiceOrderEditControlState {
  held: boolean;
  holder: { publicId: string; username: string } | null;
  isSameUser: boolean;
  expiresAt: string | null;
  isCurrentContext: boolean;
  generation: number;
  heartbeatIntervalSeconds: number;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    message: string,
    readonly details?: Record<string, unknown>,
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
  withdrawBudget = false,
  editToken?: string,
): Promise<{ data: ServiceOrderDetail }> {
  const response = await fetch(`/api/v1/service-orders/${encodeURIComponent(publicId)}/operational-situation`, {
    method: "PATCH",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfToken,
      ...(editToken ? { "X-Service-Order-Edit-Token": editToken } : {}),
    },
    body: JSON.stringify({ operationalSituation, ...(withdrawBudget ? { withdrawBudget: true } : {}) }),
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

export function listAvailableCatalogServices(signal?: AbortSignal) {
  return get<{ data: AvailableCatalogService[] }>("/api/v1/services/available-for-order", signal);
}

export function getServiceOrderBudget(publicId: string, signal?: AbortSignal) {
  return get<ServiceOrderBudget>(`/api/v1/service-orders/${encodeURIComponent(publicId)}/budget-items`, signal);
}

async function mutateBudget<T>(path: string, method: "POST" | "PATCH" | "DELETE", csrfToken: string, body?: unknown, editToken?: string): Promise<T> {
  const response = await fetch(path, {
    method, credentials: "include",
    headers: { Accept: "application/json", "X-CSRF-Token": csrfToken, ...(editToken ? { "X-Service-Order-Edit-Token": editToken } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const root = isRecord(payload) ? payload : undefined;
    const error = root && isRecord(root.error) ? root.error : root;
    throw new ApiError(response.status, typeof error?.code === "string" ? error.code : undefined,
      typeof error?.message === "string" ? error.message : "Não foi possível alterar o orçamento.",
      error && isRecord(error.details) ? error.details : undefined);
  }
  return payload as T;
}

export function addRegisteredBudgetService(publicId: string, body: { servicePublicId: string; quantity: number; unitPrice?: string }, csrfToken: string, editToken?: string) {
  return mutateBudget<{ data: ServiceOrderBudgetItem }>(`/api/v1/service-orders/${encodeURIComponent(publicId)}/budget-items/service`, "POST", csrfToken, body, editToken);
}
export function addManualLaborBudgetItem(publicId: string, body: { description: string; quantity: number; unitPrice: string }, csrfToken: string, editToken?: string) {
  return mutateBudget<{ data: ServiceOrderBudgetItem }>(`/api/v1/service-orders/${encodeURIComponent(publicId)}/budget-items/manual-labor`, "POST", csrfToken, body, editToken);
}
export function addManualPartBudgetItem(publicId: string, body: { description: string; quantity: number; unitPrice: string; unitCost?: string | null }, csrfToken: string, editToken?: string) {
  return mutateBudget<{ data: ServiceOrderBudgetItem }>(`/api/v1/service-orders/${encodeURIComponent(publicId)}/budget-items/manual-part`, "POST", csrfToken, body, editToken);
}
export function updateBudgetItem(publicId: string, itemPublicId: string, body: Record<string, unknown>, csrfToken: string, editToken?: string) {
  return mutateBudget<{ data: ServiceOrderBudgetItem }>(`/api/v1/service-orders/${encodeURIComponent(publicId)}/budget-items/${encodeURIComponent(itemPublicId)}`, "PATCH", csrfToken, body, editToken);
}
export function removeBudgetItem(publicId: string, itemPublicId: string, csrfToken: string, editToken?: string) {
  return mutateBudget<{ data: { removed: boolean; publicId: string; total: string } }>(`/api/v1/service-orders/${encodeURIComponent(publicId)}/budget-items/${encodeURIComponent(itemPublicId)}`, "DELETE", csrfToken, undefined, editToken);
}

async function mutateEditControl<T>(publicId: string, action: "acquire" | "heartbeat" | "release" | "takeover", csrfToken: string, editToken: string): Promise<T> {
  const base = `/api/v1/service-orders/${encodeURIComponent(publicId)}/edit-control`;
  const path = action === "heartbeat" ? `${base}/heartbeat` : action === "takeover" ? `${base}/takeover` : base;
  const response = await fetch(path, { method: action === "release" ? "DELETE" : "POST", credentials: "include", keepalive: action === "release", headers: { Accept: "application/json", "X-CSRF-Token": csrfToken, "X-Service-Order-Edit-Token": editToken } });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const root = isRecord(payload) ? payload : undefined;
    const error = root && isRecord(root.error) ? root.error : root;
    throw new ApiError(response.status, typeof error?.code === "string" ? error.code : undefined, typeof error?.message === "string" ? error.message : "Não foi possível atualizar o controle de edição.", error && isRecord(error.details) ? error.details : undefined);
  }
  return payload as T;
}

export function getServiceOrderEditControl(publicId: string, editToken: string, signal?: AbortSignal) {
  return fetch(`/api/v1/service-orders/${encodeURIComponent(publicId)}/edit-control`, { method: "GET", credentials: "include", headers: { Accept: "application/json", "X-Service-Order-Edit-Token": editToken }, signal })
    .then(async (response) => {
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new ApiError(response.status, undefined, "Não foi possível consultar o controle de edição.");
      return payload as { data: ServiceOrderEditControlState };
    });
}
export function acquireServiceOrderEditControl(publicId: string, csrfToken: string, editToken: string) { return mutateEditControl<{ data: { acquired: boolean; expiresAt: string; generation: number; heartbeatIntervalSeconds: number } }>(publicId, "acquire", csrfToken, editToken); }
export function heartbeatServiceOrderEditControl(publicId: string, csrfToken: string, editToken: string) { return mutateEditControl<{ data: { renewed: boolean; expiresAt: string } }>(publicId, "heartbeat", csrfToken, editToken); }
export function releaseServiceOrderEditControl(publicId: string, csrfToken: string, editToken: string) { return mutateEditControl<{ data: { released: boolean } }>(publicId, "release", csrfToken, editToken); }
export function takeoverServiceOrderEditControl(publicId: string, csrfToken: string, editToken: string) { return mutateEditControl<{ data: { acquired: boolean; expiresAt: string; generation: number; heartbeatIntervalSeconds: number } }>(publicId, "takeover", csrfToken, editToken); }

export function listAssignableUsers(page: number, pageSize: number, search = "", signal?: AbortSignal) {
  const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (search.trim()) query.set("search", search.trim());
  return get<Paginated<AssignableUser>>(`/api/v1/users/assignable?${query}`, signal);
}

export async function replaceServiceOrderAssignments(
  publicId: string,
  userPublicIds: string[],
  csrfToken: string,
  editToken?: string,
): Promise<{ data: ServiceOrderDetail }> {
  const response = await fetch(`/api/v1/service-orders/${encodeURIComponent(publicId)}/assignments`, {
    method: "PUT",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfToken,
      ...(editToken ? { "X-Service-Order-Edit-Token": editToken } : {}),
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

export function getCurrentServiceOrderOpening(signal?: AbortSignal) {
  return get<{ data: ServiceOrderOpening }>("/api/v1/service-orders/openings/current", signal);
}

export function listOpeningCustomers(page: number, pageSize: number, search = "", signal?: AbortSignal) {
  const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (search.trim()) query.set("search", search.trim());
  return get<Paginated<OpeningCustomer>>(`/api/v1/people/customers?${query}`, signal);
}

export function listOpeningEquipment(page: number, pageSize: number, search = "", signal?: AbortSignal) {
  const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (search.trim()) query.set("search", search.trim());
  return get<Paginated<OpeningEquipment>>(`/api/v1/equipment/opening-search?${query}`, signal);
}

export function listOpeningEquipmentTypes(page: number, pageSize: number, search = "", signal?: AbortSignal) {
  const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (search.trim()) query.set("search", search.trim());
  return get<Paginated<OpeningCatalogOption>>(`/api/v1/equipment-types?${query}`, signal);
}

export function listOpeningEquipmentBrands(page: number, pageSize: number, search = "", signal?: AbortSignal) {
  const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (search.trim()) query.set("search", search.trim());
  return get<Paginated<OpeningCatalogOption>>(`/api/v1/equipment-brands?${query}`, signal);
}

export async function updateServiceOrderOpeningCustomer(
  publicId: string,
  customerPublicId: string,
  csrfToken: string,
): Promise<{ data: ServiceOrderOpening }> {
  const response = await fetch(`/api/v1/service-orders/openings/${encodeURIComponent(publicId)}`, {
    method: "PATCH",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfToken,
    },
    body: JSON.stringify({ customerPublicId }),
  });

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const responseBody = isRecord(body) ? body : undefined;
    const errorBody = responseBody && isRecord(responseBody.error) ? responseBody.error : responseBody;
    throw new ApiError(
      response.status,
      typeof errorBody?.code === "string" ? errorBody.code : undefined,
      typeof errorBody?.message === "string" ? errorBody.message : "Não foi possível salvar o cliente da abertura.",
    );
  }

  return body as { data: ServiceOrderOpening };
}

export async function updateServiceOrderOpeningEquipment(
  publicId: string,
  equipmentPublicId: string,
  csrfToken: string,
): Promise<{ data: ServiceOrderOpening }> {
  const response = await fetch(`/api/v1/service-orders/openings/${encodeURIComponent(publicId)}`, {
    method: "PATCH",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfToken,
    },
    body: JSON.stringify({ equipmentPublicId }),
  });

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const responseBody = isRecord(body) ? body : undefined;
    const errorBody = responseBody && isRecord(responseBody.error) ? responseBody.error : responseBody;
    throw new ApiError(
      response.status,
      typeof errorBody?.code === "string" ? errorBody.code : undefined,
      typeof errorBody?.message === "string" ? errorBody.message : "Não foi possível salvar o equipamento da abertura.",
    );
  }

  return body as { data: ServiceOrderOpening };
}

export async function updateServiceOrderOpeningOwnership(
  publicId: string,
  patch: OpeningOwnershipPatch,
  csrfToken: string,
): Promise<{ data: ServiceOrderOpening }> {
  const response = await fetch(`/api/v1/service-orders/openings/${encodeURIComponent(publicId)}`, {
    method: "PATCH",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfToken,
    },
    body: JSON.stringify(patch),
  });

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const responseBody = isRecord(body) ? body : undefined;
    const errorBody = responseBody && isRecord(responseBody.error) ? responseBody.error : responseBody;
    throw new ApiError(
      response.status,
      typeof errorBody?.code === "string" ? errorBody.code : undefined,
      typeof errorBody?.message === "string" ? errorBody.message : "Não foi possível salvar a decisão de titularidade.",
    );
  }

  return body as { data: ServiceOrderOpening };
}

export async function updateServiceOrderOpeningEquipmentDraft(
  publicId: string,
  equipmentDraft: OpeningEquipmentDraft,
  csrfToken: string,
): Promise<{ data: ServiceOrderOpening }> {
  const response = await fetch(`/api/v1/service-orders/openings/${encodeURIComponent(publicId)}`, {
    method: "PATCH",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfToken,
    },
    body: JSON.stringify({ equipmentDraft }),
  });

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const responseBody = isRecord(body) ? body : undefined;
    const errorBody = responseBody && isRecord(responseBody.error) ? responseBody.error : responseBody;
    throw new ApiError(
      response.status,
      typeof errorBody?.code === "string" ? errorBody.code : undefined,
      typeof errorBody?.message === "string" ? errorBody.message : "Não foi possível salvar o novo equipamento na abertura.",
    );
  }

  return body as { data: ServiceOrderOpening };
}

async function mutateOpening(path: string, csrfToken: string): Promise<{ data: ServiceOrderOpening }> {
  const response = await fetch(path, {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfToken,
    },
    body: "{}",
  });

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const responseBody = isRecord(body) ? body : undefined;
    const errorBody = responseBody && isRecord(responseBody.error) ? responseBody.error : responseBody;
    throw new ApiError(
      response.status,
      typeof errorBody?.code === "string" ? errorBody.code : undefined,
      typeof errorBody?.message === "string" ? errorBody.message : "Não foi possível concluir a abertura da OS.",
    );
  }

  return body as { data: ServiceOrderOpening };
}

export function createServiceOrderOpening(csrfToken: string) {
  return mutateOpening("/api/v1/service-orders/openings", csrfToken);
}

export function cancelServiceOrderOpening(publicId: string, csrfToken: string) {
  return mutateOpening(`/api/v1/service-orders/openings/${encodeURIComponent(publicId)}/cancel`, csrfToken);
}

export async function confirmServiceOrderOpening(
  publicId: string,
  csrfToken: string,
): Promise<{ data: ServiceOrderOpeningConfirmation }> {
  const response = await fetch(`/api/v1/service-orders/openings/${encodeURIComponent(publicId)}/confirm`, {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfToken,
    },
    body: "{}",
  });

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const responseBody = isRecord(body) ? body : undefined;
    const errorBody = responseBody && isRecord(responseBody.error) ? responseBody.error : responseBody;
    throw new ApiError(
      response.status,
      typeof errorBody?.code === "string" ? errorBody.code : undefined,
      typeof errorBody?.message === "string" ? errorBody.message : "Não foi possível confirmar a Ordem de Serviço.",
    );
  }

  return body as { data: ServiceOrderOpeningConfirmation };
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

export function listServiceOrderHistory(publicId: string, pageSize: number, cursor?: string, signal?: AbortSignal) {
  const query = new URLSearchParams({ pageSize: String(pageSize) });
  if (cursor) query.set("cursor", cursor);
  return get<ServiceOrderHistoryPage>(`/api/v1/service-orders/${encodeURIComponent(publicId)}/history?${query}`, signal);
}

async function mutateNote(path: string, method: "POST" | "DELETE", csrfToken: string, text?: string): Promise<void> {
  const response = await fetch(path, {
    method,
    credentials: "include",
    headers: { Accept: "application/json", "X-CSRF-Token": csrfToken, ...(text === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(text === undefined ? {} : { body: JSON.stringify({ text }) }),
  });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const responseBody = isRecord(body) ? body : undefined;
    const errorBody = responseBody && isRecord(responseBody.error) ? responseBody.error : responseBody;
    throw new ApiError(response.status, typeof errorBody?.code === "string" ? errorBody.code : undefined,
      typeof errorBody?.message === "string" ? errorBody.message : "Não foi possível alterar a observação.");
  }
}

export function createServiceOrderNote(publicId: string, text: string, csrfToken: string) {
  return mutateNote(`/api/v1/service-orders/${encodeURIComponent(publicId)}/notes`, "POST", csrfToken, text);
}

export function deleteServiceOrderNote(publicId: string, notePublicId: string, csrfToken: string) {
  return mutateNote(`/api/v1/service-orders/${encodeURIComponent(publicId)}/notes/${encodeURIComponent(notePublicId)}`, "DELETE", csrfToken);
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
