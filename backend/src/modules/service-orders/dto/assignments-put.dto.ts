import { BadRequestException } from "@nestjs/common";

const PUBLIC_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AssignmentsPutInput {
  userPublicIds: string[];
  originalUserPublicIds?: string[];
  resolvedCurrentUserPublicIds?: string[];
  editSnapshotToken?: string;
}

export function parseAssignmentsPut(body: unknown): AssignmentsPutInput {
  if (!isObject(body) || Object.keys(body).some((key) => !["userPublicIds", "originalUserPublicIds", "resolvedCurrentUserPublicIds", "editSnapshotToken"].includes(key)) || !Object.hasOwn(body, "userPublicIds") || !Array.isArray(body.userPublicIds)) {
    throw invalid();
  }
  const ids = body.userPublicIds;
  if (ids.some((id) => typeof id !== "string" || !PUBLIC_ID.test(id))) throw invalid();
  const normalizedIds = (ids as string[]).map((id) => id.toLowerCase());
  if (new Set(normalizedIds).size !== normalizedIds.length) throw invalid();
  const result: AssignmentsPutInput = { userPublicIds: normalizedIds };
  for (const key of ["originalUserPublicIds", "resolvedCurrentUserPublicIds"] as const) {
    if (body[key] === undefined) continue;
    if (!Array.isArray(body[key]) || body[key].some((id) => typeof id !== "string" || !PUBLIC_ID.test(id))) throw invalid();
    const value = (body[key] as string[]).map((id) => id.toLowerCase());
    if (new Set(value).size !== value.length) throw invalid();
    result[key] = value;
  }
  if (result.resolvedCurrentUserPublicIds && !result.originalUserPublicIds) throw invalid();
  if (body.editSnapshotToken !== undefined && (typeof body.editSnapshotToken !== "string" || body.editSnapshotToken.length > 2048)) throw invalid();
  if (result.originalUserPublicIds && body.editSnapshotToken === undefined) throw invalid();
  if (body.editSnapshotToken !== undefined) result.editSnapshotToken = body.editSnapshotToken as string;
  return result;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalid(): BadRequestException {
  return new BadRequestException({ code: "VALIDATION_ERROR", message: "Informe uma lista válida de usuários atribuídos." });
}
