'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const prompts=require('../shared/ai-image-prompts.js'),images=require('../shared/ai-image.js'),mobile=require('../platform/ai/service.js'),gemini=require('../platform/ai/gemini.js'),{PersonalAi}=require('../lib/personal-ai.cjs');
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGM4saXnPwAHWAMILdCQ7AAAAABJRU5ErkJggg==';
const imageReply=()=>Response.json({candidates:[{finishReason:'STOP',content:{parts:[{inlineData:{mimeType:'image/png',data:png}}]}}]});
function vault(delay=0){return {leer:async name=>{if(delay)await new Promise(r=>setTimeout(r,delay));return name==='gemini'?'AQ.'+'x'.repeat(50):'sk-or-'+'x'.repeat(40);},guardar:async()=>{},borrar:async()=>{}};}
test('Ideas y mejora requieren datos limitados, solo símbolos y no generan una imagen',()=>{
  const req=prompts.request({ref:'Juan 3:16',texto:'Texto elegido',estilo:'acuarela',notes:'PRIVADO'},'ideas');assert.match(req.instruction,/sin representar a Dios/);assert.doesNotMatch(req.prompt,/PRIVADO/);
  const r=prompts.result({ideas:[{prompt:'Una semilla iluminada'},{prompt:'Un puente de luz'},{prompt:'Un círculo dorado'}]},'ideas');assert.equal(r.length,3);assert.deepEqual(r.map(i=>i.titulo),['Escena','Metáfora','Minimalista']);assert.ok(r.every(i=>i.prompt.length<=600&&i.prompt.includes('Sin texto')));assert.throws(()=>prompts.result({ideas:[{prompt:'Una idea'}]},'ideas'),{code:'CORRUPT'});assert.throws(()=>prompts.request({idea:'x'.repeat(601)},'prompt'),{code:'VALIDATION'});
});
test('Servicio móvil usa proveedor activo para texto, no llama imagen ni envía contexto privado',async()=>{
  const requests=[],service=mobile.create({credentialStore:vault(),call:async(name)=>{if(name==='privacyStatus')return {locked:false};if(name==='catalog')return {modules:[{personalDefault:true}]};throw Error('No debe leer '+name);},fetchImpl:async(url,input)=>{requests.push({url,input});if(url.includes('/models?'))return Response.json({models:[{name:'models/gemini-flash-lite-latest',supportedGenerationMethods:['generateContent']}]});if(url.includes(':generateContent'))return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({ideas:[{prompt:'Montaña'},{prompt:'Luz'},{prompt:'Semilla'}]})}]}}]});return Response.json({choices:[{message:{content:JSON.stringify({prompt:'Un amanecer sereno'})}}]});}});
  const ideas=await service.handlers().aiImageIdeas({ref:{book:42,chapter:3,verse:16},texto:'Texto elegido',provider:'gemini-api'});assert.equal(ideas.length,3);assert.equal(requests.filter(r=>r.url.includes(':generateContent')).length,1);assert.ok(requests.every(r=>!r.input?.body?.includes('responseModalities')));
  const improved=await service.handlers().aiImagePrompt({idea:'Luz',provider:'openrouter'});assert.match(improved.prompt,/amanecer/);assert.equal(requests.at(-1).url,'https://openrouter.ai/api/v1/chat/completions');assert.equal(JSON.parse(requests.at(-1).input.body).model,'openrouter/free');await service.close();
});

