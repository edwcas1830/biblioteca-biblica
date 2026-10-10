'use strict';
// Synthetic keys, invented text and fake providers. Never reads native/user credentials.
const test=require('node:test'),assert=require('node:assert/strict');
const openrouter=require('../platform/ai/openrouter.js'),geminis=require('../platform/ai/gemini.js'),services=require('../platform/ai/service.js'),contract=require('../platform/bridge-contract.js');
const token='sk-or-v1-'+ 'c'.repeat(64),geminiKey='AIza-fixture-'+ 'd'.repeat(30);
const response=(value,status=200,headers={})=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json',...headers}});
function store(initial={}){
  const values=new Map(Object.entries(initial)),calls=[];
  const check=n=>assert.ok(['openrouter','gemini'].includes(n));
  return {values,calls,leer:async n=>{check(n);calls.push(['read',n]);return values.get(n)??null;},guardar:async(n,v)=>{check(n);calls.push(['save',n]);values.set(n,v);return true;},borrar:async n=>{check(n);calls.push(['remove',n]);values.delete(n);return true;}};
}
const models=[{name:'models/gemini-fixture-flash',displayName:'Flash inventado',supportedGenerationMethods:['generateContent']},{name:'models/embedding-fixture',supportedGenerationMethods:['embedContent']},{name:'models/gemini-fixture-image',supportedGenerationMethods:['generateContent']},{name:'models/../../secret',supportedGenerationMethods:['generateContent']}];
const answer={text:'Observación inventada',sections:{brief:'En breve',living:'No solicitado'},keywords:[],citations:[{book:42,chapter:3,verse:16}]};
const reply=()=>response({modelVersion:'gemini-fixture-flash',candidates:[{finishReason:'STOP',content:{parts:[{thought:true,text:'NO MOSTRAR PENSAMIENTO'},{text:JSON.stringify(answer)}]}}]});
const fetchGemini=async url=>url.includes('/models?')?response({models}):reply();
async function connect(provider){await provider.connect();return provider.connect({code:'codigo-inventado'});}

test('OpenRouter persists only through secure store; close keeps it and disconnect removes it on the next session',async()=>{
  const credentialStore=store(),provider=openrouter.create({credentialStore,fetchImpl:async()=>response({key:token})});
  await connect(provider);assert.equal(provider.status().credentialStorage,'device-secure');assert.equal(credentialStore.values.get('openrouter'),token);
  assert.doesNotMatch(JSON.stringify(provider.status()),/sk-or-|code_verifier/);await provider.close();
  const next=openrouter.create({credentialStore});await next.ready;assert.equal(next.status().connected,true);await next.disconnect();assert.equal(credentialStore.values.has('openrouter'),false);await next.close();
  const last=openrouter.create({credentialStore});await last.ready;assert.equal(last.status().connected,false);await last.close();
});

test('A stored key loading late cannot reconnect after disconnect or close',async()=>{
  for(const action of ['disconnect','close']){
    let release;const credentialStore=store({openrouter:token});credentialStore.leer=()=>new Promise(r=>release=r);
    const provider=openrouter.create({credentialStore}),finish=provider[action]();while(!release)await new Promise(r=>setImmediate(r));release(token);await finish;await provider.ready;assert.equal(provider.status().connected,false);
    if(action==='disconnect')assert.equal(credentialStore.values.has('openrouter'),false);else assert.equal(credentialStore.values.get('openrouter'),token);
  }
});

test('Disconnect while a native save is in flight rolls back and never resurrects authorization',async()=>{
  const credentialStore=store();let release;
  credentialStore.guardar=async(n,v)=>{await new Promise(r=>release=r);credentialStore.values.set(n,v);return true;};
  const provider=openrouter.create({credentialStore,fetchImpl:async()=>response({key:token})});await provider.connect();const connecting=provider.connect({code:'codigo'});
  while(!release)await new Promise(r=>setImmediate(r));const disconnecting=provider.disconnect();release();await assert.rejects(connecting,{code:'CANCELLED'});await disconnecting;assert.equal(credentialStore.values.has('openrouter'),false);assert.equal(provider.status().connected,false);await provider.close();
});

