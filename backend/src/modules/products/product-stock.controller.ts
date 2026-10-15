import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import type { AuthRequest } from "../auth/auth.types.js";
import { RequireAnyPermissions, RequirePermissions } from "../auth/decorators/auth-metadata.js";
import {
  parseProductStockMovementsQuery, parseStockAdjustmentBody, parseStockDisposalBody, parseStockQuantityBody,
} from "./dto/product-stock.dto.js";
import { ProductStockService } from "./product-stock.service.js";

@Controller("products/:publicId/stock")
export class ProductStockController {
  constructor(private readonly stock: ProductStockService) {}

  @Get()
  @RequireAnyPermissions("products.manage", "products.stock.manage")
  summary(@Param("publicId") publicId: string) {
    return this.stock.summary(publicId);
  }

  @Get("movements")
  @RequireAnyPermissions("products.manage", "products.stock.manage")
  movements(@Param("publicId") publicId: string, @Query() query: Record<string, unknown>) {
    return this.stock.movements(publicId, parseProductStockMovementsQuery(query));
  }

  @Post("entries")
  @RequirePermissions("products.stock.manage")
  entry(@Param("publicId") publicId: string, @Body() body: unknown, @Req() request: AuthRequest) {
    return this.stock.entry(publicId, parseStockQuantityBody(body).quantity, request.auth!);
  }

  @Post("adjustments")
  @RequirePermissions("products.stock.manage")
  adjustment(@Param("publicId") publicId: string, @Body() body: unknown, @Req() request: AuthRequest) {
    return this.stock.adjustment(publicId, parseStockAdjustmentBody(body).quantityDelta, request.auth!);
  }

  @Post("defective/classifications")
  @RequirePermissions("products.stock.manage")
  classifyDefective(@Param("publicId") publicId: string, @Body() body: unknown, @Req() request: AuthRequest) {
    return this.stock.classifyDefective(publicId, parseStockQuantityBody(body).quantity, request.auth!);
  }

  @Post("defective/returns")
  @RequirePermissions("products.stock.manage")
  returnDefective(@Param("publicId") publicId: string, @Body() body: unknown, @Req() request: AuthRequest) {
    return this.stock.returnDefective(publicId, parseStockQuantityBody(body).quantity, request.auth!);
  }

  @Post("defective/disposals")
  @RequirePermissions("products.stock.manage")
  disposeDefective(@Param("publicId") publicId: string, @Body() body: unknown, @Req() request: AuthRequest) {
    const input = parseStockDisposalBody(body);
    return this.stock.disposeDefective(publicId, input.quantity, request.auth!);
  }
}
