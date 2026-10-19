import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Socket } from 'node:net';

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const stable = (value) => JSON.stringify(Object.entries(value ?? {}).sort(([a], [b]) => a.localeCompare(b)));
export const sha256 = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

export function validateLock(root) {
  const pkg = readJson(path.join(root, 'package.json'));
  const lock = readJson(path.join(root, 'package-lock.json'));
  const top = lock.packages?.[''];
  if (lock.lockfileVersion !== 3 || !top || pkg.name !== lock.name || pkg.version !== lock.version ||
      ['dependencies', 'devDependencies', 'optionalDependencies'].some((key) => stable(pkg[key]) !== stable(top[key]))) {
    throw new Error('Lockfile incompatível com package.json.');
  }
  const client = pkg.dependencies?.['@prisma/client'];
  if (!/^7\.10\.\d+$/.test(client ?? '') || client !== pkg.dependencies?.['@prisma/adapter-mariadb'] || client !== pkg.devDependencies?.prisma) {
    throw new Error('Versões Prisma Client, adapter e CLI não estão alinhadas.');
  }
  for (const [name, required] of Object.entries(pkg.dependencies ?? {})) {
    const actual = lock.packages[`node_modules/${name}`]?.version;
    const expression = /^(\^|~)?(\d+)\.(\d+)\.(\d+)$/.exec(required);
    const actualExpression = /^(\d+)\.(\d+)\.(\d+)$/.exec(actual ?? '');
    if (!expression || !actualExpression) throw new Error('Formato de versão de dependência não suportado pelo validador.');
    const [, operator, ...minimumText] = expression;
    const minimum = minimumText.map(Number);
    const version = actualExpression.slice(1).map(Number);
    const compare = version[0] - minimum[0] || version[1] - minimum[1] || version[2] - minimum[2];
    const compatible = !operator ? compare === 0 : compare >= 0 &&
      (operator === '~' ? version[0] === minimum[0] && version[1] === minimum[1] :
        minimum[0] > 0 ? version[0] === minimum[0] : minimum[1] > 0 ? version[0] === 0 && version[1] === minimum[1] : version[0] === 0 && version[1] === 0);
    if (!compatible) throw new Error(`Versão resolvida não atende package.json: ${name}`);
  }
  if (lock.packages['node_modules/prisma']?.version !== client) throw new Error('CLI no lockfile não corresponde ao Client.');
  return { pkg, lock, prismaVersion: client };
}

function resolvePackageKey(lock, from, name) {
  let cursor = from;
  while (true) {
    const key = `${cursor ? `${cursor}/` : ''}node_modules/${name}`;
    if (lock.packages[key]) return key;
    if (!cursor) return null;
    const index = cursor.lastIndexOf('/node_modules/');
    cursor = index >= 0 ? cursor.slice(0, index) : '';
  }
}

// Traverse actual runtime edges; dev/peer-only packages need not be shipped.
export function validateRuntimeTree(root) {
  const result = validateLock(root);
  const visited = new Set();
  function visit(from, name, optional = false) {
    const key = resolvePackageKey(result.lock, from, name);
    if (!key) { if (optional) return; throw new Error(`Dependência ausente no lockfile: ${name}`); }
    const entry = result.lock.packages[key];
    const file = path.join(root, ...key.split('/'), 'package.json');
    const compatible = (!entry.os || entry.os.includes(process.platform)) && (!entry.cpu || entry.cpu.includes(process.arch));
    if (optional && (!compatible || !fs.existsSync(file))) return;
    if (!fs.existsSync(file) || readJson(file).version !== entry.version) throw new Error(`Dependência ausente ou incompatível: ${key}`);
    if (entry.link || !entry.integrity || !entry.resolved?.startsWith('https://registry.npmjs.org/')) throw new Error(`Origem de dependência não aprovada: ${key}`);
    if (visited.has(key)) return;
    visited.add(key);
    const installed = readJson(file);
    if (stable(installed.dependencies) !== stable(entry.dependencies) || stable(installed.optionalDependencies) !== stable(entry.optionalDependencies)) {
      throw new Error(`Metadados divergentes do lockfile: ${key}`);
    }
    for (const dependency of Object.keys(entry.dependencies ?? {})) visit(key, dependency, dependency in (entry.optionalDependencies ?? {}));
    for (const dependency of Object.keys(entry.optionalDependencies ?? {})) visit(key, dependency, true);
  }
  for (const name of Object.keys(result.pkg.dependencies ?? {})) visit('', name);
  return { ...result, runtimePackageCount: visited.size, runtimePackagePaths: [...visited].sort() };
}

