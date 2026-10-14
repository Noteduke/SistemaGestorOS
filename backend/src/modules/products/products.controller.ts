import { Body, Controller, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import type { AuthRequest } from "../auth/auth.types.js";
import { RequirePermissions } from "../auth/decorators/auth-metadata.js";
import { parseCreateProduct, parseProductListQuery, parseUpdateProduct } from "./dto/product.dto.js";
import { ProductsService } from "./products.service.js";

@Controller("products")
@RequirePermissions("products.manage")
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  list(@Query() query: Record<string, unknown>, @Req() request: AuthRequest) {
    return this.products.list(parseProductListQuery(query), request.auth!);
  }

  @Get(":publicId")
  get(@Param("publicId") publicId: string, @Req() request: AuthRequest) {
    return this.products.get(publicId, request.auth!);
  }

  @Post()
  create(@Body() body: unknown, @Req() request: AuthRequest) {
    return this.products.create(parseCreateProduct(body), request.auth!);
  }

  @Patch(":publicId")
  update(@Param("publicId") publicId: string, @Body() body: unknown, @Req() request: AuthRequest) {
    return this.products.update(publicId, parseUpdateProduct(body), request.auth!);
  }
}
