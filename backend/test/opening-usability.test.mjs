import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { editOpeningCustomer, linkedOpeningCustomer } from '../dist/modules/people/opening-customer-editor.js';
import { PeopleService } from '../dist/modules/people/people.service.js';
import { PeopleController } from '../dist/modules/people/people.controller.js';
import { ServiceOrdersReadService } from '../dist/modules/service-orders/service-orders-read.service.js';
import { REQUIRED_PERMISSIONS_KEY } from '../dist/modules/auth/decorators/auth-metadata.js';
import { parseCompletePerson } from '../dist/modules/people/dto/complete-person.dto.js';
const code = name => e => e.response?.code === name;
test('país interno não cria endereço vazio nem torna outros campos obrigatórios', () => {
  const p = parseCompletePerson({ name: 'Cliente', address: { country: 'BR' } });
  assert.equal(p.address, undefined); assert.equal(p.data.personType, 'PF'); assert.equal(p.data.document, null);
  assert.equal(parseCompletePerson({ personType: 'PJ', name: 'Empresa', stateRegistration: '123', municipalRegistration: '456', address: { street: 'Rua' } }).address.country, 'BR');
});
function fixture(overrides = {}) {
  const previous = { id: 1, publicId: 'person', personType: 'PF', name: 'ANTERIOR', document: null, tradeName: null, contactName: null, observations: null, stateRegistration: 'HISTORICA', municipalRegistration: 'MANTIDA', warning: null, isActive: true, updatedAt: new Date('2026-10-23T12:00:00Z'), phones: [{ id: 1, publicId: 'phone', number: '1132345678', isPrimary: true }], emails: [{ id: 2, publicId: 'email', address: 'old@example.test', isPrimary: true }], address: { street: 'RUA ANTIGA', country: 'AR' } };
  const data = { ...previous }; const calls = [];
  const tx = {
    $queryRaw: async () => [{ customer_id: 1, status: 'IN_PROGRESS', initiated_by_user_id: 3, ...overrides }],
    person: { findUnique: async () => previous, update: async ({ data: change }) => { calls.push('person'); Object.assign(data, change); }, findUniqueOrThrow: async () => data },
    personAddress: { upsert: async args => { calls.push(args); data.address = { ...data.address, ...args.update }; } },
    personPhone: { updateMany: async () => {}, update: async () => calls.push('phone'), create: async () => {} },
    personEmail: { updateMany: async () => {}, update: async () => calls.push('email'), create: async () => {} },
    adminAuditLog: { create: async args => calls.push(args.data) },
  };
  const body = { personType: 'PF', name: 'Novo', isActive: true, warning: '', expectedUpdatedAt: previous.updatedAt.toISOString(), confirmPersonChange: true,
    phones: [{ publicId: 'phone', number: '(11) 3234-5678', isPrimary: true }], emails: [{ publicId: 'email', address: 'new@example.test', isPrimary: true }], address: { street: 'RUA NOVA', country: 'AR' } };
  return { tx, body, calls, data };
}
test('edição preserva inscrições ocultas de PF, país histórico e audita valores anteriores/novos', async () => {
  const f = fixture(); const r = await editOpeningCustomer(f.tx, 'opening', 3, f.body);
  assert.equal(r.data.name, 'NOVO'); assert.equal(f.data.stateRegistration, 'HISTORICA'); assert.equal(f.data.municipalRegistration, 'MANTIDA'); assert.equal(f.data.address.country, 'AR');
  const audit = f.calls.find(c => c?.eventCode); assert.equal(audit.eventCode, 'CUSTOMER_UPDATED_DURING_OPENING'); assert.equal(audit.actorUserId, 3); assert.equal(audit.detailsJson.previous.name, 'ANTERIOR'); assert.equal(audit.detailsJson.current.name, 'NOVO');
});
test('edição exige confirmação, revisão atual, abertura própria e em andamento', async () => {
  for (const [override, error] of [[{ confirmPersonChange: false }, 'PERSON_CHANGE_CONFIRMATION_REQUIRED'], [{ expectedUpdatedAt: 'antigo' }, 'PERSON_CONCURRENCY_CONFLICT']]) {
    const f = fixture(); await assert.rejects(editOpeningCustomer(f.tx, 'o', 3, { ...f.body, ...override }), code(error)); assert.equal(f.calls.length, 0);
  }
  await assert.rejects(linkedOpeningCustomer(fixture({ initiated_by_user_id: 9 }).tx, 'o', 3), code('OPENING_NOT_FOUND'));
  await assert.rejects(linkedOpeningCustomer(fixture({ status: 'CONFIRMED' }).tx, 'o', 3), code('OPENING_NOT_IN_PROGRESS'));
});
test('não remove contatos históricos, não aceita IDs alheios nem mudanças em situação/aviso', async () => {
  for (const change of [{ phones: [] }, { phones: [{ publicId: 'outro', number: '1132345678' }] }, { isActive: false }, { warning: 'novo aviso' }]) {
    const f = fixture(); await assert.rejects(editOpeningCustomer(f.tx, 'o', 3, { ...f.body, ...change })); assert.equal(f.calls.length, 0);
  }
});
test('DDD, fixo/celular nacionais: valida alterações e preserva legado inalterado', async () => {
  for (const value of ['5511987654321', '00987654321', '11876543210', '2032345678', '1032345678']) { const f = fixture(); await assert.rejects(editOpeningCustomer(f.tx, 'o', 3, { ...f.body, phones: [{ publicId: 'phone', number: value }] }), code('INVALID_PHONE')); }
  const svc = new PeopleService({ $transaction: () => { throw Error('Não deve escrever'); } });
  await assert.rejects(svc.createOpeningCustomer({ openingPublicId: '10000000-0000-0000-0000-000000000001', name: 'X', phones: [{ number: '5511987654321', confirmNonstandardPhone: true }] }, 3), code('INVALID_PHONE'));
});
test('API de alteração usa permissões individuais já existentes', () => {
  assert.deepEqual(Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, PeopleController.prototype.updateOpeningCustomer), ['service_orders.opening.create', 'people.update', 'people.contacts.add']);
});
test('Backend bloqueia documento de saída em OS aberta e permite encerrada/cancelada', async () => {
  const service = new ServiceOrdersReadService({serviceOrderEvent:{findFirst:async()=>null}});
  for (const status of ['ABERTA', 'FECHADA', 'CANCELADA']) {
    service.getByPublicId = async () => ({ data: { macroStatus: status } });
    if (status === 'ABERTA') await assert.rejects(service.getExitPrintData('o'), code('EXIT_PRINT_REQUIRES_CLOSURE'));
    else assert.equal((await service.getExitPrintData('o')).data.macroStatus, status);
  }
});

