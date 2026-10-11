import { Module } from "@nestjs/common";
import { PrismaModule } from "../../infrastructure/prisma/prisma.module.js";
import { UsersAssignableController } from "./users-assignable.controller.js";
import { UsersAssignableService } from "./users-assignable.service.js";

@Module({
  imports: [PrismaModule],
  controllers: [UsersAssignableController],
  providers: [UsersAssignableService],
})
export class UsersModule {}
