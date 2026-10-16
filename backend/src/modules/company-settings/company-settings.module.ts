import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "../../infrastructure/prisma/prisma.module.js";
import { CompanySettingsController } from "./company-settings.controller.js";
import { CompanySettingsService } from "./company-settings.service.js";

@Module({ imports: [ConfigModule, PrismaModule], controllers: [CompanySettingsController], providers: [CompanySettingsService] })
export class CompanySettingsModule {}
