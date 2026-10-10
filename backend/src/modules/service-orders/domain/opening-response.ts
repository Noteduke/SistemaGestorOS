import { formatServiceOrderNumber } from "./service-order-number-format.js";

interface OpeningForResponse {
  publicId: string;
  attemptedNumberValue: bigint;
  status: "IN_PROGRESS" | "CANCELED" | "CONFIRMED";
  createdAt: Date;
  updatedAt: Date;
  customer?: { publicId: string } | null;
  equipment?: { publicId: string } | null;
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
    equipmentPublicId: opening.equipment?.publicId ?? null,
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
