'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{DatabaseSync}=require('node:sqlite');
const helpers=require('./mobile-fixtures.cjs'),{privacyFactory}=require('./vault-worker-fixture.cjs'),{PersonalStore}=require('../platform/android/personal-store.js'),{PersonalStore:WindowsStore}=require('../lib/personal-store.cjs'),windowsCrypto=require('../lib/private-vault.cjs'),core=require('../shared/private-vault.js');
const books=Array.from({length:66},(_,i)=>({name:'Libro original '+i,chapters:Array.from({length:30},()=>Array(25).fill('Texto inventado'))}));
const sentinel='SECRETO_INVENTADO_UNICO_47';
const state=()=>({version:1,position:{book:18,chapter:23,verse:1},notes:{'18:23:1':sentinel},highlights:{'18:23:1':'gold'},plans:[{id:'plan-123',title:'Plan inventado',days:2,entries:[{readings:[{book:18,chapter:23}]},{readings:[{book:42,chapter:3}]}],completed:[0]}],devotionals:[{id:'dev-inventado',title:'Devocional original',entries:[{body:'Texto inventado',book:18,chapter:23}],completed:[]}],prayers:[],prayerDrafts:{},guideResponses:{},aiStudies:[],devResponses:{'dev-inventado:0':sentinel},planNotes:{}});
async function fixture(t,{now,onPrivacyClosed}={}){const root=await helpers.root(t),sqlite=helpers.sqlite(root),store=new PersonalStore({sqlite,books,privacyFactory,now,onPrivacyClosed});helpers.dispose(root,()=>store.close());assert.equal(await store.preparePrivacy(),true);await store.bootstrap({initial:state()});return {root,sqlite,store};}
test('Local Worker cipher opens Windows scrypt/AES-GCM and Windows decrypts its output with identical AAD',async()=>{
  const client=privacyFactory({});try{
    await client.initialize();const pin='123456',salt='11'.repeat(16),key=windowsCrypto.derive(pin,salt),part=core.privatePart(state()),source=windowsCrypto.encrypt(part,key,salt);
    const opened=await client.call('unlock',{pin,vault:source});assert.deepEqual(opened.part,part);assert.ok(!Object.hasOwn(opened,'key'));
    const native=await client.call('encrypt',{session:opened.session,part});assert.deepEqual(windowsCrypto.decrypt(native,key),part);assert.notEqual(native.iv,source.iv);
    const created=await client.call('create',{pin:'654321',part});assert.deepEqual(windowsCrypto.decrypt(created.vault,windowsCrypto.derive('654321',created.vault.salt)),part);await client.call('discard',created.session);
    await client.call('lock');await assert.rejects(client.call('decrypt',{session:opened.session,vault:source}),{code:'LOCKED'});key.fill(0);
  }finally{client.close();}
});
test('PIN activation removes plaintext SQLite, preserves IDs/highlights and encrypted exports even while unlocked',async t=>{
  const {root,store}=await fixture(t),saved=await store.load(),protectedState=await store.setPin('123456');assert.equal(protectedState.privacyEnabled,true);assert.equal(protectedState.privateLocked,false);assert.deepEqual(protectedState.notes,saved.notes);assert.deepEqual(protectedState.plans[0].dayIds,saved.plans[0].dayIds);
  const data=await fs.readFile(path.join(root,'biblioteca-personalSQLite.db'));assert.ok(!data.includes(Buffer.from(sentinel)));
  const backup=await store.exportBackup();assert.deepEqual(backup.notes,{});assert.equal(backup.privateLocked,true);assert.ok(backup.privateVault);assert.ok(!JSON.stringify(backup).includes(sentinel));
  const locked=await store.lockPrivate();assert.equal(locked.privateLocked,true);assert.deepEqual(locked.notes,{});assert.deepEqual(locked.highlights,saved.highlights);
  locked.plans[0].completed=[0,1];await store.write(locked);const copied=await store.exportBackup();assert.deepEqual(copied.privateVault,backup.privateVault);assert.equal((await store.unlock('123456')).notes['18:23:1'],sentinel);
});
test('Protected database persists locked across restart and is readable/unlockable by Windows without changing IDs',async t=>{
  const {root,sqlite,store}=await fixture(t);await store.setPin('123456');const original=await store.load();await store.close();
  const reopened=new PersonalStore({sqlite,books,privacyFactory});helpers.dispose(root,()=>reopened.close());await reopened.preparePrivacy();const fresh=(await reopened.bootstrap({initial:state()})).state;assert.equal(fresh.privateLocked,true);assert.deepEqual(fresh.notes,{});const unlocked=await reopened.unlock('123456');assert.deepEqual(unlocked.notes,original.notes);
  unlocked.notes['18:23:1']='NOTA_NATIVA_INVENTADA';await reopened.write(unlocked);await reopened.close();const destination=path.join(root,'windows-roundtrip');await fs.mkdir(destination);await fs.copyFile(path.join(root,'biblioteca-personalSQLite.db'),path.join(destination,'biblioteca-personal.sqlite'));
  const windows=new WindowsStore(destination);try{assert.equal(windows.load().privateLocked,true);assert.equal(windows.unlock('123456').notes['18:23:1'],'NOTA_NATIVA_INVENTADA');assert.deepEqual(windows.load().plans[0].dayIds,original.plans[0].dayIds);}finally{windows.close();}
});
test('Wrong PIN attempts persist, throttle after five, survive reopen and reset only after successful authentication',async t=>{
  let now=1700000000000;const {root,sqlite,store}=await fixture(t,{now:()=>now});await store.setPin('123456');await store.lockPrivate();const before=(await store.exportBackup()).privateVault;
  for(let i=0;i<5;i++)await assert.rejects(store.unlock('000000'),e=>e.code==='LOCKED'&&!e.message.includes('000000'));
  assert.equal((await store.privacyStatus()).retryAt,now+30000);await assert.rejects(store.unlock('123456'),{code:'LOCKED'});assert.deepEqual((await store.exportBackup()).privateVault,before);await store.close();
  const reopened=new PersonalStore({sqlite,books,privacyFactory,now:()=>now});helpers.dispose(root,()=>reopened.close());await reopened.preparePrivacy();await reopened.bootstrap({initial:state()});assert.equal((await reopened.privacyStatus()).retryAt,now+30000);now+=30001;await reopened.unlock('123456');assert.equal((await reopened.privacyStatus()).retryAt,0);
});
test('Locked private edits are refused, PIN change invalidates old PIN, disabling requires unlock and returns plaintext intentionally',async t=>{
  const {store}=await fixture(t);await store.setPin('123456');const locked=await store.lockPrivate();locked.notes['18:23:1']='No debe guardarse';await assert.rejects(store.write(locked),{code:'LOCKED'});await assert.rejects(store.setPin('222222'),{code:'LOCKED'});await assert.rejects(store.disablePin(),{code:'LOCKED'});
  await store.unlock('123456');await store.setPin('654321');await store.lockPrivate();await assert.rejects(store.unlock('123456'),{code:'LOCKED'});await store.unlock('654321');const open=await store.disablePin();assert.equal(open.privacyEnabled,false);assert.equal(open.notes['18:23:1'],sentinel);assert.ok(!(await store.exportBackup()).privateVault);
});
test('Failed PIN creation/change/disable preserves original data and previous key, never writes a half-ciphered state',async t=>{
  const {store}=await fixture(t);const plain=await store.load();await assert.rejects(store.setPin('123456',{fail:true}),{code:'STORAGE'});assert.deepEqual(await store.load(),plain);
  await store.setPin('123456');const protectedState=await store.load(),vault=(await store.exportBackup()).privateVault;await assert.rejects(store.setPin('654321',{fail:true}),{code:'STORAGE'});assert.deepEqual(await store.load(),protectedState);assert.deepEqual((await store.exportBackup()).privateVault,vault);
  await assert.rejects(store.disablePin({fail:true}),{code:'STORAGE'});assert.deepEqual(await store.load(),protectedState);await store.lockPrivate();await store.unlock('123456');
});
test('Encrypted backup restores locked with original PIN and retains previous encrypted snapshot; bad PIN/transaction restore leaves old data',async t=>{
  const {store}=await fixture(t);await store.setPin('123456');const backup=await store.exportBackup(),old=await store.load();old.notes['18:23:1']='OTRA_NOTA_INVENTADA';await store.write(old);
  const before=await store.exportBackup();await assert.rejects(store.restoreBackup({state:backup,privateVault:backup.privateVault,pin:'654321'}),{code:'LOCKED'});assert.deepEqual(await store.exportBackup(),before);
  await assert.rejects(store.restoreBackup({state:backup,privateVault:backup.privateVault,pin:'123456'},{fail:true}),{code:'STORAGE'});assert.deepEqual(await store.exportBackup(),before);
  const restored=await store.restoreBackup({state:backup,privateVault:backup.privateVault,pin:'123456'});assert.equal(restored.privateLocked,true);const retained=await store.listBackups();assert.ok(retained.length);const prior=await store.backup(retained.at(-1).id);assert.ok(prior.privateVault);assert.ok(!JSON.stringify(prior).includes('OTRA_NOTA_INVENTADA'));assert.equal((await store.unlock('123456')).notes['18:23:1'],sentinel);
});
test('Worker failure closes session without leaking keys; encrypted input remains readable locked when crypto is unavailable',async t=>{
  let closures=0;const {root,store}=await fixture(t,{onPrivacyClosed:()=>closures++});await store.setPin('123456');store.privacy.close();assert.equal(closures,1);assert.equal((await store.privacyStatus()).locked,true);await assert.rejects(store.write(state()),{code:'LOCKED'});await assert.rejects(store.unlock('123456'),{code:'UNAVAILABLE'});await store.close();
  const unavailable=new PersonalStore({sqlite:helpers.sqlite(root),books});helpers.dispose(root,()=>unavailable.close());assert.equal(await unavailable.preparePrivacy(),false);assert.equal((await unavailable.bootstrap({initial:state()})).state.privateLocked,true);assert.deepEqual((await unavailable.exportBackup()).notes,{});await assert.rejects(unavailable.unlock('123456'),{code:'UNAVAILABLE'});
});
test('Queued old plaintext writes cannot bypass a newly activated PIN or an explicit lock',async t=>{
  const {store}=await fixture(t),plain=await store.load();const protect=store.setPin('123456'),stale=assert.rejects(store.write(plain),{code:'CONFLICT'});await protect;await stale;const opened=await store.load();const lock=store.lockPrivate(),another=assert.rejects(store.write(opened),{code:'CONFLICT'});await lock;await another;
});
test('All seven private fields are encrypted, including prayers/testimonies, guide responses and AI conversations',async t=>{
  const {root,store}=await fixture(t),saved=await store.load();saved.notes['42:3:16']=sentinel;saved.planNotes['plan-123:'+saved.plans[0].dayIds[0]]=sentinel;
  saved.prayers=[{id:'pray-inventado',title:sentinel,body:sentinel,status:'answered',created:'2026-10-10',answer:{text:sentinel,date:'2026-10-10',reference:{book:18,chapter:23,verse:1}}}];saved.prayerDrafts={'acas:0':sentinel};saved.guideResponses={'dev-inventado:0:oia:0:0':sentinel};saved.aiStudies=[{id:'rv1909:verse:18:23:1',anchor:{scope:'verse',book:18,chapter:23,verse:1,module:'rv1909'},title:sentinel,messages:[{id:'msg-original',role:'user',text:sentinel}]}];
  const expected=core.privatePart(await store.write(saved));await store.setPin('123456');assert.ok(!(await fs.readFile(path.join(root,'biblioteca-personalSQLite.db'))).includes(Buffer.from(sentinel)));const record=await store.readRecord();assert.ok(!record.annotations.some(a=>a.reference==='b043:3:16'));
  const exported=await store.exportBackup();assert.ok(!JSON.stringify(exported).includes(sentinel));await store.lockPrivate();assert.deepEqual(core.privatePart(await store.load()),core.empty());assert.deepEqual(core.privatePart(await store.unlock('123456')),expected);
});
test('Post-commit compaction failure preserves the new PIN and blocks stale saves until a locked restart',async t=>{
  const {root,sqlite,store}=await fixture(t),execute=sqlite.execute;sqlite.execute=async o=>{if(o.statements==='VACUUM;')throw Error('Synthetic compaction failure');return execute(o);};
  await assert.rejects(store.setPin('123456'),{code:'STORAGE'});assert.equal((await store.privacyStatus()).locked,true);await assert.rejects(store.write(state()),{code:'CONFLICT'});assert.ok((await store.exportBackup()).privateVault);await store.close();sqlite.execute=execute;
  const reopened=new PersonalStore({sqlite,books,privacyFactory});helpers.dispose(root,()=>reopened.close());await reopened.preparePrivacy();assert.equal((await reopened.bootstrap({initial:state()})).state.privateLocked,true);assert.equal((await reopened.unlock('123456')).notes['18:23:1'],sentinel);
});
test('Mixed plaintext/ciphertext and malformed envelopes refuse startup without rewriting the original bytes',async t=>{
  const {root,store}=await fixture(t);await store.setPin('123456');await store.close();const file=path.join(root,'biblioteca-personalSQLite.db'),db=new DatabaseSync(file);db.exec("UPDATE annotations SET note='forbidden plaintext'");db.close();const before=await fs.readFile(file),bad=new PersonalStore({sqlite:helpers.sqlite(root),books,privacyFactory});helpers.dispose(root,()=>bad.close());await bad.preparePrivacy();await assert.rejects(bad.open(),{code:'CORRUPT'});assert.deepEqual(await fs.readFile(file),before);
});
