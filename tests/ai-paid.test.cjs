'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const pricing=require('../shared/ai-pricing.js'),or=require('../platform/ai/openrouter.js');
const models=[{id:'openai/fixture',name:'OpenAI',architecture:{output_modalities:['text']},pricing:{prompt:'0.0000001',completion:'0.0000005',request:'0'},top_provider:{max_completion_tokens:4000}},{id:'anthropic/fixture',name:'Claude',architecture:{output_modalities:['text']},pricing:{prompt:'0.0000002',completion:'0.000001'}},{id:'qwen/free:free',pricing:{prompt:'0',completion:'0'}},{id:'openai/hidden-charge',architecture:{output_modalities:['text']},pricing:{prompt:'0.1',completion:'0.1',request:'1'}}];
test('Catálogo trae precios actuales, etiqueta vía OpenRouter y excluye costos no presupuestables',()=>{
  const rows=pricing.catalog(models,100);assert.equal(rows.length,4);assert.ok(rows.filter(r=>r.paid).every(r=>r.name.includes('vía OpenRouter')));assert.equal(rows.find(r=>r.id==='openai/fixture').pricing.inputPerMillion,0.1);assert.ok(!rows.some(r=>r.id.includes('hidden')));
});
test('Modelo pago requiere permiso explícito, presupuesto suficiente y precio vigente; gratis nunca permite precio positivo',()=>{
  const base={models:pricing.catalog(models,100),model:'openai/fixture',prompt:'Texto',maxTokens:4000,now:100};
  assert.throws(()=>pricing.authorize(base),{code:'VALIDATION'});assert.throws(()=>pricing.authorize({...base,paid:{confirmed:true,maxCostUsd:0.0001}}),{code:'QUOTA'});assert.throws(()=>pricing.authorize({...base,now:100+16*60000,paid:{confirmed:true,maxCostUsd:0.05}}),{code:'CONFLICT'});
  const allowed=pricing.authorize({...base,paid:{confirmed:true,maxCostUsd:0.01}});assert.equal(allowed.provider.allow_fallbacks,false);assert.equal(allowed.provider.max_price.prompt,0.1);assert.equal(allowed.maxTokens,4000);
  assert.deepEqual(pricing.authorize({...base,model:'qwen/free:free'}).provider.max_price,{prompt:0,completion:0});
});
test('Android consulta pago solo tras autorización, no reintenta/fallback, y transmite límites y estimación',async()=>{
  let calls=0,sent;const api=or.create({fetchImpl:async(url,input)=>{if(url.endsWith('/auth/keys'))return Response.json({key:'sk-or-'+ 'x'.repeat(40)});if(url.endsWith('/models'))return Response.json({data:models});calls++;sent=JSON.parse(input.body);return Response.json({model:'openai/fixture',choices:[{message:{content:JSON.stringify({brief:'Resumen',texto:'Observación',fuentes:[],seguimientos:[]})}}]});}});
  await api.connect();await api.connect({code:'fixture'});await api.listModels();await assert.rejects(api.ask({model:'openai/fixture',prompt:'Contexto',action:'exegesis'}),{code:'VALIDATION'});assert.equal(calls,0);
  const r=await api.ask({model:'openai/fixture',prompt:'Contexto',action:'exegesis',paid:{confirmed:true,maxCostUsd:0.02}});assert.equal(calls,1);assert.ok(r.estimatedCostUsd>0);assert.equal(sent.provider.data_collection,'deny');assert.equal(sent.provider.allow_fallbacks,false);assert.match(sent.messages[0].content,/interpretacion/);assert.equal(r.texto,'Observación');await api.close();
});

test('Windows aplica el mismo permiso y límite, sin revelar la clave',async()=>{
const {AiService}=require('../lib/ai-service.cjs');let sent,count=0;const api=new AiService({root:'.',safeStorage:{isEncryptionAvailable:()=>true},fetchImpl:async(url,input)=>{if(url.endsWith('/models'))return Response.json({data:models});count++;sent=JSON.parse(input.body);return Response.json({choices:[{message:{content:JSON.stringify({text:'Respuesta'})}}]});}});api.key=()=> 'sk-or-'+ 'x'.repeat(40);await api.listModels();await assert.rejects(api.ask({prompt:'Fuente',model:'anthropic/fixture'}),{code:'VALIDATION'});assert.equal(count,0);const result=await api.ask({prompt:'Fuente',model:'anthropic/fixture',paid:{confirmed:true,maxCostUsd:0.02}});assert.equal(count,1);assert.ok(result.estimatedCostUsd>0);assert.equal(sent.provider.max_price.completion,1);assert.equal(sent.provider.allow_fallbacks,false);
});
