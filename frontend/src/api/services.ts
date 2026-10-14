export interface CatalogService {
  publicId: string;
  name: string;
  defaultPrice: string;
  isActive: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ServicePage {
  data: CatalogService[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

export type ServiceFilter = "active" | "inactive" | "all";

export class ServiceApiError extends Error {
  constructor(readonly status: number, readonly code: string | undefined, message: string) {
    super(message);
    this.name = "ServiceApiError";
  }
}

async function request<T>(path: string, method = "GET", csrfToken?: string, payload?: object, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, {
    method,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(payload ? { "Content-Type": "application/json" } : {}),
      ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
    },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
    signal,
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const root = isRecord(body) ? body : undefined;
    const error = root && isRecord(root.error) ? root.error : root;
    throw new ServiceApiError(
      response.status,
      typeof error?.code === "string" ? error.code : undefined,
      typeof error?.message === "string" ? error.message : "Não foi possível concluir a operação.",
    );
  }
  return body as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function listServices(page: number, status: ServiceFilter, search: string, signal?: AbortSignal): Promise<ServicePage> {
  const query = new URLSearchParams({ page: String(page), pageSize: "20", status });
  if (search.trim()) query.set("search", search.trim());
  return request<ServicePage>(`/api/v1/services?${query}`, "GET", undefined, undefined, signal);
}

export function createService(name: string, defaultPrice: string, csrfToken: string) {
  return request<{ data: CatalogService }>("/api/v1/services", "POST", csrfToken, { name, defaultPrice });
}

export function changeServicePrice(service: CatalogService, defaultPrice: string, csrfToken: string) {
  return request<{ data: CatalogService }>(`/api/v1/services/${encodeURIComponent(service.publicId)}`, "PATCH", csrfToken, {
    defaultPrice, expectedVersion: service.version,
  });
}

export function changeServiceActivity(service: CatalogService, isActive: boolean, csrfToken: string) {
  return request<{ data: CatalogService }>(`/api/v1/services/${encodeURIComponent(service.publicId)}`, "PATCH", csrfToken, {
    isActive, expectedVersion: service.version,
  });
}

export function deleteService(service: CatalogService, csrfToken: string) {
  const query = new URLSearchParams({ expectedVersion: String(service.version) });
  return request<{ data: { deleted: boolean; publicId: string } }>(
    `/api/v1/services/${encodeURIComponent(service.publicId)}?${query}`, "DELETE", csrfToken,
  );
}
