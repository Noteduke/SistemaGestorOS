import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module.js";
import { PrismaService } from "../infrastructure/prisma/prisma.service.js";
import { PERMISSION_CATALOG } from "../modules/auth/auth.constants.js";

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const prisma = app.get(PrismaService);
    for (const [code, description] of PERMISSION_CATALOG) {
      await prisma.permission.upsert({
        where: { code },
        create: { code, description },
        update: { description },
      });
    }
    console.log(`Catálogo verificado: ${PERMISSION_CATALOG.length} permissões.`);
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Falha ao verificar o catálogo de permissões.";
  console.error(message);
  process.exitCode = 1;
});
