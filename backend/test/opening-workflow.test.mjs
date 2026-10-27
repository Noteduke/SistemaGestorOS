import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { PeopleService } from '../dist/modules/people/people.service.js';
import { EquipmentLookupService } from '../dist/modules/equipment/equipment-lookup.service.js';
import { PeopleController } from '../dist/modules/people/people.controller.js';
import { EquipmentController } from '../dist/modules/equipment/equipment.controller.js';
import { REQUIRED_PERMISSIONS_KEY } from '../dist/modules/auth/decorators/auth-metadata.js';
import { emptyOpeningIntake, parseOpeningIntake } from '../dist/modules/service-orders/dto/opening-intake.dto.js';
import { parseOpeningPatch } from '../dist/modules/service-orders/dto/opening-patch.dto.js';
import { parseOpeningEquipmentSearchQuery } from '../dist/modules/equipment/dto/opening-equipment-search-query.dto.js';
import { ServiceOrderOpeningsService } from '../dist/modules/service-orders/service-order-openings.service.js';

const id = '10000000-0000-0000-0000-000000000001';
const typeId = '20000000-0000-0000-0000-000000000001';
const draft = { typePublicId: typeId, brandPublicId: id, model: 'Latitude', serialNumber: null, serialIdentificationStatus: 'NOT_IDENTIFIED' };
const errorCode = code => e => e.response?.code === code;

function peopleFixture(options = {}) {
  const records = { people: [], phones: [], emails: [], events: [], audits: [], addresses: [], linked: false };
  const push = key => async ({ data }) => { const row = { id: records[key].length + 1, publicId: id, ...data }; records[key].push(row); return row; };
  const tx = {
    $queryRaw: async () => [{ id: 1, status: "IN_PROGRESS", initiated_by_user_id: 3, customer_created_during_opening: options.alreadyCreated ?? false, equipment_id: null }],
    serviceOrderOpening: { update: async () => { records.linked = true; } },
    personAddress: { create: push("addresses") },
    person: { findUnique: async () => options.duplicate ? { id: 8 } : null, findFirst: async () => options.sameName ? { id: 8 } : null, create: push('people') },
    personPhone: { create: push('phones') }, personEmail: { create: push('emails'), findFirst: async () => options.sharedEmail ? { id: 99 } : null },
    personContactEvent: { create: push('events') }, adminAuditLog: { create: async input => { if (options.failAudit) throw Error('synthetic audit failure'); return push('audits')(input); } },
  };
  return { records, service: new PeopleService({ $transaction: async callback => {
    const before = structuredClone(records);
    try { return await callback(tx); } catch (error) { Object.assign(records, before); throw error; }
  } }) };
}

test('new customer uses Person validation, optional document, CUSTOMER role and actor audit', async () => {
  const { service, records } = peopleFixture();
  const result = await service.createOpeningCustomer({ openingPublicId: id, personType: 'PF', name: '  Cliente teste ', document: '', phone: '(11) 99999-0000', email: 'Teste@example.com' }, 3);
  assert.equal(result.data.name, 'CLIENTE TESTE');
  assert.equal(records.people[0].document, null);
  assert.deepEqual(records.people[0].roles, { create: { role: 'CUSTOMER' } });
  assert.equal(records.events.length, 4);
  assert.ok(records.events.every(row => row.userId === 3));
  assert.equal(records.audits[0].actorUserId, 3);
  assert.equal('document' in result.data, false);
});

test('customer validation rejects invalid document, duplicates and unconfirmed phone without creating Person', async () => {
  for (const [options, input, code] of [
    [{}, { document: '123' }, 'INVALID_CPF'],
    [{ duplicate: true }, { document: '52998224725' }, 'DUPLICATE_DOCUMENT'],
    [{}, { phone: '12345' }, 'INVALID_PHONE'],
    [{}, { isAdmin: true }, 'UNSUPPORTED_FIELDS'],
  ]) {
    const { service, records } = peopleFixture(options);
    await assert.rejects(service.createOpeningCustomer({ openingPublicId: id, personType: 'PF', name: 'Teste', ...input }, 3), errorCode(code));
    assert.equal(records.people.length, 0);
  }
  const { service } = peopleFixture({ sameName: true });
  assert.equal((await service.createOpeningCustomer({ openingPublicId: id, personType: 'PF', name: 'Teste' }, 3)).warnings[0].code, 'POSSIBLE_DUPLICATE_NAME');
});

test('creation and permanent equipment edit require existing permissions', () => {
  assert.deepEqual(Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, PeopleController.prototype.createOpeningCustomer), ['people.create', 'service_orders.opening.create']);
  assert.deepEqual(Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, EquipmentController.prototype.update), ['equipment.update']);
});

