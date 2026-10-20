import { Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../../generated/prisma/client.js";
import { buildMysqlConnectionOptions } from "./mysql-connection-options.js";

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(configService: ConfigService) {
    const adapter = new PrismaMariaDb(buildMysqlConnectionOptions(configService));

    super({ adapter });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      // The adapter can absorb capability-probe failures; require a successful read as well.
      await this.$queryRaw`SELECT 1`;
    } catch {
      throw new Error("Não foi possível conectar ao banco configurado; detalhes de conexão foram omitidos.");
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
