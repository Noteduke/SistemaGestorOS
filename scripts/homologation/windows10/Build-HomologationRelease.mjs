import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { crc32, deflateRawSync } from 'node:zlib';
import { validateLock, validateRuntimeTree, sha256 } from './Verify-BackendRuntime.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(here, '../../..');
const builderSha256 = sha256(fileURLToPath(import.meta.url));
const verifierSha256 = sha256(path.join(here, 'Verify-BackendRuntime.mjs'));
if (process.platform !== 'win32' || process.arch !== 'x64' || !process.version.startsWith('v24.')) throw new Error('Build exige Windows x64 e Node.js 24.');
const git = (...args) => execFileSync('git.exe', ['-C', repository, ...args], { encoding: 'utf8' }).trim();
const backendSnapshot = process.argv.includes('--backend-snapshot');
if (!backendSnapshot && git('diff', 'HEAD', '--', 'backend', 'frontend')) throw new Error('Backend/Frontend rastreados devem corresponder ao commit de origem.');
validateLock(path.join(repository, 'backend'));
const commit = git('rev-parse', 'HEAD');
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const output = path.join(here, 'artifacts/packages', `runtime-${commit.slice(0, 7)}-${stamp}`);
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.mkdirSync(output, { recursive: false });
const work = path.join(output, 'work');
const payload = path.join(output, 'payload');
fs.mkdirSync(work);
fs.mkdirSync(payload);
const emptyConfig = path.join(work, 'empty.npmrc');
const emptyGlobalConfig = path.join(work, 'empty-global.npmrc');
fs.writeFileSync(emptyConfig, '');
fs.writeFileSync(emptyGlobalConfig, '');
const env = {};
for (const key of ['SystemRoot', 'WINDIR', 'PATH', 'PATHEXT', 'TEMP', 'TMP', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'COMSPEC', 'PROCESSOR_ARCHITECTURE']) {
  const actual = Object.keys(process.env).find((name) => name.toLowerCase() === key.toLowerCase());
  if (actual) env[key] = process.env[actual];
}
Object.assign(env, { CI: 'true', GOS_ENV_FILE: path.join(work, 'absent-build-config'), GOS_DEPLOYMENT_ENV: 'homologation',
  GOS_DATABASE_TARGET: 'gestor_os_opening_test', GOS_EXTERNAL_EFFECTS_ENABLED: 'false',
  DATABASE_URL: 'mysql://offline@127.0.0.1:1/gestor_os_opening_test', NPM_CONFIG_USERCONFIG: emptyConfig,
  NPM_CONFIG_GLOBALCONFIG: emptyGlobalConfig, NPM_CONFIG_CACHE: path.join(here, 'artifacts/npm-cache') });
