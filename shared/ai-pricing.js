(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('../platform/bridge-contract.js'));else root.LibraryAiPricing=factory(root.LibraryBridgeContract);})(typeof globalThis!=='undefined'?globalThis:this,function(contract){
  'use strict';
  const fail=(code,message)=>{throw new contract.BridgeError(code,message);};
  const price=v=>typeof v==='string'||typeof v==='number'?Number(v):NaN;
  function catalog(data,now=Date.now()){
    const rows=[];
    for(const m of Array.isArray(data)?data:[]){
      if(!/^[-a-zA-Z0-9_./:]{1,200}$/.test(m?.id)||!m.pricing)continue;
      const p=price(m.pricing.prompt),c=price(m.pricing.completion);
      if(!Number.isFinite(p)||!Number.isFinite(c)||p<0||c<0)continue;
      const free=m.id.endsWith(':free')&&Object.values(m.pricing).every(v=>v===null||price(v)===0);
      const paid=!free&&/^(openai|anthropic)\//.test(m.id)&&(p>0||c>0)&&m.architecture?.output_modalities?.length===1&&m.architecture.output_modalities[0]==='text'&&Object.entries(m.pricing).every(([k,v])=>['prompt','completion','input_cache_read','input_cache_write'].includes(k)||v===null||price(v)===0);
      if(!free&&!paid)continue;
      rows.push({id:m.id,name:String(m.name||m.id).slice(0,150)+(paid?' · vía OpenRouter':''),paid,via:'openrouter',pricing:{currency:'USD',prompt:p,completion:c,inputPerMillion:p*1e6,outputPerMillion:c*1e6,checkedAt:now},contextLength:m.context_length,maxOutputTokens:m.top_provider?.max_completion_tokens});
    }
    rows.sort((a,b)=>Number(a.paid)-Number(b.paid)||(a.paid?a.pricing.completion-b.pricing.completion:Number(/^(qwen|deepseek)\//.test(b.id))-Number(/^(qwen|deepseek)\//.test(a.id))));
    return [...rows.slice(0,200),{id:'openrouter/free',name:'Selección gratuita automática',paid:false,via:'openrouter',pricing:{currency:'USD',prompt:0,completion:0,inputPerMillion:0,outputPerMillion:0,checkedAt:now}}];
  }
  function authorize({models,model,prompt,instruction='',maxTokens,paid,now=Date.now()}){
    const m=models.find(m=>m.id===model);if(!m)fail('VALIDATION','Actualiza los modelos y elige uno de la lista.');
    if(!m.paid&&!model.endsWith(':free')&&model!=='openrouter/free')fail('VALIDATION','Este modelo no declara un precio verificable.');
    if(!m.paid)return {provider:{max_price:{prompt:0,completion:0},allow_fallbacks:false},maxTokens,estimatedCostUsd:0,estimated:true};
    if(!paid||paid.confirmed!==true||typeof paid.maxCostUsd!=='number'||!Number.isFinite(paid.maxCostUsd)||paid.maxCostUsd<=0||paid.maxCostUsd>1)fail('VALIDATION','Confirma el modelo de pago y un límite de hasta US$1 para esta consulta.');
    if(now-m.pricing.checkedAt>15*60*1000)fail('CONFLICT','El precio venció. Actualiza los modelos antes de confirmar.');
    const limit=Math.min(maxTokens,Number.isSafeInteger(m.maxOutputTokens)&&m.maxOutputTokens>0?m.maxOutputTokens:maxTokens);
    // Conservative byte estimate, including framing; this is not a provider-side spending cap.
    const bytes=new TextEncoder().encode(prompt+instruction).length+1024;
    const estimatedCostUsd=bytes*m.pricing.prompt+limit*m.pricing.completion;
    if(estimatedCostUsd>paid.maxCostUsd)fail('QUOTA','La estimación supera el límite confirmado. Reduce el contexto o elige otro modelo.');
    return {provider:{max_price:{prompt:m.pricing.inputPerMillion,completion:m.pricing.outputPerMillion},allow_fallbacks:false,require_parameters:true},maxTokens:limit,estimatedCostUsd,estimated:true,notice:'Estimación conservadora por consulta; para un tope real de cuenta configura el límite de tu clave en OpenRouter. No incluye la comisión de recarga.'};
  }
  return Object.freeze({catalog,authorize});
});
