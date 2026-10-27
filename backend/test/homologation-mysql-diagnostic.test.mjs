import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Socket } from 'node:net';
import { parseDiagnosticConfig, pinnedSettings, diagnosticFailureCode, queryDiagnostic } from '../dist/scripts/diagnose-homologation-mysql.js';
// Tests below never read a real config/key or open sockets. Protocol tests live in mysql-connection-options.test.mjs.
Socket.prototype.connect=()=>{throw new Error('NETWORK_FORBIDDEN')};
const base=['DATABASE_URL=mysql://gos_homologation_app:synthetic%40value@127.0.0.1:3306/gestor_os_homologation',
 'GOS_DEPLOYMENT_ENV=homologation','GOS_DATABASE_TARGET=gestor_os_homologation','GOS_EXTERNAL_EFFECTS_ENABLED=false'].join('\n');
test('configuração RSA aplica-se em memória e não exige mudar o arquivo ou process.env',()=>{
 const before={...process.env}; const values=parseDiagnosticConfig(base,{});
 assert.equal(values.GOS_MYSQL_AUTH_MODE,'rsa-pinned');
 assert.equal(values.GOS_MYSQL_RSA_PUBLIC_KEY_SHA256,pinnedSettings.GOS_MYSQL_RSA_PUBLIC_KEY_SHA256);
 assert.ok(Object.keys(process.env).length === Object.keys(before).length && Object.keys(before).every(key=>process.env[key] === before[key]),'Process environment must remain unchanged (values intentionally omitted).');
});
test('destino, conflitos, duplicações e precedência inválidos bloqueiam antes de abrir conexão',()=>{
 for(const value of [base.replace('/gestor_os_homologation','/gestor_os'),base.replace('127.0.0.1','localhost'),base.replace(':3306',':3307'),base.replace('gos_homologation_app:','root:'),base.replace('ENABLED=false','ENABLED=true'),base+'\nGOS_MYSQL_AUTH_MODE=tls',base+'\nGOS_MYSQL_TLS_CA_FILE=x',base+'\nGOS_DEPLOYMENT_ENV=homologation',base+'\nBAD="unclosed']) assert.throws(()=>parseDiagnosticConfig(value,{}));
 assert.throws(()=>parseDiagnosticConfig(base,{DATABASE_URL:'never-print-this'}),/INHERITED_ENV_CONFLICT/);
 assert.throws(()=>parseDiagnosticConfig(base,{GOS_ENV_FILE:'C:/other/.env.homologation'}),/INHERITED_ENV_CONFLICT/);
});
test('erros públicos têm códigos específicos; erros de driver nunca expõem mensagens',()=>{
 for(const code of ['PUBLIC_KEY_ENVELOPE','PUBLIC_KEY_PARSE','PUBLIC_KEY_ALGORITHM','PUBLIC_KEY_SIZE','PUBLIC_KEY_EXPORT']) assert.equal(diagnosticFailureCode(new Error(code)),code);
 assert.equal(diagnosticFailureCode({errno:45028,cause:{errno:45044,message:'secret'}}),'RSA_AUTHENTICATION');
 assert.equal(diagnosticFailureCode({meta:{driverAdapterError:{cause:{originalCode:1045,message:'secret'}}}}),'AUTHENTICATION');
 assert.equal(diagnosticFailureCode({errno:45028}),'POOL_ACQUIRE_TIMEOUT');
 assert.equal(diagnosticFailureCode({code:'ETIMEDOUT'}),'CONNECTION_TIMEOUT');
 assert.equal(diagnosticFailureCode({code:'ECONNREFUSED'}),'TCP_CONNECTION');
 assert.equal(diagnosticFailureCode(new Error('mysql://secret')),'CONFIGURATION_OR_CONNECTION');
});
const options={host:'127.0.0.1',port:3306,user:'gos_homologation_app',password:'synthetic',database:'gestor_os_homologation',allowPublicKeyRetrieval:false,permitRedirect:false,cachingRsaPublicKey:'fixture'};
test('diagnóstico recusa destino não autorizado antes de construir cliente',async()=>{
 let calls=0;
 for(const extra of [{database:'gestor_os'},{user:'root'},{port:3307},{host:'localhost'},{allowPublicKeyRetrieval:true},{permitRedirect:true},{cachingRsaPublicKey:undefined},{ssl:{rejectUnauthorized:false}}]) await assert.rejects(()=>queryDiagnostic({...options,...extra},()=>{calls++;throw new Error('must not construct')}),/WRONG_TARGET/);
 assert.equal(calls,0);
});
test('leitura exige conta TCP exata, resposta única e disconnect mesmo em falha',async()=>{
 let closes=0;
 const row={db:'gestor_os_homologation',account:'gos_homologation_app@127.0.0.1',ok:1};
 for(const rows of [[row],[],[row,row],[{...row,db:'gestor_os'}],[{...row,account:'gos_homologation_app@localhost'}],[{...row,ok:0}]]) {
  const call=()=>queryDiagnostic(options,()=>({$queryRaw:async strings=>{assert.equal(strings.join(''),'SELECT DATABASE() AS db, CURRENT_USER() AS account, 1 AS ok');return rows},$disconnect:async()=>{closes++}}));
  if(rows.length === 1 && rows[0] === row) assert.match(await call(),/^READ_ONLY_OK /);else await assert.rejects(call,/AUTHENTICATED_TARGET_MISMATCH/);
 }
 assert.equal(closes,6);
});
