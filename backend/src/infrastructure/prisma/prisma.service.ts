import { Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../../generated/prisma/client.js";

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(configService: ConfigService) {
    const connectionString = configService.get<string>("DATABASE_URL");
    if (!connectionString?.trim()) {
      throw new Error("DATABASE_URL é obrigatória para iniciar a persistência.");
    }

    let databaseUrl: URL;
    try {
      databaseUrl = new URL(connectionString);
      if (
        databaseUrl.protocol !== "mysql:" ||
        !databaseUrl.hostname ||
        !databaseUrl.username ||
        databaseUrl.pathname.length <= 1
      ) {
        throw new Error("Invalid database URL");
      }
    } catch {
      throw new Error("DATABASE_URL deve ser uma URL MySQL válida.");
    }

    const adapter = new PrismaMariaDb({
      host: databaseUrl.hostname,
      port: Number(databaseUrl.port || 3306),
      user: decodeURIComponent(databaseUrl.username),
      password: decodeURIComponent(databaseUrl.password),
      database: decodeURIComponent(databaseUrl.pathname.slice(1)),
    });

    super({ adapter });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
