import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, privateDecrypt, constants } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import tls from 'node:tls';
import { after, test } from 'node:test';
import mariadb from 'mariadb';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { buildMysqlConnectionOptions } from '../dist/infrastructure/prisma/mysql-connection-options.js';
import { PrismaService } from '../dist/infrastructure/prisma/prisma.service.js';

const root = mkdtempSync(path.join(os.tmpdir(), 'gestor-mysql-auth-'));
const openssl = process.platform === 'win32' ? 'C:/Program Files/Git/usr/bin/openssl.exe' : 'openssl';
const run = args => execFileSync(openssl, args, { cwd: root, stdio: 'ignore', windowsHide: true });
// Only ephemeral synthetic keys/certificates. No installed MySQL/Caddy material or cert store.
run(['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'ca-key.pem', '-out', 'ca.pem', '-days', '2', '-subj', '/CN=Ephemeral Test CA', '-addext', 'basicConstraints=critical,CA:TRUE']);
run(['req', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'leaf-key.pem', '-out', 'leaf.csr', '-subj', '/CN=mysql.test', '-addext', 'subjectAltName=DNS:mysql.test,IP:127.0.0.1', '-addext', 'basicConstraints=critical,CA:FALSE']);
run(['x509', '-req', '-in', 'leaf.csr', '-CA', 'ca.pem', '-CAkey', 'ca-key.pem', '-set_serial', '1', '-out', 'leaf.pem', '-days', '1', '-copy_extensions', 'copy']);
run(['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'other-ca-key.pem', '-out', 'other-ca.pem', '-days', '2', '-subj', '/CN=Other Ephemeral CA', '-addext', 'basicConstraints=critical,CA:TRUE']);
const keyPair = generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicPem = keyPair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
writeFileSync(path.join(root, 'public.pem'), publicPem);
const pkcs1Pem=keyPair.publicKey.export({type:'pkcs1',format:'pem'}).toString();
writeFileSync(path.join(root,'pkcs1.pem'),pkcs1Pem);
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const file = name => path.join(root, name);
const values = {
  DATABASE_URL: 'mysql://gos_homologation_app:fixture%40value%25@127.0.0.1:3306/gestor_os_homologation',
  GOS_DEPLOYMENT_ENV: 'homologation', GOS_DATABASE_TARGET: 'gestor_os_homologation', GOS_EXTERNAL_EFFECTS_ENABLED: 'false',
};
const config = extra => ({ get(name) { return { ...values, ...extra }[name]; } });
const tlsConfig = { GOS_MYSQL_AUTH_MODE: 'tls', GOS_MYSQL_TLS_CA_FILE: file('ca.pem'), GOS_MYSQL_TLS_CA_SHA256: hash(file('ca.pem')) };
const rsaConfig = { GOS_MYSQL_AUTH_MODE: 'rsa-pinned', GOS_MYSQL_RSA_PUBLIC_KEY_FILE: file('public.pem'), GOS_MYSQL_RSA_PUBLIC_KEY_SHA256: hash(file('public.pem')) };

test('TLS preferido mantém CA, identidade, protocolo mínimo e recuperação de chave desativada', () => {
  const options = buildMysqlConnectionOptions(config(tlsConfig));
  assert.equal(options.ssl.rejectUnauthorized, true);
  assert.equal(options.ssl.minVersion, 'TLSv1.2');
  assert.equal(options.allowPublicKeyRetrieval, false);
  assert.equal(options.permitRedirect, false);
  assert.deepEqual(options.restrictedAuth, ['caching_sha2_password']);
  assert.ok(options.password === 'fixture@value%');
  assert.equal(options.cachingRsaPublicKey, undefined);
});

test('RSA pública fixada é carregada em memória, sem TLS ou recuperação automática', () => {
  const options = buildMysqlConnectionOptions(config(rsaConfig));
  assert.equal(options.cachingRsaPublicKey, publicPem);
  assert.equal(options.ssl, undefined);
  assert.equal(options.allowPublicKeyRetrieval, false);
  const ipv6 = buildMysqlConnectionOptions(config({ ...rsaConfig, DATABASE_URL: values.DATABASE_URL.replace('127.0.0.1', '[::1]') }));
  assert.equal(ipv6.host, '::1');
});
test('SPKI e PKCS#1 preservam hash original e normalizam somente em memória', () => {
  for (const name of ['public.pem','pkcs1.pem']) {
    const original=readFileSync(file(name));
    const options=buildMysqlConnectionOptions(config({...rsaConfig,GOS_MYSQL_RSA_PUBLIC_KEY_FILE:file(name),GOS_MYSQL_RSA_PUBLIC_KEY_SHA256:hash(file(name))}));
    assert.equal(options.cachingRsaPublicKey,publicPem);
    assert.deepEqual(readFileSync(file(name)),original);
  }
  assert.notEqual(hash(file('public.pem')),hash(file('pkcs1.pem')));
  assert.throws(() => buildMysqlConnectionOptions(config({...rsaConfig,GOS_MYSQL_RSA_PUBLIC_KEY_FILE:file('pkcs1.pem')})));
  const invalids=[publicPem+pkcs1Pem,pkcs1Pem.replace('END RSA PUBLIC KEY','END PUBLIC KEY'),
    keyPair.privateKey.export({type:'pkcs1',format:'pem'}).toString(),
    generateKeyPairSync('rsa',{modulusLength:3072}).publicKey.export({type:'spki',format:'pem'}).toString()];
  for (const pem of invalids) {
    writeFileSync(file('invalid-rsa.pem'),pem);
    assert.throws(() => buildMysqlConnectionOptions(config({...rsaConfig,GOS_MYSQL_RSA_PUBLIC_KEY_FILE:file('invalid-rsa.pem'),GOS_MYSQL_RSA_PUBLIC_KEY_SHA256:hash(file('invalid-rsa.pem'))})));
  }
});

test('recusa modo ausente, mistura, caminhos inválidos, hash diferente e material malformado sem expor credenciais', () => {
  writeFileSync(file('bad.pem'), 'not-public-material');
  const cases = [ {}, { GOS_MYSQL_AUTH_MODE: 'insecure' }, { ...tlsConfig, ...rsaConfig },
    { ...tlsConfig, GOS_MYSQL_TLS_CA_FILE: 'relative.pem' },
    { ...tlsConfig, GOS_MYSQL_TLS_CA_SHA256: '0'.repeat(64) },
    { ...rsaConfig, GOS_MYSQL_RSA_PUBLIC_KEY_FILE: file('missing.pem') },
    { ...rsaConfig, GOS_MYSQL_RSA_PUBLIC_KEY_FILE: file('bad.pem'), GOS_MYSQL_RSA_PUBLIC_KEY_SHA256: hash(file('bad.pem')) },
    { ...tlsConfig, GOS_MYSQL_TLS_CA_FILE: file('leaf.pem'), GOS_MYSQL_TLS_CA_SHA256: hash(file('leaf.pem')) },
    { ...tlsConfig, GOS_MYSQL_TLS_SERVER_NAME: 'invalid name' } ];
  for (const extra of cases) assert.throws(() => buildMysqlConnectionOptions(config(extra)), error => {
    assert.ok(!error.message.includes('fixture') && !error.message.includes('mysql://') && !error.message.includes(root));
    return true;
  });
});

test('recusa chave privada, chave fraca e chave de tipo incompatível', () => {
  writeFileSync(file('synthetic-private.pem'), keyPair.privateKey.export({ type: 'pkcs8', format: 'pem' }));
  const weak = generateKeyPairSync('rsa', { modulusLength: 1024 });
  writeFileSync(file('weak.pem'), weak.publicKey.export({ type: 'spki', format: 'pem' }));
  const ec = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  writeFileSync(file('ec.pem'), ec.publicKey.export({ type: 'spki', format: 'pem' }));
  for (const name of ['synthetic-private.pem', 'weak.pem', 'ec.pem']) {
    assert.throws(() => buildMysqlConnectionOptions(config({ ...rsaConfig, GOS_MYSQL_RSA_PUBLIC_KEY_FILE: file(name), GOS_MYSQL_RSA_PUBLIC_KEY_SHA256: hash(file(name)) })));
  }
});

test('guard de homologação continua bloqueando produção, hosts externos, usuário indevido, porta e opções na URL', () => {
  for (const extra of [
    { DATABASE_URL: values.DATABASE_URL.replace('/gestor_os_homologation', '/gestor_os') },
    { DATABASE_URL: values.DATABASE_URL.replace('127.0.0.1', '192.0.2.1') },
    { DATABASE_URL: values.DATABASE_URL.replace('gos_homologation_app', 'root') },
    { DATABASE_URL: values.DATABASE_URL.replace(':3306', ':3307') },
    { DATABASE_URL: values.DATABASE_URL + '?allowPublicKeyRetrieval=true' },
    { DATABASE_URL: values.DATABASE_URL.replace('fixture%40value%25', '%INVALID') },
    { GOS_EXTERNAL_EFFECTS_ENABLED: 'true' },
    { GOS_DEPLOYMENT_ENV: 'production' },
  ]) assert.throws(() => buildMysqlConnectionOptions(config({ ...rsaConfig, ...extra })));
});

test('PrismaService exige leitura bem-sucedida na inicialização e não publica erros de autenticação', async () => {
  const calls = [];
  await PrismaService.prototype.onModuleInit.call({ async $connect() { calls.push('connect'); }, async $queryRaw(sql) { assert.equal(sql[0], 'SELECT 1'); calls.push('read'); } });
  assert.deepEqual(calls, ['connect', 'read']);
  for (const failedMethod of ['$connect', '$queryRaw']) {
    const fake = { async $connect() {}, async $queryRaw() {} };
    fake[failedMethod] = async () => { throw new Error('sensitive-fixture'); };
    await assert.rejects(() => PrismaService.prototype.onModuleInit.call(fake), error => !error.message.includes('sensitive-fixture'));
  }
  const bootstrap = readFileSync(new URL('../src/scripts/bootstrap-admin.ts', import.meta.url), 'utf8');
  assert.match(bootstrap, /app\.get\(PrismaService\)/);
  const service = readFileSync(new URL('../src/infrastructure/prisma/prisma.service.ts', import.meta.url), 'utf8');
  assert.match(service, /new PrismaMariaDb\(buildMysqlConnectionOptions\(configService\)\)/);
});

async function tlsProbe(extra) {
  const server = tls.createServer({ cert: readFileSync(file('leaf.pem')), key: readFileSync(file('leaf-key.pem')) }, socket => socket.end());
  server.on('tlsClientError', () => {});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const options = buildMysqlConnectionOptions(config({ ...tlsConfig, ...extra }));
  try {
    await new Promise((resolve, reject) => {
      const socket = tls.connect({ ...options.ssl, host: '127.0.0.1', port: server.address().port });
      socket.setTimeout(3000, () => socket.destroy(new Error('fixture timeout')));
      socket.once('secureConnect', () => { socket.end(); resolve(); });
      socket.once('error', reject);
    });
  } finally { await new Promise(resolve => server.close(resolve)); }
}

test('TLS real em porta efêmera aceita CA/identidade corretas e rejeita CA desconhecida ou nome divergente', async () => {
  await tlsProbe({});
  await tlsProbe({ GOS_MYSQL_TLS_SERVER_NAME: 'mysql.test' });
  await assert.rejects(() => tlsProbe({ GOS_MYSQL_TLS_SERVER_NAME: 'wrong.invalid' }));
  await assert.rejects(() => tlsProbe({ GOS_MYSQL_TLS_CA_FILE: file('other-ca.pem'), GOS_MYSQL_TLS_CA_SHA256: hash(file('other-ca.pem')) }));
});

// Minimal authentication-only MySQL protocol fixture. It is not a database and never
// listens on 3306. Full caching_sha2_password authentication must use the pinned RSA key.
function packet(payload, sequence) { const header = Buffer.alloc(4); header.writeUIntLE(payload.length, 0, 3); header[3] = sequence; return Buffer.concat([header, payload]); }
async function rsaProbe({ wrongPassword = false, wrongKey = false, missingKey = false, pkcs1=false, adapter=false } = {}) {
  const seed = Buffer.from('abcdefghijklmnopqrst');
  let retrievalRequested = false;
  let acceptedAuthentications = 0;
  const sockets = new Set();
  const server = net.createServer(socket => {
    sockets.add(socket); socket.on('close', () => sockets.delete(socket)); socket.on('error', () => {});
    socket.setTimeout(4000, () => socket.destroy());
    const capabilities = 0x0028a20d;
    const low = Buffer.alloc(2); low.writeUInt16LE(capabilities & 65535);
    const high = Buffer.alloc(2); high.writeUInt16LE(capabilities >>> 16);
    socket.write(packet(Buffer.concat([Buffer.from([10]), Buffer.from('8.0.46-fixture\0'), Buffer.from([1,0,0,0]), seed.subarray(0,8), Buffer.from([0]), low, Buffer.from([45,2,0]), high, Buffer.from([21]), Buffer.alloc(10), seed.subarray(8), Buffer.from([0]), Buffer.from('caching_sha2_password\0')]), 0));
    let pending = Buffer.alloc(0); let state = 0;
    socket.on('data', bytes => {
      pending = Buffer.concat([pending, bytes]);
      while (pending.length >= 4 && pending.length >= pending.readUIntLE(0,3) + 4) {
        const size = pending.readUIntLE(0,3); const data = pending.subarray(4,4+size); pending = pending.subarray(4+size);
        if (state++ === 0) {
          socket.write(packet(Buffer.concat([Buffer.from([254]), Buffer.from('caching_sha2_password\0'), seed, Buffer.from([0])]), 2));
          continue;
        }
        if (state === 2) { socket.write(packet(Buffer.from([1,4]), 4)); continue; }
        if (state === 3) {
          retrievalRequested = data.length === 1 && data[0] === 2;
          let valid = false;
          try {
            const decoded = privateDecrypt({ key: keyPair.privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING }, data);
            for (let i=0; i<decoded.length; i++) decoded[i] ^= seed[i % seed.length];
            valid = decoded.equals(Buffer.from('fixture@value%\0'));
          } catch {}
          if (valid) acceptedAuthentications++;
          socket.write(packet(valid ? Buffer.from([0,0,0,2,0,0,0]) : Buffer.concat([Buffer.from([255,21,4]), Buffer.from('#28000Access denied')]), 6));
        } else if (data[0] === 1) { socket.end(); }
        else { socket.write(packet(Buffer.from([0,0,0,2,0,0,0]), 1)); }
      }
    });
  });
  const options = buildMysqlConnectionOptions(config(pkcs1 ? {...rsaConfig,GOS_MYSQL_RSA_PUBLIC_KEY_FILE:file('pkcs1.pem'),GOS_MYSQL_RSA_PUBLIC_KEY_SHA256:hash(file('pkcs1.pem'))} : rsaConfig));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  if (wrongPassword) options.password = 'incorrect-fixture';
  if (wrongKey) options.cachingRsaPublicKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ type: 'spki', format: 'pem' }).toString();
  if (missingKey) delete options.cachingRsaPublicKey;
  let connection;
  try {
    // Only this synthetic protocol port is used; never the configured/real 3306.
    const fixtureOptions={ ...options, port: server.address().port, connectTimeout: 2000, acquireTimeout:3000, socketTimeout: 3000, connectionLimit:1 };
    if (adapter) {
      connection=await new PrismaMariaDb(fixtureOptions).connect();
      assert.ok(acceptedAuthentications > 0, 'Adapter capability probe must actually authenticate, not merely absorb a pool failure.');
    } else connection = await mariadb.createConnection(fixtureOptions);
  } finally {
    if (connection) { if (adapter) await connection.dispose(); else await connection.end(); }
    for (const socket of sockets) socket.destroy();
    await new Promise(resolve => server.close(resolve));
    assert.equal(retrievalRequested, false, 'Driver must not request a server public key from the network.');
  }
}

test('driver instalado completa autenticação RSA fixada e rejeita senha/chave incorretas e ausência da chave', async () => {
  await rsaProbe();
  await rsaProbe({pkcs1:true});
  await assert.rejects(() => rsaProbe({ wrongPassword: true }), error => error.errno === 1045);
  await assert.rejects(() => rsaProbe({ wrongKey: true }), error => error.errno === 1045);
  await assert.rejects(() => rsaProbe({ missingKey: true }), error => error.errno === 45044);
});
test('Prisma Adapter instalado autentica com os dois envelopes contra simulador isolado', async () => {
  await rsaProbe({adapter:true});
  await rsaProbe({adapter:true,pkcs1:true});
});

after(() => {
  assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep));
  assert.ok(path.basename(root).startsWith('gestor-mysql-auth-'));
  rmSync(root, { recursive: true, force: true });
});
