import type { ServiceOrderTechnicalCompletion } from "../../../generated/prisma/enums.js";

export type TechnicalCompletionTransitionKind = "CONCLUSION" | "RETURN_TO_SERVICE" | "STATUS_ONLY";

export function classifyTechnicalCompletionTransition(
  previous: ServiceOrderTechnicalCompletion,
  next: ServiceOrderTechnicalCompletion,
): TechnicalCompletionTransitionKind {
  if (previous !== "NOT_COMPLETED" && next === "NOT_COMPLETED") return "RETURN_TO_SERVICE";
  if (next !== "NOT_COMPLETED" && previous !== next) return "CONCLUSION";
  return "STATUS_ONLY";
}
