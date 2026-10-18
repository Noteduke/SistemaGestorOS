import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { assertHomologationBootstrapTarget } from "../src/scripts/bootstrap-admin-target.ts";
import { assertDatabaseTarget } from "../src/infrastructure/homologation-database-target.ts";

const backendPackage = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const bootstrapSource = readFileSync(new URL("../src/scripts/bootstrap-admin.ts", import.meta.url), "utf8");

const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), "gestor-os-bootstrap-test-"));
const envFile = path.join(temporaryRoot, ".env.homologation");
writeFileSync(envFile, "# fixture sem credenciais\n", { flag: "wx" });

test("aceita somente configuração explícita da Homologação 1", () => {
  assert.doesNotThrow(() => assertHomologationBootstrapTarget({
    GOS_ENV_FILE: envFile,
    GOS_DEPLOYMENT_ENV: "homologation",
    GOS_DATABASE_TARGET: "gestor_os_homologation",
    GOS_EXTERNAL_EFFECTS_ENABLED: "false",
  }));
});

test("comando no servidor usa bootstrap compilado sem reconstruir o projeto", () => {
  assert.equal(backendPackage.scripts["auth:bootstrap-homologation-admin"], "node dist/scripts/bootstrap-admin.js");
});

test("guard executa antes da aplicação e o prompt não ecoa nem registra a senha", () => {
  const targetGuardIndex = bootstrapSource.indexOf("assertHomologationBootstrapTarget(process.env)");
  const appStartIndex = bootstrapSource.indexOf("NestFactory.createApplicationContext(AppModule");
  assert.ok(targetGuardIndex >= 0 && targetGuardIndex < appStartIndex);
  assert.match(bootstrapSource, /stdin\.setRawMode\(true\)/u);
  assert.match(bootstrapSource, /bootstrapFirstAdmin\(username, password\)/u);
  assert.doesNotMatch(bootstrapSource, /process\.argv/u);
  assert.doesNotMatch(bootstrapSource, /stdout\.write\(\s*(?:value|password|confirmation)/iu);
  assert.doesNotMatch(bootstrapSource, /console\.(?:log|error)\(\s*(?:value|password|confirmation)/iu);
});

test("recusa ambiente, banco, efeitos ou arquivo diferentes sem revelar configuração", () => {
  const valid = {
    GOS_ENV_FILE: envFile,
    GOS_DEPLOYMENT_ENV: "homologation",
    GOS_DATABASE_TARGET: "gestor_os_homologation",
    GOS_EXTERNAL_EFFECTS_ENABLED: "false",
    DATABASE_URL: "mysql://fixture:must-not-appear@localhost:3306/gestor_os",
  };
  for (const invalid of [
    { GOS_DEPLOYMENT_ENV: "production" },
    { GOS_DATABASE_TARGET: "gestor_os" },
    { GOS_EXTERNAL_EFFECTS_ENABLED: "true" },
    { GOS_ENV_FILE: path.join(temporaryRoot, ".env") },
    { GOS_ENV_FILE: path.join(temporaryRoot, ".env.homologation-missing") },
  ]) {
    assert.throws(
      () => assertHomologationBootstrapTarget({ ...valid, ...invalid }),
      (error) => !error.message.includes("must-not-appear"),
    );
  }
});

test("guard do Prisma recusa banco ou host não local antes de criar o adapter", () => {
  assert.throws(
    () => assertDatabaseTarget(new URL("mysql://gos_homologation_app@localhost:3306/gestor_os"), "gestor_os_homologation", "homologation", "false"),
    /Destino do banco não corresponde a GOS_DATABASE_TARGET/,
  );
  assert.throws(
    () => assertDatabaseTarget(new URL("mysql://gos_homologation_app@192.0.2.10:3306/gestor_os_homologation"), "gestor_os_homologation", "homologation", "false"),
    /conexão local/,
  );
  assert.throws(
    () => assertDatabaseTarget(new URL("mysql://root@localhost:3306/gestor_os_homologation"), "gestor_os_homologation", "homologation", "false"),
    /usuário gos_homologation_app/,
  );
  assert.equal(
    assertDatabaseTarget(new URL("mysql://gos_homologation_app@[::1]:3306/gestor_os_homologation"), "gestor_os_homologation", "homologation", "false"),
    "gestor_os_homologation",
  );
});

test.after(() => rmSync(temporaryRoot, { recursive: true, force: true }));
