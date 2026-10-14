import { BadRequestException } from "@nestjs/common";

export function cleanProductDescription(value: unknown): string {
  if (typeof value !== "string") throw invalidDescription();
  const description = value.trim().replace(/\s+/gu, " ").toLocaleUpperCase("pt-BR");
  if (!description) throw invalidDescription();
  if ([...description].length > 255) {
    throw new BadRequestException({ code: "PRODUCT_DESCRIPTION_TOO_LONG", message: "Descrição não pode exceder 255 caracteres." });
  }
  return description;
}

export function cleanProductCode(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new BadRequestException({ code: "INVALID_PRODUCT_CODE", message: "Código interno deve ser texto." });
  }
  const code = value.trim().replace(/\s+/gu, " ").toLocaleUpperCase("pt-BR");
  if (!code) return null;
  if ([...code].length > 64) {
    throw new BadRequestException({ code: "PRODUCT_CODE_TOO_LONG", message: "Código interno não pode exceder 64 caracteres." });
  }
  return code;
}

function invalidDescription(): BadRequestException {
  return new BadRequestException({ code: "PRODUCT_DESCRIPTION_REQUIRED", message: "Descrição do produto é obrigatória." });
}
