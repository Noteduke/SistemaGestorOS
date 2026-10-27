// Creates its own disposable MySQL instance. Never reads project .env or connects to an existing service.
import 'reflect-metadata';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import mariadb from 'mariadb';
import * as argon2 from 'argon2';

const arg = name => process.argv[process.argv.indexOf(name) + 1];
for (const name of ['--mysql-binary', '--work-dir', '--migrations-dir']) assert.ok(process.argv.includes(name), `Missing ${name}`);
const binary = path.resolve(arg('--mysql-binary'));
const work = path.resolve(arg('--work-dir'));
const migrations = path.resolve(arg('--migrations-dir'));
assert.equal(path.basename(binary).toLowerCase(), 'mysqld.exe');
assert.equal(fs.existsSync(work), false, 'Disposable directory must be new');
assert.match(execFileSync(binary, ['--no-defaults', '--version'], { encoding: 'utf8' }), /8\.0\.46/);
fs.mkdirSync(work, { recursive: true });
const data = path.join(work, 'data');
execFileSync(binary, ['--no-defaults', '--initialize-insecure', `--basedir=${path.dirname(path.dirname(binary))}`, `--datadir=${data}`], { stdio: 'pipe' });
const socket = net.createServer(); socket.listen(0, '127.0.0.1'); await once(socket, 'listening');
const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
const server = spawn(binary, ['--no-defaults', `--datadir=${data}`, `--port=${port}`, '--bind-address=127.0.0.1', '--mysqlx=OFF', '--skip-log-bin', `--log-error=${path.join(work, 'mysql-error.log')}`], { windowsHide: true, stdio: 'ignore' });
let connection, app;
try {
  for (let attempt = 0; attempt < 100; attempt++) {
    try { connection = await mariadb.createConnection({ host: '127.0.0.1', port, user: 'root', password: '', connectTimeout: 1000, multipleStatements: true }); break; }
    catch { await new Promise(resolve => setTimeout(resolve, 200)); }
  }
  assert.ok(connection, 'Disposable MySQL did not start');
  // This connection belongs to the child instance we just initialized, on its unique loopback port.
  await connection.query('CREATE DATABASE gestor_os_opening_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
  await connection.query('USE gestor_os_opening_test');
  assert.equal((await connection.query('SELECT DATABASE() AS db'))[0].db, 'gestor_os_opening_test');
  let migrationCount = 0;
  for (const name of fs.readdirSync(migrations).sort()) {
    const file = path.join(migrations, name, 'migration.sql');
    if (fs.existsSync(file)) { await connection.query(fs.readFileSync(file, 'utf8')); migrationCount++; }
  }
  Object.assign(process.env, { GOS_ENV_FILE: path.join(work, 'absent-config'), DATABASE_URL: `mysql://root@127.0.0.1:${port}/gestor_os_opening_test`,
    GOS_DATABASE_TARGET: 'gestor_os_opening_test', GOS_DEPLOYMENT_ENV: 'test', GOS_EXTERNAL_EFFECTS_ENABLED: 'false', NODE_ENV: 'test' });
  delete process.env.SHADOW_DATABASE_URL;
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../dist/app.module.js');
  const { PrismaService } = await import('../dist/infrastructure/prisma/prisma.service.js');
  app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api/v1');
  await app.init();
  const db = app.get(PrismaService);
  assert.equal((await db.$queryRaw`SELECT DATABASE() AS db`)[0].db, 'gestor_os_opening_test');
  const password = randomBytes(24).toString('base64url');
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const admin = await db.user.create({ data: { username: 'opening_integration_admin', passwordHash, isAdmin: true } });
  const ordinary = await db.user.create({ data: { username: 'opening_integration_reader', passwordHash, isAdmin: false } });
  await app.listen(0, '127.0.0.1');
  const base = `http://127.0.0.1:${app.getHttpServer().address().port}/api/v1`;
  const request = async (method, route, session = {}, body) => {
    const result = await fetch(base + route, { method, headers: { ...(session.cookie ? { cookie: session.cookie, 'x-csrf-token': session.csrf } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: result.status, headers: result.headers, body: await result.json().catch(() => null) };
  };
  const cookie = (headers, name) => headers.getSetCookie().find(value => value.startsWith(name + '=')).split(';')[0];
  const login = async user => {
    const pre = await request('GET', '/auth/csrf');
    const result = await request('POST', '/auth/login', { cookie: cookie(pre.headers, 'gos_pre_auth'), csrf: pre.body.data.csrfToken }, { username: user.username, password });
    assert.equal(result.status, 201);
    return { cookie: cookie(result.headers, 'gos_session'), csrf: result.body.data.csrfToken };
  };
  const session = await login(admin), denied = await login(ordinary);
  const ok = (result, expected = 200) => { assert.equal(result.status, expected, `HTTP status: ${JSON.stringify(result.body)}`); return result.body?.data; };
  ok(await request('POST', '/people/customers', denied, { personType: 'PF', name: 'Negado' }), 403);
  const open = async () => ok(await request('POST', '/service-orders/openings', session, {}), 201);
  const first = await open();
  const input={openingPublicId:first.publicId,personType:'PF',name:'Cliente sem documento',phones:[{number:'11999990000',isPrimary:true},{number:'1133334444'}],emails:[{address:'cliente@example.test',isPrimary:true},{address:'segundo@example.test'}],address:{street:'Rua teste',number:'1',city:'Teste',state:'SP'}};
  const creation=await Promise.all([request('POST','/people/customers',session,input),request('POST','/people/customers',session,input)]);
  assert.deepEqual(creation.map(x=>x.status).sort(),[201,409]);const customer=ok(creation.find(x=>x.status===201),201);
  assert.equal(ok(await request('GET','/service-orders/openings/current',session)).customerCreatedDuringOpening,true);
  ok(await request('POST','/people/customers',session,input),409);
  const persisted=await db.person.findUniqueOrThrow({where:{publicId:customer.publicId},include:{phones:true,emails:true,address:true}});
  assert.equal(persisted.phones.length,2);assert.equal(persisted.emails.length,2);assert.equal(persisted.address.street,'RUA TESTE');
  const pj=ok(await request('POST','/people',session,{personType:'PJ',name:'Empresa',contactName:'Maria',stateRegistration:'123',municipalRegistration:'456',tradeName:'Fantasia',warning:'Aviso',isActive:false}),201);
  assert.equal(pj.contactName,'MARIA');assert.equal(pj.isActive,false);
  assert.equal(ok(await request('POST','/people',session,{personType:'PF',name:'Somente nome'}),201).document,null);
  const {ensureOpeningCatalogs}=await import('../dist/scripts/ensure-opening-catalogs.js');
  assert.deepEqual(await db.$transaction(tx=>ensureOpeningCatalogs(tx,admin.id)),{types:16,brands:27});
  assert.deepEqual(await db.$transaction(tx=>ensureOpeningCatalogs(tx,admin.id)),{types:0,brands:0});
  assert.equal(customer.documentHint, null);
  assert.equal(ok(await request('GET', '/people/customers?page=1&pageSize=20&search=999990000', session))[0].publicId, customer.publicId);
  ok(await request('POST', '/people', session, { personType: 'PF', name: 'Documento', document: '52998224725' }), 201);
  ok(await request('POST', '/people', session, { personType: 'PF', name: 'Duplicado', document: '52998224725' }), 409);
  const type=await db.equipmentType.findUniqueOrThrow({where:{name:'NOTEBOOK'}});
  const brand=await db.equipmentBrand.findUniqueOrThrow({where:{name:'NÃO INFORMADA'}});
  const intakeData = { version: 1, reportedDefect: 'Não liga', accessories: 'Carregador', physicalCondition: 'Riscos', battery: 'Sem teste', observations: 'Entrada teste', priority: 'URGENT' };
  const draft = { typePublicId: type.publicId, brandPublicId: brand.publicId, model: 'Não informado', serialNumber: null, serialIdentificationStatus: 'NOT_IDENTIFIED' };
  const patch = async (opening, body) => ok(await request('PATCH', `/service-orders/openings/${opening.publicId}`, session, body));
  assert.equal(first.intakeData.accessories, ''); assert.equal(first.complaint, null);
  await patch(first, { customerPublicId: customer.publicId, equipmentDraft: draft, intakeData, complaint: 'Solicitação' });
  const outcomes = await Promise.all([1, 2].map(() => request('POST', `/service-orders/openings/${first.publicId}/confirm`, session, {})));
  assert.deepEqual(outcomes.map(row => row.status).sort(), [201, 409]);
  const saved = outcomes.find(row => row.status === 201).body.data;
  assert.equal(saved.equipment.serialNumber, null);
  const recovered = ok(await request('GET', `/service-orders/${saved.publicId}`, session));
  assert.equal(recovered.intakeData.accessories, 'CARREGADOR'); assert.equal(recovered.intakeData.battery, 'SEM TESTE');
  assert.equal(recovered.complaint, 'SOLICITAÇÃO');
  assert.equal(await db.serviceOrder.count(), 1);
  assert.equal((await db.equipment.findUniqueOrThrow({ where: { publicId: saved.equipment.publicId } })).ownerId, (await db.person.findUniqueOrThrow({ where: { publicId: customer.publicId } })).id);
  const history = ok(await request('GET', `/service-orders?page=1&pageSize=20&equipmentPublicId=${saved.equipment.publicId}`, session));
  assert.equal(history.length, 1);
  const second = await open();
  assert.equal(second.complaint, null); assert.equal(second.intakeData.accessories, '');
  await patch(second, { customerPublicId: customer.publicId, equipmentPublicId: saved.equipment.publicId });
  ok(await request('POST', `/service-orders/openings/${second.publicId}/confirm`, session, {}), 201);
  const equipment = ok(await request('GET', `/equipment/opening-search?page=1&pageSize=20&ownerPublicId=${customer.publicId}`, session))[0];
  ok(await request('PATCH', `/equipment/${equipment.publicId}`, denied, { equipmentDraft: draft, expectedUpdatedAt: equipment.updatedAt, confirmEquipmentChange: true }), 403);
  ok(await request('PATCH', `/equipment/${equipment.publicId}`, session, { equipmentDraft: { ...draft, model: 'NOVO MODELO', serialNumber: 'ABC', serialIdentificationStatus: 'IDENTIFIED' }, expectedUpdatedAt: equipment.updatedAt, confirmEquipmentChange: true }));
  assert.equal(ok(await request('GET', `/service-orders/${saved.publicId}`, session)).equipmentSnapshotJson.model, 'NÃO INFORMADO');
  const third = await open();
  await patch(third, { customerPublicId: customer.publicId, equipmentDraft: { ...draft, serialNumber: 'ABC', serialIdentificationStatus: 'IDENTIFIED' } });
  ok(await request('POST', `/service-orders/openings/${third.publicId}/confirm`, session, {}), 409);
  assert.equal(await db.serviceOrder.count(), 2);
  assert.ok(await db.adminAuditLog.count({ where: { eventCode: 'CUSTOMER_CREATED_DURING_OPENING' } }) >= 1);
  console.log(JSON.stringify({ result: 'PASS', database: 'gestor_os_opening_test', disposableMysql: true, migrations: migrationCount,
    scenarios: ['complete-PF-PJ-multiple-contacts-single-address', 'concurrent-customer-create-once', 'catalog-seed-idempotent', 'customer-create-search-optional-document', 'document-duplicate', 'new-equipment-no-serial', 'existing-equipment', 'blank-new-intake', 'intake-persist-retrieve', 'concurrent-confirm-once', 'equipment-duplicate', 'permissions', 'permanent-edit-snapshots', 'equipment-history', 'audit'] }));
} finally {
  if (app) await app.close();
  if (connection) { try { await connection.query('SHUTDOWN'); } catch {} await connection.end().catch(() => {}); }
  if (server.exitCode === null) { server.kill(); await Promise.race([once(server, 'exit'), new Promise(resolve => setTimeout(resolve, 5000))]); }
}
