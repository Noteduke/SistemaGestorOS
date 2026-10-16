import { spawnSync } from "node:child_process";
import { createPool } from "mariadb";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const targets = new Set(["gestor_os_opening_test", "gestor_os_homologation"]);
const [target, command, action, ...extraArgs] = process.argv.slice(2);
if (!targets.has(target) || command !== "migrate" || !["status", "deploy"].includes(action) || extraArgs.length > 0) {
  console.error("Uso: npm run prisma:safe -- <gestor_os_opening_test|gestor_os_homologation> migrate <status|deploy>");
  process.exit(2);
}

let sourceUrl;
const envFile = process.env.GOS_ENV_FILE ?? (target === "gestor_os_homologation" ? ".env.homologation" : ".env");
try {
  const parsed = dotenv.parse(fs.readFileSync(path.resolve(backendDir, envFile), "utf8"));
  sourceUrl = new URL(process.env.DATABASE_URL ?? parsed.DATABASE_URL ?? "");
  if (sourceUrl.protocol !== "mysql:" || !["localhost", "127.0.0.1"].includes(sourceUrl.hostname) || !sourceUrl.username) {
    throw new Error("invalid local database configuration");
  }
} catch {
  console.error("Operação de banco bloqueada: configuração local MySQL ausente ou inválida; nenhum destino foi conectado.");
  process.exit(2);
}

const targetUrl = new URL(sourceUrl);
if (target === "gestor_os_homologation" && decodeURIComponent(targetUrl.pathname.slice(1)) !== target) {
  console.error("Operação de banco bloqueada: arquivo de homologação não aponta para gestor_os_homologation.");
  process.exit(2);
}
targetUrl.pathname = `/${target}`;
targetUrl.hash = "";

const pool = createPool({
  host: targetUrl.hostname,
  port: Number(targetUrl.port || 3306),
  user: decodeURIComponent(targetUrl.username),
  password: decodeURIComponent(targetUrl.password),
  database: target,
  connectionLimit: 1,
  connectTimeout: 5000,
});
try {
  const rows = await pool.query("SELECT DATABASE() AS selected");
  if (rows[0]?.selected !== target) throw new Error("database mismatch");
} catch {
  console.error(`Operação de banco bloqueada: pré-checagem de SELECT DATABASE() não confirmou ${target}; nenhum comando Prisma foi iniciado.`);
  await pool.end().catch(() => undefined);
  process.exit(2);
}
await pool.end();
console.log(`Destino confirmado por SELECT DATABASE(): ${target}.`);

const require = createRequire(import.meta.url);
let prismaCli;
try {
  const packageJsonPath = require.resolve("prisma/package.json");
  const packageDirectory = path.dirname(packageJsonPath);
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  prismaCli = path.resolve(packageDirectory, packageJson.bin.prisma);
} catch {
  console.error("Prisma local não está disponível; nenhum download automático foi iniciado.");
  process.exit(2);
}

const childEnv = { ...process.env, DATABASE_URL: targetUrl.href, GOS_DATABASE_TARGET: target, GOS_DATABASE_PREFLIGHT_CONFIRMED: target, GOS_ENV_FILE: envFile };
delete childEnv.SHADOW_DATABASE_URL;
const result = spawnSync(process.execPath, [prismaCli, command, action], { cwd: backendDir, env: childEnv, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
const redact = (text) => String(text ?? "").replace(/mysql:\/\/[^\s@]+@/giu, "mysql://[credenciais omitidas]@");
if (result.stdout) process.stdout.write(redact(result.stdout));
if (result.stderr) process.stderr.write(redact(result.stderr));
if (result.error) {
  console.error("Falha ao iniciar o Prisma local; detalhes de ambiente foram omitidos.");
  process.exit(2);
}
process.exit(result.status ?? 2);
