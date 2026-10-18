const HOMOLOGATION_DATABASE = "gestor_os_homologation";

export function assertDatabaseTarget(
  databaseUrl: URL,
  declaredTarget: string | undefined,
  deploymentEnvironment: string | undefined,
  externalEffectsEnabled: string | undefined,
): string {
  const databaseName = decodeURIComponent(databaseUrl.pathname.slice(1));
  if (declaredTarget && declaredTarget !== databaseName) {
    throw new Error("Destino do banco não corresponde a GOS_DATABASE_TARGET.");
  }

  const databaseHost = databaseUrl.hostname.toLowerCase().replace(/^\[|\]$/gu, "");
  const databaseHostIsLocal = databaseHost === "localhost" || databaseHost === "127.0.0.1" || databaseHost === "::1";
  const databaseUser = decodeURIComponent(databaseUrl.username);
  if (deploymentEnvironment === "homologation" &&
      (databaseName !== HOMOLOGATION_DATABASE || databaseUser !== "gos_homologation_app" || !databaseHostIsLocal || externalEffectsEnabled !== "false")) {
    throw new Error("Homologação exige banco gestor_os_homologation, usuário gos_homologation_app, conexão local e efeitos externos desativados.");
  }

  return databaseName;
}
