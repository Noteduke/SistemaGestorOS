// Only enumerated metadata leaves the driver boundary. Never retain messages,
// SQL, configuration, tokens, addresses or raw Error/cause objects in a report.
export const mysqlErrorNames = {
  ER_CON_COUNT_ERROR: 1040, ER_DBACCESS_DENIED_ERROR: 1044, ER_ACCESS_DENIED_ERROR: 1045,
  ER_BAD_DB_ERROR: 1049, ER_BAD_FIELD_ERROR: 1054, ER_PARSE_ERROR: 1064,
  ER_HOST_IS_BLOCKED: 1129, ER_HOST_NOT_PRIVILEGED: 1130, ER_TABLEACCESS_DENIED_ERROR: 1142,
  ER_NO_SUCH_TABLE: 1146, ER_TOO_MANY_USER_CONNECTIONS: 1203, ER_USER_LIMIT_REACHED: 1226,
  ER_CONNECTION_ALREADY_CLOSED: 45001, ER_CMD_NOT_EXECUTED_DESTROYED: 45004,
  ER_SOCKET_UNEXPECTED_CLOSE: 45009, ER_CONNECTION_TIMEOUT: 45012, ER_CMD_CONNECTION_CLOSED: 45013,
  ER_SOCKET: 45019, ER_SERVER_SSL_DISABLED: 45023, ER_AUTHENTICATION_BAD_PACKET: 45024,
  ER_AUTHENTICATION_PLUGIN_NOT_SUPPORTED: 45025, ER_SOCKET_TIMEOUT: 45026,
  ER_POOL_ALREADY_CLOSED: 45027, ER_GET_CONNECTION_TIMEOUT: 45028,
  ER_CANNOT_RETRIEVE_RSA_KEY: 45044, ER_NOT_SUPPORTED_AUTH_PLUGIN: 45047,
  ER_SELF_SIGNED: 45056, ER_SELF_SIGNED_NO_PWD: 45057, ER_TLS_IDENTITY_ERROR: 45059,
  ER_POOL_NOT_INITIALIZED: 45060, ER_POOL_NO_CONNECTION: 45061, ER_SELF_SIGNED_SHA256: 45063,
} as const;
export const systemErrorNames = ["ECONNREFUSED", "ECONNRESET", "EHOSTUNREACH", "ENETUNREACH", "ENOTFOUND", "EAI_AGAIN", "ETIMEDOUT", "EPIPE", "ERR_TLS_CERT_ALTNAME_INVALID", "DEPTH_ZERO_SELF_SIGNED_CERT", "SELF_SIGNED_CERT_IN_CHAIN", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "CERT_HAS_EXPIRED"] as const;
export const prismaErrorNames = ["P1000", "P1001", "P1002", "P1008", "P1010", "P1017", "P2002", "P2010", "P2024"] as const;
export const mysqlStates = ["HY000", "28000", "08000", "08001", "08003", "08004", "08S01", "42000", "3D000", "42S02", "42S22", "23000"] as const;
export const observationSources = ["POOL_EVENT", "POOL_QUERY", "POOL_EXECUTE", "POOL_ACQUIRE", "CONNECTION_EVENT", "PRISMA_QUERY", "DISCONNECT", "POOL_END"] as const;
export type ObservationSource = typeof observationSources[number];
export type SafeMysqlFrame = Readonly<{ source: ObservationSource; depth: number; errno: number | "NONE"; code: string; state: string; prisma: string }>;
export type SafePoolMetrics = Readonly<{ active: number | "NONE"; idle: number | "NONE"; total: number | "NONE"; queued: number | "NONE"; limit: number | "NONE" }>;
const knownNumbers = new Set<number>(Object.values(mysqlErrorNames));
const knownCodes = new Set<string>([...Object.keys(mysqlErrorNames), ...systemErrorNames]);
const knownPrisma = new Set<string>(prismaErrorNames);
const knownStates = new Set<string>(mysqlStates);

