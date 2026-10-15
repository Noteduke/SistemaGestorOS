import { Body, Controller, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import type { AuthRequest } from "../auth/auth.types.js";
import { RequireAnyPermissions, RequirePermissions } from "../auth/decorators/auth-metadata.js";
import { parseCreateProduct, parseProductListQuery, parseUpdateProduct } from "./dto/product.dto.js";
import { ProductsService } from "./products.service.js";

@Controller("products")
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @RequireAnyPermissions("products.manage", "products.stock.manage")
  list(@Query() query: Record<string, unknown>, @Req() request: AuthRequest) {
    return this.products.list(parseProductListQuery(query), request.auth!);
  }

  @Get(":publicId")
  @RequireAnyPermissions("products.manage", "products.stock.manage")
  get(@Param("publicId") publicId: string, @Req() request: AuthRequest) {
    return this.products.get(publicId, request.auth!);
  }

  @Post()
  @RequirePermissions("products.manage")
  create(@Body() body: unknown, @Req() request: AuthRequest) {
    return this.products.create(parseCreateProduct(body), request.auth!);
  }

  @Patch(":publicId")
  @RequirePermissions("products.manage")
  update(@Param("publicId") publicId: string, @Body() body: unknown, @Req() request: AuthRequest) {
    return this.products.update(publicId, parseUpdateProduct(body), request.auth!);
  }
}
