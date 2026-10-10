'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{DatabaseSync}=require('node:sqlite');
const helpers=require('./mobile-fixtures.cjs'),{PersonalStore}=require('../platform/android/personal-store.js'),services=require('../platform/android/services.js'),contract=require('../platform/bridge-contract.js'),{PersonalStore:WindowsStore}=require('../lib/personal-store.cjs');
const books=Array.from({length:66},(_,i)=>({name:'Libro sintético '+i,chapters:Array.from({length:30},()=>Array(25).fill('Texto sintético'))}));
const state=()=>({version:1,position:{book:18,chapter:23,verse:1},notes:{'18:23:1':'Nota sintética','rv1960@42:3:16':'Nota de otra versión'},highlights:{'18:23:1':'gold'},plans:[{id:'plan-123',days:1189,title:'Plan inventado',entries:Array.from({length:1189},(_,i)=>({title:'Día '+i,readings:[{book:18,chapter:23}]})),completed:Array.from({length:329},(_,i)=>i)}],devotionals:['a','b'].map(x=>({id:'dev-prueba-'+x,title:'Devocional inventado',entries:[{title:'Día 1',body:'Reflexión original',book:18,chapter:23}],completed:[],lastDay:0})),prayers:[],prayerDrafts:{},guideResponses:{},aiStudies:[],devResponses:{'dev-prueba-a:0':'Respuesta inventada'},planNotes:{},appearance:{design:'c'},font:20});
async function fixture(t){const root=await helpers.root(t),sqlite=helpers.sqlite(root),store=new PersonalStore({sqlite,books});helpers.dispose(root,()=>store.close());return {root,sqlite,store};}
test('Native SQLite persists 1189/329, canonical IDs, notes, day responses and reader position across reopening',async t=>{
  const {root,sqlite,store}=await fixture(t),legacy=JSON.stringify(state()),result=await store.bootstrap({legacy,initial:state()});
  assert.equal(result.migrated,true);assert.equal(await store.backup(result.backup),legacy);let saved=result.state;
  assert.equal(saved.plans[0].completed.length,329);assert.equal(new Set(saved.plans[0].dayIds).size,1189);assert.deepEqual(saved.notes,state().notes);
  const ids=saved.plans[0].dayIds;saved.planNotes['plan-123:'+ids[0]]='Nota de día';saved.devotionals[0].lastDay=0;saved.devotionals[0].status='finished';saved.devotionals[0].finishedAt='2026-10-10T09:00:00.000Z';saved.position={book:42,chapter:3,verse:16};saved=await store.write(saved);await store.close();
  assert.equal(sqlite.opened(),0);const reopened=new PersonalStore({sqlite,books});helpers.dispose(root,()=>reopened.close());const loaded=(await reopened.bootstrap({initial:state()})).state;
  assert.deepEqual(loaded,saved);assert.deepEqual(loaded.plans[0].dayIds,ids);assert.equal(loaded.planNotes['plan-123:'+ids[0]],'Nota de día');
  const db=new DatabaseSync(path.join(root,'biblioteca-personalSQLite.db'),{readOnly:true});assert.equal(JSON.parse(db.prepare("SELECT value FROM meta WHERE key='state'").get().value).position.bookId,'b043');assert.ok(db.prepare("SELECT reference FROM annotations WHERE reference='rv1960@b043:3:16'").get());db.close();assert.ok(sqlite.batches()<40,'Lotes pequeños, no un viaje nativo por día');
});
test('Failed migration/write rolls back all tables while keeping the exact legacy backup for retry',async t=>{
  const {store}=await fixture(t),legacy=JSON.stringify(state());await assert.rejects(store.bootstrap({legacy,initial:state()},{fail:true}),{code:'STORAGE'});assert.equal(await store.load(),null);
  const backups=await store.listBackups();assert.equal(backups.length,1);assert.equal(await store.backup(backups[0].id),legacy);
  const saved=(await store.bootstrap({legacy,initial:state()})).state,next=structuredClone(saved);next.notes['18:23:1']='No conservar';next.plans[0].completed=[];
  await assert.rejects(store.write(next,{fail:true}),{code:'STORAGE'});assert.deepEqual(await store.load(),saved);
});
test('Restore retains prior state durably, failed restore preserves the active library and encrypted input is refused',async t=>{
  const {store}=await fixture(t),saved=(await store.bootstrap({initial:state()})).state,next=structuredClone(saved);next.notes['18:23:1']='Restaurada';
  await assert.rejects(store.restoreBackup({state:next},{fail:true}),{code:'STORAGE'});assert.deepEqual(await store.load(),saved);
  const prior=(await store.listBackups()).find(b=>b.kind==='snapshot');assert.deepEqual(await store.backup(prior.id),saved);
  assert.equal((await store.restoreBackup({state:next})).notes['18:23:1'],'Restaurada');const after=await store.load();await assert.rejects(store.restoreBackup({state:saved,privateVault:{v:1}}),{code:'UNAVAILABLE'});assert.deepEqual(await store.load(),after);
});
test('A stale independent session cannot overwrite newer progress or annotations',async t=>{
  const {root,store}=await fixture(t),saved=(await store.bootstrap({initial:state()})).state,second=new PersonalStore({sqlite:helpers.sqlite(root),books});helpers.dispose(root,()=>second.close());const old=await second.load();
  saved.notes['18:23:1']='Guardado nuevo';await store.write(saved);old.notes['18:23:1']='Viejo';await assert.rejects(second.write(old),{code:'CONFLICT'});assert.equal((await store.load()).notes['18:23:1'],'Guardado nuevo');
});
test('A full backup device prevents restore before changing any active data and returns QUOTA',async t=>{
  const {store,sqlite}=await fixture(t),saved=(await store.bootstrap({initial:state()})).state,run=sqlite.run;
  sqlite.run=async options=>{if(options.database==='biblioteca-respaldos')throw Object.assign(Error('database or disk is full'),{code:'SQLITE_FULL'});return run(options);};
  const next=structuredClone(saved);next.notes['18:23:1']='No debe guardarse';await assert.rejects(store.restoreBackup({state:next}),{code:'QUOTA'});assert.deepEqual(await store.load(),saved);
});
test('Original Windows schema loads without regenerating IDs and native data can be read by Windows',async t=>{
  const {root,sqlite,store}=await fixture(t),source=path.join(root,'windows-fixture'),windows=new WindowsStore(source),original=windows.write(state());windows.db.exec('PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE;');windows.close();
  await fs.copyFile(path.join(source,'biblioteca-personal.sqlite'),path.join(root,'biblioteca-personalSQLite.db'));
  const loaded=(await store.bootstrap({initial:state()})).state;assert.deepEqual(loaded.plans[0].dayIds,original.plans[0].dayIds);assert.equal(loaded.plans[0].completed.length,329);
  loaded.notes['18:23:1']='Guardado desde Android';await store.write(loaded);await store.close();assert.equal(sqlite.opened(),0);
  const target=path.join(root,'windows-roundtrip');await fs.mkdir(target);await fs.copyFile(path.join(root,'biblioteca-personalSQLite.db'),path.join(target,'biblioteca-personal.sqlite'));const back=new WindowsStore(target);try{assert.deepEqual(back.load(),loaded);}finally{back.close();}
});
test('Future/corrupt schemas and a vault never become a new empty library',async t=>{
  const root=await helpers.root(t),file=path.join(root,'biblioteca-personalSQLite.db');
  for(const kind of ['future','vault','ordinal']){
    const windows=new WindowsStore(root);windows.write(state());windows.db.exec('PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE;');windows.close();await fs.copyFile(path.join(root,'biblioteca-personal.sqlite'),file);
    const db=new DatabaseSync(file);if(kind==='future')db.exec("UPDATE meta SET value='4' WHERE key='schema'");else if(kind==='vault')db.exec("INSERT INTO meta VALUES('private-vault','{}')");else db.exec('UPDATE plan_days SET ordinal=4000 WHERE ordinal=0');db.close();
    const before=await fs.readFile(file),sqlite=helpers.sqlite(root),store=new PersonalStore({sqlite,books});helpers.dispose(root,()=>store.close());await assert.rejects(store.open(),{code:kind==='vault'?'LOCKED':'CORRUPT'});assert.equal(sqlite.opened(),0);assert.equal(sqlite.registered(),0);assert.deepEqual(await fs.readFile(file),before);
  }
});
test('Async attach registers the public reader immediately, queues early bootstrap and announces SQLite only after opening',async t=>{
  const root=await helpers.root(t),sqlite=helpers.sqlite(root),open=sqlite.open;let release;const gate=new Promise(resolve=>{release=resolve;});sqlite.open=async options=>{await gate;return open(options);};
  const registry=services.create(),adapter=contract.createBridge({platform:'android'}),ready=registry.attach(adapter,{sqlite,bible:{books},manifest:{iaPermitida:true}});helpers.dispose(root,()=>registry.close());
  assert.equal(registry.status().state,'preparing');assert.equal((await adapter.bridge.getCapabilities()).storage,'none');assert.equal((await adapter.bridge.chapter({book:0,chapter:1})).verses.length,25);
  const boot=adapter.bridge.bootstrap({initial:state()});let settled=false;boot.then(()=>{settled=true;});await new Promise(resolve=>setImmediate(resolve));assert.equal(settled,false);
  assert.equal(registry.attach(adapter),ready);release();const caps=await ready;assert.equal(caps.storage,'sqlite');assert.equal(registry.storage(),'sqlite');assert.equal(registry.status().state,'ready');assert.equal(caps.nativeVerified,false);assert.equal((await boot).state.plans[0].completed.length,329);
  assert.equal((await adapter.bridge.privacyStatus()).enabled,false);assert.equal(caps.operations.setPin.available,false);assert.equal(caps.operations.transferInstall.available,false);
});
test('Failed async SQLite startup gives safe errors and leaves native storage absent without using IndexedDB',async()=>{
  const registry=services.create(),adapter=contract.createBridge({platform:'android'}),ready=registry.attach(adapter,{sqlite:{},bible:{books}});
  await assert.rejects(ready,{code:'UNAVAILABLE'});assert.equal(registry.status().state,'failed');assert.equal((await adapter.bridge.getCapabilities()).storage,'none');await assert.rejects(adapter.bridge.bootstrap({initial:state()}),{code:'UNAVAILABLE'});await registry.close();
  assert.throws(()=>adapter.setStorage('indexeddb'),{code:'VALIDATION'});assert.ok(!('setStorage' in adapter.bridge));
});
