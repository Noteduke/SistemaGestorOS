import { ApiError, type OpeningCustomer, type OpeningEquipmentDraft, type ServiceOrderOpening } from "./serviceOrders";

export interface OpeningIntake {
  version: 1; reportedDefect: string; accessories: string; physicalCondition: string;
  battery: string; observations: string; priority: "NORMAL" | "URGENT" | "VERY_URGENT" | "LOW";
}
export const emptyIntake = (): OpeningIntake => ({ version: 1, reportedDefect: "", accessories: "", physicalCondition: "", battery: "", observations: "", priority: "NORMAL" });
export async function openingRequest<T>(path: string, method = "GET", body?: unknown, csrfToken?: string): Promise<T> {
  const response = await fetch(`/api/v1/${path}`, { method, credentials: "include", headers: { Accept: "application/json", ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    const error = result?.error ?? result;
    throw new ApiError(response.status, typeof error?.code === "string" ? error.code : undefined, typeof error?.message === "string" ? error.message : "Não foi possível concluir a operação.", typeof error?.details === "object" ? error.details : undefined);
  }
  return result as T;
}
export const createOpeningCustomer = (data: import("./people").PersonFormInput & { openingPublicId: string }, csrf: string) =>
  openingRequest<{ data: OpeningCustomer; warnings: Array<{ code: string; message: string }> }>("people/customers", "POST", data, csrf);
export const saveOpeningIntake = (id: string, complaint: string, intakeData: OpeningIntake, csrf: string) =>
  openingRequest<{ data: ServiceOrderOpening }>(`service-orders/openings/${encodeURIComponent(id)}`, "PATCH", { complaint, intakeData }, csrf);
export const openingOptions = () => openingRequest<{ data: { initialStatus: { publicId: string; name: string } | null } }>("service-orders/openings/options");
export const editPermanentEquipment = (id: string, equipmentDraft: OpeningEquipmentDraft, expectedUpdatedAt: string, csrf: string) => openingRequest(`equipment/${encodeURIComponent(id)}`, "PATCH", { equipmentDraft, expectedUpdatedAt, confirmEquipmentChange: true }, csrf);
