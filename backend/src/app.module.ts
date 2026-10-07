import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "./infrastructure/prisma/prisma.module.js";
import { PeopleModule } from "./modules/people/people.module.js";

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, PeopleModule],
})
export class AppModule {}
