import { BadRequestException } from "@nestjs/common";
import { ServiceOrderOperationalSituation } from "../../../generated/prisma/enums.js";

export interface OperationalSituationPatchInput {
  operationalSituation: ServiceOrderOperationalSituation;
}

export function parseOperationalSituationPatch(body: unknown): OperationalSituationPatchInput {
  if (!isObject(body) || Object.keys(body).length !== 1 || !Object.hasOwn(body, "operationalSituation") ||
      !Object.values(ServiceOrderOperationalSituation).includes(body.operationalSituation as ServiceOrderOperationalSituation)) {
    throw new BadRequestException({ code: "INVALID_SITUATION", message: "Informe uma situação operacional válida." });
  }
  return { operationalSituation: body.operationalSituation as ServiceOrderOperationalSituation };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
