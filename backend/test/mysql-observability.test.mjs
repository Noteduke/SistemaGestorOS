import assert from 'node:assert/strict';
import {test} from 'node:test';
import {PrismaMariaDb} from '@prisma/adapter-mariadb';
import {MysqlObservation,MysqlDiagnosticFailure,sanitizeMysqlError,classifyMysqlFrames,observeMysqlPool,poolMetrics} from '../dist/infrastructure/prisma/mysql-observability.js';
import {queryDiagnostic} from '../dist/scripts/diagnose-homologation-mysql.js';
const options={host:'127.0.0.1',port:3306,user:'gos_homologation_app',password:'synthetic',database:'gestor_os_homologation',allowPublicKeyRetrieval:false,permitRedirect:false,cachingRsaPublicKey:'fixture'};
test('explicit structured evidence classifies roots, not raw messages',()=>{
 for(const [e,expected] of [[{errno:45028},'POOL_ACQUIRE_TIMEOUT'],[{errno:45061},'POOL_ACQUISITION'],[{errno:45028,cause:{errno:45044}},'RSA_AUTHENTICATION'],[{errno:1045},'AUTHENTICATION'],[{errno:1142},'AUTHORIZATION'],[{errno:1040},'CONNECTION_LIMIT'],[{code:'ECONNREFUSED'},'TCP_CONNECTION'],[{code:'ETIMEDOUT'},'CONNECTION_TIMEOUT'],[{errno:45026},'TIMEOUT'],[{code:'CERT_HAS_EXPIRED'},'TLS_VALIDATION'],[{errno:1049},'CONFIGURATION'],[{errno:1146},'PRISMA_QUERY'],[{errno:45044,cause:{errno:1045}},'MULTIPLE_CAUSES'],[{message:'errno 1045 password=synthetic-secret'},'UNKNOWN']]) assert.equal(classifyMysqlFrames(sanitizeMysqlError(e,'POOL_QUERY')),expected);
});
test('sanitizer rejects secrets, getters, proxies, unknown values, cycles and excessive frames',()=>{
 const secret='synthetic-secret'; const e={errno:45028,message:secret,sql:secret,code:secret,sqlState:secret,meta:{driverAdapterError:{cause:{originalCode:'45044'}}}};e.cause=e;
 Object.defineProperty(e,'originalError',{get(){throw Error(secret)}});
 const obs=new MysqlObservation();obs.capture(e,'POOL_QUERY');obs.capture(new Proxy({},{getOwnPropertyDescriptor(){throw Error(secret)}}),'POOL_EVENT');
 for(let n=0;n<100;n++) obs.capture({errno:1045,errors:[{errno:45044}]},'POOL_EXECUTE');
 const failure=new MysqlDiagnosticFailure(obs,{active:secret,idle:Infinity,total:-1,queued:0,limit:1},true);
 assert.ok(failure.primary.length<=64);assert.ok(!JSON.stringify(failure).includes(secret));assert.ok(!failure.lines().join('').includes(secret));
 assert.equal(sanitizeMysqlError(e,secret).length,0);assert.equal(failure.metrics.active,'NONE');
});
test('installed Adapter drops original nested code; observer preserves it before conversion',async()=>{
 const original=Object.assign(new Error('synthetic-secret'),{errno:45028,code:'ER_GET_CONNECTION_TIMEOUT',sqlMessage:'synthetic-secret',sqlState:'HY000',cause:{errno:45044,code:'ER_CANNOT_RETRIEVE_RSA_KEY'}});
 const obs=new MysqlObservation();
 const pool={query:async()=>[['8.0.46']],execute:async()=>{throw original},getConnection:async()=>{throw original},end:async()=>{}};
 const connection=await new PrismaMariaDb(observeMysqlPool(pool,obs),{disposeExternalPool:false}).connect();
 try {await assert.rejects(()=>connection.queryRaw({sql:'SELECT 1',args:[],argTypes:[]}),error=>{assert.equal(error.cause.originalCode,'45028');assert.equal(error.cause.cause,undefined);return true});}
 finally {await connection.dispose()}
 assert.ok(obs.snapshot().primary.some(frame=>frame.errno===45044));
 assert.equal(classifyMysqlFrames(obs.snapshot().primary),'RSA_AUTHENTICATION');
});
test('primary acquisition failure survives both cleanup failures; cleanup-only cannot pass',async()=>{
 const obs=new MysqlObservation();let ended=false;
 await assert.rejects(()=>queryDiagnostic(options,()=>({observation:obs,client:{$queryRaw:async()=>{throw {errno:45028,cause:{errno:45044},message:'synthetic-secret'}},$disconnect:async()=>{throw {code:'ECONNRESET'}}},closePool:async()=>{ended=true;throw {errno:45027}},metrics:()=>({active:0,idle:0,total:0,queued:0,limit:1})})),e=>e.code==='RSA_AUTHENTICATION' && e.cleanup.length===2 && !e.lines().join('').includes('synthetic-secret'));
 assert.ok(ended);
 await assert.rejects(()=>queryDiagnostic(options,()=>({$queryRaw:async()=>[{db:'gestor_os_homologation',account:'gos_homologation_app@127.0.0.1',ok:1}],$disconnect:async()=>{throw {errno:45027}}})),e=>e.code==='CLEANUP_FAILURE');
});
test('pool proxy preserves private receiver and safe metrics',async()=>{
 class Pool {#value=1;async query(){return this.#value}activeConnections(){return this.#value}idleConnections(){throw Error('secret')}totalConnections(){return -1}taskQueueSize(){return Infinity}}
 const pool=new Pool();assert.equal(await observeMysqlPool(pool,new MysqlObservation()).query(),1);
 assert.deepEqual(poolMetrics(pool,1),{active:1,idle:'NONE',total:'NONE',queued:'NONE',limit:1});
});