const npmCli = path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
function node(cwd, args, capture = false) {
  return execFileSync(process.execPath, args, { cwd, env, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit', maxBuffer: 30 * 1024 * 1024 });
}
const npm = (cwd, args, capture = false) => node(cwd, [npmCli, ...args], capture);
function copyTracked(prefix, destination, filter) {
  for (const relative of git('ls-files', '-z', '--', prefix).split('\0').filter(Boolean)) {
    const suffix = relative.slice(prefix.length + 1);
    if (!filter(suffix) || suffix.split('/').some((part) => part.startsWith('.env'))) continue;
    const target = path.join(destination, suffix);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(repository, relative), target);
  }
}
function sourceRecords(root) {
  return files(root).filter((name) => !name.startsWith('node_modules/') && !name.startsWith('dist/') && !name.endsWith('.tsbuildinfo'))
    .map((name) => ({ path: name, sha256: sha256(path.join(root, name)) }));
}
function audit(cwd, args, name) {
  const report = JSON.parse(npm(cwd, ['audit', '--json', ...args], true));
  fs.writeFileSync(path.join(output, `${name}.json`), JSON.stringify(report, null, 2));
  if (report.metadata.vulnerabilities.total !== 0) throw new Error('Auditoria contém vulnerabilidades; pacote não aprovado.');
  return report.metadata.vulnerabilities;
}

const backendBuild = path.join(work, 'backend-build');
copyTracked('backend', backendBuild, (name) => name.startsWith('src/') || name.startsWith('test/') ||
  ['package.json', 'package-lock.json', 'prisma.config.ts', 'prisma/schema.prisma', 'nest-cli.json', 'tsconfig.json', 'tsconfig.build.json'].includes(name));
if (backendSnapshot) {
  // Explicitly selected companion sources/tests; never copy arbitrary untracked files.
  for (const name of ['src/infrastructure/prisma/mysql-observability.ts', 'src/scripts/diagnose-homologation-mysql.ts',
    'test/mysql-observability.test.mjs', 'test/homologation-mysql-diagnostic.test.mjs',
    'src/modules/service-orders/dto/opening-intake.dto.ts', 'test/opening-workflow.test.mjs',
    'test/opening-workflow.integration.mjs', 'src/modules/people/dto/complete-person.dto.ts',
    'test/complete-person.test.mjs', 'src/scripts/ensure-opening-catalogs.ts',
    'src/modules/people/opening-customer-editor.ts', 'test/opening-usability.test.mjs', 'test/service-order-list-filters.test.mjs']) {
    const target = path.join(backendBuild, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(repository, 'backend', name), target);
  }
}
const snapshotRecords = sourceRecords(backendBuild);
const { createHash } = await import('node:crypto');
const snapshotHash = createHash('sha256').update(JSON.stringify(snapshotRecords)).digest('hex');
const provenance = backendSnapshot ? { sourceCommit: null, baseCommit: commit, sourceSnapshotSha256: snapshotHash, sourceFiles: snapshotRecords }
  : { sourceCommit: commit };
npm(backendBuild, ['ci', '--no-audit', '--no-fund']);
const fullAudit = audit(backendBuild, [], 'audit-full');
node(backendBuild, ['node_modules/prisma/build/index.js', 'generate']);
npm(backendBuild, ['run', 'build']);
const unitTests = fs.readdirSync(path.join(backendBuild, 'test')).filter((name) => name.endsWith('.test.mjs')).map((name) => `test/${name}`);
const testEnv = { ...env };
delete testEnv.GOS_DEPLOYMENT_ENV;
delete testEnv.GOS_DATABASE_TARGET;
execFileSync(process.execPath, ['--test', ...unitTests], { cwd: backendBuild, env: testEnv, stdio: 'inherit' });

const backend = path.join(payload, 'backend');
fs.mkdirSync(backend, { recursive: true });
for (const name of ['package.json', 'package-lock.json']) fs.copyFileSync(path.join(backendBuild, name), path.join(backend, name));
npm(backend, ['ci', '--omit=dev', '--omit=peer', '--no-audit', '--no-fund']);
// npm may retain explicit dev packages promoted by optional peer edges in the lock.
// Retain exactly the validated runtime dependency closure, without re-resolving versions.
const runtimeTree = validateRuntimeTree(backend);
const runtimeKeys = new Set(runtimeTree.runtimePackagePaths);
const modulesPrefix = path.resolve(backend, 'node_modules') + path.sep;
for (const key of Object.keys(runtimeTree.lock.packages).sort((a, b) => b.length - a.length)) {
  if (!key.startsWith('node_modules/') || runtimeKeys.has(key)) continue;
  if ([...runtimeKeys].some((runtimeKey) => runtimeKey.startsWith(`${key}/`))) throw new Error('Dependência runtime aninhada em pacote exclusivo de build; revisão necessária.');
  const target = path.resolve(backend, ...key.split('/'));
  if (!target.startsWith(modulesPrefix)) throw new Error('Limpeza recusada fora do node_modules de staging.');
  if (fs.existsSync(target)) {
    if (fs.lstatSync(target).isSymbolicLink()) throw new Error('Link inesperado no staging.');
    fs.rmSync(target, { recursive: true });
  }
}
for (const relative of ['node_modules/.bin', 'node_modules/.package-lock.json']) {
  const target = path.resolve(backend, relative);
  if (!target.startsWith(modulesPrefix)) throw new Error('Destino de limpeza inválido.');
  if (fs.existsSync(target)) fs.rmSync(target, { recursive: true });
}
validateRuntimeTree(backend);
const runtimeAudit = audit(backend, ['--omit=dev', '--omit=peer'], 'audit-runtime');
fs.cpSync(path.join(backendBuild, 'dist'), path.join(backend, 'dist'), { recursive: true });
fs.mkdirSync(path.join(backend, 'release'));
fs.copyFileSync(path.join(here, 'Verify-BackendRuntime.mjs'), path.join(backend, 'release/Verify-BackendRuntime.mjs'));
const runtimeInfo = { platform: 'win32', arch: 'x64', nodeMajor: 24, nodeVersion: process.version,
  ...provenance, prismaVersion: validateLock(backend).prismaVersion, omit: 'dev,peer', runtimeTreePruned: true, lockSha256: sha256(path.join(backend, 'package-lock.json')) };
fs.writeFileSync(path.join(backend, 'runtime-info.json'), JSON.stringify(runtimeInfo, null, 2));
const runtimeValidation = JSON.parse(node(backend, ['release/Verify-BackendRuntime.mjs'], true));
for (const devOnly of ['@nestjs/cli', 'typescript', 'prisma']) {
  if (fs.existsSync(path.join(backend, 'node_modules', devOnly))) throw new Error(`Dependência exclusiva de build foi incluída: ${devOnly}`);
}

let frontendVersion = null;
if (!backendSnapshot) {
const frontendBuild = path.join(work, 'frontend-build');
copyTracked('frontend', frontendBuild, () => true);
npm(frontendBuild, ['ci', '--no-audit', '--no-fund']);
npm(frontendBuild, ['run', 'build', '--', '--mode', 'homologation']);
const frontend = path.join(payload, 'frontend');
fs.mkdirSync(frontend);
fs.cpSync(path.join(frontendBuild, 'dist'), path.join(frontend, 'dist'), { recursive: true });
const frontendText = files(path.join(frontend, 'dist')).filter((name) => /\.(js|css|html)$/.test(name))
  .map((name) => fs.readFileSync(path.join(frontend, 'dist', name), 'utf8')).join('\n');
if (!frontendText.includes('AMBIENTE DE HOMOLOGAÇÃO') || !frontendText.includes('DOCUMENTO DE TESTE — HOMOLOGAÇÃO')) {
  throw new Error('Frontend compilado não contém os dois marcadores obrigatórios de homologação.');
}
frontendVersion = JSON.parse(fs.readFileSync(path.join(frontendBuild, 'package.json'))).version;
const buildInfo = { environment: 'homologation', frontendVersion, sourceCommit: commit, builtAtUtc: new Date().toISOString(), homologationMarkerVerified: true };
fs.writeFileSync(path.join(frontend, 'build-info.json'), JSON.stringify(buildInfo, null, 2));
}

for (const record of snapshotRecords) {
  if (sha256(path.join(backendBuild, record.path)) !== record.sha256 || sha256(path.join(repository, 'backend', record.path)) !== record.sha256)
    throw new Error('Fontes mudaram durante compilação; pacote recusado.');
}

if (builderSha256 !== sha256(fileURLToPath(import.meta.url)) || verifierSha256 !== sha256(path.join(here, 'Verify-BackendRuntime.mjs'))) {
  throw new Error('Empacotador/verificador mudou durante o build; gere novamente a partir de fontes estáveis.');
}
const manifest = { application: 'Sistema Gestor OS', environment: 'homologation', releaseType: 'complete-runtime-update',
  ...provenance, scope: backendSnapshot ? 'backend-only' : 'full', backendVersion: validateLock(backend).pkg.version, frontendVersion, nodeVersion: process.version,
  platform: 'win32', architecture: 'x64', runtimeDependenciesIncluded: true, runtimeDependenciesUnchanged: false,
  lockSha256: runtimeInfo.lockSha256, runtimeValidation, audit: { full: fullAudit, runtime: runtimeAudit },
  npmVersion: npm(backend, ['--version'], true).trim(), builderSha256, verifierSha256 };
fs.writeFileSync(path.join(payload, 'release-manifest.json'), JSON.stringify(manifest, null, 2));
function files(root, base = '') {
  return fs.readdirSync(path.join(root, base), { withFileTypes: true }).flatMap((entry) => {
    const relative = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new Error('Reparse/link não é permitido no pacote.');
    if (relative.split('/').some((part) => part.startsWith('.env') || part === '.npmrc')) throw new Error('Configuração local recusada no pacote.');
    return entry.isDirectory() ? files(root, relative) : [relative];
  }).sort();
}
const payloadFiles = files(payload);
fs.writeFileSync(path.join(payload, 'SHA256SUMS.txt'), payloadFiles.map((name) => `${sha256(path.join(payload, name))}  ${name}`).join('\n') + '\n');

// ZIP32, UTF-8 names, no links, each file independently compressed. No external archiver.
const zipPath = path.join(output, `GestorOS-Homologation1-runtime-${commit.slice(0, 7)}.zip`);
const fd = fs.openSync(zipPath, 'wx');
let offset = 0;
const central = [];
try {
  for (const name of files(payload)) {
    const raw = fs.readFileSync(path.join(payload, name));
    const compressed = deflateRawSync(raw);
    const bytes = Buffer.from(name, 'utf8');
    const crc = crc32(raw);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x800, 6); header.writeUInt16LE(8, 8);
    header.writeUInt16LE(33, 12); header.writeUInt32LE(crc, 14); header.writeUInt32LE(compressed.length, 18); header.writeUInt32LE(raw.length, 22); header.writeUInt16LE(bytes.length, 26);
    const index = Buffer.alloc(46);
    index.writeUInt32LE(0x02014b50); index.writeUInt16LE(20, 4); index.writeUInt16LE(20, 6); index.writeUInt16LE(0x800, 8); index.writeUInt16LE(8, 10);
    index.writeUInt16LE(33, 14); index.writeUInt32LE(crc, 16); index.writeUInt32LE(compressed.length, 20); index.writeUInt32LE(raw.length, 24); index.writeUInt16LE(bytes.length, 28); index.writeUInt32LE(offset, 42);
    for (const data of [header, bytes, compressed]) { fs.writeSync(fd, data); offset += data.length; }
    central.push(index, bytes);
  }
  if (central.length / 2 > 65535 || offset > 0xffffffff) throw new Error('Limite ZIP32 excedido.');
  const centralStart = offset;
  for (const data of central) { fs.writeSync(fd, data); offset += data.length; }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(central.length / 2, 8); end.writeUInt16LE(central.length / 2, 10);
  end.writeUInt32LE(offset - centralStart, 12); end.writeUInt32LE(centralStart, 16); fs.writeSync(fd, end);
} finally { fs.closeSync(fd); }
const summary = { zipPath, sha256: sha256(zipPath), ...provenance, releaseIdentity: backendSnapshot ? `snapshot:${snapshotHash}` : commit, nodeVersion: process.version, runtimeValidation, fullAudit, runtimeAudit };
fs.writeFileSync(path.join(output, 'build-result.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