test('saída consulta encerramento mais recente sem limite de paginação e não expõe payload restrito',async()=>{
  let query;const service=new ServiceOrdersReadService({serviceOrderEvent:{findFirst:async args=>{query=args;return {eventType:'OS_ENCERRADA',occurredAt:new Date('2026-10-23T12:00:00Z'),payloadJson:{outcome:'REPAIRED',unitCost:'SEGREDO',stockOperations:['INTERNO']}}}}});
  service.getByPublicId=async()=>({data:{macroStatus:'FECHADA'}});
  const result=await service.getExitPrintData('os');assert.equal(result.data.closureEvent.outcome,'REPAIRED');assert.deepEqual(query.orderBy,[{occurredAt:'desc'},{id:'desc'}]);assert.equal(query.where.serviceOrder.publicId,'os');assert.ok(!JSON.stringify(result).includes('SEGREDO'));assert.ok(!JSON.stringify(result).includes('stockOperations'));
});

test('impressão recebe contatos atuais do cliente sem reescrever o retrato histórico',async()=>{
  const row={publicId:'os',numberValue:1n,macroStatus:'OPEN',opening:{publicId:'opening',confirmedAt:new Date()},operationalStatus:{publicId:'status',name:'RECEPÇÃO'},technicalCompletion:'NOT_COMPLETED',customer:{publicId:'customer',name:'ATUAL',personType:'PJ',document:'SINTÉTICO',tradeName:'FANTASIA',contactName:'CONTATO',phones:[{number:'1132345678'}],emails:[{address:'cliente@example.test'}],address:{city:'CIDADE SINTÉTICA'}},equipment:{publicId:'equipment',type:{name:'NOTEBOOK'},brand:{name:'MARCA'},model:'MODELO ATUAL',owner:{publicId:'customer'},serialNumber:null},createdBy:{publicId:'user'},assignments:[],customerSnapshotJson:{name:'HISTÓRICO'},equipmentSnapshotJson:{model:'HISTÓRICO'}};
  let query;const service=new ServiceOrdersReadService({serviceOrder:{findFirst:async args=>{query=args;return row}}});
  const {data}=await service.getByPublicId('os');assert.equal(data.customerPrint.name,'ATUAL');assert.deepEqual(data.customerPrint.phones,['1132345678']);assert.equal(data.customerSnapshotJson.name,'HISTÓRICO');assert.equal(data.equipment.model,'MODELO ATUAL');assert.equal(query.select.customer.select.warning,undefined);assert.equal(data.customerPrint.id,undefined);
});
