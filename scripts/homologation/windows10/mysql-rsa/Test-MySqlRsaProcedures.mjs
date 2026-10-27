import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Socket } from 'node:net';
import { generateKeyPairSync, createPublicKey } from 'node:crypto';
import { validateConfig, rejectInherited, required, validateReadOnlyResult,normalizePublicKey,getSourceCommit } from './Check-MySqlRsa.mjs';
Socket.prototype.connect = () => { throw new Error('NETWORK_FORBIDDEN_IN_OFFLINE_TEST'); };
test('NUL terminal após PEM reproduz o erro de envelope e é aceito pelo parser oficial sem aceitar material privado',()=>{
 const pair=generateKeyPairSync('rsa',{modulusLength:2048});
 const spki=pair.publicKey.export({type:'spki',format:'pem'}).toString();
 const text=(spki+'\0').trim();
 const old=/^-----BEGIN (PUBLIC KEY|RSA PUBLIC KEY)-----\s+([A-Za-z0-9+/=\s]+)-----END \1-----$/u;
 assert.equal(old.test(text),false); assert.equal(old.test(text.slice(0,-1).trim()),true);
 assert.equal(normalizePublicKey(text),spki);
 assert.throws(()=>normalizePublicKey(text+pair.privateKey.export({type:'pkcs8',format:'pem'}).toString()),/PUBLIC_KEY_ENVELOPE/);
});
test('Node aceita RSA equivalente sem NULL ASN.1 e auxiliares não exigem DER idêntico',()=>{
 const pair=generateKeyPairSync('rsa',{modulusLength:2048});
 const der=pair.publicKey.export({type:'spki',format:'der'});
 const original=Buffer.from('300d06092a864886f70d0101010500','hex'); const at=der.indexOf(original);
 const equivalent=Buffer.concat([der.subarray(0,at),Buffer.from('300b06092a864886f70d010101','hex'),der.subarray(at+original.length)]);
 equivalent.writeUInt16BE(der.readUInt16BE(2)-2,2);
 const pem='-----BEGIN PUBLIC KEY-----\n'+equivalent.toString('base64').match(/.{1,64}/g).join('\n')+'\n-----END PUBLIC KEY-----\n';
 assert.ok(!createPublicKey(pem).export({type:'spki',format:'der'}).equals(equivalent));
 assert.equal(normalizePublicKey(pem),pair.publicKey.export({type:'spki',format:'pem'}).toString());
 assert.throws(()=>normalizePublicKey('-----BEGIN PUBLIC KEY-----\ninvalid\n-----END PUBLIC KEY-----'),/PUBLIC_KEY_PARSE/);
 assert.throws(()=>normalizePublicKey(pair.privateKey.export({type:'pkcs8',format:'pem'}).toString()),/PUBLIC_KEY_ENVELOPE/);
});
test('SPKI/PKCS#1 reais sintéticos normalizam para a mesma chave e candidato não declara commit', () => {
 const pair=generateKeyPairSync('rsa',{modulusLength:2048});
 const spki=pair.publicKey.export({type:'spki',format:'pem'}).toString();
 const pkcs1=pair.publicKey.export({type:'pkcs1',format:'pem'}).toString();
 assert.equal(normalizePublicKey(spki),spki); assert.equal(normalizePublicKey(pkcs1),spki);
 assert.equal(normalizePublicKey('Public key export\n'+spki),spki);
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
test('resultado aceita somente a conta TCP comprovada e o banco de homologação', () => {
  const row={db:'gestor_os_homologation',account:'gos_homologation_app@127.0.0.1',ok:1};
  assert.equal(validateReadOnlyResult([row]),'READ_ONLY_OK database=gestor_os_homologation account=gos_homologation_app@127.0.0.1 prisma=7.10.1');
  for (const account of ['gos_homologation_app@localhost','gos_homologation_app@%','gos_homologation_app@192.0.2.1','root@127.0.0.1','gos_homologation_app@127.0.0.10','gos_homologation_app@::1']) assert.throws(() => validateReadOnlyResult([{...row,account}]));
  for (const rows of [[],[row,row],[{...row,db:'gestor_os'}],[{...row,db:'gestor_os_opening_test'}],[{...row,ok:0}]]) assert.throws(() => validateReadOnlyResult(rows));
});
