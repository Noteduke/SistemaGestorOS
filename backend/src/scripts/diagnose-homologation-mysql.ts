import { readFileSync, lstatSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseEnv } from "node:util";
import { EventEmitter } from "node:events";
import mariadb, { type Pool } from "mariadb";
import { MysqlObservation, MysqlDiagnosticFailure, sanitizeMysqlError, classifyMysqlFrames, observeMysqlPool, poolMetrics, type SafePoolMetrics } from "../infrastructure/prisma/mysql-observability.js";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../generated/prisma/client.js";
import { buildMysqlConnectionOptions, type MysqlConnectionOptions } from "../infrastructure/prisma/mysql-connection-options.js";

const envFile = "C:/ProgramData/GestorOS/homologation/config/.env.homologation";
export const pinnedSettings = {
  GOS_MYSQL_AUTH_MODE: "rsa-pinned",
  GOS_MYSQL_RSA_PUBLIC_KEY_FILE: "C:/ProgramData/GestorOS/homologation/config/mysql/caching-sha2-public.pem",
  GOS_MYSQL_RSA_PUBLIC_KEY_SHA256: "9C2384DBD2B09A2CCE97D276A7ECAB92B565B9FA15978162C82EFAFB90A8C73B",
};
const guarded = ["DATABASE_URL", "GOS_DEPLOYMENT_ENV", "GOS_DATABASE_TARGET", "GOS_EXTERNAL_EFFECTS_ENABLED", ...Object.keys(pinnedSettings)];

export function parseDiagnosticConfig(text: string, inherited: NodeJS.ProcessEnv): Record<string, string> {
  const seen = new Set<string>();
  for (const line of text.replace(/^\uFEFF/u, "").split(/\r\n|\n|\r/u)) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/u.exec(line);
    if (!match || seen.has(match[1])) throw new Error("CONFIG_FORMAT");
    const value = match[2].trim();
    if ((value.startsWith('"') || value.startsWith("'")) && !new RegExp(value[0] + "\\s*(?:#.*)?$").test(value.slice(1))) throw new Error("CONFIG_FORMAT");
    seen.add(match[1]);
  }
  const values = parseEnv(text.replace(/^\uFEFF/u, ""));
  for (const name of guarded) if (inherited[name] !== undefined && inherited[name] !== values[name]) throw new Error("INHERITED_ENV_CONFLICT");
  if (inherited.GOS_ENV_FILE && path.resolve(inherited.GOS_ENV_FILE).toLowerCase() !== path.resolve(envFile).toLowerCase()) throw new Error("INHERITED_ENV_CONFLICT");
  for (const name of Object.keys(values)) {
    if (name.startsWith("GOS_MYSQL_") && (!Object.hasOwn(pinnedSettings, name) || values[name] !== pinnedSettings[name as keyof typeof pinnedSettings])) throw new Error("CONFLICTING_AUTH_CONFIG");
  }
  let url: URL;
  try { url = new URL(values.DATABASE_URL ?? ""); } catch { throw new Error("WRONG_TARGET"); }
  if (url.protocol !== "mysql:" || url.hostname !== "127.0.0.1" || (url.port || "3306") !== "3306" ||
      decodeURIComponent(url.username) !== "gos_homologation_app" || !decodeURIComponent(url.password) ||
      decodeURIComponent(url.pathname.slice(1)) !== "gestor_os_homologation" || url.search || url.hash ||
      values.GOS_DEPLOYMENT_ENV !== "homologation" || values.GOS_DATABASE_TARGET !== "gestor_os_homologation" ||
      values.GOS_EXTERNAL_EFFECTS_ENABLED !== "false") throw new Error("WRONG_TARGET");
  // Only this local object changes. process.env and the protected file remain untouched.
  return { ...values, ...pinnedSettings };
}

export function diagnosticFailureCode(error: unknown): string {
  if (error instanceof MysqlDiagnosticFailure) return error.code;
  const safe = ["CONFIG_FORMAT", "INHERITED_ENV_CONFLICT", "CONFLICTING_AUTH_CONFIG", "WRONG_TARGET", "AUTHENTICATED_TARGET_MISMATCH", "RUNTIME_VERSION", "PUBLIC_KEY_ENVELOPE", "PUBLIC_KEY_PARSE", "PUBLIC_KEY_ALGORITHM", "PUBLIC_KEY_SIZE", "PUBLIC_KEY_EXPORT", "REPARSE_POINT"];
  const own = (key: string): unknown => { try { return error && typeof error === "object" ? Object.getOwnPropertyDescriptor(error, key)?.value : undefined; } catch { return undefined; } };
  const ownMessage = own("message");
  if (typeof ownMessage === "string" && safe.includes(ownMessage)) return ownMessage;
  const code = classifyMysqlFrames(sanitizeMysqlError(error, "PRISMA_QUERY"));
  if (code !== "UNKNOWN") return code;
  // File failures contain no connection metadata and keep their existing safe categories.
  const ownCode = own("code");
  if (ownCode === "ENOENT") return "FILE_MISSING";
  if (ownCode === "EACCES" || ownCode === "EPERM") return "FILE_READ_DENIED";
  return "CONFIGURATION_OR_CONNECTION";
}

