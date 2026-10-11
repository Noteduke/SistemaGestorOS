import { Body, Controller, Get, Param, Patch, Put, Query, Req } from "@nestjs/common";
import { RequirePermissions } from "../auth/decorators/auth-metadata.js";
import type { AuthRequest } from "../auth/auth.types.js";
import { parseListServiceOrdersQuery } from "./dto/list-service-orders-query.dto.js";
import { parseOperationalSituationPatch } from "./dto/operational-situation-patch.dto.js";
import { ServiceOrderOperationalSituationService } from "./service-order-operational-situation.service.js";
import { parseAssignmentsPut } from "./dto/assignments-put.dto.js";
import { ServiceOrderAssignmentsService } from "./service-order-assignments.service.js";
import { ServiceOrdersReadService } from "./service-orders-read.service.js";

@Controller("service-orders")
export class ServiceOrdersController {
  constructor(
    private readonly orders: ServiceOrdersReadService,
    private readonly situations: ServiceOrderOperationalSituationService,
    private readonly assignments: ServiceOrderAssignmentsService,
  ) {}

  @Get()
  @RequirePermissions("service_orders.read")
  list(@Query() query: Record<string, unknown>) {
    return this.orders.list(parseListServiceOrdersQuery(query));
  }

  @Get(":publicId")
  @RequirePermissions("service_orders.read")
  getByPublicId(@Param("publicId") publicId: string) {
    return this.orders.getByPublicId(publicId);
  }

  @Patch(":publicId/operational-situation")
  @RequirePermissions("service_orders.situation.update")
  updateOperationalSituation(@Param("publicId") publicId: string, @Body() body: unknown, @Req() request: AuthRequest) {
    return this.situations.update(publicId, parseOperationalSituationPatch(body), request.auth!);
  }

  @Put(":publicId/assignments")
  @RequirePermissions("service_orders.assignment.manage")
  replaceAssignments(@Param("publicId") publicId: string, @Body() body: unknown, @Req() request: AuthRequest) {
    return this.assignments.replace(publicId, parseAssignmentsPut(body), request.auth!);
  }
}
