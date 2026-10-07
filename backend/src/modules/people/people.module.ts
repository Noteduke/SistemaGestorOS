import { Module } from "@nestjs/common";
import { PrismaModule } from "../../infrastructure/prisma/prisma.module.js";
import { PeopleController } from "./people.controller.js";
import { PeopleService } from "./people.service.js";

@Module({
  imports: [PrismaModule],
  controllers: [PeopleController],
  providers: [PeopleService],
})
export class PeopleModule {}
