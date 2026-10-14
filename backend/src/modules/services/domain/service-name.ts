import { BadRequestException } from "@nestjs/common";

export function cleanServiceName(value: unknown): string {
  if (typeof value !== "string") {
    throw new BadRequestException({ code: "SERVICE_NAME_REQUIRED", message: "Nome do serviço é obrigatório." });
  }
  const name = value.trim().replace(/\s+/gu, " ");
  if (!name) {
    throw new BadRequestException({ code: "SERVICE_NAME_REQUIRED", message: "Nome do serviço é obrigatório." });
  }
  if (name.length > 120) {
    throw new BadRequestException({ code: "SERVICE_NAME_TOO_LONG", message: "Nome do serviço não pode exceder 120 caracteres." });
  }
  return name;
}

export function normalizeServiceName(name: string): string {
  return name.normalize("NFD").replace(/\p{M}/gu, "").toLocaleUpperCase("pt-BR")
    .normalize("NFD").replace(/\p{M}/gu, "");
}
