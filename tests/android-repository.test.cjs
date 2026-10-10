'use strict';
// Separate synthetic DATA/files and databases directories, matching Android's layout.
// No AppData, OneDrive or personal package is read by these tests.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),vm=require('node:vm'),{DatabaseSync}=require('node:sqlite');
const helpers=require('./mobile-fixtures.cjs'),services=require('../platform/android/services.js'),contract=require('../platform/bridge-contract.js'),{PersonalStore:WindowsStore}=require('../lib/personal-store.cjs'),{PersonalStore}=require('../platform/android/personal-store.js'),repositories=require('../platform/android/repository.js'),native=require('../platform/android/library.js');
const sandbox={window:{}};vm.runInNewContext(require('node:fs').readFileSync(path.join(__dirname,'../app/bible-data.js'),'utf8'),sandbox);const bible=JSON.parse(JSON.stringify(sandbox.window.BIBLE));
const resources={manifest:async()=>({modulos:[]}),file:async()=>{throw Error('No external resources in fixture');}};
const state=(label='original')=>({version:1,position:{book:18,chapter:23,verse:1},notes:{'18:23:1':label},highlights:{},plans:[{id:'plan-123',title:'Plan inventado',days:1189,entries:Array.from({length:1189},(_,i)=>({title:'Día '+i,readings:[{book:18,chapter:23}]})),completed:Array.from({length:329},(_,i)=>i)}],devotionals:['a','b'].map(x=>({id:'dev-sintetico-'+x,title:'Devocional original '+x,entries:[{title:'Día 1',body:'Texto inventado',book:18,chapter:23}],completed:[]})),prayers:[],prayerDrafts:{},guideResponses:{},aiStudies:[],devResponses:{},planNotes:{}});
async function fixture(t,{readerFactory}={}){
  const root=await helpers.root(t),data=path.join(root,'files'),databases=path.join(root,'databases');await fs.mkdir(data);await fs.mkdir(databases);
  const sqlite=helpers.sqlite(databases),filesystem=helpers.filesystem(data,{absoluteRoot:root}),registry=services.create({readerFactory}),adapter=contract.createBridge({platform:'android'});
  helpers.dispose(root,()=>registry.close());
  const attach=()=>registry.attach(adapter,{sqlite,filesystem,bible,manifest:{iaPermitida:true},resources});
  return {root,data,databases,sqlite,filesystem,registry,adapter,bridge:adapter.bridge,attach};
}
async function incoming(f,{invalidModule=false,pin=false}={}){
  const directory=path.join(f.data,'traspaso-entrante');await fs.mkdir(directory,{recursive:true});
  const source=path.join(f.root,'windows-synthetic'),windows=new WindowsStore(source),saved=windows.write(state('importada'));
  if(pin)windows.setPin('123456');windows.db.exec('PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE;');windows.close();
  await fs.copyFile(path.join(source,'biblioteca-personal.sqlite'),path.join(directory,'biblioteca-personal.sqlite'));
  const pack={paquete:'personal',version:'5',modoPersonal:true,modulos:[]};
  for(const [id,tipo,sql]of [['texto-inventado','biblia',"CREATE TABLE Bible(Book INT,Chapter INT,Verse INT,Scripture TEXT); INSERT INTO Bible VALUES(19,23,1,'El corazón recibió paz inventada.');"],['comentario-inventado','comentario',invalidModule?"CREATE TABLE Otro(texto TEXT);":"CREATE TABLE Verses(Book INT,ChapterBegin INT,ChapterEnd INT,VerseBegin INT,VerseEnd INT,Comments TEXT); INSERT INTO Verses VALUES(19,23,23,1,2,'Comentario nuevo original');"]]){
    const archivo=id+'.'+(tipo==='biblia'?'bblx':'cmtx'),db=new DatabaseSync(path.join(directory,archivo));db.exec(sql);db.close();const bytes=await fs.readFile(path.join(directory,archivo));
    pack.modulos.push({id,tipo,rol:tipo==='biblia'?'version':'comentario',archivo,titulo:id,bytes:bytes.length,sha256:helpers.digest(bytes),licencia:'CC0 · fixture inventado'});
  }
  await fs.writeFile(path.join(directory,'manifest.json'),JSON.stringify(pack));
  const meta={formato:'biblioteca-biblica-traspaso',version:1,creado:new Date().toISOString(),origen:'Windows',paquete:{version:'5',modoPersonal:true,modulos:2},conteos:{diasPlan:1189,diasCompletados:329,devocionales:2,oraciones:0},archivos:[]};
  for(const archivo of ['biblioteca-personal.sqlite','manifest.json',...pack.modulos.map(m=>m.archivo)]){const bytes=await fs.readFile(path.join(directory,archivo)),m=pack.modulos.find(m=>m.archivo===archivo);meta.archivos.push({archivo,tipo:m?'modulo':archivo==='manifest.json'?'manifiesto':'datos',...(m?{id:m.id}:{}),bytes:bytes.length,sha256:helpers.digest(bytes)});}
  await fs.writeFile(path.join(directory,'traspaso.json'),JSON.stringify(meta));
  return {saved,input:{carpeta:'traspaso-entrante',archivos:await Promise.all((await fs.readdir(directory)).map(async nombre=>({nombre,ruta:'traspaso-entrante/'+nombre,bytes:(await fs.stat(path.join(directory,nombre))).size})))}};
}
const active=f=>path.join(f.databases,'biblioteca-personalSQLite.db');
test('Native startup exposes real five-hook repository, public RV1909, SQLite only after recovery, no DATA shadow DB',async t=>{
  const f=await fixture(t);await f.attach();const repo=f.registry.repository();for(const k of ['revision','exclusive','quiesce','activate','resume'])assert.equal(typeof repo[k],'function');
  const boot=await f.bridge.bootstrap({initial:state()}),caps=await f.bridge.getCapabilities();assert.equal(caps.storage,'sqlite');assert.equal(caps.operations.transferInstall.available,true);assert.equal(caps.nativeVerified,false);
  assert.match((await f.bridge.chapter({book:18,chapter:23})).verses[0].text,/Jehov/i);assert.equal(await fs.stat(active(f)).then(s=>s.isFile()),true);await assert.rejects(fs.stat(path.join(f.data,'biblioteca-personal.sqlite')),{code:'ENOENT'});
  assert.equal(boot.state.plans[0].completed.length,329);await assert.rejects(repo.quiesce(),{code:'CONFLICT'});
});
test('Real SQLite import replaces conformed DB, keeps durable backup, rebinds modules and rejects queued old autosave',async t=>{
  const f=await fixture(t);await f.attach();const old=(await f.bridge.bootstrap({initial:state()})).state;await f.registry.loadReader();
  const x=await incoming(f),review=await f.bridge.transferScan(x.input);
  // Queue savePersonal while the install is already inside the exclusive lease.
  let entered,release;const enteredPromise=new Promise(r=>{entered=r;}),gate=new Promise(r=>{release=r;});
  const originalRun=f.sqlite.close;let gateOnce=true;f.sqlite.close=async options=>{if(options.database==='biblioteca-personal'&&gateOnce){gateOnce=false;entered();await gate;}return originalRun(options);};
  const installing=f.bridge.transferInstall({token:review.token,confirmado:true});await enteredPromise;
  const stale=f.bridge.savePersonal(old);const rejected=assert.rejects(stale,{code:'CONFLICT'});release();const result=await installing;await rejected;
  assert.equal(result.instalado,true);const backup=new DatabaseSync(path.join(f.data,result.respaldo,'biblioteca-personal.sqlite'),{readOnly:true});assert.equal(backup.prepare('SELECT note FROM annotations').get().note,'original');backup.close();
  await assert.rejects(f.bridge.savePersonal(old),{code:'CONFLICT'});await assert.rejects(f.bridge.restoreBackup({state:old}),{code:'CONFLICT'});
  const loaded=(await f.bridge.bootstrap({initial:old})).state;assert.equal(loaded.notes['18:23:1'],'importada');assert.deepEqual(loaded.plans[0].dayIds,x.saved.plans[0].dayIds);assert.equal(loaded.plans[0].completed.length,329);assert.equal(loaded.devotionals.length,2);
  assert.ok((await f.bridge.catalog()).modules.some(m=>m.id==='comentario-inventado'));assert.equal((await f.bridge.comments({module:'comentario-inventado',book:18,chapter:23,verse:1})).entries[0].text,'Comentario nuevo original');
  assert.equal((await f.bridge.search({module:'texto-inventado',query:'corazon'})).count,1);loaded.notes['18:23:1']='nuevo móvil';await f.bridge.savePersonal(loaded);
  await f.registry.close();assert.equal(f.sqlite.opened(),0);assert.equal(f.sqlite.registered(),0);const reopened=new PersonalStore({sqlite:f.sqlite,books:bible.books});helpers.dispose(f.root,()=>reopened.close());assert.equal((await reopened.load()).notes['18:23:1'],'nuevo móvil');
});
test('Revision changes between review and install leave original DB/catalog intact',async t=>{
  const f=await fixture(t);await f.attach();const saved=(await f.bridge.bootstrap({initial:state()})).state,x=await incoming(f),r=await f.bridge.transferScan(x.input);saved.notes['18:23:1']='guardada después del resumen';await f.bridge.savePersonal(saved);
  await assert.rejects(f.bridge.transferInstall({token:r.token,confirmado:true}),{code:'CONFLICT'});assert.equal((await f.bridge.exportBackup()).notes['18:23:1'],saved.notes['18:23:1']);
});
for(const kind of ['invalid-module','PIN'])test('Failed activation '+kind+' restores conformed database and original catalog, never an empty success',async t=>{
  const f=await fixture(t);await f.attach();await f.bridge.bootstrap({initial:state()});await f.registry.loadReader();const x=await incoming(f,{invalidModule:kind==='invalid-module',pin:kind==='PIN'}),r=await f.bridge.transferScan(x.input);
  await assert.rejects(f.bridge.transferInstall({token:r.token,confirmado:true}),{code:kind==='PIN'?'UNAVAILABLE':'CORRUPT'});assert.equal((await f.bridge.exportBackup()).notes['18:23:1'],'original');assert.ok(!(await f.bridge.catalog()).modules.some(m=>m.id==='texto-inventado'));
  const fresh=(await f.bridge.bootstrap({initial:state()})).state;await f.bridge.savePersonal(fresh);await assert.rejects(fs.stat(path.join(f.data,'traspaso-journal.json')),{code:'ENOENT'});
});
for(const committed of [false,true])test('Startup recovery '+(committed?'retains committed import':'restores interrupted import')+' before SQLite open',async t=>{
  const f=await fixture(t),source=path.join(f.root,'synthetic-source'),windows=new WindowsStore(source);windows.write(state('anterior recuperada'));windows.db.exec('PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE;');windows.close();
  const key='c'.repeat(32),directory=path.join(f.data,'respaldos/traspaso-'+key);await fs.mkdir(directory,{recursive:true});await fs.copyFile(path.join(source,'biblioteca-personal.sqlite'),path.join(directory,'biblioteca-personal.sqlite'));
  if(committed)await fs.copyFile(path.join(source,'biblioteca-personal.sqlite'),active(f));else await fs.writeFile(active(f),'SIMULATED INTERRUPTED REPLACEMENT');
  await fs.writeFile(path.join(f.data,'traspaso-journal.json'),JSON.stringify({v:1,id:key,oldDatabase:true,oldModules:false}));if(committed)await fs.writeFile(path.join(f.data,'traspaso-commit-'+key),'committed');
  let opens=0;const open=f.sqlite.open;f.sqlite.open=async o=>{opens++;const db=new DatabaseSync(active(f),{readOnly:true});db.close();return open(o);};
  await f.attach();assert.equal(opens,1);assert.equal((await f.bridge.bootstrap({initial:state()})).state.notes['18:23:1'],'anterior recuperada');await assert.rejects(fs.stat(path.join(f.data,'traspaso-journal.json')),{code:'ENOENT'});
});
test('Recovery I/O failure leaves journal and refuses opening/advertising personal storage',async t=>{
  const f=await fixture(t),key='d'.repeat(32),directory=path.join(f.data,'respaldos/traspaso-'+key);await fs.mkdir(directory,{recursive:true});await fs.writeFile(path.join(directory,'biblioteca-personal.sqlite'),'synthetic old');await fs.writeFile(active(f),'synthetic new');await fs.writeFile(path.join(f.data,'traspaso-journal.json'),JSON.stringify({v:1,id:key,oldDatabase:true,oldModules:false}));
  const rename=f.filesystem.rename;f.filesystem.rename=async o=>{if(o.to.startsWith('file:'))throw Object.assign(Error('Synthetic denied recovery'),{code:'EACCES'});return rename(o);};
  let opens=0;f.sqlite.open=async()=>{opens++;throw Error('Should not open');};await assert.rejects(f.attach(),{code:'STORAGE'});assert.equal(opens,0);assert.equal(f.registry.storage(),'none');assert.equal((await f.bridge.getCapabilities()).storage,'none');assert.equal((await fs.stat(path.join(f.data,'traspaso-journal.json'))).isFile(),true);
});
test('Repository refuses unexpected plugin database URI and leaves connections closed',async t=>{
  const f=await fixture(t),store=new PersonalStore({sqlite:f.sqlite,books:bible.books});f.sqlite.getUrl=async()=>({url:'https://example.invalid/private.sqlite'});await assert.rejects(repositories.create({store,filesystem:f.filesystem}),{code:'STORAGE'});assert.equal(f.sqlite.opened(),0);assert.equal(f.sqlite.registered(),0);await store.close();
});
test('Failed rollback keeps native repository closed and storage absent until next-start recovery',async t=>{
  const f=await fixture(t);await f.attach();await f.bridge.bootstrap({initial:state()});await f.registry.loadReader();const x=await incoming(f,{invalidModule:true}),r=await f.bridge.transferScan(x.input),rename=f.filesystem.rename;
  f.filesystem.rename=async o=>{if(o.to.startsWith('file:')&&o.from.includes('/respaldos/'))throw Object.assign(Error('Synthetic denied rollback'),{code:'EACCES'});return rename(o);};
  await assert.rejects(f.bridge.transferInstall({token:r.token,confirmado:true}),{code:'LOCKED'});assert.equal(f.registry.storage(),'none');assert.equal(f.sqlite.opened(),0);await assert.rejects(f.bridge.savePersonal(state()),{code:'LOCKED'});await assert.rejects(f.bridge.bootstrap({initial:state()}),{code:'LOCKED'});
  await f.registry.close();f.filesystem.rename=rename;
  const restarted=services.create(),adapter=contract.createBridge({platform:'android'});helpers.dispose(f.root,()=>restarted.close());await restarted.attach(adapter,{sqlite:f.sqlite,filesystem:f.filesystem,bible,resources});
  assert.equal((await adapter.bridge.bootstrap({initial:state()})).state.notes['18:23:1'],'original');await assert.rejects(fs.stat(path.join(f.data,'traspaso-journal.json')),{code:'ENOENT'});
});
test('Serialized background module load cannot replace the newly imported catalog afterwards',async t=>{
  let gateRelease,entered;const gate=new Promise(r=>{gateRelease=r;}),began=new Promise(r=>{entered=r;});let first=true;
  const factory={create:async options=>{if(first){first=false;entered();await gate;}return native.create(options);}};
  const f=await fixture(t,{readerFactory:factory});await f.attach();await f.bridge.bootstrap({initial:state()});const x=await incoming(f),r=await f.bridge.transferScan(x.input),loading=f.registry.loadReader();await began;
  const installing=f.bridge.transferInstall({token:r.token,confirmado:true});gateRelease();await loading;await installing;assert.ok((await f.bridge.catalog()).modules.some(m=>m.id==='texto-inventado'));
});
