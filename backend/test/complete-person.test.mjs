import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCompletePerson } from '../dist/modules/people/dto/complete-person.dto.js';
import { PeopleService } from '../dist/modules/people/people.service.js';
import { ensureOpeningCatalogs, openingEquipmentTypes, openingEquipmentBrands } from '../dist/scripts/ensure-opening-catalogs.js';

test('complete PF/PJ, optional document, contact name, one address and multiple contacts', () => {
 const pj=parseCompletePerson({personType:'PJ',name:' Oficina ',contactName:'Maria',stateRegistration:'123',phones:[{number:'11999990000',isPrimary:true},{number:'1133334444'}],emails:[{address:'A@example.test',isPrimary:true},{address:'B@example.test'}],address:{street:'Rua',postalCode:'01.234-567',state:'sp'}});
 assert.equal(pj.data.contactName,'MARIA');assert.equal(pj.address.postalCode,'01234567');assert.equal(pj.address.state,'SP');assert.equal(pj.address.country,'BR');assert.equal(pj.phones.length,2);assert.equal(pj.emails[0].address,'a@example.test');
 assert.equal(parseCompletePerson({personType:'PF',name:'Somente nome'}).data.document,null);
 assert.equal(parseCompletePerson({name:'Somente nome'}).data.personType,'PF');
 assert.throws(()=>parseCompletePerson({name:'X',address:{toString:'invalid'}}));
 for(const input of [{phones:[{number:'11999990000',isPrimary:true},{number:'1133334444',isPrimary:true}]},{emails:[{address:'a@example.test'},{address:'A@example.test'}]},{address:[{}]},{contactName:'Indevido'},{isAdmin:true}])assert.throws(()=>parseCompletePerson({personType:'PF',name:'X',...input}));
});

test('second customer rejected before any creation; general registration has no opening restriction',async()=>{
 let created=0;
 const tx={$queryRaw:async()=>[{id:1,status:'IN_PROGRESS',initiated_by_user_id:3,customer_created_during_opening:1,equipment_id:null}],person:{findUnique:async()=>null,findFirst:async()=>null,create:async({data})=>{created++;return {id:1,publicId:'p',...data}}},adminAuditLog:{create:async()=>{}}};
 const svc=new PeopleService({$transaction:fn=>fn(tx)});
 await assert.rejects(svc.createOpeningCustomer({openingPublicId:'10000000-0000-0000-0000-000000000001',personType:'PF',name:'X'},3),e=>e.response.code==='OPENING_CUSTOMER_ALREADY_CREATED');assert.equal(created,0);
 await svc.createCompletePerson({personType:'PF',name:'X'},3);assert.equal(created,1);
});

test('catalog seed is target guarded, idempotent, preserves IDs and audits only insertions',async()=>{
 const types=new Map(),brands=new Map();let audits=0;
 const model=map=>({findUnique:async({where})=>map.get(where.name),createMany:async({data})=>{map.set(data[0].name,{id:map.size+1});return {count:1}}});
 const tx={$queryRaw:async()=>[{db:'gestor_os_opening_test'}],equipmentType:model(types),equipmentBrand:model(brands),adminAuditLog:{create:async()=>{audits++}}};
 assert.deepEqual(await ensureOpeningCatalogs(tx,1),{types:16,brands:27});assert.equal(audits,43);assert.equal(types.size,openingEquipmentTypes.length);assert.equal(brands.size,openingEquipmentBrands.length);
 assert.deepEqual(await ensureOpeningCatalogs(tx,1),{types:0,brands:0});assert.equal(audits,43);
 await assert.rejects(ensureOpeningCatalogs({...tx,$queryRaw:async()=>[{db:'gestor_os'}]},1),/TARGET_REJECTED/);
});
