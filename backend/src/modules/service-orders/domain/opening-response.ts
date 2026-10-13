import { formatServiceOrderNumber } from "./service-order-number-format.js";
import { maskPersonDocument } from "../../people/domain/mask-person-document.js";

interface OpeningForResponse {
  publicId: string;
  attemptedNumberValue: bigint;
  status: "IN_PROGRESS" | "CANCELED" | "CONFIRMED";
  createdAt: Date;
  updatedAt: Date;
  customer?: { publicId: string; name: string; document: string | null } | null;
  equipment?: {
    publicId: string;
    type: { publicId: string; name: string };
    brand: { publicId: string; name: string };
    model: string;
    serialNumber: string | null;
    owner: { publicId: string; name: string; document: string | null };
  } | null;
  equipmentDraftJson?: unknown;
  equipmentDraftVersion?: number | null;
  transferRequested?: boolean;
  transferRequester?: { publicId: string } | null;
  complaint?: string | null;
}

export function toOpeningResponse(opening: OpeningForResponse, initiatedByUserPublicId: string, numberReleased?: boolean) {
  return {
    publicId: opening.publicId,
    visibleNumber: formatServiceOrderNumber(opening.attemptedNumberValue),
    numberValue: opening.attemptedNumberValue.toString(),
    status: opening.status,
    initiatedByUserPublicId,
    createdBy: initiatedByUserPublicId,
    customerPublicId: opening.customer?.publicId ?? null,
    customer: opening.customer
      ? {
          publicId: opening.customer.publicId,
          name: opening.customer.name,
          documentHint: maskPersonDocument(opening.customer.document),
        }
      : null,
    equipmentPublicId: opening.equipment?.publicId ?? null,
    equipment: opening.equipment
      ? {
          publicId: opening.equipment.publicId,
          type: { publicId: opening.equipment.type.publicId, name: opening.equipment.type.name },
          brand: { publicId: opening.equipment.brand.publicId, name: opening.equipment.brand.name },
          model: opening.equipment.model,
          serialNumber: opening.equipment.serialNumber,
          serialIdentificationStatus: opening.equipment.serialNumber === null ? "NOT_IDENTIFIED" : "IDENTIFIED",
          owner: {
            publicId: opening.equipment.owner.publicId,
            name: opening.equipment.owner.name,
            documentHint: maskPersonDocument(opening.equipment.owner.document),
          },
        }
      : null,
    equipmentDraft: opening.equipmentDraftJson ?? null,
    equipmentDraftVersion: opening.equipmentDraftVersion ?? null,
    transferRequested: opening.transferRequested ?? false,
    transferRequestedByUserPublicId: opening.transferRequester?.publicId ?? null,
    complaint: opening.complaint ?? null,
    createdAt: opening.createdAt,
    updatedAt: opening.updatedAt,
    ...(numberReleased === undefined ? {} : { numberReleased }),
  };
}
