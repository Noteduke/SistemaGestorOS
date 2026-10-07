import { BadRequestException } from "@nestjs/common";

export function normalizePhoneNumber(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || !/^[0-9+().\-\s]+$/.test(trimmed)) {
    throw new BadRequestException({ code: "INVALID_PHONE", message: "Informe um telefone válido, contendo apenas números e separadores permitidos." });
  }
  const number = trimmed.replace(/\D/g, "");
  if (number.length < 1 || number.length > 32) {
    throw new BadRequestException({ code: "INVALID_PHONE", message: "O telefone deve conter de 1 a 32 dígitos." });
  }
  return number;
}

export function isStandardBrazilianPhone(number: string): boolean {
  return number.length === 10 || (number.length === 11 && number[2] === "9");
}

export function normalizeEmailAddress(value: string): string {
  const address = value.trim().toLowerCase();
  if (address.length > 254 || !/^[\x00-\x7F]*$/.test(address)) invalidEmail();

  const at = address.indexOf("@");
  if (at <= 0 || at !== address.lastIndexOf("@") || at === address.length - 1) invalidEmail();
  const local = address.slice(0, at);
  const domain = address.slice(at + 1);

  if (
    local.length > 64 ||
    !/^[a-z0-9_%+-]+(?:\.[a-z0-9_%+-]+)*$/.test(local) ||
    domain.length > 253 ||
    !domain.includes(".")
  ) invalidEmail();

  const labels = domain.split(".");
  if (labels.some((label) => label.length < 1 || label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))) invalidEmail();
  return address;
}

function invalidEmail(): never {
  throw new BadRequestException({ code: "INVALID_EMAIL", message: "Informe um e-mail válido em formato ASCII." });
}
