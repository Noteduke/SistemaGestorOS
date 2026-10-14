import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "./infrastructure/prisma/prisma.module.js";
import { AuthModule } from "./modules/auth/auth.module.js";
import { PeopleModule } from "./modules/people/people.module.js";
import { ServiceOrdersModule } from "./modules/service-orders/service-orders.module.js";
import { UsersModule } from "./modules/users/users.module.js";
import { EquipmentModule } from "./modules/equipment/equipment.module.js";
import { ServicesModule } from "./modules/services/services.module.js";
import { ProductsModule } from "./modules/products/products.module.js";

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, AuthModule, PeopleModule, ServiceOrdersModule, UsersModule, EquipmentModule, ServicesModule, ProductsModule],
})
export class AppModule {}
