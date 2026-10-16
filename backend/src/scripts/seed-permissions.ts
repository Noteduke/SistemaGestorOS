import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module.js";
import { PrismaService } from "../infrastructure/prisma/prisma.service.js";
import { safeDiagnosticMessage } from "../infrastructure/safe-diagnostic.js";
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
  console.error(safeDiagnosticMessage(error, "Falha ao verificar o catálogo de permissões."));
  process.exitCode = 1;
});
