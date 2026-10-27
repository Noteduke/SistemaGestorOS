import { BadRequestException } from "@nestjs/common";
import { parseOpeningLookupQuery, type OpeningLookupQuery } from "../../shared/dto/opening-lookup-query.dto.js";
export interface OpeningEquipmentSearchQuery extends OpeningLookupQuery { ownerPublicId?: string }
export function parseOpeningEquipmentSearchQuery(query: Record<string, unknown>): OpeningEquipmentSearchQuery {
  const { ownerPublicId, ...rest } = query;
  if (ownerPublicId !== undefined && (typeof ownerPublicId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ownerPublicId))) throw new BadRequestException({ code: "INVALID_OWNER", message: "Cliente inválido." });
  return { ...parseOpeningLookupQuery(rest), ...(ownerPublicId ? { ownerPublicId: ownerPublicId as string } : {}) };
}
