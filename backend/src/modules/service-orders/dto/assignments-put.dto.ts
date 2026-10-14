import { BadRequestException } from "@nestjs/common";

const PUBLIC_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AssignmentsPutInput {
  userPublicIds: string[];
}

export function parseAssignmentsPut(body: unknown): AssignmentsPutInput {
  if (!isObject(body) || Object.keys(body).length !== 1 || !Object.hasOwn(body, "userPublicIds") || !Array.isArray(body.userPublicIds)) {
    throw invalid();
  }
  const ids = body.userPublicIds;
  if (ids.some((id) => typeof id !== "string" || !PUBLIC_ID.test(id))) throw invalid();
  const normalizedIds = (ids as string[]).map((id) => id.toLowerCase());
  if (new Set(normalizedIds).size !== normalizedIds.length) throw invalid();
  return { userPublicIds: normalizedIds };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalid(): BadRequestException {
  return new BadRequestException({ code: "VALIDATION_ERROR", message: "Informe uma lista válida de usuários atribuídos." });
}
