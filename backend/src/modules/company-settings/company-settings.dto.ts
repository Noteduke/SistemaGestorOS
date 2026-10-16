import { BadRequestException } from "@nestjs/common";
import { isValidCnpj } from "../people/validators/cnpj.validator.js";

export interface CompanySettingsInput {
  legalName?: string | null;
  tradeName?: string | null;
  cnpj?: string | null;
  fullAddress?: string | null;
  phone?: string | null;
  email?: string | null;
}

const ALLOWED_FIELDS = new Set(["legalName", "tradeName", "cnpj", "fullAddress", "phone", "email"]);

export function parseCompanySettingsInput(value: unknown): CompanySettingsInput {
  if (!isRecord(value)) throw invalid();
  for (const field of Object.keys(value)) if (!ALLOWED_FIELDS.has(field)) throw invalid();
  const result: CompanySettingsInput = {};
  if ("legalName" in value) result.legalName = optionalText(value.legalName, "legalName", 191);
  if ("tradeName" in value) result.tradeName = optionalText(value.tradeName, "tradeName", 191);
  if ("fullAddress" in value) result.fullAddress = optionalText(value.fullAddress, "fullAddress", 4000, true);
  if ("phone" in value) result.phone = optionalText(value.phone, "phone", 30);
  if ("email" in value) {
    const email = optionalText(value.email, "email", 254)?.toLocaleLowerCase("pt-BR") ?? null;
    if (email !== null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) {
      throw new BadRequestException({ code: "INVALID_COMPANY_EMAIL", message: "Informe um e-mail válido." });
    }
    result.email = email;
  }
  if ("cnpj" in value) {
    const raw = optionalText(value.cnpj, "cnpj", 32);
    if (raw === null) result.cnpj = null;
    else {
      if (!/^[A-Za-z0-9./\-\s]+$/u.test(raw)) throw invalid();
      const cnpj = raw.replace(/[./\-\s]/gu, "").toUpperCase();
      if (!isValidCnpj(cnpj)) throw new BadRequestException({ code: "INVALID_COMPANY_CNPJ", message: "Informe um CNPJ válido." });
      result.cnpj = cnpj;
    }
  }
  if (Object.keys(result).length === 0) throw invalid();
  return result;
}

function optionalText(value: unknown, field: string, maximum: number, preserveLines = false): string | null {
  if (value === null) return null;
  if (typeof value !== "string") throw new BadRequestException({ code: "INVALID_COMPANY_SETTINGS", message: "Os dados da empresa são inválidos." });
  const trimmed = value.trim();
  const normalized = preserveLines ? trimmed : trimmed.replace(/\s+/gu, " ");
  if (normalized.length > maximum) {
    throw new BadRequestException({ code: "COMPANY_FIELD_TOO_LONG", message: `${field} excede o limite de ${maximum} caracteres.` });
  }
  return normalized || null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalid(): BadRequestException {
  return new BadRequestException({ code: "INVALID_COMPANY_SETTINGS", message: "Os dados da empresa são inválidos." });
}
