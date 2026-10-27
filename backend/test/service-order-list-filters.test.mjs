import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { parseListServiceOrdersQuery as parse } from '../dist/modules/service-orders/dto/list-service-orders-query.dto.js';
import { ServiceOrdersReadService } from '../dist/modules/service-orders/service-orders-read.service.js';
const id = '10000000-0000-4000-8000-000000000001';
const base = {page:'2',pageSize:'20'};
test('filtros validam identificadores, estado, datas reais e garantia não implementada',()=>{
  for(const change of [{state:'UNKNOWN'},{dateFrom:'2026-02-30',dateField:'entry'},{dateFrom:'2026-01-01'}, {dateField:'exit',dateFrom:'2026-10-24',dateTo:'2026-10-23'}, {technicianPublicId:id,unassigned:'true'}, {warranty:'in'}, {statusPublicId:'invalid'}]) assert.throws(()=>parse({...base,...change}));
  assert.equal(parse({...base,warranty:'all'}).page,2);
});
test('dia completo de São Paulo usa início inclusivo e próximo dia exclusivo, inclusive DST',()=>{
  for(const [day,start,end] of [['2026-10-23','2026-10-23T03:00:00.000Z','2026-10-24T03:00:00.000Z'],['2018-11-04','2018-11-04T03:00:00.000Z','2018-11-05T02:00:00.000Z'],['2024-02-29','2024-02-29T03:00:00.000Z','2024-03-01T03:00:00.000Z']]){
    const q=parse({...base,dateField:'entry',dateFrom:day,dateTo:day});assert.equal(q.dateStart.toISOString(),start);assert.equal(q.dateEnd.toISOString(),end);
  }
});
test('combina filtros e usa o mesmo predicado na contagem e página, sem presumir saída',async()=>{
  const calls=[];const prisma={serviceOrder:{findMany:args=>{calls.push(args);return []},count:args=>{calls.push(args);return 0}},$transaction:async values=>Promise.all(values)};
  const query=parse({...base,state:'CLOSED',statusPublicId:id,technicianPublicId:id,dateField:'exit',dateFrom:'2026-10-23',dateTo:'2026-10-23'});
  const result=await new ServiceOrdersReadService(prisma).list(query);
  assert.deepEqual(calls[0].where,calls[1].where);assert.equal(calls[0].skip,20);assert.equal(result.pagination.total,0);
  assert.equal(calls[0].where.macroStatus,'CLOSED');assert.equal(calls[0].where.events.some.eventType,'OS_ENCERRADA');assert.equal(calls[0].where.assignments.some.user.publicId,id);
  calls.length=0;await new ServiceOrdersReadService(prisma).list(parse({...base,unassigned:'true',awaitingPickup:'true',state:'CLOSED'}));
  assert.deepEqual(calls[0].where.assignments,{none:{}});assert.equal(calls[0].where.macroStatus,'CLOSED');assert.equal(calls[0].where.AND[0].macroStatus,'OPEN');
});
