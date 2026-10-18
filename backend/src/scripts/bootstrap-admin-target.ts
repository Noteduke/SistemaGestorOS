import { existsSync, realpathSync } from "node:fs";
import path from "node:path";

const HOMOLOGATION_ENV_FILE = ".env.homologation";
const HOMOLOGATION_DATABASE = "gestor_os_homologation";

export function assertHomologationBootstrapTarget(environment: NodeJS.ProcessEnv): void {
  const envFile = environment.GOS_ENV_FILE?.trim();
  if (!envFile || !path.isAbsolute(envFile) || path.basename(envFile).toLowerCase() !== HOMOLOGATION_ENV_FILE || !existsSync(envFile)) {
    throw new Error("Bootstrap exige GOS_ENV_FILE apontando para um arquivo .env.homologation existente.");
  }

  const realEnvFile = realpathSync(envFile);
  if (path.basename(realEnvFile).toLowerCase() !== HOMOLOGATION_ENV_FILE) {
    throw new Error("O arquivo selecionado não é a configuração homologation aprovada.");
  }

  if (environment.GOS_DEPLOYMENT_ENV !== "homologation" ||
      environment.GOS_DATABASE_TARGET !== HOMOLOGATION_DATABASE ||
      environment.GOS_EXTERNAL_EFFECTS_ENABLED !== "false") {
    throw new Error("Bootstrap permitido somente com homologation, banco gestor_os_homologation e efeitos externos desativados.");
  }
}
