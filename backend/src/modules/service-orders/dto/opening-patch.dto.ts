import { BadRequestException } from "@nestjs/common";
import { parseOpeningIntake, type OpeningIntake } from "./opening-intake.dto.js";

const PUBLIC_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FIELDS = ["customerPublicId", "equipmentPublicId", "equipmentDraft", "complaint", "ownershipDecision", "intakeData"] as const;
const DRAFT_FIELDS = ["typePublicId", "brandPublicId", "model", "serialIdentificationStatus", "serialNumber"] as const;

export interface EquipmentDraftInput {
  typePublicId: string;
  brandPublicId: string;
  model: string;
  serialIdentificationStatus: "IDENTIFIED" | "NOT_IDENTIFIED";
  serialNumber: string | null;
}

export interface OpeningPatchInput {
  intakeData?: OpeningIntake;
  customerPublicId?: string | null;
  equipmentPublicId?: string | null;
  equipmentDraft?: EquipmentDraftInput | null;
  complaint?: string | null;
  ownershipDecision?: "CANCEL_SELECTION" | "USE_CURRENT_OWNER" | "TRANSFER_TO_CUSTOMER" | null;
}

export function parseOpeningPatch(body: unknown): OpeningPatchInput {
  if (!isObject(body) || Object.keys(body).length === 0 || Object.keys(body).some((key) => !FIELDS.includes(key as typeof FIELDS[number]))) {
    throw invalid("Informe somente campos permitidos para a abertura.");
  }
  const result: OpeningPatchInput = {};
  if (has(body, "intakeData")) result.intakeData = parseOpeningIntake(body.intakeData);
  if (has(body, "customerPublicId")) result.customerPublicId = publicIdOrNull(body.customerPublicId);
  if (has(body, "equipmentPublicId")) result.equipmentPublicId = publicIdOrNull(body.equipmentPublicId);
  if (has(body, "complaint")) {
    if (body.complaint !== null && (typeof body.complaint !== "string" || body.complaint.length > 65535)) throw invalid("Reclamação inválida.");
    result.complaint = body.complaint === null ? null : body.complaint.toLocaleUpperCase("pt-BR");
  }
  if (has(body, "ownershipDecision")) {
    if (body.ownershipDecision !== null && !["CANCEL_SELECTION", "USE_CURRENT_OWNER", "TRANSFER_TO_CUSTOMER"].includes(body.ownershipDecision as string)) {
      throw invalid("Decisão de titularidade inválida.");
    }
    result.ownershipDecision = body.ownershipDecision as OpeningPatchInput["ownershipDecision"];
  }
  if (has(body, "equipmentDraft")) {
    result.equipmentDraft = body.equipmentDraft === null ? null : parseDraft(body.equipmentDraft);
  }
  if (result.equipmentPublicId && result.equipmentDraft) throw invalid("Selecione equipamento existente ou novo, não ambos.");
  return result;
}

function parseDraft(value: unknown): EquipmentDraftInput {
  if (!isObject(value) || Object.keys(value).length !== DRAFT_FIELDS.length || Object.keys(value).some((key) => !DRAFT_FIELDS.includes(key as typeof DRAFT_FIELDS[number]))) {
    throw invalid("Rascunho de equipamento inválido.");
  }
  const typePublicId = publicIdOrNull(value.typePublicId);
  const brandPublicId = publicIdOrNull(value.brandPublicId);
  if (!typePublicId || !brandPublicId || typeof value.model !== "string" || !value.model.trim() || value.model.trim().length > 191) {
    throw invalid("Tipo, marca e modelo são obrigatórios no rascunho.");
  }
  if (value.serialIdentificationStatus !== "IDENTIFIED" && value.serialIdentificationStatus !== "NOT_IDENTIFIED") {
    throw invalid("Identificação do número de série inválida.");
  }
  if (value.serialIdentificationStatus === "NOT_IDENTIFIED" && value.serialNumber !== null) throw invalid("Série não identificada deve ser nula.");
  if (value.serialIdentificationStatus === "IDENTIFIED" && (typeof value.serialNumber !== "string" || !value.serialNumber.trim() || value.serialNumber.length > 191)) {
    throw invalid("Informe o número de série identificado.");
  }
  return {
    typePublicId,
    brandPublicId,
    model: value.model.trim().toLocaleUpperCase("pt-BR"),
    serialIdentificationStatus: value.serialIdentificationStatus,
    serialNumber: value.serialNumber === null ? null : (value.serialNumber as string).toLocaleUpperCase("pt-BR"),
  };
}

function publicIdOrNull(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !PUBLIC_ID.test(value)) throw invalid("Identificador público inválido.");
  return value;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function has(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function invalid(message: string): BadRequestException {
  return new BadRequestException({ code: "VALIDATION_ERROR", message });
}
