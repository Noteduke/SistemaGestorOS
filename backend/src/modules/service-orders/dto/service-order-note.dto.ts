import { BadRequestException } from "@nestjs/common";

export interface CreateServiceOrderNoteInput { text: string }

export function parseCreateServiceOrderNote(body: unknown): CreateServiceOrderNoteInput {
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some((key) => key !== "text")) {
    throw invalidNote();
  }
  const text = (body as Record<string, unknown>).text;
  if (typeof text !== "string" || !text.trim() || Array.from(text).length > 255 || /[\r\n]/u.test(text)) {
    throw invalidNote();
  }
  return { text };
}

function invalidNote(): BadRequestException {
  return new BadRequestException({ code: "INVALID_SERVICE_ORDER_NOTE", message: "A observação deve ter uma linha de texto não vazio com até 255 caracteres." });
}
