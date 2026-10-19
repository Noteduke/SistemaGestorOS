import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateLock, validateRuntimeTree } from '../Verify-BackendRuntime.mjs';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gos-runtime-contract-'));
  const dependencies = { '@prisma/client': '7.10.1', '@prisma/adapter-mariadb': '7.10.1', argon2: '^0.45.1', sharp: '^0.35.5' };
  const pkg = { name: 'sistema-gestor-os-backend', version: '0.1.0', dependencies, devDependencies: { prisma: '7.10.1' } };
  const lock = { name: pkg.name, version: pkg.version, lockfileVersion: 3, packages: { '': structuredClone(pkg) } };
  for (const [name, version] of Object.entries({ '@prisma/client': '7.10.1', '@prisma/adapter-mariadb': '7.10.1', argon2: '0.45.1', sharp: '0.35.5', mariadb: '3.5.4' })) {
    const key = `node_modules/${name}`;
    const installed = { name, version, ...(name === '@prisma/adapter-mariadb' ? { dependencies: { mariadb: '3.5.4' } } : {}) };
    lock.packages[key] = { ...installed, integrity: 'sha512-fixture', resolved: `https://registry.npmjs.org/${name}/fixture.tgz` };
    fs.mkdirSync(path.join(root, key), { recursive: true });
    fs.writeFileSync(path.join(root, key, 'package.json'), JSON.stringify(installed));
  }
  lock.packages['node_modules/prisma'] = { version: '7.10.1', dev: true };
  const save = () => {
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify(pkg));
    fs.writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify(lock));
  };
  save();
  return { root, pkg, lock, save, close: () => fs.rmSync(root, { recursive: true, force: true }) };
}

test('runtime completo usa lock exato e dispensa CLI/compilador no servidor', () => {
  const f = fixture();
  try {
    assert.equal(validateRuntimeTree(f.root).runtimePackageCount, 5);
    assert.equal(fs.existsSync(path.join(f.root, 'node_modules/prisma')), false);
  } finally { f.close(); }
});
test('lock com declarações divergentes é recusado', () => {
  const f = fixture();
  try {
    f.lock.packages[''].dependencies.sharp = '^0.34.0'; f.save();
    assert.throws(() => validateLock(f.root), /Lockfile incompatível/);
  } finally { f.close(); }
});
test('versão resolvida incompatível e Prisma desalinhado são recusados', () => {
  const f = fixture();
  try {
    f.lock.packages['node_modules/@prisma/client'].version = '7.10.0'; f.save();
    assert.throws(() => validateLock(f.root), /Versão resolvida/);
    f.lock.packages['node_modules/@prisma/client'].version = '7.10.1';
    f.pkg.devDependencies.prisma = '7.10.0'; f.lock.packages[''].devDependencies.prisma = '7.10.0'; f.save();
    assert.throws(() => validateLock(f.root), /não estão alinhadas/);
  } finally { f.close(); }
});
test('dependência transitiva ausente ou adulterada é recusada', () => {
  const f = fixture();
  try {
    const moduleFile = path.join(f.root, 'node_modules/mariadb/package.json');
    fs.writeFileSync(moduleFile, JSON.stringify({ name: 'mariadb', version: '3.4.7' }));
    assert.throws(() => validateRuntimeTree(f.root), /ausente ou incompatível/);
    fs.rmSync(moduleFile);
    assert.throws(() => validateRuntimeTree(f.root), /ausente ou incompatível/);
  } finally { f.close(); }
});
test('árvore não aceita manifesto transitivo divergente nem origem fora do registry aprovado', () => {
  const f = fixture();
  try {
    const moduleFile = path.join(f.root, 'node_modules/mariadb/package.json');
    fs.writeFileSync(moduleFile, JSON.stringify({ name: 'mariadb', version: '3.5.4', dependencies: { unexpected: '1.0.0' } }));
    assert.throws(() => validateRuntimeTree(f.root), /Metadados divergentes/);
    fs.writeFileSync(moduleFile, JSON.stringify({ name: 'mariadb', version: '3.5.4' }));
    f.lock.packages['node_modules/mariadb'].resolved = 'file:local-package'; f.save();
    assert.throws(() => validateRuntimeTree(f.root), /Origem de dependência/);
  } finally { f.close(); }
});
