import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "../../infrastructure/prisma/prisma.module.js";
import { HomologationIssuesController } from "./homologation-issues.controller.js";
import { HomologationIssuesService } from "./homologation-issues.service.js";

@Module({ imports: [ConfigModule, PrismaModule], controllers: [HomologationIssuesController], providers: [HomologationIssuesService] })
export class HomologationIssuesModule {}