test('Native read/write/delete failures expose safe errors and never claim persistent authorization',async()=>{
  const marker='SECRETO_DEL_PLUGIN';const credentialStore=store();credentialStore.guardar=async()=>{throw Error(marker+token);};
  const provider=openrouter.create({credentialStore,fetchImpl:async()=>response({key:token})});await provider.connect();await assert.rejects(provider.connect({code:'codigo'}),e=>e.code==='STORAGE'&&!e.message.includes(marker)&&!e.message.includes(token));assert.equal(provider.status().connected,false);await provider.close();
  const broken=store({openrouter:token});broken.leer=async()=>{throw Error(marker);};const reader=openrouter.create({credentialStore:broken});await reader.ready;assert.equal(reader.status().connected,false);assert.equal(reader.status().credentialError.code,'STORAGE');assert.doesNotMatch(JSON.stringify(reader.status()),/SECRETO/);await reader.close();
  const undeletable=store({openrouter:token}),last=openrouter.create({credentialStore:undeletable});await last.ready;undeletable.borrar=async()=>false;await assert.rejects(last.disconnect(),{code:'STORAGE'});assert.equal(last.status().connected,false);assert.equal(last.status().credentialError.code,'STORAGE');await last.close();
});

test('Closing during a replacement restores the previous credential instead of persisting a cancelled login',async()=>{
  const credentialStore=store({openrouter:token}),replacement='sk-or-v1-'+ 'e'.repeat(64);let release;
  credentialStore.guardar=async(n,v)=>{if(v===replacement)await new Promise(r=>release=r);credentialStore.values.set(n,v);return true;};
  const provider=openrouter.create({credentialStore,fetchImpl:async()=>response({key:replacement})});await provider.connect();const connecting=provider.connect({code:'replacement'});
  while(!release)await new Promise(r=>setImmediate(r));const closing=provider.close();release();await assert.rejects(connecting,{code:'CANCELLED'});await closing;assert.equal(credentialStore.values.get('openrouter'),token);assert.equal(provider.status().connected,false);
});

test('Gemini disconnect queued behind key replacement deletes both pending and original keys',async()=>{
  const credentialStore=store({gemini:geminiKey}),replacement='AIza-replacement-'+ 'e'.repeat(30);let release;
  credentialStore.guardar=async(n,v)=>{if(v===replacement)await new Promise(r=>release=r);credentialStore.values.set(n,v);return true;};
  const provider=geminis.create({credentialStore}),saving=provider.storeKey(replacement);while(!release)await new Promise(r=>setImmediate(r));const disconnecting=provider.disconnect();release();await assert.rejects(saving,{code:'CANCELLED'});await disconnecting;assert.equal(credentialStore.values.has('gemini'),false);await provider.close();
});

test('Gemini requires the native credential contract and rejects invalid keys without writing them',async()=>{
  assert.throws(()=>geminis.create(),{code:'UNAVAILABLE'});assert.throws(()=>geminis.create({credentialStore:{}}),{code:'UNAVAILABLE'});
  const credentialStore=store(),provider=geminis.create({credentialStore});await provider.ready;
  await assert.rejects(provider.storeKey('secret\nheader'),{code:'VALIDATION'});assert.equal(credentialStore.values.size,0);await provider.close();
});

test('Gemini persists/restores a key but neither status nor public results return it',async()=>{
  const credentialStore=store(),provider=geminis.create({credentialStore,fetchImpl:fetchGemini});await provider.storeKey(geminiKey);await provider.close();
  const next=geminis.create({credentialStore,fetchImpl:fetchGemini});await next.ready;assert.equal(next.status().connected,true);assert.equal(next.status().credentialStorage,'device-secure');
  assert.deepEqual(await next.listModels(),[{id:'gemini-fixture-flash',name:'Flash inventado'}]);assert.doesNotMatch(JSON.stringify(next.status()),/AIza|fixture-dd/);await next.disconnect();assert.equal(credentialStore.values.has('gemini'),false);await next.close();
});

