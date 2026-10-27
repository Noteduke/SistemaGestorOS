import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {validateDisposableConfig} from './disposable-config.mjs';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'gos-config-'));
const data=path.join(root,'run-'+'a'.repeat(32),'data');
const proof=path.join(root,'proof.json');
fs.writeFileSync(proof,JSON.stringify({port:45001,data,pid:123}));
const base={GOS_TEST_INSTANCE_FILE:proof,DATABASE_URL:'mysql://gos_disposable_app:synthetic@127.0.0.1:45001/gestor_os_opening_test',GOS_DATABASE_TARGET:'gestor_os_opening_test',GOS_DEPLOYMENT_ENV:'test',GOS_EXTERNAL_EFFECTS_ENABLED:'false',GOS_ENV_FILE:path.join(root,'absent')};
test('aceita configuração explícita com prova e alvo descartável',()=>assert.equal(validateDisposableConfig(base).proof.port,45001));
test('recusa produção, homologação, outro host e usuário',()=>{
 for(const url of [base.DATABASE_URL.replace('gestor_os_opening_test','gestor_os'),base.DATABASE_URL.replace('gestor_os_opening_test','gestor_os_homologation'),base.DATABASE_URL.replace('127.0.0.1','192.0.2.1'),base.DATABASE_URL.replace('gos_disposable_app','root')])assert.throws(()=>validateDisposableConfig({...base,DATABASE_URL:url}));
});
test('recusa prova ausente e divergência de porta',()=>{assert.throws(()=>validateDisposableConfig({...base,GOS_TEST_INSTANCE_FILE:''}));assert.throws(()=>validateDisposableConfig({...base,DATABASE_URL:base.DATABASE_URL.replace('45001','45002')}));});
test('recusa env real e efeitos externos',()=>{assert.throws(()=>validateDisposableConfig({...base,GOS_ENV_FILE:proof}));assert.throws(()=>validateDisposableConfig({...base,GOS_EXTERNAL_EFFECTS_ENABLED:'true'}));});
after(()=>fs.rmSync(root,{recursive:true,force:true}));
