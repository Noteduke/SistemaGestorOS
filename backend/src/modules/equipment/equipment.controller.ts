import { Body, Controller, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import type { AuthRequest } from "../auth/auth.types.js";
import { RequirePermissions } from "../auth/decorators/auth-metadata.js";
import { parseOpeningEquipmentSearchQuery } from "./dto/opening-equipment-search-query.dto.js";
import { EquipmentLookupService } from "./equipment-lookup.service.js";
import { DellPublicLookupService } from "./dell-public-lookup.service.js";

@Controller("equipment")
export class EquipmentController {
  constructor(private readonly equipment: EquipmentLookupService, private readonly dell: DellPublicLookupService) {}

  @Patch(":publicId")
  @RequirePermissions("equipment.update")
  update(@Param("publicId") publicId: string, @Body() body: unknown, @Req() request: AuthRequest) {
    return this.equipment.updateEquipment(publicId, body, request.auth!.id);
  }

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

  @Post()
  @RequirePermissions("equipment.create")
  create(@Body() body: unknown, @Req() request: AuthRequest) { return this.equipment.createCatalog("type", body, request.auth!.id); }

  @Get()
  @RequirePermissions("service_orders.opening.create")
  listTypes(@Query() query: Record<string, unknown>) {
    return this.equipment.listTypes(parseOpeningEquipmentSearchQuery(query));
  }
}

@Controller("equipment-brands")
export class EquipmentBrandsController {
  constructor(private readonly equipment: EquipmentLookupService) {}

  @Post()
  @RequirePermissions("equipment.create")
  create(@Body() body: unknown, @Req() request: AuthRequest) { return this.equipment.createCatalog("brand", body, request.auth!.id); }

  @Get()
  @RequirePermissions("service_orders.opening.create")
  listBrands(@Query() query: Record<string, unknown>) {
    return this.equipment.listBrands(parseOpeningEquipmentSearchQuery(query));
  }
}
