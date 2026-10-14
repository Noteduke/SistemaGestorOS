import { Module } from "@nestjs/common";
import { PrismaModule } from "../../infrastructure/prisma/prisma.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { ServiceOrderOpeningsController } from "./service-order-openings.controller.js";
import { ServiceOrderOpeningsService } from "./service-order-openings.service.js";
import { ServiceOrderConfirmationService } from "./service-order-confirmation.service.js";
import { ServiceOrderOperationalSituationService } from "./service-order-operational-situation.service.js";
import { ServiceOrderAssignmentsService } from "./service-order-assignments.service.js";
import { ServiceOrderEventsReadService } from "./service-order-events-read.service.js";
import { ServiceOrdersController } from "./service-orders.controller.js";
import { ServiceOrdersReadService } from "./service-orders-read.service.js";
import { ServiceOrderNotesService } from "./service-order-notes.service.js";
import { ServiceOrderHistoryService } from "./service-order-history.service.js";

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [ServiceOrderOpeningsController, ServiceOrdersController],
  providers: [ServiceOrderOpeningsService, ServiceOrderConfirmationService, ServiceOrderOperationalSituationService, ServiceOrderAssignmentsService, ServiceOrdersReadService, ServiceOrderEventsReadService, ServiceOrderNotesService, ServiceOrderHistoryService],
})
export class ServiceOrdersModule {}
