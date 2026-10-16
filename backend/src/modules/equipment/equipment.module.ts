import { Module } from "@nestjs/common";
import { PrismaModule } from "../../infrastructure/prisma/prisma.module.js";
import { EquipmentBrandsController, EquipmentController, EquipmentTypesController } from "./equipment.controller.js";
import { EquipmentLookupService } from "./equipment-lookup.service.js";
import { DellPublicLookupService } from "./dell-public-lookup.service.js";

@Module({
  imports: [PrismaModule],
  controllers: [EquipmentController, EquipmentTypesController, EquipmentBrandsController],
  providers: [EquipmentLookupService, DellPublicLookupService],
})
export class EquipmentModule {}
