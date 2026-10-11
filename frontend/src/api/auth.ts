export interface AuthIdentity {
  publicId: string;
  username: string;
  isAdmin: boolean;
  permissions: string[];
  csrfToken: string;
  session: { expiresAt: string };
}

interface ApiEnvelope<T> {
  data: T;
}

export class AuthApiError extends Error {
  constructor(readonly status: number, readonly endpoint: string, message: string) {
    super(message);
    this.name = "AuthApiError";
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...options,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers as Record<string, string> | undefined),
    },
  });

  if (response.status === 204) return undefined as T;
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = isRecord(body) && isRecord(body.error) ? body.error : undefined;
    throw new AuthApiError(
      response.status,
      path,
      typeof error?.message === "string" ? error.message : "Não foi possível concluir a autenticação.",
    );
  }
  return body as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function getCurrentIdentity(signal?: AbortSignal): Promise<AuthIdentity> {
  const response = await request<ApiEnvelope<AuthIdentity>>("/api/v1/auth/me", { method: "GET", signal });
  return response.data;
}

export async function login(username: string, password: string): Promise<AuthIdentity> {
  const csrf = await request<ApiEnvelope<{ csrfToken: string }>>("/api/v1/auth/csrf", { method: "GET" });
  await request<ApiEnvelope<AuthIdentity>>("/api/v1/auth/login", {
    method: "POST",
    headers: { "X-CSRF-Token": csrf.data.csrfToken },
    body: JSON.stringify({ username, password }),
  });
  return getCurrentIdentity();
}

export async function logout(csrfToken: string): Promise<void> {
  await request<void>("/api/v1/auth/logout", {
    method: "POST",
    headers: { "X-CSRF-Token": csrfToken },
  });
}

export function authErrorMessage(error: unknown): string {
  if (error instanceof AuthApiError && error.status === 401 && error.endpoint.endsWith("/auth/login")) {
    return "Usuário ou senha inválidos.";
  }
  if (error instanceof AuthApiError && error.status === 403) return "A verificação de segurança falhou. Recarregue a tela e tente novamente.";
  return "Não foi possível conectar ao serviço. Verifique a conexão e tente novamente.";
}
