import { BadRequestException } from "@nestjs/common";
import { ServiceOrderOperationalSituation } from "../../../generated/prisma/enums.js";

export interface OperationalSituationPatchInput {
  operationalSituation: ServiceOrderOperationalSituation;
  withdrawBudget?: true;
  originalOperationalSituation?: ServiceOrderOperationalSituation;
  resolvedCurrentSituation?: ServiceOrderOperationalSituation;
  editSnapshotToken?: string;
}

export function parseOperationalSituationPatch(body: unknown): OperationalSituationPatchInput {
  if (!isObject(body) || Object.keys(body).some((key) => !["operationalSituation", "withdrawBudget", "originalOperationalSituation", "resolvedCurrentSituation", "editSnapshotToken"].includes(key)) || !Object.hasOwn(body, "operationalSituation") ||
      !Object.values(ServiceOrderOperationalSituation).includes(body.operationalSituation as ServiceOrderOperationalSituation)) {
    throw new BadRequestException({ code: "INVALID_SITUATION", message: "Informe uma situação operacional válida." });
  }
  if (body.withdrawBudget !== undefined && body.withdrawBudget !== true) throw new BadRequestException({ code: "INVALID_BUDGET_WITHDRAWAL", message: "withdrawBudget deve ser true quando informado." });
  const notAuthorized = body.operationalSituation === ServiceOrderOperationalSituation.NOT_AUTHORIZED_REASSEMBLE ||
    body.operationalSituation === ServiceOrderOperationalSituation.NOT_AUTHORIZED_READY_DELIVERY;
  if (body.withdrawBudget === true && !notAuthorized) throw new BadRequestException({ code: "BUDGET_WITHDRAWAL_SITUATION_INVALID", message: "A composição só pode ser retirada ao definir uma situação de não autorização." });
  for (const key of ["originalOperationalSituation", "resolvedCurrentSituation"] as const) {
    if (body[key] !== undefined && !Object.values(ServiceOrderOperationalSituation).includes(body[key] as ServiceOrderOperationalSituation)) throw new BadRequestException({ code: "INVALID_SITUATION", message: "Situação de comparação inválida." });
  }
  if (body.resolvedCurrentSituation !== undefined && body.originalOperationalSituation === undefined) throw new BadRequestException({ code: "INVALID_SITUATION", message: "Situação original obrigatória para resolver conflito." });
  if (body.editSnapshotToken !== undefined && (typeof body.editSnapshotToken !== "string" || body.editSnapshotToken.length > 2048)) throw new BadRequestException({ code: "INVALID_SITUATION", message: "Fotografia de edição inválida." });
  if (body.originalOperationalSituation !== undefined && body.editSnapshotToken === undefined) throw new BadRequestException({ code: "INVALID_SITUATION", message: "Fotografia de edição obrigatória." });
  return { operationalSituation: body.operationalSituation as ServiceOrderOperationalSituation, ...(body.withdrawBudget === true ? { withdrawBudget: true } : {}),
    ...(body.originalOperationalSituation !== undefined ? { originalOperationalSituation: body.originalOperationalSituation as ServiceOrderOperationalSituation } : {}),
    ...(body.resolvedCurrentSituation !== undefined ? { resolvedCurrentSituation: body.resolvedCurrentSituation as ServiceOrderOperationalSituation } : {}),
    ...(body.editSnapshotToken !== undefined ? { editSnapshotToken: body.editSnapshotToken as string } : {}) };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
