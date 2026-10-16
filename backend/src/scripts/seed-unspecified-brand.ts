import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module.js";
import { PrismaService } from "../infrastructure/prisma/prisma.service.js";
import { safeDiagnosticMessage } from "../infrastructure/safe-diagnostic.js";
import { ensureUnspecifiedBrand } from "./ensure-unspecified-brand.js";

async function main(): Promise<void> {
  const expectedDatabase = process.env.EXPECTED_SEED_DATABASE;
  if (!expectedDatabase || !/^[a-zA-Z0-9_]+$/.test(expectedDatabase)) {
    throw new Error("Defina EXPECTED_SEED_DATABASE para confirmar explicitamente o banco de destino.");
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const prisma = app.get(PrismaService);
    const rows = await prisma.$queryRaw<{ database_name: string | null }[]>`SELECT DATABASE() AS database_name`;
    if (rows.length !== 1 || rows[0].database_name !== expectedDatabase) {
      throw new Error("O banco conectado não corresponde a EXPECTED_SEED_DATABASE; nenhuma marca foi criada.");
    }
    const outcome = await ensureUnspecifiedBrand(prisma);
    console.log(`Marca controlada verificada em ${expectedDatabase}: ${outcome}.`);
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(safeDiagnosticMessage(error, "Falha ao verificar a Marca controlada."));
  process.exitCode = 1;
});
