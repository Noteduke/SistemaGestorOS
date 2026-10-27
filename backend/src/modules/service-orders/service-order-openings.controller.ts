import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Req } from "@nestjs/common";
import { RequireAuthenticated, RequirePermissions } from "../auth/decorators/auth-metadata.js";
import type { AuthRequest } from "../auth/auth.types.js";
import { requireEmptyOpeningBody } from "./dto/empty-opening-body.dto.js";
import { parseOpeningPatch } from "./dto/opening-patch.dto.js";
import { parseConfirmOpening } from "./dto/confirm-opening.dto.js";
import { ServiceOrderConfirmationService } from "./service-order-confirmation.service.js";
import { ServiceOrderOpeningsService } from "./service-order-openings.service.js";

@Controller("service-orders/openings")
export class ServiceOrderOpeningsController {
  constructor(private readonly openings: ServiceOrderOpeningsService, private readonly confirmation: ServiceOrderConfirmationService) {}

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

  @Get("options")
  @RequirePermissions("service_orders.opening.create")
  options() { return this.openings.options(); }

  @Get(":publicId")
  @RequireAuthenticated()
  getByPublicId(@Param("publicId") publicId: string, @Req() request: AuthRequest) {
    return this.openings.getByPublicId(publicId, request.auth!);
  }

  @Patch(":publicId")
  @RequireAuthenticated()
  update(@Param("publicId") publicId: string, @Body() body: unknown, @Req() request: AuthRequest) {
    return this.openings.update(publicId, parseOpeningPatch(body), request.auth!);
  }

  @Post(":publicId/cancel")
  @RequireAuthenticated()
  @HttpCode(HttpStatus.OK)
  cancel(@Param("publicId") publicId: string, @Body() body: unknown, @Req() request: AuthRequest) {
    requireEmptyOpeningBody(body);
    return this.openings.cancel(publicId, request.auth!);
  }

  @Post(":publicId/confirm")
  @RequireAuthenticated()
  confirm(@Param("publicId") publicId: string, @Body() body: unknown, @Req() request: AuthRequest) {
    return this.confirmation.confirm(publicId, parseConfirmOpening(body), request.auth!);
  }
}
