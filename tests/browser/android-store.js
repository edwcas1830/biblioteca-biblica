'use strict';
const fixtureBooks=Array.from({length:66},(_,i)=>({name:'Libro '+i,chapters:Array.from({length:30},()=>Array(25).fill('Texto de prueba'))}));
function fixtureState(){return {version:1,position:{book:18,chapter:23,verse:1},notes:{'18:23:1':'Nota sintética','rv1960@42:3:16':'Otra versión sintética'},highlights:{'18:23:1':'gold'},devResponses:{'dev-prueba:0':'Respuesta sintética'},planNotes:{},prayers:[],prayerDrafts:{},guideResponses:{},aiStudies:[],devotionals:[{id:'dev-prueba',title:'Devocional sintético',entries:[{title:'Día 1',body:'Reflexión sintética',book:18,chapter:23}],completed:[],lastDay:0,status:'active'}],plans:[{id:'plan-123',days:1189,scope:'custom',title:'Plan sintético',entries:Array.from({length:1189},(_,i)=>({title:'Día '+i,readings:[{book:18,chapter:23}]})),completed:Array.from({length:329},(_,i)=>i)}],appearance:{design:'c'},font:20};}
const equal=(a,b,message)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw Error(message);};
const ok=(value,message)=>{if(!value)throw Error(message);};
async function rejects(work,code){try{await work();}catch(error){equal(error.code,code,'Código esperado '+code+', recibido '+error.code);return;}throw Error('La operación debía fallar: '+code);}
window.testStorePhase1=async()=>{
  const names=[];const test=async(name,fn)=>{await fn();names.push(name);};
  const adapter=LibraryWebBridge.create({bible:window.BIBLE,resourceBase:'/app/data/',documentBase:location.origin+'/',dbName:'test-persistence'}),store=adapter.store,bridge=adapter.bridge;
  let saved,ids;
  await test('SHA incremental en Chromium coincide con WebCrypto y carga las fábricas sin Node',async()=>{
    const bytes=Uint8Array.from({length:600007},(_,i)=>i%251),stream=LibrarySha256Stream.create();
    for(let i=0;i<bytes.length;i+=65537)stream.update(bytes.subarray(i,i+65537));
    const expected=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');equal(stream.hex(),expected,'Huella portable');
    ok(typeof LibraryTransfer.inspect==='function'&&typeof LibraryAndroidTransfer.create==='function','Fábricas UMD sin Node');
    ok(typeof LibraryAndroidStore.PersonalStore==='function'&&typeof LibraryAndroidServices.attach==='function','Repositorio y arranque UMD sin Node');
  });
  await test('La vista web no anuncia traspaso nativo ni convierte SQLite a IndexedDB',async()=>{
    const caps=await bridge.getCapabilities();equal(caps.operations.transferScan.available,false,'Scan nativo ausente');equal(caps.operations.transferInstall.available,false,'Instalar ausente');
    await rejects(()=>bridge.transferInstall({token:'transfer-'+'a'.repeat(32),confirmado:true}),'UNAVAILABLE');
  });
  await test('IndexedDB real: migración conserva 1189 días y 329 completados',async()=>{const raw=JSON.stringify(fixtureState()),result=await bridge.bootstrap({legacy:raw,initial:fixtureState()});saved=result.state;ids=saved.plans[0].dayIds;equal(saved.plans[0].completed.length,329,'Progreso');equal(new Set(ids).size,1189,'IDs únicos');equal(saved.notes,fixtureState().notes,'Notas');equal(await store.backup(result.backup),raw,'Respaldo exacto');});
  await test('Guardado conserva nota por día, lectura pendiente y configuración',async()=>{saved.planNotes['plan-123:'+ids[0]]='Nota de día';saved.devotionals[0].lastDay=0;saved.devotionals[0].completed=[0];saved.devotionals[0].status='finished';saved.devotionals[0].finishedAt='2026-10-10T12:00:00.000Z';saved=await bridge.savePersonal(saved);equal(saved.plans[0].dayIds,ids,'IDs estables');});
  await test('Fallo después de poner datos revierte toda la transacción',async()=>{const before=await store.load(),next=structuredClone(before);next.notes['18:23:1']='No debe aparecer';await rejects(()=>store.write(next,{fail:true}),'STORAGE');equal(await store.load(),before,'Rollback');});
  await test('Restaurar respalda antes de sustituir y revierte al fallar',async()=>{const before=await store.load(),next=structuredClone(before);next.notes['18:23:1']='Restauración de prueba';await rejects(()=>store.restoreBackup({state:next},{fail:true}),'STORAGE');equal(await store.load(),before,'Rollback de restauración');const after=await bridge.restoreBackup({state:next});const backups=await store.listBackups();const prior=backups.find(b=>b.kind==='snapshot');ok(prior,'Respaldo previo');equal((await store.backup(prior.id)).notes,before.notes,'Notas anteriores');saved=after;});
  await test('Un PIN o respaldo cifrado no se degrada a texto ni borra datos',async()=>{const before=await store.load();await rejects(()=>bridge.restoreBackup({state:fixtureState(),privateVault:{v:1}}),'UNAVAILABLE');await rejects(()=>bridge.setPin('123456'),'UNAVAILABLE');equal(await store.load(),before,'No debe cambiar la biblioteca');});
  await test('Una segunda pestaña no sobrescribe una revisión antigua',async()=>{const second=new LibraryWebStore.PersonalStore({dbName:'test-persistence',books:fixtureBooks});const old=await second.readRecord(),newState=await second.load(),prepared=await second.model.encode(newState,newState);saved.notes['18:23:1']='Después de otra pestaña';saved=await bridge.savePersonal(saved);await rejects(()=>second.write(newState),'CONFLICT');await rejects(()=>second.commit(prepared,old),'CONFLICT');equal((await store.load()).notes['18:23:1'],saved.notes['18:23:1'],'Guardado más nuevo');await second.close();});
  await test('Copia antigua inválida no reemplaza una base válida',async()=>{const result=await bridge.bootstrap({legacy:'dañado',legacyValid:false,initial:fixtureState()});equal(result.state,saved,'Base válida prevalece');});
  await test('Migración abortada conserva copia original para reintentar',async()=>{const other=new LibraryWebStore.PersonalStore({dbName:'test-rollback',books:fixtureBooks}),raw=JSON.stringify(fixtureState());await rejects(()=>other.bootstrap({legacy:raw,initial:fixtureState()},{fail:true}),'STORAGE');equal(await other.load(),null,'Sin datos parciales');const backups=await other.listBackups();equal(backups.length,1,'Copia retenida');equal(await other.backup(backups[0].id),raw,'Copia exacta');const migrated=await other.bootstrap({legacy:raw,initial:fixtureState()});equal(migrated.state.plans[0].completed.length,329,'Reintento');await other.close();});
  await test('Capacidades y catálogo nunca fingen módulos o funciones nativas',async()=>{const caps=await bridge.getCapabilities();equal(caps.storage,'indexeddb','Almacén');equal(caps.nativeVerified,false,'No es prueba nativa');equal(caps.operations.setPin.available,false,'PIN no disponible');equal(caps.operations.bootstrap.available,true,'Persistencia disponible');equal(caps.operations.readPdf.available,true,'Worker PDF disponible');equal((await bridge.catalog()).versions,['rv1909','onbv2008'],'Solo versiones libres');await rejects(()=>bridge.chapter({module:'rv1960',book:42,chapter:3}),'NOT_FOUND');});
  await test('Diccionario, comparación, referencias y gráficos se leen de archivos libres en Chromium',async()=>{
    const lex=await bridge.dictionary({group:'step-hebrew',query:'H1'});ok(lex.entries[0].text.includes('אָב'),'Hebreo');
    const compare=await bridge.compare({modules:['rv1909','onbv2008'],book:42,chapter:3,verse:16});equal(compare.rows.length,1,'Comparar');
    ok((await bridge.connections({book:42,chapter:3,verse:16})).items.length,'Conexiones');
    const map=await bridge.graphicsChapter({book:41,chapter:2});ok(map.places.some(p=>p.name.startsWith('Belén'))&&map.land.features.length,'Atlas');
    const people=await bridge.graphicsPeople({query:'Abraham'}),family=await bridge.graphicsGenealogy({id:people.items[0].id});ok(family.groups.find(g=>g.kind==='children').items.some(p=>p.name==='Isaac'),'Familia');
  });
  await test('Comentario sintético en web conserva el rango y escapa HTML',async()=>{
    const modules=LibraryJsonModules.create({resources:{manifest:async()=>({modulos:[{id:'fixture-comment',tipo:'comentario',rol:'comentario',titulo:'Fixture original CC0',registros:1,dataFile:'fixture-comment.json.gz',dataSha256:'a'.repeat(64)}]}),file:async()=>[[43,3,4,16,2,'Comentario inventado <script>literal</script>']]}});
    const reader=LibraryReader.create({bible:window.BIBLE,source:modules});const result=await reader.comments({module:'fixture-comment',book:42,chapter:4,verse:2});equal(result.entries.length,1,'Rango cruzado');ok(result.entries[0].html.includes('&lt;script&gt;')&&!result.entries[0].html.includes('<script>'),'HTML seguro');
  });
  await test('IA UMD en Chromium: PKCE manual, cuenta de sesión, cuota real y seis secciones con citas locales',async()=>{
    const token='sk-or-v1-'+'a'.repeat(64);let exchange,opened,copy,request;
    const ai=LibraryWebBridge.create({bible:window.BIBLE,manifest:{iaPermitida:true},resourceBase:'/app/data/',dbName:'test-ai-session',events:['onAiState'],handlers:{aiTextCopy:async text=>{copy=text;return true;},shareText:async()=>({completed:false})},aiOptions:{openExternal:async url=>{opened=url;},fetchImpl:async(url,input)=>{
      let body;if(url.endsWith('/auth/keys')){exchange=JSON.parse(input.body);body={key:token};}
      else if(url.endsWith('/key'))body={data:{free_model_daily_requests:{used:2,limit:50,remaining:48}}};
      else if(url.endsWith('/models'))body={data:[{id:'qwen/test:free',pricing:{prompt:'0',completion:'0'}}]};
      else{request=JSON.parse(input.body);body={choices:[{message:{content:JSON.stringify({text:'Observación inventada',sections:{brief:'Idea breve'},citations:[{book:42,chapter:3,verse:16,text:'NO USAR CITA GENERADA'}]})}}]};}
      return new Response(JSON.stringify(body));
    }}}),api=ai.bridge;
    await api.bootstrap({initial:fixtureState()});const login=await api.aiConnect(),url=new URL(login.authorizationUrl);ok(!url.searchParams.has('callback_url'),'Sin callback');await api.aiConnect({code:'fixture-code'});
    const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(exchange.code_verifier)),challenge=btoa(String.fromCharCode(...new Uint8Array(hash))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');equal(challenge,url.searchParams.get('code_challenge'),'PKCE real WebCrypto');
    equal((await api.aiQuota()).daily.remaining,48,'Cuota del proveedor');equal((await api.aiModels())[0].id,'qwen/test:free','Modelo gratis');
    const p=await api.aiPrepare({module:'rv1909',book:42,chapter:3,verse:16,task:'explain',study:true,includeBible:true,notes:'NO ENVIAR NOTA'});ok(!p.prompt.includes('NO ENVIAR NOTA'),'Sin notas');
    const result=await api.aiAsk({id:p.id});equal(Object.keys(result.sections).length,6,'Diseño C');ok(result.citations[0].text!== 'NO USAR CITA GENERADA','Cita local');equal(request.provider.max_price.completion,0,'Sin precio positivo');
    await api.aiCopy({id:p.id,provider:'chatgpt'});equal(opened,'https://chatgpt.com/','URL sin pregunta');equal(copy,p.prompt,'Contexto elegido');equal((await api.aiShare({id:p.id})).shared,false,'Selector cancelado');
    equal((await api.aiReport({reason:'incorrecta',text:result.text,confirmed:true})).sent,false,'Sin canal no simular envío');await ai.close();
    const restarted=LibraryWebBridge.create({bible:window.BIBLE,resourceBase:'/app/data/',dbName:'test-ai-session'});equal((await restarted.bridge.aiStatus()).connected,false,'Credencial no persistida');await restarted.close();
  });
  // Put the expected snapshot in a second IDB record, not a JS global surviving reload.
  await store.transaction(['records'],'readwrite',tx=>tx.objectStore('records').put({key:'expected-test-snapshot',value:saved}));
  await store.close();return {phase:1,passed:names.length,names};
};
window.testStorePhase2=async()=>{
  const store=new LibraryWebStore.PersonalStore({dbName:'test-persistence',books:fixtureBooks});
  const expected=await store.transaction(['records'],'readonly',(tx,result)=>{const r=tx.objectStore('records').get('expected-test-snapshot');r.onsuccess=()=>result(r.result.value);});
  const state=(await store.bootstrap({legacy:null,initial:fixtureState()})).state;equal(state,expected,'Recarga real debe conservar el estado completo');
  equal(state.plans[0].completed.length,329,'329 completados tras recarga');equal(state.planNotes['plan-123:'+state.plans[0].dayIds[0]],'Nota de día','Nota por ID');equal(state.devotionals[0].status,'finished','Devocional terminado');
  const names=['Recarga real de página conserva días, notas, progreso y configuración'];
  const record=await store.readRecord();await store.transaction(['records'],'readwrite',tx=>tx.objectStore('records').put({key:'personal',value:{...record,schema:999}}));
  await rejects(()=>store.bootstrap({legacy:null,initial:fixtureState()}),'CORRUPT');equal((await store.readRecord()).schema,999,'No borrar esquema futuro');names.push('Esquema futuro bloquea migración sin sobrescribir');
  await store.close();return {phase:2,passed:names.length,names};
};
