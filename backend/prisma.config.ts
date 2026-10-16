import dotenv from "dotenv";
import { defineConfig, env } from "prisma/config";

dotenv.config({ path: process.env.GOS_ENV_FILE ?? ".env" });

const databaseOperations = new Set(["migrate", "db", "studio"]);
const prismaCommand = process.argv.slice(2).find((argument) => databaseOperations.has(argument));
if (prismaCommand) {
  const configuredTarget = process.env.GOS_DATABASE_TARGET;
  const connectionString = process.env.DATABASE_URL;
  let configuredDatabase = "";
  try {
    configuredDatabase = decodeURIComponent(new URL(connectionString ?? "").pathname.slice(1));
  } catch {
    throw new Error("Operação de banco bloqueada: DATABASE_URL inválida; configure o destino explicitamente.");
  }
  if (!["gestor_os_opening_test", "gestor_os_homologation"].includes(configuredTarget ?? "") || configuredTarget !== configuredDatabase || process.env.GOS_DATABASE_PREFLIGHT_CONFIRMED !== configuredTarget) {
    throw new Error("Operação de banco bloqueada: use prisma:safe para validar o destino por SELECT DATABASE() antes do comando.");
  }
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
