'use strict';
// Only original invented passages and mocked network. No accounts or profiles.
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const providers=require('../platform/ai/openrouter.js'),services=require('../platform/ai/service.js'),contract=require('../platform/bridge-contract.js');
const token='sk-or-v1-'+ 'a'.repeat(64),response=(value,status=200,headers={})=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json',...headers}});
async function connected(options={}){
  const fetchImpl=options.fetchImpl||(async(url,input)=>url.endsWith('/auth/keys')?response({key:token}):response({choices:[{message:{content:JSON.stringify({text:'Observación original',citations:[]})}}]}));
  const service=providers.create({...options,fetchImpl}),login=await service.connect();await service.connect({code:'code-sintetico'});return {service,login};
}
test('Mobile PKCE uses no callback, S256 random verifier, manual one-time code, no token in returned state',async()=>{
  const calls=[],{service,login}=await connected({fetchImpl:async(url,input)=>{calls.push({url,input});return response({key:token});}}),url=new URL(login.authorizationUrl);
  assert.equal(url.origin,'https://openrouter.ai');assert.equal(url.searchParams.has('callback_url'),false);assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.ok(url.searchParams.get('key_label'));
  const data=JSON.parse(calls[0].input.body);assert.equal(data.code,'code-sintetico');assert.equal(data.code_challenge_method,'S256');assert.equal(crypto.createHash('sha256').update(data.code_verifier).digest('base64url'),url.searchParams.get('code_challenge'));
  assert.match(data.code_verifier,/^[a-zA-Z0-9_-]{43}$/);assert.equal(calls[0].input.redirect,'error');assert.equal(calls[0].input.credentials,'omit');assert.equal(service.status().credentialStorage,'session');assert.equal(service.status().connected,true);
  assert.doesNotMatch(JSON.stringify({...service.status(),...login}),/sk-or-|code_verifier/);await assert.rejects(service.connect({code:'code-sintetico'}),{code:'CONFLICT'});service.close();assert.equal(service.status().connected,false);
});
test('Expired and concurrent auth exchanges reject; disconnect prevents a late key from reconnecting',async()=>{
  let clock=0,release;const service=providers.create({now:()=>clock,fetchImpl:()=>new Promise(r=>{release=r;})});
  await service.connect();clock=600001;await assert.rejects(service.connect({code:'old'}),{code:'CONFLICT'});await service.connect();
  const late=service.connect({code:'late'});await assert.rejects(service.connect({code:'duplicate'}),{code:'CONFLICT'});service.disconnect();release(response({key:token}));await assert.rejects(late,{code:'CANCELLED'});assert.equal(service.status().connected,false);
});
test('Each new login has a different S256 challenge and invalid codes or provider key never leak',async()=>{
  const service=providers.create({fetchImpl:async()=>response({key:'token secreto inesperado'})}),a=await service.connect(),b=await service.connect();assert.notEqual(a.authorizationUrl,b.authorizationUrl);
  await assert.rejects(service.connect({code:'https://wrong.local/code?token=secret'}),{code:'VALIDATION'});await assert.rejects(service.connect({code:'bad-key'}),e=>e.code==='CORRUPT'&&!e.message.includes('secreto'));assert.equal(service.status().connected,false);
});
test('Only genuinely zero-priced :free text models are selectable; no paid fallback, collection deny by default',async()=>{
  let sent;const {service}=await connected({fetchImpl:async(url,input)=>{
    if(url.endsWith('/auth/keys'))return response({key:token});if(url.endsWith('/models'))return response({data:[{id:'qwen/fixture:free',name:'Qwen fixture',pricing:{prompt:'0',completion:'0',request:'0'}},{id:'paid',pricing:{prompt:'1',completion:'1'}},{id:'fee:free',pricing:{prompt:'0',completion:'0',request:'0.1'}}]});
    sent=JSON.parse(input.body);return response({model:'qwen/fixture:free',choices:[{message:{content:JSON.stringify({text:'Observación',sections:{brief:'Breve',living:'No solicitado'},keywords:[],citations:[{book:42,chapter:3,verse:16},{book:66,chapter:1,verse:1}]})}}]});
  }});
  assert.deepEqual((await service.listModels()).map(m=>m.id),['qwen/fixture:free','openrouter/free']);await assert.rejects(service.ask({prompt:'x',model:'paid'}),{code:'VALIDATION'});
  const result=await service.ask({prompt:'Pregunta',model:'qwen/fixture:free',study:true});assert.deepEqual(sent.provider,{max_price:{prompt:0,completion:0},allow_fallbacks:false,data_collection:'deny'});assert.equal(sent.stream,false);assert.equal(sent.max_tokens,4000);assert.equal(result.citations.length,1);assert.equal(result.sections.brief,'Breve');assert.equal(result.living,undefined);
  await service.ask({prompt:'Pregunta',allowData:true});assert.equal(sent.provider.data_collection,'allow');service.close();
});
test('Quota displays provider daily counter, never treats zero-cost usage as a request count',async()=>{
  let unknown=false;const {service}=await connected({fetchImpl:async(url)=>url.endsWith('/auth/keys')?response({key:token}):response({data:unknown?{usage_daily:0}:{usage_daily:0,limit_remaining:2,is_free_tier:false,free_model_daily_requests:{used:12,limit:50,remaining:38}}})});
  assert.deepEqual((await service.refreshQuota()).daily,{used:12,limit:50,remaining:38});unknown=true;const quota=await service.refreshQuota();assert.equal(quota.daily,null);assert.equal(quota.creditsRemaining,null);assert.match(quota.notice,/No se estima/);
});
test('Provider quota, offline, malformed and excessive bodies return safe typed errors, with no automatic retry',async()=>{
  let mode='quota',calls=0;const {service}=await connected({now:()=>100,fetchImpl:async url=>{if(url.endsWith('/auth/keys'))return response({key:token});calls++;if(mode==='quota')return response({error:{message:token}},429,{'Retry-After':'30'});if(mode==='offline')throw Error('secret native path');if(mode==='malformed')return new Response('not json');return new Response('x'.repeat(200001));}});
  await assert.rejects(service.ask({prompt:'Pregunta'}),{code:'QUOTA'});assert.equal(service.status().retryAt,30100);await assert.rejects(service.ask({prompt:'Pregunta'}),{code:'QUOTA'});assert.equal(calls,1);service.disconnect();
  for(const failure of ['offline','malformed','big']){mode=failure;const {service:s}=await connected({fetchImpl:async(url)=>url.endsWith('/auth/keys')?response({key:token}):failure==='offline'?Promise.reject(Error('secret native path')):failure==='malformed'?new Response('not json'):new Response('x'.repeat(200001))});await assert.rejects(s.ask({prompt:'Pregunta'}),e=>['UNAVAILABLE','CORRUPT','QUOTA'].includes(e.code)&&!e.message.includes('secret'));s.close();}
});
test('Cancellation discards even a response from a fetch implementation that ignores abort',async()=>{
  let release;const {service}=await connected({fetchImpl:async url=>url.endsWith('/auth/keys')?response({key:token}):new Promise(r=>{release=r;})});
  const pending=service.ask({prompt:'Pregunta'});await assert.rejects(service.ask({prompt:'Segunda'}),{code:'CONFLICT'});service.cancel();release(response({choices:[{message:{content:'Respuesta tardía'}}]}));await assert.rejects(pending,{code:'CANCELLED'});service.close();
});
function fixture(options={}){
  let epoch=0,locked=false,permit=true,revision='a'.repeat(64),sent,opened,shared,copied,report;
  const calls=[],catalog=()=>({modules:[{id:'fixture-bible',tipo:'biblia',titulo:'Biblia inventada',sha256:revision,iaPermitida:permit,licencia:'CC0',atribucion:'Autor de fixture',origen:'https://fixture.invalid/original'},{id:'fixture-comment',tipo:'comentario',titulo:'Comentario inventado',sha256:'b'.repeat(64),iaPermitida:false}]});
  const call=async(name,input)=>{calls.push({name,input});switch(name){case 'privacyStatus':return {locked};case 'catalog':return catalog();case 'metadata':return Array.from({length:66},()=>({name:'Libro inventado',chapters:Array(50).fill(30)}));case 'chapter':return {module:input.module,title:'Biblia inventada',revision,verses:[{verse:16,text:'Pasaje original local',strong:['G25']}]};case 'comments':return {revision:'b'.repeat(64),entries:[]};case 'dictionary':return {entries:[{title:'G25',text:'Definición inventada'}]};case 'aiTextCopy':copied=input;return true;case 'shareText':shared=input;return {shared:true};default:throw Error('Unexpected read '+name);}};
  const service=services.create({call,epoch:()=>epoch,openExternal:async url=>{opened=url;},reporter:options.reporter?async r=>{report=r;return options.reporter(r);}:undefined,fetchImpl:async(url,input)=>{if(url.endsWith('/auth/keys'))return response({key:token});sent=JSON.parse(input.body);return options.answer?options.answer(url,input):response({choices:[{message:{content:JSON.stringify({text:'Observación generada',sections:{brief:'En breve',living:'Acción no solicitada'},keywords:[{code:'G25',label:'palabra'},{code:'G999',label:'inventada'}],citations:[{book:42,chapter:3,verse:16,text:'CITA INVENTADA POR IA'}]})}}]});}});
  return {service,calls,connect:async()=>{await service.handlers().aiConnect();await service.handlers().aiConnect({code:'fixture-code'});},input:{module:'fixture-bible',book:42,chapter:3,verse:16,task:'explain',question:'Qué observar',study:true,includeBible:true,includeComment:false},get:()=>({sent,opened,shared,copied,report}),change:()=>epoch++,lock:()=>{locked=true;},deny:()=>{permit=false;},revise:()=>{revision='c'.repeat(64);}};
}
test('Selected licensed context carries attribution and no private state, even if extra private fields are provided',async()=>{
  const f=fixture(),p=await f.service.handlers().aiPrepare({...f.input,notes:'NO ENVIAR NOTA',prayers:'NO ENVIAR ORACIÓN',includeComment:true,comment:'fixture-comment'});
  assert.equal(p.sources.length,1);assert.match(p.prompt,/CC0/);assert.match(p.prompt,/Autor de fixture/);assert.doesNotMatch(p.prompt,/NO ENVIAR|Comentario inventado/);assert.equal(p.notices.length,1);assert.ok(!f.calls.some(c=>['bootstrap','exportBackup'].includes(c.name)));
  const noSource=await f.service.handlers().aiPrepare({...f.input,includeBible:false});assert.equal(noSource.sources.length,0);assert.doesNotMatch(noSource.prompt,/Pasaje original/);f.service.close();
});
test('Send uses prepared immutable prompt; answer C resolves local citations and only verified original words',async()=>{
  const f=fixture();await f.connect();const api=f.service.handlers(),p=await api.aiPrepare(f.input);p.prompt='ALTERED BY RENDERER';p.sources[0].text='ALTERED SOURCE';
  const result=await api.aiAsk({id:p.id,prompt:'UNPREPARED PRIVATE TEXT'});assert.doesNotMatch(f.get().sent.messages[1].content,/ALTERED|UNPREPARED/);assert.equal(result.citations[0].text,'Pasaje original local');assert.deepEqual(result.keywords,[{code:'G25',label:'palabra'}]);assert.equal(result.living,undefined);assert.equal(Object.keys(result.sections).length,6);
  assert.equal(result.sources[0].text.includes('ALTERED SOURCE'),false);await assert.rejects(api.aiAsk({id:p.id,provider:'codex'}),{code:'UNAVAILABLE'});f.service.close();await assert.rejects(async()=>api.aiConnect(),{code:'UNAVAILABLE'});
});
for(const change of ['deny','revise','change','lock'])test('Changed '+change+' invalidates prepared context before any network send',async()=>{
  const f=fixture();await f.connect();const api=f.service.handlers(),p=await api.aiPrepare(f.input);f[change]();await assert.rejects(api.aiAsk({id:p.id}),e=>['LOCKED','CONFLICT'].includes(e.code));assert.equal(f.get().sent,undefined);f.service.close();
});
test('Lock or generation change while a response is in flight prevents releasing it',async()=>{
  let release;const f=fixture({answer:()=>new Promise(r=>{release=r;})});await f.connect();const api=f.service.handlers(),p=await api.aiPrepare(f.input),pending=api.aiAsk({id:p.id});
  while(!release)await new Promise(r=>setImmediate(r));f.change();release(response({choices:[{message:{content:JSON.stringify({text:'Respuesta tardía',citations:[]})}}]}));await assert.rejects(pending,{code:'CONFLICT'});f.service.close();
});
test('Copy/open and share use selected prepared text, no question in URL; invalid providers fail before clipboard',async()=>{
  const f=fixture(),api=f.service.handlers(),p=await api.aiPrepare(f.input);await assert.rejects(api.aiCopy({id:p.id,provider:'javascript:alert(1)'}),{code:'VALIDATION'});assert.equal(f.get().copied,undefined);
  assert.deepEqual(await api.aiCopy({id:p.id,provider:'claude'}),{copied:true,opened:true});assert.equal(f.get().opened,'https://claude.ai/new');assert.equal(f.get().copied,p.prompt);assert.deepEqual(await api.aiShare({id:p.id}),{shared:true});assert.equal(f.get().shared.text,p.prompt);
  f.lock();await assert.rejects(api.aiShare({id:p.id}),{code:'LOCKED'});f.service.close();
});
test('Reports require a preview/confirmation, never claim sent without a developer acknowledgement or include prompt/private fields',async()=>{
  const plain=fixture(),input={text:'Respuesta elegida',reason:'incorrecta',confirmed:true,notes:'NO ENVIAR',prompt:'NO ENVIAR'};
  const draft=await plain.service.handlers().aiReport(input);assert.equal(draft.sent,false);assert.equal(draft.status,'sin-canal');assert.doesNotMatch(JSON.stringify(draft.report),/NO ENVIAR/);
  const f=fixture({reporter:async()=>({accepted:true})}),result=await f.service.handlers().aiReport(input);assert.equal(result.sent,true);assert.equal(f.get().report.text,input.text);assert.doesNotMatch(JSON.stringify(f.get().report),/NO ENVIAR/);
  await assert.rejects(f.service.handlers().aiReport({...input,confirmed:false}),{code:'VALIDATION'});const refused=fixture({reporter:async()=>({accepted:false})});await assert.rejects(refused.service.handlers().aiReport(input),{code:'UNAVAILABLE'});plain.service.close();f.service.close();refused.service.close();
});
test('Mobile extensions retain all Windows preload operation names and advertise only actual report transport in status',async()=>{
  const f=fixture(),adapter=contract.createBridge({handlers:f.service.handlers(),events:['onAiState']});assert.equal((await adapter.bridge.getCapabilities()).operations.aiQuota.available,true);assert.equal(f.service.status().reporting,'not-configured');assert.equal(contract.preloadNames.length,70);f.service.close();
});
