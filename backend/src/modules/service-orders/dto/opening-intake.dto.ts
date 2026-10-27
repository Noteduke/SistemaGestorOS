import { BadRequestException } from "@nestjs/common";

export const openingPriorities = ["NORMAL", "URGENT", "VERY_URGENT", "LOW"] as const;
export interface OpeningIntake {
  version: 1;
  reportedDefect: string;
  accessories: string;
  physicalCondition: string;
  battery: string;
  observations: string;
  priority: typeof openingPriorities[number];
}
export function emptyOpeningIntake(): OpeningIntake {
  return { version: 1, reportedDefect: "", accessories: "", physicalCondition: "", battery: "", observations: "", priority: "NORMAL" };
}
export function parseOpeningIntake(value: unknown): OpeningIntake {
  const invalid = () => new BadRequestException({ code: "VALIDATION_ERROR", message: "Dados de entrada da OS inválidos." });
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid();
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some(key => !Object.keys(emptyOpeningIntake()).includes(key)) || input.version !== 1 || !openingPriorities.includes(input.priority as OpeningIntake["priority"])) throw invalid();
  const result = emptyOpeningIntake();
  for (const key of ["reportedDefect", "accessories", "physicalCondition", "battery", "observations"] as const) {
    if (typeof input[key] !== "string" || input[key].length > 2000) throw invalid();
    result[key] = input[key].trim().toLocaleUpperCase("pt-BR");
  }
  result.priority = input.priority as OpeningIntake["priority"];
  return result;
}
