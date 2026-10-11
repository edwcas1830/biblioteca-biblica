'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const images=require('../shared/ai-image.js'),contract=require('../platform/bridge-contract.js'),or=require('../platform/ai/openrouter.js'),gemini=require('../platform/ai/gemini.js'),{AiService}=require('../lib/ai-service.cjs'),{PersonalAi}=require('../lib/personal-ai.cjs');
const prompt='Una montaña iluminada, óleo y espacio tranquilo',input={prompt,aspect:'4:5'},png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGM4saXnPwAHWAMILdCQ7AAAAABJRU5ErkJggg==';
const models={economica:{gemini:'gemini-3.1-flash-lite-image',openrouter:'google/gemini-3.1-flash-lite-image'},alta:{gemini:'gemini-nano-banana-2.1',openrouter:'google/gemini-nano-banana-2.1'}};
const vault={leer:async n=>n==='gemini'?'AQ.'+'x'.repeat(50):'sk-or-'+'x'.repeat(40),guardar:async()=>{},borrar:async()=>{}};
async function provider(kind,fetchImpl){
  let api;if(kind==='Android Gemini')api=gemini.create({credentialStore:vault,fetchImpl});
  if(kind==='Android OpenRouter')api=or.create({credentialStore:vault,fetchImpl});
  if(kind==='Windows Gemini'){api=new PersonalAi({root:'.',policy:async()=>({available:true,default:true}),fetchImpl});api.key=()=> 'AQ.'+'x'.repeat(50);}
  if(kind==='Windows OpenRouter'){api=new AiService({root:'.',fetchImpl});api.key=()=> 'sk-or-'+'x'.repeat(40);}
  await api.ready;return api;
}
function response(kind,model){return kind.includes('Gemini')?Response.json({candidates:[{finishReason:'STOP',content:{parts:[{inlineData:{mimeType:'image/png',data:png}}]}}]}):Response.json({model,choices:[{finish_reason:'stop',message:{images:[{image_url:{url:'data:image/png;base64,'+png}}]}}]});}
for(const kind of ['Android Gemini','Android OpenRouter','Windows Gemini','Windows OpenRouter']){
  test(kind+': Económica por defecto y Alta explícita seleccionan un modelo único, 1K y presupuesto de imagen correcto',async()=>{
    const requests=[],api=await provider(kind,async(url,options)=>{const body=JSON.parse(options.body);requests.push({url,body});return response(kind,body.model);});
    try{for(const calidad of [undefined,'economica','alta']){
      const r=await api.image({...input,...(calidad?{calidad}:{}),provider:kind.includes('Gemini')?'gemini-api':'openrouter'}),q=calidad||'economica',sent=requests.at(-1);
      assert.equal(r.calidad,q);assert.equal(r.estimatedCostUsd,0.0336);assert.equal(r.costEstimate.imageTokens,1120);assert.equal(r.costEstimate.imageOutputPerMillionUsd,30);assert.equal(r.costEstimate.approximate,true);
      assert.equal(r.costEstimate.textOutputPerMillionUsd,q==='economica'?1.5:7.5);assert.match(r.costEstimate.notice,/No es el cargo real/);
      if(kind.includes('Gemini')){assert.equal(sent.url,'https://generativelanguage.googleapis.com/v1beta/models/'+models[q].gemini+':generateContent');assert.equal(sent.body.generationConfig.imageConfig.imageSize,'1K');assert.equal(r.model,'gemini · '+models[q].gemini);}
      else{assert.equal(sent.body.model,models[q].openrouter);assert.equal(sent.body.provider.allow_fallbacks,false);assert.equal(sent.body.image_config.image_size,'1K');assert.equal(r.model,models[q].openrouter);}
    }assert.equal(requests.length,3);}finally{if(api.close)await api.close();}
  });
  test(kind+': 404/cuota rechazan una vez sin probar la otra calidad, y calidad inválida no consulta',async()=>{
    let calls=0,status=404;const api=await provider(kind,async()=>{calls++;return new Response('PRIVATE KEY ERROR',{status});});
    try{await assert.rejects(api.image({...input,calidad:'automatica'}),{code:'VALIDATION'});assert.equal(calls,0);
      for(const calidad of ['economica','alta']){const before=calls;await assert.rejects(api.image({...input,calidad}),e=>e.code==='UNAVAILABLE'&&!e.message.includes('PRIVATE'));assert.equal(calls-before,1);}
      status=429;const before=calls;await assert.rejects(api.image(input),{code:'QUOTA'});assert.equal(calls-before,1);
    }finally{if(api.close)await api.close();}
  });
}
test('Contrato aditivo admite solo las dos calidades y conserva llamadas antiguas sin calidad',async()=>{
  const bridge=contract.createBridge({handlers:{aiImage:v=>images.validate(v)}}).bridge;
  assert.equal((await bridge.aiImage(input)).calidad,'economica');assert.equal((await bridge.aiImage({...input,calidad:'alta'})).calidad,'alta');
  for(const calidad of ['',null,{},'barata'])await assert.rejects(bridge.aiImage({...input,calidad}),{code:'VALIDATION',operation:'aiImage'});
});
test('Estimación calcula tokens de imagen por tarifa de imagen, nunca la tarifa textual de Flash Lite',()=>{
  for(const calidad of ['economica','alta']){const r=images.estimate(calidad);assert.equal(r.estimatedCostUsd,1120*30/1e6);assert.notEqual(r.estimatedCostUsd,1120*1.5/1e6);assert.equal(r.costEstimate.resolution,'1K');}
  assert.throws(()=>images.estimate('inventada'),{code:'VALIDATION'});assert.throws(()=>images.modelFor('alta','otra'),{code:'VALIDATION'});
});
test('Resultado de OpenRouter acepta JPEG integrado acotado y rechaza otro modelo, sin aceptar URL externa',()=>{
  // Structural JPEG fixture with SOF dimensions, SOS and EOI; no private/media files.
  const jpeg=Buffer.alloc(128);jpeg.set([255,216,255,192,0,17,8,0,1,0,1],0);jpeg.set([255,218,0,2],21);jpeg.set([255,217],126);
  const url='data:image/jpeg;base64,'+jpeg.toString('base64'),value={model:models.economica.openrouter,choices:[{finish_reason:'stop',message:{images:[{image_url:{url}}]}}]};
  assert.equal(images.result(value).dataUrl,url);assert.throws(()=>images.result(value,'alta'),{code:'CORRUPT'});
  assert.throws(()=>images.geminiResult({},models.alta.gemini,'economica'),{code:'CORRUPT'});
});
