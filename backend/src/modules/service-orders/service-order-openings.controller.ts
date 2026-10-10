import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import { RequireAuthenticated, RequirePermissions } from "../auth/decorators/auth-metadata.js";
import type { AuthRequest } from "../auth/auth.types.js";
import { requireEmptyOpeningBody } from "./dto/empty-opening-body.dto.js";
import { ServiceOrderOpeningsService } from "./service-order-openings.service.js";

@Controller("service-orders/openings")
export class ServiceOrderOpeningsController {
  constructor(private readonly openings: ServiceOrderOpeningsService) {}

  @Post()
  @RequirePermissions("service_orders.opening.create")
  create(@Body() body: unknown, @Req() request: AuthRequest) {
    requireEmptyOpeningBody(body);
    return this.openings.create(request.auth!);
  }

  @Get("current")
  @RequirePermissions("service_orders.opening.read")
  current(@Req() request: AuthRequest) {
    return this.openings.current(request.auth!);
  }

  @Get(":publicId")
  @RequireAuthenticated()
  getByPublicId(@Param("publicId") publicId: string, @Req() request: AuthRequest) {
    return this.openings.getByPublicId(publicId, request.auth!);
  }

  @Post(":publicId/cancel")
  @RequireAuthenticated()
  cancel(@Param("publicId") publicId: string, @Body() body: unknown, @Req() request: AuthRequest) {
    requireEmptyOpeningBody(body);
    return this.openings.cancel(publicId, request.auth!);
  }
}