function data(object: object, key: PropertyKey): unknown {
  try { return Object.getOwnPropertyDescriptor(object, key)?.value; } catch { return undefined; }
}
export function sanitizeMysqlError(error: unknown, source: ObservationSource): SafeMysqlFrame[] {
  if (!(observationSources as readonly string[]).includes(source)) return [];
  const seen = new Set<object>(); const frames: SafeMysqlFrame[] = [];
  function visit(value: unknown, depth: number): void {
    if (!value || typeof value !== "object" || seen.has(value) || seen.size >= 32 || depth > 8) return;
    seen.add(value);
    let errno: number | "NONE" = "NONE", code = "NONE", prisma = "NONE";
    for (const key of ["errno", "code", "originalCode"]) {
      const raw = data(value, key);
      if (typeof raw === "number" && knownNumbers.has(raw)) errno = raw;
      if (typeof raw === "string") {
        if (knownCodes.has(raw)) code = raw;
        if (knownPrisma.has(raw)) prisma = raw;
        if (/^\d{4,5}$/u.test(raw) && knownNumbers.has(Number(raw))) errno = Number(raw);
      }
    }
    const sqlState = data(value, "sqlState") ?? data(value, "state");
    const state = typeof sqlState === "string" && knownStates.has(sqlState) ? sqlState : "NONE";
    if (errno !== "NONE" || code !== "NONE" || state !== "NONE" || prisma !== "NONE") frames.push(Object.freeze({ source, depth, errno, code, state, prisma }));
    for (const key of ["cause", "originalError", "meta", "driverAdapterError"]) visit(data(value, key), depth + 1);
    const errors = data(value, "errors");
    if (Array.isArray(errors)) {
      const count = data(errors, "length");
      if (typeof count === "number") for (let index = 0; index < Math.min(count, 8); index++) visit(data(errors, String(index)), depth + 1);
    }
  }
  visit(error, 0);
  return frames;
}
export function classifyMysqlFrames(frames: readonly SafeMysqlFrame[]): string {
  const numbers = new Set(frames.map(frame => frame.errno));
  const names = new Set(frames.flatMap(frame => [frame.code, frame.prisma]));
  for (const frame of frames) if (Object.hasOwn(mysqlErrorNames, frame.code)) numbers.add(mysqlErrorNames[frame.code as keyof typeof mysqlErrorNames]);
  const categories = new Set<string>();
  if (numbers.has(45044)) categories.add("RSA_AUTHENTICATION");
  if (numbers.has(1045) || names.has("P1000") || numbers.has(45024) || numbers.has(45025) || numbers.has(45047)) categories.add("AUTHENTICATION");
  if ([1044, 1129, 1130, 1142].some(value => numbers.has(value)) || names.has("P1010")) categories.add("AUTHORIZATION");
  if ([1040, 1203, 1226].some(value => numbers.has(value))) categories.add("CONNECTION_LIMIT");
  if ([45023, 45056, 45057, 45059, 45063].some(value => numbers.has(value)) || systemErrorNames.slice(8).some(value => names.has(value))) categories.add("TLS_VALIDATION");
  if (["ECONNREFUSED", "ECONNRESET", "EHOSTUNREACH", "ENETUNREACH", "ENOTFOUND", "EAI_AGAIN", "EPIPE", "P1001", "P1017"].some(value => names.has(value)) || [45001, 45004, 45009, 45013, 45019].some(value => numbers.has(value))) categories.add("TCP_CONNECTION");
  if (numbers.has(45012) || names.has("ETIMEDOUT") || names.has("P1002")) categories.add("CONNECTION_TIMEOUT");
  if (numbers.has(45026) || names.has("P1008")) categories.add("TIMEOUT");
  if (numbers.has(1049)) categories.add("CONFIGURATION");
  if ([1054, 1064, 1146].some(value => numbers.has(value))) categories.add("PRISMA_QUERY");
  if (categories.size > 1) return "MULTIPLE_CAUSES";
  if (categories.size === 1) return [...categories][0];
  if (numbers.has(45028) || names.has("P2024")) return "POOL_ACQUIRE_TIMEOUT";
  if ([45027, 45060, 45061].some(value => numbers.has(value))) return "POOL_ACQUISITION";
  if (names.has("P2010") || names.has("P2002")) return "PRISMA_QUERY";
  return "UNKNOWN";
}
export class MysqlObservation {
  private primary: SafeMysqlFrame[] = [];
  private cleanup: SafeMysqlFrame[] = [];
  private closing = false;
  capture(error: unknown, source: ObservationSource): void {
    const target = this.closing ? this.cleanup : this.primary;
    for (const frame of sanitizeMysqlError(error, source)) {
      if (target.length >= 64) break;
      if (!target.some(existing => JSON.stringify(existing) === JSON.stringify(frame))) target.push(frame);
    }
  }
  beginCleanup(): void { this.closing = true; }
  snapshot(): { primary: readonly SafeMysqlFrame[]; cleanup: readonly SafeMysqlFrame[] } {
    return { primary: Object.freeze([...this.primary]), cleanup: Object.freeze([...this.cleanup]) };
  }
}