test('Gemini uses fixed REST endpoints and x-goog-api-key, filtered live models, structured C and no thoughts',async()=>{
  const calls=[],provider=geminis.create({credentialStore:store({gemini:geminiKey}),fetchImpl:async(url,input)=>{calls.push({url,input});return fetchGemini(url);}});
  const result=await provider.ask({prompt:'Pregunta con contexto elegido',model:'gemini-fixture-flash',study:true});
  assert.equal(calls.length,2);for(const c of calls){assert.equal(new URL(c.url).origin,'https://generativelanguage.googleapis.com');assert.equal(c.input.headers['x-goog-api-key'],geminiKey);assert.equal(c.input.redirect,'error');assert.equal(c.input.credentials,'omit');assert.ok(!c.url.includes(geminiKey));}
  const sent=JSON.parse(calls[1].input.body);assert.equal(sent.contents[0].parts[0].text,'Pregunta con contexto elegido');assert.equal(sent.generationConfig.responseMimeType,'application/json');assert.equal(sent.generationConfig.maxOutputTokens,5000);assert.equal(sent.tools,undefined);assert.equal(Object.keys(result.sections).length,6);assert.equal(result.living,undefined);assert.doesNotMatch(JSON.stringify(result),/NO MOSTRAR/);await provider.close();
});

test('Gemini pagination is bounded and never sends the prompt to a model outside the returned list',async()=>{
  const urls=[],provider=geminis.create({credentialStore:store({gemini:geminiKey}),fetchImpl:async url=>{urls.push(url);return url.includes('pageToken=next')?response({models}):response({models:[],nextPageToken:'next'});}});
  assert.equal((await provider.listModels()).length,1);assert.equal(urls.length,2);await assert.rejects(provider.ask({prompt:'No enviar',model:'modelo-no-listado'}),{code:'VALIDATION'});assert.equal(urls.length,2);await assert.rejects(provider.ask({prompt:'No enviar',model:'../secret'}),{code:'VALIDATION'});await provider.close();
});

test('Gemini quota is unknown; 429/403/network/malformed/oversize errors are safe and no automatic retry occurs',async()=>{
  for(const mode of ['quota','auth','offline','malformed','oversize']){
    let calls=0;const provider=geminis.create({credentialStore:store({gemini:geminiKey}),now:()=>10,fetchImpl:async url=>{if(url.includes('/models?'))return response({models});calls++;if(mode==='quota')return response({error:{message:geminiKey}},429,{'Retry-After':'30'});if(mode==='auth')return response({error:{message:geminiKey}},403);if(mode==='offline')throw Error(geminiKey);if(mode==='malformed')return new Response('not-json');return new Response('x'.repeat(200001));}});
    await assert.rejects(provider.ask({prompt:'Pregunta',model:'gemini-fixture-flash'}),e=>['QUOTA','LOCKED','UNAVAILABLE','CORRUPT'].includes(e.code)&&!e.message.includes(geminiKey));assert.equal(calls,1);assert.equal(provider.status().quota,null);
    if(mode==='quota'){assert.equal(provider.status().retryAt,30010);await assert.rejects(provider.ask({prompt:'Pregunta',model:'gemini-fixture-flash'}),{code:'QUOTA'});assert.equal(calls,1);}await provider.close();
  }
});

test('Gemini does not turn blocked or truncated provider output into a completed answer',async()=>{
  for(const finishReason of ['SAFETY','RECITATION','MAX_TOKENS']){
    const provider=geminis.create({credentialStore:store({gemini:geminiKey}),fetchImpl:async url=>url.includes('/models?')?response({models}):response({candidates:[{finishReason,content:{parts:[{text:JSON.stringify(answer)}]}}]})});
    await assert.rejects(provider.ask({prompt:'Pregunta',model:'gemini-fixture-flash'}),{code:'UNAVAILABLE'});await provider.close();
  }
});

test('Changing/deleting a Gemini key cancels an old answer even if fetch ignores AbortSignal',async()=>{
  let release;const provider=geminis.create({credentialStore:store({gemini:geminiKey}),fetchImpl:async url=>url.includes('/models?')?response({models}):new Promise(r=>release=r)});
  const pending=provider.ask({prompt:'Pregunta',model:'gemini-fixture-flash'});while(!release)await new Promise(r=>setImmediate(r));await provider.disconnect();release(reply());await assert.rejects(pending,{code:'CANCELLED'});await provider.close();
});

