import { createHash, createPublicKey, X509Certificate } from "node:crypto";
import { closeSync, fstatSync, lstatSync, openSync, readSync, realpathSync } from "node:fs";
import { isIP } from "node:net";
import path from "node:path";
import { checkServerIdentity, type ConnectionOptions } from "node:tls";
import { assertDatabaseTarget } from "../homologation-database-target.js";

export type MysqlConfigReader = { get<T = string>(key: string): T | undefined };

export interface MysqlConnectionOptions {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  allowPublicKeyRetrieval: false;
  permitRedirect: false;
  ssl?: ConnectionOptions;
  cachingRsaPublicKey?: string;
  restrictedAuth?: string[];
}

function readVerifiedPublicPem(file: string | undefined, expectedHash: string | undefined): string {
  if (!file || !path.isAbsolute(file) || !expectedHash || !/^[a-f0-9]{64}$/iu.test(expectedHash)) {
    throw new Error("Material público MySQL exige caminho absoluto e SHA-256 válido conferido na origem.");
  }
  let descriptor: number | undefined;
  try {
    let cursor = path.resolve(file);
    while (true) {
      if (lstatSync(cursor).isSymbolicLink()) throw new Error();
      const parent = path.dirname(cursor);
      if (parent === cursor) break;
      cursor = parent;
    }
    if (path.resolve(realpathSync(file)) !== path.resolve(file)) throw new Error();
    descriptor = openSync(file, "r");
    const stat = fstatSync(descriptor);
    if (!stat.isFile() || stat.size < 1 || stat.size > 65536) throw new Error();
    const buffer = Buffer.alloc(65537);
    const size = readSync(descriptor, buffer, 0, buffer.length, 0);
    if (size !== stat.size) throw new Error();
    const bytes = buffer.subarray(0, size);
    if (createHash("sha256").update(bytes).digest("hex") !== expectedHash.toLowerCase()) throw new Error();
    const pem = bytes.toString("utf8").trim();
    if (pem.includes("PRIVATE KEY")) throw new Error();
    return pem;
  } catch {
    throw new Error("Material público MySQL ausente, inacessível, redirecionado, inválido ou com SHA-256 divergente.");
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

export function buildMysqlConnectionOptions(config: MysqlConfigReader): MysqlConnectionOptions {
  let url: URL;
  let user: string;
  let password: string;
  try {
    const value = config.get<string>("DATABASE_URL");
    if (!value?.trim()) throw new Error();
    url = new URL(value);
    if (url.protocol !== "mysql:" || !url.hostname || !url.username || url.pathname.length <= 1) throw new Error();
    user = decodeURIComponent(url.username);
    password = decodeURIComponent(url.password);
    decodeURIComponent(url.pathname.slice(1));
  } catch {
    throw new Error("DATABASE_URL MySQL ausente, inválida ou com codificação percentual inválida; detalhes omitidos.");
  }
  const environment = config.get<string>("GOS_DEPLOYMENT_ENV");
  const database = assertDatabaseTarget(url, config.get<string>("GOS_DATABASE_TARGET"), environment, config.get<string>("GOS_EXTERNAL_EFFECTS_ENABLED"));
  const host = url.hostname.replace(/^\[|\]$/gu, "").toLowerCase();
  const port = Number(url.port || 3306);
  if (environment === "homologation" && (port !== 3306 || !password || url.search || url.hash)) {
    throw new Error("Homologação exige porta MySQL 3306, senha configurada e opções de autenticação fora da URL.");
  }
  const options: MysqlConnectionOptions = { host, port, user, password, database, allowPublicKeyRetrieval: false, permitRedirect: false };
  const mode = config.get<string>("GOS_MYSQL_AUTH_MODE");
  const caFile = config.get<string>("GOS_MYSQL_TLS_CA_FILE");
  const caHash = config.get<string>("GOS_MYSQL_TLS_CA_SHA256");
  const serverName = config.get<string>("GOS_MYSQL_TLS_SERVER_NAME");
  const rsaFile = config.get<string>("GOS_MYSQL_RSA_PUBLIC_KEY_FILE");
  const rsaHash = config.get<string>("GOS_MYSQL_RSA_PUBLIC_KEY_SHA256");
  if (!mode && environment !== "homologation" && !caFile && !caHash && !serverName && !rsaFile && !rsaHash) return options;
  if (mode === "tls") {
    if (rsaFile || rsaHash) throw new Error("Não misture configuração TLS e chave RSA MySQL.");
    if (serverName && (serverName.length > 253 || isIP(serverName) || !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/iu.test(serverName))) {
      throw new Error("Identidade DNS MySQL TLS inválida.");
    }
    const pem = readVerifiedPublicPem(caFile, caHash);
    try {
      if (!/^-----BEGIN CERTIFICATE-----\s+[A-Za-z0-9+/=\s]+-----END CERTIFICATE-----$/u.test(pem)) throw new Error();
      const certificate = new X509Certificate(pem);
      const now = Date.now();
      if (!certificate.ca || Date.parse(certificate.validFrom) > now || Date.parse(certificate.validTo) < now) throw new Error();
    } catch { throw new Error("CA pública MySQL inválida, não é CA ou está fora da validade."); }
    const expectedIdentity = serverName || host;
    options.ssl = {
      ca: pem, rejectUnauthorized: true, minVersion: "TLSv1.2",
      checkServerIdentity: (_hostname, certificate) => checkServerIdentity(expectedIdentity, certificate),
      ...(serverName ? { servername: serverName } : {}),
    };
  } else if (mode === "rsa-pinned") {
    if (environment !== "homologation" || !["127.0.0.1", "localhost", "::1"].includes(host) || port !== 3306) {
      throw new Error("Chave RSA MySQL fixada é permitida somente na homologação local autorizada.");
    }
    if (caFile || caHash || serverName) throw new Error("Não misture configuração TLS e chave RSA MySQL.");
    const pem = readVerifiedPublicPem(rsaFile, rsaHash);
    try {
      const match = /^-----BEGIN (PUBLIC KEY|RSA PUBLIC KEY)-----\s+([A-Za-z0-9+/=\s]+)-----END \1-----$/u.exec(pem);
      if (!match) throw new Error();
      const key = createPublicKey(pem);
      if (key.asymmetricKeyType !== "rsa" || key.asymmetricKeyDetails?.modulusLength !== 2048) throw new Error();
      const type = match[1] === "PUBLIC KEY" ? "spki" : "pkcs1";
      const base64 = match[2].replace(/\s/gu, "");
      const der = Buffer.from(base64, "base64");
      const spki = key.export({ format: "pem", type: "spki" }).toString();
      // Re-import SPKI before canonical comparison: some Windows Node/OpenSSL builds
      // cannot export PKCS#1 DER directly from a key originally imported as PKCS#1 PEM.
      if (der.toString("base64") !== base64 || !createPublicKey(spki).export({ format: "der", type }).equals(der)) throw new Error();
      options.cachingRsaPublicKey = spki;
    } catch { throw new Error("Chave pública MySQL inválida; exige SPKI ou PKCS#1 RSA de 2048 bits."); }
  } else {
    throw new Error("Configure GOS_MYSQL_AUTH_MODE=tls (preferido) ou rsa-pinned com material público MySQL conferido.");
  }
  options.restrictedAuth = ["caching_sha2_password"];
  return options;
}
