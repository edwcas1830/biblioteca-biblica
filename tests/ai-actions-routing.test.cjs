'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const actions=require('../shared/study-actions.js'),or=require('../platform/ai/openrouter.js'),gemini=require('../platform/ai/gemini.js'),{AiService}=require('../lib/ai-service.cjs'),{PersonalAi}=require('../lib/personal-ai.cjs'),mobile=require('../platform/ai/service.js');
const vault={leer:async n=>n==='gemini'?'AQ.'+'x'.repeat(50):'sk-or-'+'x'.repeat(40),guardar:async()=>{},borrar:async()=>{}};
const answer={brief:'Síntesis [1]',texto:'Observación [1]',interpretacion:'Lectura prudente',conexiones:'Relación [1]',fuentes:[{sourceId:1,extracto:'INVENTADO'}],seguimientos:['Primera','Segunda','Tercera']};
const input={action:'exegesis',book:42,chapter:3,verse:16,module:'rv1909'};
const context={...input,reference:'Juan 3:16',sources:[{sourceId:1,kind:'bible',module:'rv1909',title:'Fixture',text:'Texto local',book:42,chapter:3,verse:16,endVerse:16}]};
const prompt=actions.prepare(input,context).prompt;
function browser(){
  const root=path.join(__dirname,'..'),box={crypto:globalThis.crypto,TextEncoder,TextDecoder,AbortController,AbortSignal,URL,URLSearchParams,setTimeout,clearTimeout,structuredClone,btoa};box.window=box;
  vm.createContext(box);for(const file of ['platform/bridge-contract.js','app/ai-core.js','app/study-chat-core.js','shared/study-actions.js','shared/ai-image.js','shared/ai-pricing.js','shared/ai-citations.js','platform/ai/credentials.js','platform/ai/openrouter.js','platform/ai/gemini.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),box,{filename:file});return box;
}
for(const kind of ['Android OpenRouter','Android Gemini','Browser OpenRouter','Browser Gemini','Windows OpenRouter','Windows Gemini'])test(kind+': action tiene prioridad sobre study e instrucción antigua, sin mezclar esquemas',async()=>{
  let sent;const fetchImpl=async(url,options)=>{
    if(url.includes('/models?'))return Response.json({models:[{name:'models/gemini-flash-latest',supportedGenerationMethods:['generateContent']}]});
    sent=JSON.parse(options.body);const content=JSON.stringify(answer);
    return url.includes(':generateContent')?Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:content}]}}]}):Response.json({choices:[{message:{content}}]});
  };
  let api,r;const request={prompt,study:true,action:'exegesis',instruction:'ESQUEMA VIEJO NO USAR',model:'openrouter/free'};
  if(kind.includes('Gemini'))request.model='gemini-flash-latest';
  if(kind.startsWith('Android')||kind.startsWith('Browser')){
    const b=kind.startsWith('Browser')?browser():null,factory=kind.includes('Gemini')?(b?.LibraryGemini||gemini):(b?.LibraryOpenRouter||or);
    api=factory.create({fetchImpl,credentialStore:vault,books:()=>{throw Error('Las acciones no usan el parser de citas antiguas');}});await api.ready;r=await api.ask(request);
  }else if(kind==='Windows OpenRouter'){api=new AiService({root:'.',fetchImpl});api.key=()=> 'sk-or-'+'x'.repeat(40);r=await api.ask(request);
  }else{api=new PersonalAi({root:'.',policy:async()=>({available:true,default:true}),fetchImpl});api.key=()=> 'AQ.'+'x'.repeat(50);r=await api.ask({...request,provider:'gemini-api'});}
  const system=sent.systemInstruction?.parts[0].text||sent.messages[0].content;
  assert.match(system,/"interpretacion"/);assert.doesNotMatch(system,/sections|citations|ESQUEMA VIEJO|Usa los seis apartados/);
  const result=actions.result(r,context);assert.equal(result.texto,'Observación [1]');assert.equal(result.fuentes[0].extracto,'Texto local');assert.equal(result.seguimientos.length,3);assert.doesNotMatch(JSON.stringify(result),/INVENTADO/);
  if(api.close)await api.close();
});
test('Una acción no acepta silenciosamente una respuesta con el esquema viejo',()=>{
  assert.throws(()=>actions.result({text:'Resumen',sections:{brief:'Viejo'},citations:[]},context),{code:'CORRUPT'});
  assert.throws(()=>actions.system('inventada',undefined,'viejo'),{code:'VALIDATION'});
});
test('Ruta móvil completa usa los recursos públicos reales para paralelos/contexto sin comentario y normaliza fuentes',async()=>{
  const box={window:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../app/bible-data.js'),'utf8'),box);
  const reader=require('../platform/web/library.js').create({bible:box.window.BIBLE,manifest:require('../app/data/rv1909-manifest.json'),resources:require('../platform/web/resources.js').create({baseUrl:'https://fixture.local/data/',fetch:async url=>new Response(await fs.promises.readFile(path.join(__dirname,'../app/data',new URL(url).pathname.slice(6))))})});
  let sent;const service=mobile.create({credentialStore:vault,call:async(name,value)=>name==='privacyStatus'?{locked:false}:reader[name](value),fetchImpl:async(url,options)=>{sent=JSON.parse(options.body);return Response.json({choices:[{message:{content:JSON.stringify(answer)}}]});}}),api=service.handlers();
  const study=await api.aiPrepare({...input,action:'paralelos'});
  assert.equal(study.action,'paralelos');assert.ok(study.sources.some(s=>s.module==='openbible-crossrefs'));assert.ok(study.sources.some(s=>s.parallel&&s.text));assert.ok(study.sources.some(s=>s.kind==='bible'&&s.verse===14));
  assert.doesNotMatch(study.prompt,/sections|citations/);
  const result=await api.aiAsk({id:study.id,action:'paralelos'});assert.match(sent.messages[0].content,/"interpretacion"/);assert.doesNotMatch(sent.messages[0].content,/sections|citations/);assert.equal(result.action,'paralelos');assert.ok(result.fuentes[0].extracto.includes('Dios'));assert.equal(result.seguimientos.length,3);
  const historical=await api.aiPrepare({...input,action:'contexto'});assert.ok(historical.sources.some(s=>s.module==='atlas'));assert.ok(historical.sources.some(s=>s.module==='bibledata'));
  await api.aiAsk({id:historical.id});await service.close();
});
