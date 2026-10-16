export type HomologationIssueStatus = "PENDENTE" | "EM CORREÇÃO" | "CORRIGIDO" | "VALIDADO";
export interface HomologationIssue {
  publicId: string; description: string; attemptedAction: string; observedResult: string; screenReference: string | null;
  systemVersion: string; status: HomologationIssueStatus; createdAt: string; updatedAt: string; screenshotMime: string | null;
  serviceOrderNumber: string | null; reportedBy: { username: string }; updatedBy: { username: string } | null;
}

async function request<T>(path: string, csrfToken?: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: "include", ...init, headers: { Accept: "application/json", ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}), ...init?.headers } });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const record = body && typeof body === "object" ? body as Record<string, unknown> : {};
    throw new Error(typeof record.message === "string" ? record.message : "Não foi possível concluir a operação.");
  }
  return body as T;
}

export function createHomologationIssue(input: { description: string; attemptedAction: string; observedResult: string; screenReference: string; serviceOrderPublicId: string; screenshot?: File }, csrfToken: string) {
  const body = new FormData();
  body.set("description", input.description); body.set("attemptedAction", input.attemptedAction); body.set("observedResult", input.observedResult);
  if (input.screenReference) body.set("screenReference", input.screenReference);
  if (input.serviceOrderPublicId) body.set("serviceOrderPublicId", input.serviceOrderPublicId);
  if (input.screenshot) body.set("screenshot", input.screenshot);
  return request<{ data: { publicId: string; status: HomologationIssueStatus; systemVersion: string; createdAt: string } }>("/api/v1/homologation/issues", csrfToken, { method: "POST", body });
}
export function listHomologationIssues() { return request<{ data: HomologationIssue[] }>("/api/v1/homologation/issues"); }
export function updateHomologationIssueStatus(publicId: string, status: HomologationIssueStatus, csrfToken: string) {
  return request<{ data: Pick<HomologationIssue, "publicId" | "status" | "updatedAt"> }>(`/api/v1/homologation/issues/${encodeURIComponent(publicId)}/status`, csrfToken, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
}
