import { BadRequestException } from "@nestjs/common";
import type { PersonType } from "../../../generated/prisma/client.js";
import { isValidCnpj } from "../validators/cnpj.validator.js";
import { isValidCpf } from "../validators/cpf.validator.js";

export interface NormalizedPersonInput {
  personType: PersonType;
  name: string;
  document: string | null;
  tradeName: string | null;
  stateRegistration: string | null;
  municipalRegistration: string | null;
  observations: string | null;
}

export function normalizeGeneralText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleUpperCase("pt-BR");
}

function optionalText(value: unknown, field: string, maxLength: number, preserveWhitespace = false): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new BadRequestException({ code: "INVALID_FIELD", message: `${field} deve ser texto.` });
  }
  const normalized = preserveWhitespace ? value.trim().toLocaleUpperCase("pt-BR") : normalizeGeneralText(value);
  if (normalized.length > maxLength) {
    throw new BadRequestException({ code: "FIELD_TOO_LONG", message: `${field} não pode exceder ${maxLength} caracteres.` });
  }
  return normalized || null;
}

function normalizeDocument(value: unknown, personType: PersonType): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") {
    throw new BadRequestException({ code: "INVALID_DOCUMENT", message: "document deve ser texto." });
  }

  if (personType === "PF") {
    const cpfInput = value.trim();
    if (!/^(?:\d{11}|\d{3}\.\d{3}\.\d{3}-\d{2})$/.test(cpfInput)) {
      throw new BadRequestException({ code: "INVALID_CPF", message: "CPF inválido." });
    }
    const cpf = cpfInput.replace(/[.-]/g, "");
    if (!isValidCpf(cpf)) {
      throw new BadRequestException({ code: "INVALID_CPF", message: "CPF inválido." });
    }
    return cpf;
  }

  if (!/^[A-Za-z0-9./\-\s]+$/.test(value)) {
    throw new BadRequestException({ code: "INVALID_CNPJ", message: "CNPJ contém caracteres inválidos." });
  }
  const cnpj = value.replace(/[./\-\s]/g, "").toUpperCase();
  if (!isValidCnpj(cnpj)) {
    throw new BadRequestException({ code: "INVALID_CNPJ", message: "CNPJ inválido." });
  }
  return cnpj;
}

export function normalizePersonInput(input: Record<string, unknown>): NormalizedPersonInput {
  if (typeof input.personType !== "string") {
    throw new BadRequestException({ code: "PERSON_TYPE_REQUIRED", message: "personType é obrigatório e deve ser PF ou PJ." });
  }
  const personType = input.personType.trim().toUpperCase();
  if (personType !== "PF" && personType !== "PJ") {
    throw new BadRequestException({ code: "INVALID_PERSON_TYPE", message: "personType deve ser PF ou PJ." });
  }
  if (typeof input.name !== "string" || !normalizeGeneralText(input.name)) {
    throw new BadRequestException({ code: "NAME_REQUIRED", message: "name é obrigatório." });
  }
  const name = normalizeGeneralText(input.name);
  if (name.length > 191) {
    throw new BadRequestException({ code: "FIELD_TOO_LONG", message: "name não pode exceder 191 caracteres." });
  }

  const tradeName = optionalText(input.tradeName, "tradeName", 191);
  if (personType === "PF" && tradeName !== null) {
    throw new BadRequestException({ code: "TRADE_NAME_NOT_APPLICABLE", message: "tradeName não se aplica a Pessoa Física." });
  }

  // Observações são texto passivo; preserva as quebras de linha e espaços internos.
  const observations = optionalText(input.observations, "observations", 2000, true);

  return {
    personType,
    name,
    document: normalizeDocument(input.document, personType),
    tradeName,
    stateRegistration: optionalText(input.stateRegistration, "stateRegistration", 50),
    municipalRegistration: optionalText(input.municipalRegistration, "municipalRegistration", 50),
    observations,
  };
}
