import { BadRequestException } from "@nestjs/common";

export interface LoginInput {
  username: string;
  password: string;
}

export function parseLoginInput(value: unknown): LoginInput {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new BadRequestException({ code: "INVALID_REQUEST", message: "Informe username e password." });
  }
  const record = value as Record<string, unknown>;
  if (typeof record.username !== "string" || typeof record.password !== "string") {
    throw new BadRequestException({ code: "INVALID_REQUEST", message: "Informe username e password." });
  }
  if (record.username.length > 256 || record.password.length > 4096) {
    throw new BadRequestException({ code: "INVALID_REQUEST", message: "Dados de autenticação inválidos." });
  }
  return { username: record.username, password: record.password };
}
