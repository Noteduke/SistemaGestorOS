import { BadRequestException } from "@nestjs/common";

const ALLOWED_FIELDS = new Set([
  "personType",
  "name",
  "document",
  "tradeName",
  "stateRegistration",
  "municipalRegistration",
  "observations",
]);

export function parseCreatePersonDto(body: unknown): Record<string, unknown> {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new BadRequestException({ code: "INVALID_BODY", message: "O corpo deve ser um objeto JSON." });
  }
  const input = body as Record<string, unknown>;
  const unsupported = Object.keys(input).filter((key) => !ALLOWED_FIELDS.has(key));
  if (unsupported.length > 0) {
    throw new BadRequestException({
      code: "UNSUPPORTED_FIELDS",
      message: "A requisição contém campos não permitidos para criação de Pessoa.",
      details: { fields: unsupported },
    });
  }
  return input;
}
