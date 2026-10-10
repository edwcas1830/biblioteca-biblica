'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const refs=require('../shared/references.js'),desktopRefs=require('../lib/references.cjs'),models=require('../shared/personal-model.js');
const reader=require('../platform/web/library.js');
const books=Array.from({length:66},(_,i)=>({name:'Libro '+i,chapters:Array.from({length:30},()=>Array(25).fill('Texto de prueba'))}));
const fixture=()=>({version:1,position:{book:18,chapter:23,verse:1},notes:{'18:23:1':'Nota de prueba','rv1960@42:3:16':'Otra numeración'},highlights:{'18:23:1':'gold'},plans:[{id:'plan-123',days:1189,scope:'custom',title:'Plan sintético',entries:Array.from({length:1189},(_,i)=>({title:'Día '+i,readings:[{book:18,chapter:23}]})),completed:Array.from({length:329},(_,i)=>i)}],devotionals:[{id:'dev-prueba',title:'Devocional sintético',entries:[{title:'Día 1',book:18,chapter:23,body:'Mi reflexión'}],completed:[],lastDay:0}],prayers:[],prayerDrafts:{},guideResponses:{},aiStudies:[],devResponses:{'dev-prueba:0':'Respuesta'},planNotes:{},appearance:{design:'c'},font:20});
test('Portable asynchronous SHA and day IDs are byte-compatible with Windows, including Unicode',async()=>{
  for(const text of ['', 'Día · oración ñ 😀', JSON.stringify(fixture())])assert.equal(await refs.digest(text),desktopRefs.digest(text));
  const entry={title:'Jesús y el corazón',readings:[{book:42,chapter:3,verse:16}]};assert.equal(await refs.dayId('plan-123',7,entry),desktopRefs.dayId('plan-123',7,entry));
  assert.equal(refs.canonicalKey('rv1960@42:3:16'),'rv1960@b043:3:16');assert.equal(refs.legacyKey('rv1960@b043:3:16'),'rv1960@42:3:16');
  assert.throws(()=>refs.legacyKey('b000:1:1'));assert.throws(()=>refs.legacyKey('b067:1:1'));
});
test('Canonical model preserves 1189 days, 329 completed, annotations, devotional progress and IDs on reorder',async()=>{
  const model=models.create({books}),source=fixture(),record=await model.encode(source),saved=model.decode(record);
  assert.equal(record.state.position.bookId,'b019');assert.equal(record.plans[0].days[0].entry.readings[0].bookId,'b019');assert.ok(record.annotations.some(a=>a.reference==='rv1960@b043:3:16'));
  assert.equal(saved.plans[0].completed.length,329);assert.equal(new Set(saved.plans[0].dayIds).size,1189);assert.deepEqual(saved.notes,source.notes);assert.deepEqual(saved.devotionals,source.devotionals);assert.deepEqual(saved.appearance,source.appearance);
  const plan=saved.plans[0],id=plan.dayIds[0];saved.planNotes={[plan.id+':'+id]:'Mi nota sintética'};
  [plan.entries[0],plan.entries[330]]=[plan.entries[330],plan.entries[0]];[plan.dayIds[0],plan.dayIds[330]]=[plan.dayIds[330],plan.dayIds[0]];plan.completed=plan.completed.filter(i=>i!==0).concat(330);
  const updated=model.decode(await model.encode(saved,model.decode(record)));assert.equal(updated.plans[0].dayIds[330],id);assert.ok(updated.plans[0].completed.includes(330));assert.equal(updated.planNotes[plan.id+':'+id],'Mi nota sintética');
});
test('Model refuses invalid plans, duplicate IDs, unsupported vault and corrupted/future records',async()=>{
  const model=models.create({books});const bad=fixture();bad.plans[0].completed=[-1];await assert.rejects(model.encode(bad),{code:'VALIDATION'});
  const state=fixture();state.plans[0].dayIds=Array(1189).fill('day-'+ 'a'.repeat(32));await assert.rejects(model.encode(state),{code:'VALIDATION'});
  const encrypted={...fixture(),privateVault:{v:1}};await assert.rejects(model.encode(encrypted),{code:'UNAVAILABLE'});
  assert.throws(()=>model.decode({schema:4,state:{},plans:[],annotations:[]}),{code:'CORRUPT'});
  const dev=fixture();dev.devotionals[0].entries[0].chapter=999;await assert.rejects(model.encode(dev),{code:'VALIDATION'});
});
test('Public preview reader respects source numbering, escapes HTML and searches without accents',async()=>{
  const bible=structuredClone({books});bible.books[0].chapters[0]=['El corazón <script> de prueba','Otra lectura'];
  const api=reader.create({bible,manifest:{iaPermitida:true}});const chapter=await api.chapter({book:0,chapter:1});assert.match(chapter.verses[0].html,/&lt;script&gt;/);assert.equal(chapter.verses[0].reference,'b001:1:1');
  const found=await api.search({query:'corazon prue'});assert.equal(found.count,1);assert.equal(found.results[0].verse,1);
  assert.equal((await api.search({query:'corazon',mode:'word'})).count,1);assert.equal((await api.search({query:'cora',mode:'word'})).count,0);
  assert.equal((await api.catalog()).modules[0].iaPermitida,true);assert.equal((await api.catalog()).modules.length,1);
  await assert.rejects(api.chapter({module:'personal',book:0,chapter:1}),{code:'NOT_FOUND'});await assert.rejects(api.search({query:'G25',mode:'strong'}),{code:'UNAVAILABLE'});
});
