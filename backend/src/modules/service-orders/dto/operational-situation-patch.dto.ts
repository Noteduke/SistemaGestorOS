import { BadRequestException } from "@nestjs/common";
export interface OperationalSituationPatchInput {
  operationalStatusPublicId: string;
  withdrawBudget?: true;
}

export function parseOperationalSituationPatch(body: unknown): OperationalSituationPatchInput {
  if (!isObject(body) || Object.keys(body).some((key) => !["operationalStatusPublicId", "withdrawBudget"].includes(key)) ||
      typeof body.operationalStatusPublicId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.operationalStatusPublicId)) {
    throw new BadRequestException({ code: "INVALID_SITUATION", message: "Informe um status operacional válido." });
  }
  if (body.withdrawBudget !== undefined && body.withdrawBudget !== true) throw new BadRequestException({ code: "INVALID_BUDGET_WITHDRAWAL", message: "withdrawBudget deve ser true quando informado." });
  return { operationalStatusPublicId: body.operationalStatusPublicId, ...(body.withdrawBudget === true ? { withdrawBudget: true } : {}) };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
