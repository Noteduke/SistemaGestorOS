import { formatServiceOrderNumber } from "./service-order-number-format.js";

interface OpeningForResponse {
  publicId: string;
  attemptedNumberValue: bigint;
  status: "IN_PROGRESS" | "CANCELED" | "CONFIRMED";
  createdAt: Date;
  updatedAt: Date;
}

export function toOpeningResponse(opening: OpeningForResponse, initiatedByUserPublicId: string, numberReleased?: boolean) {
  return {
    publicId: opening.publicId,
    visibleNumber: formatServiceOrderNumber(opening.attemptedNumberValue),
    numberValue: opening.attemptedNumberValue.toString(),
    status: opening.status,
    initiatedByUserPublicId,
    createdBy: initiatedByUserPublicId,
    createdAt: opening.createdAt,
    updatedAt: opening.updatedAt,
    ...(numberReleased === undefined ? {} : { numberReleased }),
  };
}
