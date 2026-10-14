import { BadRequestException } from "@nestjs/common";
import { ServiceOrderOperationalSituation } from "../../../generated/prisma/enums.js";

export interface OperationalSituationPatchInput {
  operationalSituation: ServiceOrderOperationalSituation;
  withdrawBudget?: true;
}

export function parseOperationalSituationPatch(body: unknown): OperationalSituationPatchInput {
  if (!isObject(body) || Object.keys(body).some((key) => !["operationalSituation", "withdrawBudget"].includes(key)) || !Object.hasOwn(body, "operationalSituation") ||
      !Object.values(ServiceOrderOperationalSituation).includes(body.operationalSituation as ServiceOrderOperationalSituation)) {
    throw new BadRequestException({ code: "INVALID_SITUATION", message: "Informe uma situação operacional válida." });
  }
  if (body.withdrawBudget !== undefined && body.withdrawBudget !== true) throw new BadRequestException({ code: "INVALID_BUDGET_WITHDRAWAL", message: "withdrawBudget deve ser true quando informado." });
  const notAuthorized = body.operationalSituation === ServiceOrderOperationalSituation.NOT_AUTHORIZED_REASSEMBLE ||
    body.operationalSituation === ServiceOrderOperationalSituation.NOT_AUTHORIZED_READY_DELIVERY;
  if (body.withdrawBudget === true && !notAuthorized) throw new BadRequestException({ code: "BUDGET_WITHDRAWAL_SITUATION_INVALID", message: "A composição só pode ser retirada ao definir uma situação de não autorização." });
  return { operationalSituation: body.operationalSituation as ServiceOrderOperationalSituation, ...(body.withdrawBudget === true ? { withdrawBudget: true } : {}) };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