function serviceFixture({personal=true,withStore=true,fetchImpl=fetchGemini}={}){
  let locked=false,permit=true;const credentialStore=store({gemini:geminiKey}),calls=[];
  const call=async(name,input)=>{calls.push({name,input});switch(name){case 'privacyStatus':return {locked};case 'catalog':return {modules:[{id:'inventada',tipo:'biblia',personalDefault:personal,iaPermitida:permit,sha256:'a'.repeat(64),titulo:'Biblia sintética',licencia:'CC0'}]};case 'metadata':return Array.from({length:66},()=>({name:'Libro inventado',chapters:Array(50).fill(30)}));case 'chapter':return {title:'Biblia sintética',revision:'a'.repeat(64),verses:[{verse:16,text:'Texto local elegido'}]};case 'dictionary':return {entries:[]};default:throw Error('Unexpected operation '+name);}};
  const service=services.create({call,credentialStore:withStore?credentialStore:undefined,fetchImpl});
  return {service,credentialStore,calls,lock:()=>{locked=true;service.invalidate();},deny:()=>{permit=false;},input:{module:'inventada',book:42,chapter:3,verse:16,task:'explain',question:'Qué observar',study:true,includeBible:true,includeComment:false}};
}

test('Gemini integrates through the existing contract only in personal mode, keeping public/CLI capabilities honest',async()=>{
  const f=serviceFixture(),api=f.service.handlers(),adapter=contract.createBridge({handlers:api});assert.equal((await adapter.bridge.getCapabilities()).operations.aiGeminiKey.available,true);const status=await api.aiPersonalStatus();assert.equal(status.enabled,true);assert.equal(status.providers[0].id,'gemini-api');assert.equal(status.providers[0].connected,true);assert.doesNotMatch(JSON.stringify(status),/AIza/);
  const p=await api.aiPrepare(f.input),result=await api.aiAsk({id:p.id,provider:'gemini-api',model:'gemini-fixture-flash'});assert.equal(result.citations[0].text,'Texto local elegido');assert.equal(result.sources[0].license,'CC0');assert.ok(!f.calls.some(c=>['bootstrap','exportBackup'].includes(c.name)));
  await api.aiPersonalEnable(false);await assert.rejects(api.aiGeminiModels(),{code:'UNAVAILABLE'});await api.aiPersonalEnable(true);await api.aiGeminiKey(null);assert.equal(f.credentialStore.values.has('gemini'),false);await f.service.close();
  const publicOnly=serviceFixture({personal:false});assert.equal((await publicOnly.service.handlers().aiPersonalStatus()).available,false);await assert.rejects(publicOnly.service.handlers().aiGeminiKey(geminiKey),{code:'UNAVAILABLE'});await publicOnly.service.close();
  const noStore=serviceFixture({withStore:false}),noStoreBridge=contract.createBridge({handlers:noStore.service.handlers()});assert.equal((await noStoreBridge.bridge.getCapabilities()).operations.aiGeminiKey.available,false);await assert.rejects(noStoreBridge.bridge.aiGeminiKey(geminiKey),{code:'UNAVAILABLE'});await noStore.service.close();
});

test('Source permission changes or private lock during Gemini model lookup stop the prompt before transmission',async()=>{
  for(const action of ['lock','deny']){
    let release,sends=0;const f=serviceFixture({fetchImpl:async url=>url.includes('/models?')?new Promise(r=>release=r):(sends++,reply())}),api=f.service.handlers(),p=await api.aiPrepare(f.input),pending=api.aiAsk({id:p.id,provider:'gemini-api',model:'gemini-fixture-flash'});
    while(!release)await new Promise(r=>setImmediate(r));f[action]();release(response({models}));await assert.rejects(pending,e=>['CANCELLED','LOCKED','CONFLICT'].includes(e.code));assert.equal(sends,0);await f.service.close();
  }
});