test('owner filter is UUID validated and added to official active equipment lookup', async () => {
  let where;
  const service = new EquipmentLookupService({ $transaction: queries => Promise.all(queries), equipment: {
    findMany: async args => { where = args.where; return []; }, count: async () => 0,
  } });
  const query = parseOpeningEquipmentSearchQuery({ page: '1', pageSize: '20', ownerPublicId: id });
  await service.searchForOpening(query);
  assert.deepEqual(where, { isActive: true, owner: { publicId: id } });
  assert.throws(() => parseOpeningEquipmentSearchQuery({ page: '1', pageSize: '20', ownerPublicId: '-'.repeat(36) }));
});

test('new intake is blank and independent; DTO normalizes only per-OS fields', () => {
  const one = emptyOpeningIntake(); one.accessories = 'Carregador';
  assert.equal(emptyOpeningIntake().accessories, '');
  const intake = parseOpeningIntake({ ...emptyOpeningIntake(), reportedDefect: ' Não liga ', battery: 'Não testada', priority: 'URGENT' });
  assert.equal(intake.reportedDefect, 'NÃO LIGA');
  assert.equal(intake.battery, 'NÃO TESTADA');
  assert.deepEqual(parseOpeningPatch({ intakeData: intake }).intakeData, intake);
  for (const data of [null, { ...intake, priority: 'INVALID' }, { ...intake, serialNumber: 'wrong place' }, { ...intake, accessories: 'a'.repeat(2001) }]) assert.throws(() => parseOpeningIntake(data));
});

test('initial status comes from existing singleton and cannot be inactive or technically concluded', async () => {
  for (const status of [null, { publicId: id, name: 'Recepção', isActive: false, technicalCompletion: 'NOT_COMPLETED' }, { publicId: id, name: 'Pronto', isActive: true, technicalCompletion: 'COMPLETED_WITH_REPAIR' }]) {
    const service = new ServiceOrderOpeningsService({ serviceOrderStatus: { findUnique: async () => status } });
    assert.equal((await service.options()).data.initialStatus, null);
  }
  const service = new ServiceOrderOpeningsService({ serviceOrderStatus: { findUnique: async () => ({ publicId: id, name: 'Recepção', isActive: true, technicalCompletion: 'NOT_COMPLETED' }) } });
  assert.equal((await service.options()).data.initialStatus.name, 'Recepção');
});

test('explicit equipment update requires confirmation/version and preserves unrelated data', async () => {
  const date = new Date('2026-10-22T12:00:00Z');
  const current = { id: 1, publicId: id, ownerId: 2, isActive: true, updatedAt: date, model: 'ANTIGO', serialNumber: null, typeId: 1, brandId: 1 };
  const changes = [], audits = [];
  const tx = { $queryRaw: async () => [], equipment: {
    findUnique: async () => ({ id: 1, ownerId: 2 }), findUniqueOrThrow: async () => current,
    findFirst: async () => null, update: async ({ data }) => { changes.push(data); return { ...current, ...data }; },
  }, equipmentType: { findUnique: async () => ({ id: 1 }) }, equipmentBrand: { findUnique: async () => ({ id: 2 }) },
  adminAuditLog: { create: async ({ data }) => audits.push(data) } };
  const service = new EquipmentLookupService({ $transaction: callback => callback(tx) });
  await assert.rejects(service.updateEquipment(id, { equipmentDraft: draft }, 3), errorCode('VALIDATION_ERROR'));
  await assert.rejects(service.updateEquipment(id, { equipmentDraft: draft, expectedUpdatedAt: '2020-01-01T00:00:00Z', confirmEquipmentChange: true }, 3), errorCode('EQUIPMENT_VERSION_CONFLICT'));
  assert.equal(changes.length, 0);
  await service.updateEquipment(id, { equipmentDraft: draft, expectedUpdatedAt: date.toISOString(), confirmEquipmentChange: true }, 3);
  assert.deepEqual(changes[0], { typeId: 1, brandId: 2, model: 'LATITUDE', serialNumber: null });
  assert.equal(audits[0].detailsJson.previous.model, 'ANTIGO');
  assert.equal(audits[0].detailsJson.next.model, 'LATITUDE');
  assert.equal(audits[0].actorUserId, 3);
});


test('full creation rolls back Person, contacts, address and opening flag on audit failure',async()=>{
 const {service,records}=peopleFixture({failAudit:true});
 await assert.rejects(service.createOpeningCustomer({openingPublicId:id,personType:'PJ',name:'Empresa',contactName:'Maria',address:{street:'Rua'},phones:[{number:'11999990000',isPrimary:true}],emails:[{address:'a@example.test'}]},3),/synthetic audit failure/);
 for(const key of ['people','phones','emails','events','audits','addresses'])assert.equal(records[key].length,0);assert.equal(records.linked,false);
});
test('shared email warning never exposes the other Person',async()=>{
 const {service}=peopleFixture({sharedEmail:true});const result=await service.createOpeningCustomer({openingPublicId:id,personType:'PF',name:'Nome',emails:[{address:'a@example.test'}]},3);
 assert.equal(result.warnings[0].code,'EMAIL_SHARED_ACROSS_PEOPLE');assert.equal(JSON.stringify(result.warnings).includes('99'),false);
});