// Binding methods to the real target preserves MariaDB's private fields. Captures
// rejection metadata before Prisma converts it, without inspecting method arguments.
export function observeMysqlPool<T extends object>(pool: T, observation: MysqlObservation): T {
  const methods = new Map<PropertyKey, unknown>();
  return new Proxy(pool, {
    get(target, key) {
      if (methods.has(key)) return methods.get(key);
      const value = Reflect.get(target, key, target);
      if (typeof value !== "function") return value;
      const source = key === "query" ? "POOL_QUERY" : key === "execute" ? "POOL_EXECUTE" : key === "getConnection" ? "POOL_ACQUIRE" : undefined;
      const bound = source ? (...args: unknown[]) => {
        try { return Promise.resolve(Reflect.apply(value, target, args)).catch(error => { observation.capture(error, source); throw error; }); }
        catch (error) { observation.capture(error, source); throw error; }
      } : value.bind(target);
      methods.set(key, bound); return bound;
    },
  });
}

export function poolMetrics(pool: object, limit: number): SafePoolMetrics {
  const safe = (value: unknown): number | "NONE" => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000 ? value : "NONE";
  const metric = (name: string): number | "NONE" => { try { const method = Reflect.get(pool, name); return typeof method === "function" ? safe(method.call(pool)) : "NONE"; } catch { return "NONE"; } };
  return Object.freeze({ active: metric("activeConnections"), idle: metric("idleConnections"), total: metric("totalConnections"), queued: metric("taskQueueSize"), limit: safe(limit) });
}
export class MysqlDiagnosticFailure extends Error {
  readonly code: string;
  readonly primary: readonly SafeMysqlFrame[];
  readonly cleanup: readonly SafeMysqlFrame[];
  readonly metrics: SafePoolMetrics | undefined;
  constructor(observation: MysqlObservation, metrics: SafePoolMetrics | undefined, primaryFailed: boolean, wrongAuthenticatedTarget = false) {
    const snapshot = observation.snapshot();
    const code = wrongAuthenticatedTarget ? "AUTHENTICATED_TARGET_MISMATCH" : primaryFailed ? classifyMysqlFrames(snapshot.primary) : "CLEANUP_FAILURE";
    super("MYSQL_DIAGNOSTIC_FAILURE code=" + code);
    this.name = "MysqlDiagnosticFailure"; this.code = code;
    this.primary = snapshot.primary; this.cleanup = snapshot.cleanup;
    if (metrics) {
      const safe = (key: keyof SafePoolMetrics): number | "NONE" => {
        const value = data(metrics, key);
        return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000 ? value : "NONE";
      };
      this.metrics = Object.freeze({ active: safe("active"), idle: safe("idle"), total: safe("total"), queued: safe("queued"), limit: safe("limit") });
    }
  }
  lines(): string[] {
    const frameLine = (tag: string, frame: SafeMysqlFrame) => `${tag} source=${frame.source} depth=${frame.depth} errno=${frame.errno} code=${frame.code} state=${frame.state} prisma=${frame.prisma}`;
    const lines = this.primary.map(frame => frameLine("MYSQL_PRIMARY", frame));
    if (this.metrics) lines.push(`MYSQL_METRICS active=${this.metrics.active} idle=${this.metrics.idle} total=${this.metrics.total} queued=${this.metrics.queued} limit=${this.metrics.limit}`);
    lines.push(...this.cleanup.map(frame => frameLine("MYSQL_CLEANUP", frame)));
    return lines;
  }
}