test('Gemini y OpenRouter conservan tildes y ñ en la idea enviada y el prompt devuelto, sin convertir a ASCII',async()=>{
  const idea='León sobre una montaña, fotografía al óleo; pequeño río y luz cálida',requests=[];
  const service=mobile.create({credentialStore:vault(),call:async name=>{if(name==='privacyStatus')return {locked:false};if(name==='catalog')return {modules:[{personalDefault:true}]};throw Error('No debe leer '+name);},fetchImpl:async(url,input)=>{
    if(url.includes('/models?'))return Response.json({models:[{name:'models/gemini-flash-latest',supportedGenerationMethods:['generateContent']}]});
    const sent=JSON.parse(input.body),system=sent.systemInstruction?.parts[0].text||sent.messages[0].content,question=sent.contents?.[0].parts[0].text||sent.messages[1].content;
    assert.match(system,/conservando tildes, diéresis y ñ/);assert.equal(JSON.parse(question).idea,idea);requests.push(url);
    const text=JSON.stringify({prompt:idea});return url.includes(':generateContent')?Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text}]}}]}):Response.json({choices:[{message:{content:text}}]});
  }});
  try{for(const provider of ['gemini-api','openrouter']){
    const r=await service.handlers().aiImagePrompt({idea,provider});assert.ok(r.prompt.startsWith(idea+'. '));assert.ok(r.prompt.length<=600);
  }assert.equal(requests.length,2);}finally{await service.close();}
});
test('Imagen espera el llavero al iniciar; un error de catálogo no deja ocupado el servicio',async()=>{
  let catalogFails=true;const urls=[],service=mobile.create({credentialStore:vault(10),call:async name=>{if(name==='privacyStatus')return {locked:false};if(name==='catalog'){if(catalogFails)throw Error('Fallo local');return {modules:[{personalDefault:true}]};}throw Error(name);},fetchImpl:async url=>{urls.push(url);return imageReply();}});
  await assert.rejects(service.handlers().aiImage({prompt:'Montaña',aspect:'4:5'}));catalogFails=false;
  const r=await service.handlers().aiImage({prompt:'Montaña',aspect:'4:5'});assert.match(urls[0],/generativelanguage/);assert.equal(r.estimatedCostUsd,0.0336);await service.close();
});
for(const kind of ['Android','Windows'])test(kind+': Gemini descarta imágenes tardías y limita el cuerpo antes de leerlo completo',async()=>{
  let release;const fetchImpl=async()=>new Promise(r=>{release=r;});let api;
  if(kind==='Android'){api=gemini.create({credentialStore:vault(),fetchImpl});await api.ready;}else{api=new PersonalAi({root:'.',policy:async()=>({default:true,available:true}),fetchImpl});api.key=()=> 'AQ.'+'x'.repeat(50);}
  const pending=api.image({prompt:'Montaña',aspect:'4:5'});while(!release)await new Promise(r=>setTimeout(r,1));kind==='Android'?api.cancel():api.stop();release(imageReply());await assert.rejects(pending,{code:'CANCELLED'});
  let cancelled=false,reads=0;const huge=()=>new Response(new ReadableStream({pull(c){reads++;c.enqueue(new Uint8Array(1024*1024));},cancel(){cancelled=true;}}));
  if(kind==='Android'){await api.close();api=gemini.create({credentialStore:vault(),fetchImpl:async()=>huge()});await api.ready;}else api.fetch=async()=>huge();
  await assert.rejects(api.image({prompt:'Montaña',aspect:'4:5'}),{code:'QUOTA'});assert.equal(cancelled,true);assert.ok(reads<=11);if(kind==='Android')await api.close();
});
test('Gemini rechaza JPEG sin dimensiones y bombas de píxeles, pensamiento y salida truncada',()=>{
  const value=raw=>({candidates:[{finishReason:'STOP',content:{parts:[{inlineData:{mimeType:'image/jpeg',data:raw.toString('base64')}}]}}]});
  const bytes=Buffer.alloc(128);bytes.set([255,216,255,192,0,17,8,255,255,255,255],0);bytes.set([255,217],126);assert.throws(()=>images.geminiResult(value(bytes),'fixture'),{code:'QUOTA'});
  const noSof=Buffer.alloc(128);noSof.set([255,216,255,224,0,2],0);noSof.set([255,217],126);assert.throws(()=>images.geminiResult(value(noSof),'fixture'),{code:'CORRUPT'});
  const thought={candidates:[{finishReason:'STOP',content:{parts:[{thought:true,inlineData:{mimeType:'image/png',data:png}}]}}]};assert.throws(()=>images.geminiResult(thought,'fixture'),{code:'UNAVAILABLE'});thought.candidates[0].finishReason='MAX_TOKENS';assert.throws(()=>images.geminiResult(thought,'fixture'),{code:'UNAVAILABLE'});
});
