import fs from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { createHash, createPublicKey } from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';

export const envPath = 'C:/ProgramData/GestorOS/homologation/config/.env.homologation';
export const backendRoot = 'C:/ProgramData/GestorOS/homologation/backend';
export const rsaPath = 'C:/ProgramData/GestorOS/homologation/config/mysql/caching-sha2-public.pem';
export const rsaHash = '9C2384DBD2B09A2CCE97D276A7ECAB92B565B9FA15978162C82EFAFB90A8C73B';
export function getSourceCommit() {
  const release=JSON.parse(fs.readFileSync(path.join(import.meta.dirname,'Release-Context.json'),'utf8'));
  if (release.status !== 'ready' || release.clean !== true || !/^[a-f0-9]{40}$/u.test(release.sourceCommit ?? '')) throw new Error('RELEASE_NOT_READY');
  return release.sourceCommit;
}
export const expectedAccount = 'gos_homologation_app@127.0.0.1';
export const required = { GOS_MYSQL_AUTH_MODE: 'rsa-pinned', GOS_MYSQL_RSA_PUBLIC_KEY_FILE: rsaPath, GOS_MYSQL_RSA_PUBLIC_KEY_SHA256: rsaHash };
const guardKeys = ['DATABASE_URL', 'GOS_DEPLOYMENT_ENV', 'GOS_DATABASE_TARGET', 'GOS_EXTERNAL_EFFECTS_ENABLED', ...Object.keys(required), 'GOS_MYSQL_TLS_CA_FILE', 'GOS_MYSQL_TLS_CA_SHA256', 'GOS_MYSQL_TLS_SERVER_NAME'];
export function validateConfig(text, ready = false) {
  // Conservative editing: refuse multiline/ambiguous assignments instead of rewriting credentials.
  if (text.includes('\0')) throw new Error('CONFIG_FORMAT');
  const seen = new Set();
  for (const line of text.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/u)) {
    if (!line.trim() || /^\s*#/u.test(line)) continue;
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/u.exec(line);
    if (!match) throw new Error('CONFIG_FORMAT');
    const value = match[2].trim();
    if (/^["']/u.test(value) && !new RegExp(value[0] + '\\s*(?:#.*)?$').test(value.slice(1))) throw new Error('CONFIG_FORMAT');
    if (seen.has(match[1])) throw new Error('DUPLICATE_KEY');
    seen.add(match[1]);
  }
  const values = parseEnv(text.replace(/^\uFEFF/, ''));
  const url = new URL(values.DATABASE_URL);
  if (url.protocol !== 'mysql:' || url.hostname !== '127.0.0.1' || (url.port || '3306') !== '3306' ||
      decodeURIComponent(url.username) !== 'gos_homologation_app' || !decodeURIComponent(url.password) ||
      decodeURIComponent(url.pathname.slice(1)) !== 'gestor_os_homologation' || url.search || url.hash ||
      values.GOS_DEPLOYMENT_ENV !== 'homologation' || values.GOS_DATABASE_TARGET !== 'gestor_os_homologation' ||
      values.GOS_EXTERNAL_EFFECTS_ENABLED !== 'false') throw new Error('WRONG_TARGET');
  if (Object.keys(values).some(key => key.startsWith('GOS_MYSQL_') && !Object.hasOwn(required, key))) throw new Error('CONFLICTING_AUTH_CONFIG');
  for (const [key, value] of Object.entries(required)) {
    if (values[key] !== undefined && values[key].toUpperCase() !== value.toUpperCase()) throw new Error('CONFLICTING_AUTH_CONFIG');
    if (ready && values[key] !== value) throw new Error('RSA_CONFIG_MISSING');
  }
  return values;
}
export function rejectInherited(values) {
  for (const key of guardKeys) {
    if (process.env[key] !== undefined && process.env[key] !== values[key]) throw new Error('INHERITED_ENV_CONFLICT');
  }
  if (process.env.GOS_ENV_FILE && path.resolve(process.env.GOS_ENV_FILE).toLowerCase() !== path.resolve(envPath).toLowerCase()) throw new Error('INHERITED_ENV_CONFLICT');
}
function noLinks(file) {
  let cursor = path.resolve(file);
  for (;;) {
    if (fs.lstatSync(cursor).isSymbolicLink()) throw new Error('REPARSE_POINT');
    const parent = path.dirname(cursor); if (parent === cursor) break; cursor = parent;
  }
}
export function normalizePublicKey(input) {
  const pem=input.trim();
  const label=pem.includes('-----BEGIN PUBLIC KEY-----') ? 'PUBLIC KEY'
    : pem.includes('-----BEGIN RSA PUBLIC KEY-----') ? 'RSA PUBLIC KEY' : undefined;
  if (!label || !pem.includes(`-----END ${label}-----`) || pem.split('-----BEGIN ').length !== 2 || pem.split('-----END ').length !== 2 || pem.includes('PRIVATE KEY')) throw new Error('PUBLIC_KEY_ENVELOPE');
  let key; try { key=createPublicKey(pem); } catch { throw new Error('PUBLIC_KEY_PARSE'); }
  if (key.asymmetricKeyType !== 'rsa') throw new Error('PUBLIC_KEY_ALGORITHM');
  if (key.asymmetricKeyDetails?.modulusLength !== 2048) throw new Error('PUBLIC_KEY_SIZE');
  try { return key.export({type:'spki',format:'pem'}).toString(); } catch { throw new Error('PUBLIC_KEY_EXPORT'); }
}
export function verifyPublicKey() {
  noLinks(rsaPath);
  const fd=fs.openSync(rsaPath,'r'); let bytes;
  try {
    const stat=fs.fstatSync(fd);
    if (!stat.isFile() || stat.size < 1 || stat.size > 65536) throw new Error('PUBLIC_KEY_FORMAT');
    const buffer=Buffer.alloc(stat.size+1);
    const count=fs.readSync(fd,buffer,0,buffer.length,0);
    if (count !== stat.size) throw new Error('PUBLIC_KEY_FORMAT');
    bytes=buffer.subarray(0,count);
  } finally { fs.closeSync(fd); }
  if (createHash('sha256').update(bytes).digest('hex').toUpperCase() !== rsaHash) throw new Error('PUBLIC_KEY_HASH');
  const text = bytes.toString('utf8').trim();
  return normalizePublicKey(text);
}
export function validateReadOnlyResult(rows) {
  if (!Array.isArray(rows) || rows.length !== 1 || rows[0]?.db !== 'gestor_os_homologation' ||
      rows[0]?.account !== expectedAccount || Number(rows[0]?.ok) !== 1) throw new Error('AUTHENTICATED_TARGET_MISMATCH');
  return `READ_ONLY_OK database=gestor_os_homologation account=${expectedAccount} prisma=7.10.1`;
}
async function main() {
  let diagnosticFailureCode; let Failure;
  try {
    if (process.platform !== 'win32' || process.arch !== 'x64' || !/^v24\./u.test(process.version)) throw new Error('NODE_VERSION');
    const action = process.argv[2];
    if (!['check-current', 'check-ready', 'diagnose'].includes(action)) throw new Error('INVALID_ACTION');
    const selected = process.argv[3] || envPath;
    const root = path.resolve('C:/ProgramData/GestorOS/homologation/config') + path.sep;
    if (!path.resolve(selected).toLowerCase().startsWith(root.toLowerCase())) throw new Error('CONFIG_PATH');
    if (action === 'diagnose' && path.resolve(selected).toLowerCase() !== path.resolve(envPath).toLowerCase()) throw new Error('CONFIG_PATH');
    noLinks(selected);
    const values = validateConfig(fs.readFileSync(selected, 'utf8'), action !== 'check-current');
    rejectInherited(values); verifyPublicKey();
    if (action !== 'diagnose') { console.log('CONFIGURATION_AND_PUBLIC_KEY_OK'); return; }
    const sourceCommit=getSourceCommit();
    const info = JSON.parse(fs.readFileSync(path.join(backendRoot, 'runtime-info.json'), 'utf8'));
    if (info.sourceCommit !== sourceCommit || info.prismaVersion !== '7.10.1') throw new Error('RELEASE_MISMATCH');
    const load = relative => import(pathToFileURL(path.join(backendRoot, relative)).href);
    const { buildMysqlConnectionOptions } = await load('dist/infrastructure/prisma/mysql-connection-options.js');
    const diagnostic = await load('dist/scripts/diagnose-homologation-mysql.js');
    ({ MysqlDiagnosticFailure: Failure } = await load('dist/infrastructure/prisma/mysql-observability.js'));
    diagnosticFailureCode=diagnostic.diagnosticFailureCode;
    // Validate URL/config/public pin BEFORE constructing an adapter or opening any socket.
    const options = buildMysqlConnectionOptions({ get: key => values[key] });
    if (options.database !== 'gestor_os_homologation' || options.user !== 'gos_homologation_app' || options.host !== '127.0.0.1' || options.port !== 3306 || options.allowPublicKeyRetrieval !== false || !options.cachingRsaPublicKey) throw new Error('WRONG_TARGET');
    // One implementation owns acquisition, sanitization and cleanup for both entrypoints.
    console.log(await diagnostic.queryDiagnostic(options));
  } catch (error) {
    // Never print native errors, stack, connection strings, config values or key bytes.
    if (Failure && error instanceof Failure) for (const line of error.lines()) console.error(line);
    console.error('FAIL stage=PRISMA_READ_ONLY code=' + (diagnosticFailureCode ? diagnosticFailureCode(error) : 'CONFIGURATION_OR_CONNECTION')); process.exitCode = 1;
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
