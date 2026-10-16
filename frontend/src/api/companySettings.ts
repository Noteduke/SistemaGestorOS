export interface CompanySettings {
  legalName: string | null;
  tradeName: string | null;
  cnpj: string | null;
  fullAddress: string | null;
  phone: string | null;
  email: string | null;
  logoDataUrl: string | null;
  logoMime: string | null;
  logoUnavailable: boolean;
  deploymentEnvironment: "homologation" | "production";
  updatedAt: string;
}

export async function getCompanySettings(signal?: AbortSignal): Promise<{ data: CompanySettings }> {
  return request("GET", "/api/v1/company-settings", undefined, undefined, signal);
}

export async function updateCompanySettings(input: Pick<CompanySettings, "legalName" | "tradeName" | "cnpj" | "fullAddress" | "phone" | "email">, csrfToken: string) {
  return request("PATCH", "/api/v1/company-settings", input, csrfToken);
}

export async function uploadCompanyLogo(file: File, csrfToken: string) {
  const body = new FormData();
  body.append("logo", file);
  return request("PUT", "/api/v1/company-settings/logo", body, csrfToken);
}

export async function removeCompanyLogo(csrfToken: string) {
  return request("DELETE", "/api/v1/company-settings/logo", undefined, csrfToken);
}

async function request<T = { data: CompanySettings }>(method: string, path: string, body?: unknown, csrfToken?: string, signal?: AbortSignal): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (csrfToken) headers["X-CSRF-Token"] = csrfToken;
  if (body && !(body instanceof FormData)) headers["Content-Type"] = "application/json";
  const response = await fetch(path, {
    method, credentials: "include", headers,
    ...(body === undefined ? {} : { body: body instanceof FormData ? body : JSON.stringify(body) }),
    ...(signal ? { signal } : {}),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const root = isRecord(payload) ? payload : undefined;
    const error = root && isRecord(root.error) ? root.error : root;
    throw new Error(typeof error?.message === "string" ? error.message : "Não foi possível consultar os dados da empresa.");
  }
  return payload as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
