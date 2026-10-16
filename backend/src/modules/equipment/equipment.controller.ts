import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { RequirePermissions } from "../auth/decorators/auth-metadata.js";
import { parseOpeningEquipmentSearchQuery } from "./dto/opening-equipment-search-query.dto.js";
import { EquipmentLookupService } from "./equipment-lookup.service.js";
import { DellPublicLookupService } from "./dell-public-lookup.service.js";

@Controller("equipment")
export class EquipmentController {
  constructor(private readonly equipment: EquipmentLookupService, private readonly dell: DellPublicLookupService) {}

  @Get("opening-search")
  @RequirePermissions("service_orders.opening.create")
  searchForOpening(@Query() query: Record<string, unknown>) {
    return this.equipment.searchForOpening(parseOpeningEquipmentSearchQuery(query));
  }

  @Post("dell-model-lookup")
  @RequirePermissions("service_orders.opening.create")
  lookupDellModel(@Body() body: unknown) {
    const tag = body && typeof body === "object" ? (body as Record<string, unknown>).serviceTag : undefined;
    return this.dell.lookup(tag);
  }
}

@Controller("equipment-types")
export class EquipmentTypesController {
  constructor(private readonly equipment: EquipmentLookupService) {}

  @Get()
  @RequirePermissions("service_orders.opening.create")
  listTypes(@Query() query: Record<string, unknown>) {
    return this.equipment.listTypes(parseOpeningEquipmentSearchQuery(query));
  }
}

@Controller("equipment-brands")
export class EquipmentBrandsController {
  constructor(private readonly equipment: EquipmentLookupService) {}

  @Get()
  @RequirePermissions("service_orders.opening.create")
  listBrands(@Query() query: Record<string, unknown>) {
    return this.equipment.listBrands(parseOpeningEquipmentSearchQuery(query));
  }
}
