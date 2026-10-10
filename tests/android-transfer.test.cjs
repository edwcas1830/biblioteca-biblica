'use strict';
// All fixtures are generated locally. Never read AppData, OneDrive or a real transfer.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),fsp=fs.promises,path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {DatabaseSync,backup}=require('node:sqlite');
const {PersonalStore}=require('../lib/personal-store.cjs');
const transfer=require('../shared/transfer.js'),native=require('../platform/android/transfer.js'),hash=require('../shared/sha256-stream.js'),contract=require('../platform/bridge-contract.js');
const books=Array.from({length:66},(_,i)=>({name:'Libro sintético '+i,chapters:Array.from({length:30},()=>Array(25).fill('Texto sintético'))}));
const state=()=>({version:1,position:{book:18,chapter:23,verse:1},notes:{'18:23:1':'Nota SOLO sintética'},highlights:{'18:23:1':'gold'},plans:[{id:'plan-123',days:1189,scope:'custom',title:'Plan sintético',entries:Array.from({length:1189},(_,i)=>({title:'Día '+i,readings:[{book:18,chapter:23}]})),completed:Array.from({length:329},(_,i)=>i)}],devotionals:['a','b'].map(i=>({id:'dev-prueba-'+i,title:'Devocional sintético '+i,entries:[{title:'Día 1',body:'Contenido inventado',book:18,chapter:23}],completed:[],lastDay:0})),prayers:[],devResponses:{'dev-prueba-a:0':'Respuesta sintética'},planNotes:{},prayerDrafts:{},guideResponses:{},aiStudies:[],appearance:{design:'c'},font:20});
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function fixture(t,{pin=false}={}){
  const root=await fsp.mkdtemp(path.join(os.tmpdir(),'biblioteca-transfer-test-'));
  t.after(async()=>{
    const target=path.resolve(root),tmp=path.resolve(os.tmpdir());
    if(path.dirname(target)!==tmp||!path.basename(target).startsWith('biblioteca-transfer-test-'))throw Error('Unsafe fixture cleanup.');
    await fsp.rm(target,{recursive:true,force:true});
  });
  const incoming=path.join(root,'traspaso-entrante'),source=path.join(root,'synthetic-source');await fsp.mkdir(incoming);
  const store=new PersonalStore(source);let loaded=store.write(state());
  loaded.planNotes={[loaded.plans[0].id+':'+loaded.plans[0].dayIds[0]]:'Nota de día sintética'};store.write(loaded);
  if(pin)store.setPin('123456');
  const originalVault=store.vault?JSON.stringify(store.vault):null;
  const originalIds=store.load().plans[0].dayIds;
  await backup(store.db,path.join(incoming,'biblioteca-personal.sqlite'));store.close();
  const mod='texto-sintetico.bblx',db=new DatabaseSync(path.join(incoming,mod));db.exec('CREATE TABLE Bible(Book INTEGER,Chapter INTEGER,Verse INTEGER,Scripture TEXT);');db.prepare('INSERT INTO Bible VALUES(19,23,1,?)').run('{\\rtf1 Texto inventado}');db.close();
  const bytes=await fsp.readFile(path.join(incoming,mod));
  const pack={paquete:'personal',version:'5',modoPersonal:true,modulos:[{id:'texto-sintetico',tipo:'biblia',rol:'version',archivo:mod,titulo:'Texto inventado para pruebas',bytes:bytes.length,sha256:digest(bytes),iaPermitida:false,licencia:'Solo fixture'}]};
  await fsp.writeFile(path.join(incoming,'manifest.json'),JSON.stringify(pack));
  const meta={formato:'biblioteca-biblica-traspaso',version:1,creado:new Date().toISOString(),origen:'Windows',paquete:{version:'5',modoPersonal:true,modulos:1},conteos:{diasPlan:1189,diasCompletados:329,devocionales:2,oraciones:0},archivos:[]};
  for(const [archivo,tipo]of [['biblioteca-personal.sqlite','datos'],['manifest.json','manifiesto'],[mod,'modulo']]){
    const b=await fsp.readFile(path.join(incoming,archivo));meta.archivos.push({archivo,tipo,...(tipo==='modulo'?{id:'texto-sintetico'}:{}),bytes:b.length,sha256:digest(b)});
  }
  await fsp.writeFile(path.join(incoming,'traspaso.json'),JSON.stringify(meta));
  const selected=async()=>({carpeta:'traspaso-entrante',archivos:await Promise.all((await fsp.readdir(incoming)).map(async nombre=>({nombre,ruta:'traspaso-entrante/'+nombre,bytes:(await fsp.stat(path.join(incoming,nombre))).size})))});
  const update=async()=>{
    for(const f of meta.archivos){const b=await fsp.readFile(path.join(incoming,f.archivo));f.bytes=b.length;f.sha256=digest(b);}
    await fsp.writeFile(path.join(incoming,'traspaso.json'),JSON.stringify(meta));
  };
  return {root,incoming,selected,meta,pack,originalIds,originalVault,update};
}
function filesystem(root,{interrupt=()=>{},chunkError=false,denyStat=false}={}){
  function resolve(p){const absolute=path.resolve(root,p);if(absolute!==root&&!absolute.startsWith(root+path.sep))throw Error('Outside synthetic fixture');return absolute;}
  const metrics={largestChunk:0,chunks:0,textPaths:[],copies:0,hashPaths:[]};
  const stat=async({path:p})=>{
    if(denyStat)throw Object.assign(Error('Access denied'),{code:'EACCES'});
    const s=await fsp.lstat(resolve(p));return {type:s.isDirectory()?'directory':s.isFile()?'file':'symlink',size:s.size};
  };
  return {metrics,
    stat,
    readdir:async({path:p})=>({files:await Promise.all((await fsp.readdir(resolve(p))).map(async name=>({name,...await stat({path:p+'/'+name})})))}),
    mkdir:async({path:p})=>fsp.mkdir(resolve(p),{recursive:true}),
    rmdir:async({path:p})=>fsp.rm(resolve(p),{recursive:true}),
    deleteFile:async({path:p})=>fsp.unlink(resolve(p)),
    readFile:async({path:p,encoding})=>{assert.equal(encoding,'utf8');metrics.textPaths.push(p);return {data:await fsp.readFile(resolve(p),'utf8')};},
    writeFile:async({path:p,data})=>{await fsp.mkdir(path.dirname(resolve(p)),{recursive:true});await fsp.writeFile(resolve(p),data);},
    rename:async({from,to})=>{await interrupt(from,to);await fsp.rename(resolve(from),resolve(to));},
    copy:async({from,to})=>{metrics.copies++;await fsp.copyFile(resolve(from),resolve(to));},
    getUri:async({path:p})=>({uri:require('node:url').pathToFileURL(resolve(p)).href}),
    readFileInChunks:async({path:p,chunkSize,encoding},callback)=>{
      metrics.hashPaths.push(p);
      assert.equal(encoding,undefined);
      queueMicrotask(async()=>{try{
        if(chunkError)throw Object.assign(Error('Synthetic chunk error'),{code:'EIO'});
        for await(const b of fs.createReadStream(resolve(p),{highWaterMark:chunkSize})){metrics.largestChunk=Math.max(metrics.largestChunk,b.length);metrics.chunks++;callback({data:b.toString('base64')});}
        callback({data:''});
      }catch(e){callback(null,e);}});return 'native-callback-id';
    }
  };
}
function sqlite(){
  const handles=new Map(),created=new Set();let connections=0;
  return {
    createNCConnection:async({databasePath,version})=>{assert.equal(version,1);created.add(databasePath);},
    open:async({database,readonly})=>{assert.equal(readonly,true);assert.ok(created.has(database));handles.set(database,new DatabaseSync(database,{readOnly:true,allowExtension:false}));connections++;},
    query:async({database,statement,values,readonly})=>{assert.equal(readonly,true);return {values:handles.get(database).prepare(statement).all(...values)};},
    close:async({database})=>{handles.get(database)?.close();handles.delete(database);connections--;},
    closeNCConnection:async({databasePath})=>{created.delete(databasePath);},
    connections:()=>connections
  };
}
function repository(root,{failActivate=false,failResume=false}={}){
  let revision=0,closed=false,locked=false,failed=false;
  return {revision:async()=>revision,bump:()=>revision++,
    exclusive:async fn=>{assert.equal(locked,false);locked=true;try{return await fn();}finally{locked=false;}},
    quiesce:async()=>{closed=true;},
    activate:async({database,modules})=>{
      assert.ok(closed);if(failActivate)throw new contract.BridgeError('STORAGE','Fallo sintético al abrir la biblioteca.');
      const db=new DatabaseSync(path.join(root,database),{readOnly:true});try{assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');}finally{db.close();}
      assert.ok(fs.existsSync(path.join(root,modules,'manifest.json')));revision++;
    },
    resume:async options=>{assert.equal(options.blockWritesUntilBootstrap,options.installed);if(failResume&&!failed){failed=true;throw new contract.BridgeError('STORAGE','Fallo sintético de reapertura.');}closed=false;}
  };
}
async function oldLibrary(root){
  await fsp.writeFile(path.join(root,'biblioteca-personal.sqlite'),'OLD-DATABASE');
  await fsp.mkdir(path.join(root,'modulos/personal'),{recursive:true});await fsp.writeFile(path.join(root,'modulos/personal/old.txt'),'OLD-MODULE');
}
async function unchanged(root){assert.equal(await fsp.readFile(path.join(root,'biblioteca-personal.sqlite'),'utf8'),'OLD-DATABASE');assert.equal(await fsp.readFile(path.join(root,'modulos/personal/old.txt'),'utf8'),'OLD-MODULE');}

test('Streaming SHA-256 matches native crypto across padding boundaries, Unicode and multi-megabyte inputs',()=>{
  for(const n of [0,1,55,56,63,64,65,127,128,1000000,3*1024*1024+7]){
    const data=crypto.randomBytes(n),h=hash.create();for(let i=0;i<data.length;i+=317)h.update(data.subarray(i,i+317));assert.equal(h.hex(),digest(data));assert.throws(()=>h.hex());
  }
  const data=new TextEncoder().encode('Día · oración ñ 😀');assert.equal(hash.create().update(data).hex(),digest(data));
});

test('Native adapter verifies real synthetic SQLite, preserves 329/1189 and IDs, backs up both assets and installs flat modules',async t=>{
  const f=await fixture(t);await oldLibrary(f.root);const fsPlugin=filesystem(f.root),sql=sqlite(),repo=repository(f.root);
  const service=native.create({filesystem:fsPlugin,sqlite:sql,books,repository:repo});const bridge=contract.createBridge({platform:'android',handlers:service.handlers()}).bridge;
  const review=await bridge.transferScan(await f.selected());assert.deepEqual(review.resumen.conteos,{diasPlan:1189,diasCompletados:329,devocionales:2,oraciones:0,estadoCifrado:false});
  await unchanged(f.root);assert.equal(sql.connections(),0);assert.ok(fsPlugin.metrics.largestChunk<=262144);assert.ok(fsPlugin.metrics.textPaths.every(p=>p.endsWith('.json')));
  assert.equal(fsPlugin.metrics.hashPaths.length,f.meta.archivos.length);assert.ok(fsPlugin.metrics.hashPaths.every(p=>p.startsWith('traspaso-listo/')));
  const result=await bridge.transferInstall({token:review.token,confirmado:true});assert.equal(result.instalado,true);assert.equal(result.requiereRecarga,true);
  assert.equal(await fsp.readFile(path.join(f.root,result.respaldo,'biblioteca-personal.sqlite'),'utf8'),'OLD-DATABASE');
  assert.equal(await fsp.readFile(path.join(f.root,result.respaldo,'personal/old.txt'),'utf8'),'OLD-MODULE');
  const restored=new PersonalStore(f.root);const data=restored.load();restored.close();assert.equal(data.plans[0].completed.length,329);assert.deepEqual(data.plans[0].dayIds,f.originalIds);assert.equal(data.notes['18:23:1'],'Nota SOLO sintética');assert.equal(data.planNotes['plan-123:'+f.originalIds[0]],'Nota de día sintética');assert.equal(data.devotionals.length,2);
  assert.equal(JSON.parse(await fsp.readFile(path.join(f.root,'modulos/personal/manifest.json'),'utf8')).modoPersonal,true);
  await assert.rejects(bridge.transferInstall({token:review.token,confirmado:true}),{code:'CONFLICT'});
});

test('Scan rejects a same-size corruption introduced by the file copy before offering review',async t=>{
  const f=await fixture(t);await oldLibrary(f.root);const fsPlugin=filesystem(f.root),copy=fsPlugin.copy;
  fsPlugin.copy=async input=>{await copy(input);if(input.to.endsWith('.bblx')){const file=path.join(f.root,input.to),bytes=await fsp.readFile(file);bytes[bytes.length-1]^=1;await fsp.writeFile(file,bytes);}};
  const service=native.create({filesystem:fsPlugin,sqlite:sqlite(),books,repository:repository(f.root)});
  await assert.rejects(service.transferScan(await f.selected()),{code:'CORRUPT'});await unchanged(f.root);
  assert.deepEqual(await fsp.readdir(path.join(f.root,'traspaso-listo')),[]);
});

test('Install still rejects candidate tampering even when its size and mtime are unchanged',async t=>{
  const f=await fixture(t);await oldLibrary(f.root);const fsPlugin=filesystem(f.root),originalStat=fsPlugin.stat;
  // A provider reporting unchanged timestamps must not defeat byte verification.
  fsPlugin.stat=async input=>({...await originalStat(input),mtime:1234567});
  const service=native.create({filesystem:fsPlugin,sqlite:sqlite(),books,repository:repository(f.root)});
  const review=await service.transferScan(await f.selected()),file=path.join(f.root,'traspaso-listo',review.token.slice(9),'texto-sintetico.bblx'),stat=await fsp.stat(file),bytes=await fsp.readFile(file);bytes[bytes.length-1]^=1;
  await fsp.writeFile(file,bytes);await fsp.utimes(file,stat.atime,stat.mtime);
  assert.equal((await fsp.stat(file)).size,stat.size);
  await assert.rejects(service.transferInstall({token:review.token,confirmado:true}),{code:'CORRUPT'});await unchanged(f.root);
});

test('Encrypted vault travels byte-for-byte, summary detects PIN despite exporter oraciones:0, Windows PIN still unlocks',async t=>{
  const f=await fixture(t,{pin:true}),original=f.originalVault;
  const service=native.create({filesystem:filesystem(f.root),sqlite:sqlite(),books,repository:repository(f.root)}),r=await service.transferScan(await f.selected());
  assert.equal(r.resumen.conservaPin,true);assert.equal(r.resumen.conteos.estadoCifrado,true);assert.equal(r.resumen.conteos.oraciones,undefined);assert.ok(!JSON.stringify(r).includes('Nota SOLO'));
  await service.transferInstall({token:r.token,confirmado:true});const installed=new PersonalStore(f.root);assert.equal(JSON.stringify(installed.vault),original);assert.equal(installed.load().privateLocked,true);assert.deepEqual(installed.load().notes,{});assert.equal(installed.unlock('123456').notes['18:23:1'],'Nota SOLO sintética');installed.close();
});

for(const scenario of ['hash','same-size-hash','missing','extra','counts','manifest','bad-database','trigger','mixed-vault','ordinals','future-schema','bad-reference'])test('Transfer refuses '+scenario+' without touching old data',async t=>{
  const f=await fixture(t,{pin:scenario==='mixed-vault'});await oldLibrary(f.root);
  if(scenario==='hash')await fsp.appendFile(path.join(f.incoming,'biblioteca-personal.sqlite'),'X');
  if(scenario==='same-size-hash'){const name=path.join(f.incoming,'texto-sintetico.bblx'),data=await fsp.readFile(name);data[data.length-1]^=1;await fsp.writeFile(name,data);}
  if(scenario==='missing')await fsp.unlink(path.join(f.incoming,'texto-sintetico.bblx'));
  if(scenario==='extra')await fsp.writeFile(path.join(f.incoming,'secret.key'),'NOT IMPORTABLE');
  if(scenario==='counts'){f.meta.conteos.diasCompletados=328;await f.update();}
  if(scenario==='manifest'){f.pack.modulos[0].sha256='0'.repeat(64);await fsp.writeFile(path.join(f.incoming,'manifest.json'),JSON.stringify(f.pack));await f.update();}
  if(scenario==='bad-database'){await fsp.writeFile(path.join(f.incoming,'biblioteca-personal.sqlite'),'NOT SQLITE');await f.update();}
  if(['trigger','mixed-vault','ordinals','future-schema','bad-reference'].includes(scenario)){
    const db=new DatabaseSync(path.join(f.incoming,'biblioteca-personal.sqlite'));
    if(scenario==='trigger')db.exec('CREATE TRIGGER evil AFTER DELETE ON meta BEGIN DELETE FROM plans; END;');
    if(scenario==='mixed-vault')db.exec("UPDATE annotations SET note='leaked plaintext'");
    if(scenario==='ordinals')db.exec('UPDATE plan_days SET ordinal=2000 WHERE ordinal=1188');
    if(scenario==='future-schema')db.exec("UPDATE meta SET value='4' WHERE key='schema'");
    if(scenario==='bad-reference'){const s=JSON.parse(db.prepare("SELECT value FROM meta WHERE key='state'").get().value);s.position.bookId='b999';db.prepare("UPDATE meta SET value=? WHERE key='state'").run(JSON.stringify(s));}
    db.close();await f.update();
  }
  const sql=sqlite(),service=native.create({filesystem:filesystem(f.root),sqlite:sql,books,repository:repository(f.root)});
  await assert.rejects(service.transferScan(await f.selected()),e=>['CORRUPT','VALIDATION'].includes(e.code));await unchanged(f.root);assert.equal(sql.connections(),0);
});

test('Contract rejects traversal, duplicate picker names, arbitrary paths and unconfirmed install; errors disclose no filenames',async t=>{
  const f=await fixture(t),selected=await f.selected(),bridge=contract.createBridge().bridge;
  for(const file of [{nombre:'../escape',ruta:'traspaso-entrante/../escape',bytes:3},{...selected.archivos[0],ruta:'/private/arbitrary.sqlite'}])await assert.rejects(bridge.transferScan({...selected,archivos:[file,...selected.archivos.slice(1)]}),{code:'VALIDATION'});
  await assert.rejects(bridge.transferScan({...selected,archivos:[...selected.archivos,selected.archivos[0]]}),{code:'VALIDATION'});
  await assert.rejects(bridge.transferInstall({token:'transfer-'+'a'.repeat(32),confirmado:false}),{code:'VALIDATION'});
});

test('Stale review and candidate mutation cannot replace current data',async t=>{
  const f=await fixture(t);await oldLibrary(f.root);const repo=repository(f.root),service=native.create({filesystem:filesystem(f.root),sqlite:sqlite(),books,repository:repo});
  const r=await service.transferScan(await f.selected());repo.bump();await assert.rejects(service.transferInstall({token:r.token,confirmado:true}),{code:'CONFLICT'});await unchanged(f.root);
  const again=await service.transferScan(await f.selected());const staged=path.join(f.root,'traspaso-listo',again.token.slice(9),'biblioteca-personal.sqlite');await fsp.appendFile(staged,'X');
  await assert.rejects(service.transferInstall({token:again.token,confirmado:true}),{code:'CORRUPT'});await unchanged(f.root);
});

for(const scenario of ['file-swap','activate','resume'])test('Rollback restores both database and modules when '+scenario+' fails',async t=>{
  const f=await fixture(t);await oldLibrary(f.root);let once=false;
  const fsPlugin=filesystem(f.root,{interrupt:async(from,to)=>{if(scenario==='file-swap'&&to==='modulos/personal'&&!once){once=true;throw new contract.BridgeError('STORAGE','Synthetic failure');}}});
  const service=native.create({filesystem:fsPlugin,sqlite:sqlite(),books,repository:repository(f.root,{failActivate:scenario==='activate',failResume:scenario==='resume'})});
  const r=await service.transferScan(await f.selected());await assert.rejects(service.transferInstall({token:r.token,confirmado:true}),{code:'STORAGE'});await unchanged(f.root);assert.equal(fs.existsSync(path.join(f.root,transfer.paths.journal)),false);
});

test('Interrupted rename is recovered before opening the repository, repeatedly and without deleting unmoved old files',async t=>{
  const f=await fixture(t);await oldLibrary(f.root);const key='a'.repeat(32),back='respaldos/traspaso-'+key;
  await fsp.mkdir(path.join(f.root,back),{recursive:true});await fsp.rename(path.join(f.root,'biblioteca-personal.sqlite'),path.join(f.root,back,'biblioteca-personal.sqlite'));await fsp.writeFile(path.join(f.root,'biblioteca-personal.sqlite'),'INCOMPLETE NEW');
  await fsp.writeFile(path.join(f.root,transfer.paths.journal),JSON.stringify({v:1,id:key,oldDatabase:true,oldModules:true}));
  const service=native.create({filesystem:filesystem(f.root),sqlite:sqlite(),books});assert.deepEqual(await service.recover(),{recovered:true});await unchanged(f.root);assert.deepEqual(await service.recover(),{recovered:false});
});

test('Durable commit survives restart; scan-only configuration never advertises installation or SQLite persistence',async t=>{
  const f=await fixture(t);await oldLibrary(f.root);const key='b'.repeat(32);
  await fsp.writeFile(path.join(f.root,transfer.paths.journal),JSON.stringify({v:1,id:key,oldDatabase:true,oldModules:true}));await fsp.writeFile(path.join(f.root,'traspaso-commit-'+key),'committed');
  const service=native.create({filesystem:filesystem(f.root),sqlite:sqlite(),books});await service.recover();await unchanged(f.root);
  const bridge=contract.createBridge({platform:'android',handlers:service.handlers()}).bridge,caps=await bridge.getCapabilities();assert.equal(caps.operations.transferScan.available,true);assert.equal(caps.operations.transferInstall.available,false);assert.equal(caps.storage,'none');assert.equal(caps.nativeVerified,false);
});

test('Native streamed read errors and denied stat fail safely rather than claiming a missing library',async t=>{
  const f=await fixture(t);const files=native.createFiles(filesystem(f.root,{chunkError:true}));await assert.rejects(files.sha256('traspaso-entrante/biblioteca-personal.sqlite',123),{code:'STORAGE'});
  const denied=native.createFiles(filesystem(f.root,{denyStat:true}));await assert.rejects(denied.exists('biblioteca-personal.sqlite'),{code:'STORAGE'});
});

test('First install rollback removes only new assets when no prior library exists',async t=>{
  const f=await fixture(t),service=native.create({filesystem:filesystem(f.root),sqlite:sqlite(),books,repository:repository(f.root,{failActivate:true})});
  const r=await service.transferScan(await f.selected());await assert.rejects(service.transferInstall({token:r.token,confirmado:true}),{code:'STORAGE'});
  assert.equal(fs.existsSync(path.join(f.root,transfer.paths.database)),false);assert.equal(fs.existsSync(path.join(f.root,transfer.paths.modules)),false);
});

test('Failed rollback keeps journal and repository closed until restart can recover',async t=>{
  const f=await fixture(t);await oldLibrary(f.root);let rejectRestore=true,resumes=0;
  const plugin=filesystem(f.root,{interrupt:async(from,to)=>{if(rejectRestore&&from.startsWith('respaldos/')&&to===transfer.paths.database)throw new contract.BridgeError('STORAGE','Synthetic failed rollback');}});
  const repo=repository(f.root,{failActivate:true}),resume=repo.resume;repo.resume=async options=>{resumes++;await resume(options);};
  const service=native.create({filesystem:plugin,sqlite:sqlite(),books,repository:repo}),r=await service.transferScan(await f.selected());
  await assert.rejects(service.transferInstall({token:r.token,confirmado:true}),{code:'LOCKED'});assert.equal(resumes,0);assert.equal(fs.existsSync(path.join(f.root,transfer.paths.journal)),true);
  rejectRestore=false;await service.recover();await unchanged(f.root);
});

test('Expired review cannot install and post-commit cleanup failure is repaired on restart without undoing success',async t=>{
  const f=await fixture(t);await oldLibrary(f.root);let time=1000;
  const files=native.createFiles(filesystem(f.root)),sql=sqlite();
  const openDatabase=async p=>{const db=new DatabaseSync(path.join(f.root,p),{readOnly:true});return {query:async(s,v=[])=>db.prepare(s).all(...v),close:async()=>db.close()};};
  let failCleanup=false;const remove=files.remove;
  const service=transfer.create({files:{...files,remove:async p=>{if(failCleanup&&p===transfer.paths.journal)throw new contract.BridgeError('STORAGE','Synthetic cleanup failure');return remove(p);}},openDatabase,books,repository:repository(f.root),now:()=>time});
  const r=await service.transferScan(await f.selected());time=r.expiresAt+1;await assert.rejects(service.transferInstall({token:r.token,confirmado:true}),{code:'CONFLICT'});await unchanged(f.root);
  const next=await service.transferScan(await f.selected());failCleanup=true;const result=await service.transferInstall({token:next.token,confirmado:true});assert.equal(result.instalado,true);assert.equal(fs.existsSync(path.join(f.root,transfer.paths.journal)),true);
  failCleanup=false;await service.recover();const installed=new PersonalStore(f.root);assert.equal(installed.load().plans[0].completed.length,329);installed.close();assert.equal(sql.connections(),0);
});