export async function verifyBackendRuntime(root) {
  if (process.platform !== 'win32' || process.arch !== 'x64' || Number(process.versions.node.split('.')[0]) !== 24) {
    throw new Error('Runtime exige Windows x64 e Node.js 24.');
  }
  const result = validateRuntimeTree(root);
  // A runtime probe must never open sockets, even if an imported module regresses.
  Socket.prototype.connect = function () { throw new Error('Rede bloqueada na validação offline.'); };
  const info = readJson(path.join(root, 'runtime-info.json'));
  if (info.platform !== 'win32' || info.arch !== 'x64' || info.nodeMajor !== 24 || info.prismaVersion !== result.prismaVersion ||
      info.lockSha256 !== sha256(path.join(root, 'package-lock.json')) || info.omit !== 'dev,peer') {
    throw new Error('Metadados de runtime incompatíveis.');
  }
  const require = createRequire(path.join(root, 'package.json'));
  const argon2 = require('argon2');
  const hashed = await argon2.hash('disposable-native-smoke', { type: argon2.argon2id });
  if (!await argon2.verify(hashed, 'disposable-native-smoke')) throw new Error('Teste nativo argon2 falhou.');
  const sharp = require('sharp');
  const image = await sharp({ create: { width: 2, height: 3, channels: 3, background: '#ffffff' } }).png().toBuffer();
  const metadata = await sharp(image).metadata();
  if (metadata.width !== 2 || metadata.height !== 3) throw new Error('Teste nativo sharp falhou.');
  const load = (relative) => import(pathToFileURL(path.join(root, relative)).href);
  const { Prisma } = await load('dist/generated/prisma/client.js');
  if (Prisma.prismaVersion.client !== result.prismaVersion) throw new Error('Prisma Client compilado não corresponde ao runtime.');
  await load('dist/infrastructure/prisma/prisma.service.js');
  const { AuthService } = await load('dist/modules/auth/auth.service.js');
  if (typeof AuthService.prototype.bootstrapFirstAdmin !== 'function') throw new Error('Serviço oficial de bootstrap ausente.');
  const { assertHomologationBootstrapTarget } = await load('dist/scripts/bootstrap-admin-target.js');
  let refused = false;
  try { assertHomologationBootstrapTarget({}); } catch { refused = true; }
  if (!refused) throw new Error('Guard de bootstrap não recusou configuração ausente.');
  const bootstrap = fs.readFileSync(path.join(root, 'dist/scripts/bootstrap-admin.js'), 'utf8');
  const guardIndex = bootstrap.indexOf('assertHomologationBootstrapTarget(process.env)');
  if (guardIndex < 0 || guardIndex > bootstrap.indexOf('NestFactory.createApplicationContext') ||
      result.pkg.scripts['auth:bootstrap-homologation-admin'] !== 'node dist/scripts/bootstrap-admin.js') {
    throw new Error('Bootstrap compilado depende de fluxo inesperado.');
  }
  // Import classes only. No Nest context, Prisma instance, socket or bootstrap execution.
  return { platform: process.platform, arch: process.arch, nodeVersion: process.version, prismaVersion: result.prismaVersion,
    runtimePackageCount: result.runtimePackageCount, argon2: 'passed', sharp: 'passed', compiledImports: 'passed', bootstrapGuard: 'passed' };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    console.log(JSON.stringify(await verifyBackendRuntime(root)));
  } catch {
    console.error('Validação offline do Backend falhou: lockfile, dependências, binários nativos ou código compilado incompatíveis. Nenhuma conexão de banco foi aberta.');
    process.exitCode = 1;
  }
}
