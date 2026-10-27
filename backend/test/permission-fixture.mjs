import assert from 'node:assert/strict';
import path from 'node:path';
import {configureDisposableTest,validateDisposableConfig} from './disposable-config.mjs';
import {PERMISSION_CATALOG} from '../dist/modules/auth/auth.constants.js';
export async function loadPermissionFixture(prisma){
 await configureDisposableTest();
 const {proof}=validateDisposableConfig(process.env);
 const identity=await prisma.$queryRawUnsafe('SELECT DATABASE() AS db, @@datadir AS datadir, @@port AS port');
 assert.equal(path.resolve(identity[0].datadir).toLowerCase(),path.resolve(proof.data).toLowerCase());
 assert.equal(Number(identity[0].port),proof.port);
 assert.equal(identity[0].db,'gestor_os_opening_test');
 for(const [code,description] of PERMISSION_CATALOG)await prisma.permission.upsert({where:{code},create:{code,description},update:{description}});
 const rows=await prisma.permission.findMany({select:{code:true}});
 assert.deepEqual(rows.map(r=>r.code).sort(),PERMISSION_CATALOG.map(r=>r[0]).sort());
 return rows.length;
}
