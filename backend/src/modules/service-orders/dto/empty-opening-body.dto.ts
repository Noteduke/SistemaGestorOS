import { BadRequestException } from "@nestjs/common";

export function requireEmptyOpeningBody(body: unknown): void {
  if (body === undefined || (typeof body === "object" && body !== null && !Array.isArray(body) && Object.keys(body).length === 0)) {
    return;
  }
  throw new BadRequestException({ code: "VALIDATION_ERROR", message: "Esta operação não aceita dados no corpo." });
}
