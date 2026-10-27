import { openingRequest } from "./openingWorkflow";
export interface PersonFormInput {
  personType: "PF" | "PJ"; name: string; document: string; tradeName: string;
  stateRegistration: string; municipalRegistration: string; contactName: string;
  observations: string; warning: string; isActive: boolean;
  address: { postalCode: string; street: string; number: string; complement: string; district: string; city: string; state: string; country: string };
  phones: Array<{ publicId?: string; number: string; isPrimary: boolean; confirmNonstandardPhone: boolean }>;
  emails: Array<{ publicId?: string; address: string; isPrimary: boolean }>;
}
export const createPerson = (data: PersonFormInput, csrf: string) => openingRequest("people", "POST", data, csrf);

export interface OpeningPersonDetails extends PersonFormInput { publicId: string; updatedAt: string }
export const getOpeningPerson = (openingId: string) => openingRequest<{ data: OpeningPersonDetails }>(`people/customers/opening/${openingId}`, "GET").then(result => {
  if (!result?.data || !Array.isArray(result.data.phones) || !Array.isArray(result.data.emails)) throw new Error("Dados do cliente indisponíveis.");
  return result;
});
export const updateOpeningPerson = (openingId: string, data: PersonFormInput, expectedUpdatedAt: string, csrf: string) => openingRequest<{ data: OpeningPersonDetails }>(`people/customers/opening/${openingId}`, "PATCH", { ...data, expectedUpdatedAt, confirmPersonChange: true }, csrf);
