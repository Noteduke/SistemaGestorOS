import { Body, Controller, Get, Param, Patch, Post, Req } from "@nestjs/common";
import { RequireAuthenticated, RequirePermissions } from "../auth/decorators/auth-metadata.js";
import type { AuthRequest } from "../auth/auth.types.js";
import { parseServiceOrderStatusInput, parseServiceOrderStatusPatch } from "./dto/service-order-status.dto.js";
import { ServiceOrderStatusesService } from "./service-order-statuses.service.js";

@Controller("service-order-statuses")
export class ServiceOrderStatusesController {
  constructor(private readonly statuses: ServiceOrderStatusesService) {}

  @Get()
  @RequirePermissions("service_orders.read")
  list() { return this.statuses.list(); }

  @Post()
  @RequireAuthenticated()
  create(@Body() body: unknown, @Req() request: AuthRequest) {
    return this.statuses.create(parseServiceOrderStatusInput(body), request.auth!);
  }

  @Patch(":publicId")
  @RequireAuthenticated()
  update(@Param("publicId") publicId: string, @Body() body: unknown, @Req() request: AuthRequest) {
    return this.statuses.update(publicId, parseServiceOrderStatusPatch(body), request.auth!);
  }
}
