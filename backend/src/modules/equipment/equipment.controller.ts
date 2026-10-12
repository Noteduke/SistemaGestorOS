import { Controller, Get, Query } from "@nestjs/common";
import { RequirePermissions } from "../auth/decorators/auth-metadata.js";
import { parseOpeningEquipmentSearchQuery } from "./dto/opening-equipment-search-query.dto.js";
import { EquipmentLookupService } from "./equipment-lookup.service.js";

@Controller("equipment")
export class EquipmentController {
  constructor(private readonly equipment: EquipmentLookupService) {}

  @Get("opening-search")
  @RequirePermissions("service_orders.opening.create")
  searchForOpening(@Query() query: Record<string, unknown>) {
    return this.equipment.searchForOpening(parseOpeningEquipmentSearchQuery(query));
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
