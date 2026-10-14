import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import type { AuthRequest } from "../auth/auth.types.js";
import { RequirePermissions } from "../auth/decorators/auth-metadata.js";
import { parseCreateServiceDto, parseDeleteServiceQuery, parseServiceListQuery, parseUpdateServiceDto } from "./dto/service.dto.js";
import { ServicesService } from "./services.service.js";

@Controller("services")
export class ServicesController {
  constructor(private readonly services: ServicesService) {}

  @Get()
  @RequirePermissions("services.manage")
  list(@Query() query: Record<string, unknown>) {
    return this.services.list(parseServiceListQuery(query));
  }

  @Get("available-for-order")
  @RequirePermissions("service_orders.budget.update")
  availableForOrder() {
    return this.services.availableForOrder();
  }

  @Get(":publicId")
  @RequirePermissions("services.manage")
  get(@Param("publicId") publicId: string) {
    return this.services.get(publicId);
  }

  @Post()
  @RequirePermissions("services.manage")
  create(@Body() body: unknown, @Req() request: AuthRequest) {
    return this.services.create(parseCreateServiceDto(body), request.auth!.id);
  }

  @Patch(":publicId")
  @RequirePermissions("services.manage")
  update(@Param("publicId") publicId: string, @Body() body: unknown, @Req() request: AuthRequest) {
    return this.services.update(publicId, parseUpdateServiceDto(body), request.auth!.id);
  }

  @Delete(":publicId")
  @RequirePermissions("services.manage")
  remove(@Param("publicId") publicId: string, @Query() query: Record<string, unknown>, @Req() request: AuthRequest) {
    return this.services.remove(publicId, parseDeleteServiceQuery(query), request.auth!.id);
  }
}
