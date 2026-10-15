import { Module } from "@nestjs/common";
import { PrismaModule } from "../../infrastructure/prisma/prisma.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { ProductsController } from "./products.controller.js";
import { ProductStockController } from "./product-stock.controller.js";
import { ProductStockService } from "./product-stock.service.js";
import { ProductsService } from "./products.service.js";

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [ProductsController, ProductStockController],
  providers: [ProductsService, ProductStockService],
})
export class ProductsModule {}
