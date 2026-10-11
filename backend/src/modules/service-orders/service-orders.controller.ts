import { Controller, Get, Param, Query } from "@nestjs/common";
import { RequirePermissions } from "../auth/decorators/auth-metadata.js";
import { parseListServiceOrdersQuery } from "./dto/list-service-orders-query.dto.js";
import { ServiceOrdersReadService } from "./service-orders-read.service.js";

@Controller("service-orders")
export class ServiceOrdersController {
  constructor(private readonly orders: ServiceOrdersReadService) {}

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
}
