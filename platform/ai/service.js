(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('../bridge-contract.js'),require('../../shared/ai-context.js'),require('./openrouter.js'),require('../../app/ai-core.js'),require('../../app/study-chat-core.js'));
  else root.LibraryMobileAi=factory(root.LibraryBridgeContract,root.LibraryAiContext,root.LibraryOpenRouter,root.AiCore,root.StudyChatCore);
})(typeof globalThis!=='undefined'?globalThis:this,function(contract,contexts,providers,core,chat){
  'use strict';
  const fail=(code,message)=>{throw new contract.BridgeError(code,message);};
  function create({call,emit=()=>{},epoch=()=>0,crypto=globalThis.crypto,fetchImpl,now=()=>Date.now(),openExternal,reporter}={}){
    const reporting=reporter?'developer-channel':'not-configured',context=contexts.create({call}),prepared=new Map(),provider=providers.create({fetchImpl,crypto,now,notify:s=>emit('onAiState',{...s,reporting})});let closed=false,busy=false,generation=0;
    const id=()=>Array.from(crypto.getRandomValues(new Uint8Array(24)),n=>n.toString(16).padStart(2,'0')).join('');
    async function guard(expected){
      if(closed)fail('UNAVAILABLE','La sesión de IA está cerrada.');
      if(expected!==undefined&&expected!==epoch())fail('CONFLICT','La sesión de tu biblioteca cambió. Prepara otra vez la pregunta.');
      if((await call('privacyStatus')).locked)fail('LOCKED','Abre tu cuaderno antes de consultar o compartir tu estudio.');
      if(expected!==undefined&&expected!==epoch())fail('CONFLICT','La sesión de tu biblioteca cambió. Prepara otra vez la pregunta.');
    }
    const cancel=()=>{generation++;provider.cancel();return true;};
    async function getPrepared(key){const item=prepared.get(key);if(!item||now()-item.createdAt>30*60*1000)fail('CONFLICT','Prepara de nuevo la pregunta.');await guard(item.epoch);await context.verify(item.context.sources);await guard(item.epoch);return item;}
    async function prepare(input){
      if(!input||JSON.stringify(input).length>15000)fail('VALIDATION','Consulta no válida o demasiado grande.');const at=epoch();await guard(at);
      const chosen=await context.prepare(input);await guard(at);let preview;
      try{preview=core.prepare({task:input.task,question:input.question,context:chosen,study:input.study===true,history:input.history||'',allowLiving:input.allowLiving===true});}catch{fail('VALIDATION','Revisa la tarea y el contexto elegido; resumir requiere un comentario permitido.');}
      if(preview.prompt.length>50000)fail('VALIDATION','El contexto es demasiado grande. Elige menos días o fuentes.');
      const key=id();if(prepared.size>=5)prepared.delete(prepared.keys().next().value);prepared.set(key,{...structuredClone(preview),context:structuredClone(chosen),createdAt:now(),module:input.module||'rv1909',epoch:at});
      return {id:key,...preview,notices:chosen.notices};
    }
    async function ask(input){
      if(input.provider!==undefined&&input.provider!=='openrouter')fail('UNAVAILABLE','En el teléfono usa OpenRouter o Copiar/Compartir pregunta. Las sesiones CLI de Windows no se importan.');
      if(busy)fail('CONFLICT','Espera a que termine la consulta anterior.');busy=true;const at=generation;
      try{
        const item=await getPrepared(input.id);if(at!==generation)fail('CANCELLED','La consulta se canceló.');
        const response=await provider.ask({prompt:item.prompt,model:input.model,allowData:input.allowData===true,study:item.study,allowLiving:item.allowLiving});
        await guard(item.epoch);await context.verify(item.context.sources);if(at!==generation)fail('CANCELLED','La consulta se canceló.');
        const citations=[];
        for(const ref of response.citations){try{const result=await call('chapter',{module:item.module,book:ref.book,chapter:ref.chapter}),v=result.verses.find(v=>v.verse===ref.verse||(v.verse<ref.verse&&v.endVerse>=ref.verse));if(v)citations.push({...ref,title:result.title,text:v.text,module:item.module,revision:result.revision});}catch(e){if(e?.code==='LOCKED'||e?.code==='CONFLICT')throw e;}}
        if(response.keywords){const codes=new Set(item.context.sources.filter(s=>s.kind==='bible').flatMap(s=>s.text.match(/[HG]\d{1,5}/g)||[])),valid=[];
          for(const k of response.keywords.filter(k=>codes.has(k.code))){try{const result=await call('dictionary',{group:'strong-es',query:k.code});if(result.entries.some(e=>e.title===k.code))valid.push(k);}catch{}}response.keywords=valid;
        }
        await guard(item.epoch);if(at!==generation)fail('CANCELLED','La consulta se canceló.');
        // Citation texts come exclusively from the local reader, never from the model.
        return {...response,...(item.study?chat.result(response,item.allowLiving):{}),citations,sources:structuredClone(item.sources),allowLiving:item.allowLiving};
      }finally{busy=false;}
    }
    async function copy(input){
      const item=await getPrepared(input.id);if(input.provider!==undefined&&!['chatgpt','claude','gemini'].includes(input.provider))fail('VALIDATION','Proveedor no válido.');
      if(input.provider&&!openExternal)fail('UNAVAILABLE','Falta conectar el navegador del dispositivo.');
      await call('aiTextCopy',item.prompt);await guard(item.epoch);
      if(input.provider){const url=new URL(core.external(input.provider,''));url.search='';await openExternal(url.href);} // prompt stays on clipboard
      return {copied:true,opened:!!input.provider};
    }
    async function share(input){const item=await getPrepared(input.id);const result=await call('shareText',{title:'Pregunta de estudio bíblico',text:item.prompt});return {shared:result?.completed===true||result?.shared===true};}
    async function report(input){
      const reasons=['incorrecta','ofensiva','peligrosa','privacidad','otra'];
      if(!input||input.confirmed!==true||!reasons.includes(input.reason)||typeof input.text!=='string'||!input.text.trim()||input.text.length>30000||typeof(input.detail??'')!=='string'||(input.detail||'').length>2000||typeof(input.model??'')!=='string'||(input.model||'').length>200)fail('VALIDATION','Revisa y confirma la respuesta que quieres reportar.');
      await guard();
      // Explicitly chosen answer only: no prompt, sources, history, account/key or notes.
      const report={id:'report-'+id(),createdAt:new Date(now()).toISOString(),reason:input.reason,text:input.text,detail:input.detail||'',model:input.model||''};
      if(!reporter)return {sent:false,status:'sin-canal',report,notice:'Reporte preparado; todavía no hay un canal de envío al desarrollador. No se ha enviado.'};
      let result;try{result=await reporter(report);}catch{fail('UNAVAILABLE','No se pudo enviar el reporte. Consérvalo y vuelve a intentarlo.');}
      if(result?.accepted!==true)fail('UNAVAILABLE','El canal no confirmó el reporte. No se marca como enviado.');
      return {sent:true,status:'enviado',id:report.id};
    }
    const handlers={aiStatus:()=>({...provider.status(),reporting}),aiConnect:input=>provider.connect(input),aiDisconnect:()=>{cancel();prepared.clear();return provider.disconnect();},aiModels:()=>provider.listModels(),aiQuota:()=>provider.refreshQuota(),aiCancel:cancel,aiPrepare:prepare,aiAsk:ask,aiCopy:copy,aiShare:share,aiReport:report,aiPersonalStatus:()=>({available:false,enabled:false,providers:[]})};
    for(const [name,fn]of Object.entries(handlers))handlers[name]=value=>{if(closed)fail('UNAVAILABLE','La sesión de IA está cerrada.');return fn(value);};
    return Object.freeze({handlers:()=>handlers,invalidate:()=>{cancel();prepared.clear();},close:()=>{closed=true;cancel();prepared.clear();provider.close();},status:()=>({...provider.status(),reporting:reporter?'developer-channel':'not-configured'})});
  }
  return Object.freeze({create});
});
