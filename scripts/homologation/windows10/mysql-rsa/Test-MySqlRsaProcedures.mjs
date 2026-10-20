import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Socket } from 'node:net';
import { generateKeyPairSync } from 'node:crypto';
import { validateConfig, rejectInherited, required, classify, validateReadOnlyResult,normalizePublicKey,getSourceCommit } from './Check-MySqlRsa.mjs';
Socket.prototype.connect = () => { throw new Error('NETWORK_FORBIDDEN_IN_OFFLINE_TEST'); };
test('SPKI/PKCS#1 reais sintéticos normalizam para a mesma chave e candidato não declara commit', () => {
 const pair=generateKeyPairSync('rsa',{modulusLength:2048});
 const spki=pair.publicKey.export({type:'spki',format:'pem'}).toString();
 const pkcs1=pair.publicKey.export({type:'pkcs1',format:'pem'}).toString();
 assert.equal(normalizePublicKey(spki),spki); assert.equal(normalizePublicKey(pkcs1),spki);
 for (const invalid of [spki+pkcs1,pkcs1.replace('END RSA PUBLIC KEY','END PUBLIC KEY'),pair.privateKey.export({type:'pkcs1',format:'pem'}).toString(),generateKeyPairSync('rsa',{modulusLength:1024}).publicKey.export({type:'pkcs1',format:'pem'}).toString(),generateKeyPairSync('rsa',{modulusLength:3072}).publicKey.export({type:'spki',format:'pem'}).toString()]) assert.throws(()=>normalizePublicKey(invalid));
 assert.throws(()=>getSourceCommit(),/RELEASE_NOT_READY/);
});
const base = ['DATABASE_URL=mysql://gos_homologation_app:synthetic%40value@127.0.0.1:3306/gestor_os_homologation',
  'GOS_DEPLOYMENT_ENV=homologation', 'GOS_DATABASE_TARGET=gestor_os_homologation', 'GOS_EXTERNAL_EFFECTS_ENABLED=false'].join('\r\n');
test('pré-checagem recusa produção, outra conta, porta, host e efeitos externos', () => {
  assert.equal(validateConfig(base).GOS_DATABASE_TARGET, 'gestor_os_homologation');
  for (const text of [base.replace('/gestor_os_homologation', '/gestor_os'), base.replace('127.0.0.1','192.0.2.1'),
    base.replace(':3306', ':3307'), base.replace('gos_homologation_app:', 'root:'), base.replace('ENABLED=false','ENABLED=true')]) assert.throws(() => validateConfig(text));
});
test('configuração pronta exige as três opções exatas e rejeita mistura ou duplicação', () => {
  const ready = base + '\r\n' + Object.entries(required).map(([key,value]) => `${key}=${value}`).join('\r\n');
  assert.equal(validateConfig(ready, true).GOS_MYSQL_AUTH_MODE,'rsa-pinned');
  assert.throws(() => validateConfig(base, true));
  for (const text of [ready+'\r\nGOS_MYSQL_AUTH_MODE=rsa-pinned', ready+'\r\nGOS_MYSQL_TLS_CA_FILE=x',
    ready.replace('rsa-pinned','tls'), ready.replace(required.GOS_MYSQL_RSA_PUBLIC_KEY_SHA256,'0'.repeat(64)), ready+'\r\nBROKEN_LINE']) assert.throws(() => validateConfig(text, true));
});
test('precedência herdada divergente é recusada sem saída de valores', () => {
  const original = process.env.DATABASE_URL;
  try { process.env.DATABASE_URL='synthetic-conflict'; assert.throws(() => rejectInherited(validateConfig(base)), /INHERITED_ENV_CONFLICT/); }
  finally { if (original === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL=original; }
});
test('diagnóstico classifica erros estruturados do Prisma sem publicar mensagens nativas', () => {
  assert.equal(classify({ meta: { driverAdapterError: { cause: { originalCode: '1045', originalMessage: 'synthetic-secret' } } } }), 'AUTHENTICATION');
  assert.equal(classify({ errno:45028, cause:{ errno:45044 } }), 'RSA_AUTHENTICATION');
  assert.equal(classify({ errno:45028 }), 'POOL');
  assert.equal(classify({ code:'ETIMEDOUT' }), 'TIMEOUT');
  assert.equal(classify({ code:'ECONNREFUSED' }), 'CONNECTION');
  assert.equal(classify(new Error('synthetic-secret')), 'CONFIGURATION_OR_CONNECTION');
});
test('resultado aceita somente a conta TCP comprovada e o banco de homologação', () => {
  const row={db:'gestor_os_homologation',account:'gos_homologation_app@127.0.0.1',ok:1};
  assert.equal(validateReadOnlyResult([row]),'READ_ONLY_OK database=gestor_os_homologation account=gos_homologation_app@127.0.0.1 prisma=7.10.1');
  for (const account of ['gos_homologation_app@localhost','gos_homologation_app@%','gos_homologation_app@192.0.2.1','root@127.0.0.1','gos_homologation_app@127.0.0.10','gos_homologation_app@::1']) assert.throws(() => validateReadOnlyResult([{...row,account}]));
  for (const rows of [[],[row,row],[{...row,db:'gestor_os'}],[{...row,db:'gestor_os_opening_test'}],[{...row,ok:0}]]) assert.throws(() => validateReadOnlyResult(rows));
});
