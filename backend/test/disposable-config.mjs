import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import mariadb from 'mariadb';
export {PERMISSION_CATALOG} from '../dist/modules/auth/auth.constants.js';
export function validateDisposableConfig(env){
  assert.ok(env.GOS_TEST_INSTANCE_FILE,'Use the disposable runner: instance proof required');
  const url=new URL(env.DATABASE_URL);
  assert.equal(url.protocol,'mysql:'); assert.equal(url.hostname,'127.0.0.1');
  assert.equal(url.pathname,'/gestor_os_opening_test');
  assert.equal(url.username,'gos_disposable_app'); assert.ok(url.password);
  assert.equal(env.GOS_DATABASE_TARGET,'gestor_os_opening_test');
  assert.equal(env.GOS_DEPLOYMENT_ENV,'test'); assert.equal(env.GOS_EXTERNAL_EFFECTS_ENABLED,'false');
  assert.ok(env.GOS_ENV_FILE && !fs.existsSync(env.GOS_ENV_FILE),'No real env file permitted');
  const proof=JSON.parse(fs.readFileSync(env.GOS_TEST_INSTANCE_FILE,'utf8'));
  assert.equal(Number(url.port),proof.port); assert.ok(proof.port>1024 && proof.port!==3306);
  assert.match(path.basename(path.dirname(proof.data)),/^run-[a-f0-9]{32}$/);
  return {url,proof};
}
export async function configureDisposableTest(){
  const {url,proof}=validateDisposableConfig(process.env);
  const c=await mariadb.createConnection({host:'127.0.0.1',port:proof.port,user:decodeURIComponent(url.username),password:decodeURIComponent(url.password),database:'gestor_os_opening_test',allowPublicKeyRetrieval:false,connectTimeout:3000});
  try {const r=(await c.query('SELECT @@datadir AS datadir, @@port AS port, DATABASE() AS db, CURRENT_USER() AS account'))[0];
    assert.equal(path.resolve(r.datadir).toLowerCase(),path.resolve(proof.data).toLowerCase());
    assert.equal(Number(r.port),proof.port);assert.equal(r.db,'gestor_os_opening_test');assert.ok(r.account.startsWith('gos_disposable_app@'));
  } finally {await c.end();}
  delete process.env.SHADOW_DATABASE_URL;
  return url;
}
export async function reserveHttpPort(){const s=net.createServer();await new Promise((r,j)=>{s.once('error',j);s.listen(0,'127.0.0.1',r)});const port=s.address().port;await new Promise(r=>s.close(r));return port;}
