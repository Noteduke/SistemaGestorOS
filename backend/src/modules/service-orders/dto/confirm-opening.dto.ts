import { BadRequestException } from "@nestjs/common";

const PUBLIC_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FIELDS = ["intakeObservations", "assignedUserPublicIds"] as const;

export interface ConfirmOpeningInput {
  intakeObservations?: string | null;
  assignedUserPublicIds?: string[];
}

export function parseConfirmOpening(body: unknown): ConfirmOpeningInput {
  if (body === undefined) return {};
  if (typeof body !== "object" || body === null || Array.isArray(body)) throw invalid();
  const value = body as Record<string, unknown>;
  if (Object.keys(value).some((key) => !FIELDS.includes(key as typeof FIELDS[number]))) throw invalid();

  const result: ConfirmOpeningInput = {};
  if (Object.prototype.hasOwnProperty.call(value, "intakeObservations")) {
    const observations = value.intakeObservations;
    if (observations !== null && (typeof observations !== "string" || observations.length > 65535)) throw invalid();
    const normalized = observations === null ? null : (observations as string).toLocaleUpperCase("pt-BR");
    if (normalized !== null && Buffer.byteLength(normalized, "utf8") > 65535) throw invalid();
    result.intakeObservations = normalized;
  }
  if (Object.prototype.hasOwnProperty.call(value, "assignedUserPublicIds")) {
    const ids = value.assignedUserPublicIds;
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string" || !PUBLIC_ID.test(id)) || new Set(ids).size !== ids.length) throw invalid();
    result.assignedUserPublicIds = ids as string[];
  }
  return result;
}

function invalid(): BadRequestException {
  return new BadRequestException({ code: "VALIDATION_ERROR", message: "Dados de confirmação inválidos." });
}
