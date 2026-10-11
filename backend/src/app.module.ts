import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "./infrastructure/prisma/prisma.module.js";
import { AuthModule } from "./modules/auth/auth.module.js";
import { PeopleModule } from "./modules/people/people.module.js";
import { ServiceOrdersModule } from "./modules/service-orders/service-orders.module.js";
import { UsersModule } from "./modules/users/users.module.js";

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, AuthModule, PeopleModule, ServiceOrdersModule, UsersModule],
})
export class AppModule {}
