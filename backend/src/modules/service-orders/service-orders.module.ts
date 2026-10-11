import { Module } from "@nestjs/common";
import { PrismaModule } from "../../infrastructure/prisma/prisma.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { ServiceOrderOpeningsController } from "./service-order-openings.controller.js";
import { ServiceOrderOpeningsService } from "./service-order-openings.service.js";
import { ServiceOrderConfirmationService } from "./service-order-confirmation.service.js";

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [ServiceOrderOpeningsController],
  providers: [ServiceOrderOpeningsService, ServiceOrderConfirmationService],
})
export class ServiceOrdersModule {}