type ReadOnlyClient = { $queryRaw: PrismaClient["$queryRaw"]; $disconnect(): Promise<void> };
export type DiagnosticRuntime = { client: ReadOnlyClient; observation: MysqlObservation; closePool(): Promise<void>; metrics?(): SafePoolMetrics };
export async function queryDiagnostic(options: MysqlConnectionOptions,
  makeClient?: (options: MysqlConnectionOptions) => ReadOnlyClient | DiagnosticRuntime): Promise<string> {
  if (options.database !== "gestor_os_homologation" || options.user !== "gos_homologation_app" || options.host !== "127.0.0.1" || options.port !== 3306 || options.allowPublicKeyRetrieval !== false || options.permitRedirect !== false || !options.cachingRsaPublicKey || options.ssl) throw new Error("WRONG_TARGET");
  let observation = new MysqlObservation();
  let client: ReadOnlyClient | undefined, pool: Pool | undefined;
  let closePool: (() => Promise<void>) | undefined, metrics: (() => SafePoolMetrics) | undefined;
  let primaryFailed = false, cleanupFailed = false, wrongAuthenticatedTarget = false;
  let capturedMetrics: SafePoolMetrics | undefined;
  try {
    if (makeClient) {
      const runtime = makeClient(options);
      if ("client" in runtime) { client = runtime.client; observation = runtime.observation; closePool = () => runtime.closePool(); metrics = runtime.metrics; }
      else client = runtime;
    } else {
      // External pool is an officially supported Adapter API. Capture native causes
      // before capability probing swallows them or convertDriverError drops them.
      pool = mariadb.createPool({ ...options, prepareCacheLength: 0, connectionLimit: 1, connectTimeout: 5000, acquireTimeout: 10000 });
      closePool = () => pool!.end(); metrics = () => poolMetrics(pool!, 1);
      // Connector PoolPromise extends EventEmitter; its published Pool overloads omit error.
      (pool as unknown as EventEmitter).on("error", error => observation.capture(error, "POOL_EVENT"));
      const adapter = new PrismaMariaDb(observeMysqlPool(pool, observation), {
        disposeExternalPool: false, onConnectionError: error => observation.capture(error, "CONNECTION_EVENT"),
      });
      client = new PrismaClient({ adapter, log: [] });
    }
    const rows = await client.$queryRaw<Array<{ db: string; account: string; ok: number }>>`SELECT DATABASE() AS db, CURRENT_USER() AS account, 1 AS ok`;
    if (rows.length !== 1 || rows[0].db !== "gestor_os_homologation" || rows[0].account !== "gos_homologation_app@127.0.0.1" || Number(rows[0].ok) !== 1) {
      wrongAuthenticatedTarget = true; throw new Error("AUTHENTICATED_TARGET_MISMATCH");
    }
  } catch (error) { primaryFailed = true; observation.capture(error, "PRISMA_QUERY"); }
  finally {
    try { capturedMetrics = metrics?.(); } catch { /* No unsafe metrics escape. */ }
    observation.beginCleanup();
    try { await client?.$disconnect(); } catch (error) { cleanupFailed = true; observation.capture(error, "DISCONNECT"); }
    try { await closePool?.(); } catch (error) { cleanupFailed = true; observation.capture(error, "POOL_END"); }
  }
  if (primaryFailed || cleanupFailed) throw new MysqlDiagnosticFailure(observation, capturedMetrics, primaryFailed, wrongAuthenticatedTarget);
  return "READ_ONLY_OK database=gestor_os_homologation account=gos_homologation_app@127.0.0.1 prisma=7.10.1";
}

async function main(): Promise<void> {
  let stage = "RUNTIME";
  try {
    if (process.platform !== "win32" || process.arch !== "x64" || !/^v24\./u.test(process.version)) throw new Error("RUNTIME_VERSION");
    const root = path.resolve(import.meta.dirname, "../..");
    for (const [dependency, version] of [["@prisma/client", "7.10.1"], ["@prisma/adapter-mariadb", "7.10.1"], ["mariadb", "3.5.4"]]) {
      if (JSON.parse(readFileSync(path.join(root, "node_modules", dependency, "package.json"), "utf8")).version !== version) throw new Error("RUNTIME_VERSION");
    }
    stage = "CONFIG";
    let cursor = path.resolve(envFile);
    for (;;) {
      if (lstatSync(cursor).isSymbolicLink()) throw new Error("REPARSE_POINT");
      const parent = path.dirname(cursor); if (parent === cursor) break; cursor = parent;
    }
    if (lstatSync(envFile).size > 65536) throw new Error("CONFIG_FORMAT");
    const values = parseDiagnosticConfig(readFileSync(envFile, "utf8"), process.env);
    stage = "PUBLIC_KEY";
    const options = buildMysqlConnectionOptions({ get: <T>(key: string) => values[key] as T });
    stage = "PRISMA_READ_ONLY";
    console.log(await queryDiagnostic(options));
  } catch (error) {
    if (error instanceof MysqlDiagnosticFailure) for (const line of error.lines()) console.error(line);
    console.error(`FAIL stage=${stage} code=${diagnosticFailureCode(error)}`);
    process.exitCode = 1;
  }
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) await main();
