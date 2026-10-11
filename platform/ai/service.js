(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('../bridge-contract.js'),require('../../shared/ai-context.js'),require('./openrouter.js'),require('../../app/ai-core.js'),require('../../app/study-chat-core.js'),require('./gemini.js'),require('./credentials.js'),require('../../shared/study-actions.js'));
  else root.LibraryMobileAi=factory(root.LibraryBridgeContract,root.LibraryAiContext,root.LibraryOpenRouter,root.AiCore,root.StudyChatCore,root.LibraryGemini,root.LibraryAiCredentials,root.LibraryStudyActions);
})(typeof globalThis!=='undefined'?globalThis:this,function(contract,contexts,providers,core,chat,geminis,credentials,actions){
  'use strict';
  const fail=(code,message)=>{throw new contract.BridgeError(code,message);};
  function create({call,emit=()=>{},epoch=()=>0,crypto=globalThis.crypto,fetchImpl,now=()=>Date.now(),openExternal,reporter,credentialStore}={}){
    const reporting=reporter?'developer-channel':'not-configured',context=contexts.create({call}),prepared=new Map(),provider=providers.create({fetchImpl,crypto,now,credentialStore,notify:s=>emit('onAiState',{...s,reporting})});let closed=false,busy=false,generation=0,personalEnabled=true;
    const gemini=credentials.supported(credentialStore)?geminis.create({fetchImpl,now,credentialStore,notify:s=>emit('onAiState',{...provider.status(),gemini:s,reporting})}):null;
    const personalMode=async()=>!!gemini&&(await call('catalog')).modules.some(m=>m.personalDefault===true);
    const personalStatus=async()=>{if(gemini)await gemini.ready;const available=await personalMode();return {available,enabled:available&&personalEnabled,providers:available&&personalEnabled?[{id:'gemini-api',installed:true,connected:gemini.status().connected,session:'key',credentialStorage:'device-secure',retryAt:gemini.status().retryAt,...(gemini.status().credentialError?{credentialError:gemini.status().credentialError}:{})}]:[]};};
    const requireGemini=async()=>{if(!gemini)fail('UNAVAILABLE','El llavero seguro del dispositivo no está disponible.');if(!await personalMode()||!personalEnabled)fail('UNAVAILABLE','Gemini API requiere el modo personal de tu biblioteca.');};
    const id=()=>Array.from(crypto.getRandomValues(new Uint8Array(24)),n=>n.toString(16).padStart(2,'0')).join('');
    async function guard(expected){
      if(closed)fail('UNAVAILABLE','La sesión de IA está cerrada.');
      if(expected!==undefined&&expected!==epoch())fail('CONFLICT','La sesión de tu biblioteca cambió. Prepara otra vez la pregunta.');
      if((await call('privacyStatus')).locked)fail('LOCKED','Abre tu cuaderno antes de consultar o compartir tu estudio.');
      if(expected!==undefined&&expected!==epoch())fail('CONFLICT','La sesión de tu biblioteca cambió. Prepara otra vez la pregunta.');
    }
    const cancel=()=>{generation++;provider.cancel();gemini?.cancel();return true;};
    async function getPrepared(key){const item=prepared.get(key);if(!item||now()-item.createdAt>30*60*1000)fail('CONFLICT','Prepara de nuevo la pregunta.');await guard(item.epoch);await context.verify(item.context.sources);await guard(item.epoch);return item;}
    async function prepare(input){
      if(!input||JSON.stringify(input).length>15000)fail('VALIDATION','Consulta no válida o demasiado grande.');const at=epoch();await guard(at);
      const chosen=await context.prepare(input);await guard(at);let preview;
      try{preview=input.action!==undefined?actions.prepare(input,chosen):core.prepare({task:input.task,question:input.question,context:chosen,study:input.study===true,history:input.history||'',allowLiving:input.allowLiving===true});}catch{fail('VALIDATION','Revisa la tarea y el contexto elegido; resumir requiere un comentario permitido.');}
      if(preview.prompt.length>50000)fail('VALIDATION','El contexto es demasiado grande. Elige menos días o fuentes.');
      const key=id();if(prepared.size>=5)prepared.delete(prepared.keys().next().value);prepared.set(key,{...structuredClone(preview),context:structuredClone(chosen),createdAt:now(),module:input.module||'rv1909',epoch:at});
      return {id:key,...preview,notices:chosen.notices};
    }
    async function ask(input){
      if(input.provider!==undefined&&!['openrouter','gemini-api'].includes(input.provider))fail('UNAVAILABLE','En el teléfono usa OpenRouter, Gemini API o Copiar/Compartir pregunta. Las sesiones CLI de Windows no se importan.');
      if(busy)fail('CONFLICT','Espera a que termine la consulta anterior.');busy=true;const at=generation;
      try{
        const selected=input.provider==='gemini-api'?gemini:provider;
        if(!selected)fail('UNAVAILABLE','El llavero seguro del dispositivo no está disponible.');
        await selected.ready;
        const item=await getPrepared(input.id);if(at!==generation)fail('CANCELLED','La consulta se canceló.');
        if(input.provider==='gemini-api')await requireGemini();
        if(at!==generation)fail('CANCELLED','La consulta se canceló.');
        if(input.action!==undefined&&input.action!==item.action)fail('CONFLICT','La acción cambió. Prepara otra vez el estudio.');
        const beforeSend=async()=>{await getPrepared(input.id);if(input.provider==='gemini-api')await requireGemini();if(at!==generation)fail('CANCELLED','La consulta se canceló.');};
        const response=await selected.ask({prompt:item.prompt,model:input.model,allowData:input.allowData===true,study:item.study,allowLiving:item.allowLiving,action:item.action,beforeSend});
        if(input.provider==='gemini-api')await requireGemini();
        await guard(item.epoch);await context.verify(item.context.sources);if(at!==generation)fail('CANCELLED','La consulta se canceló.');
        if(item.action){if(input.action!==undefined&&input.action!==item.action)fail('CONFLICT','La acción cambió. Prepara otra vez el estudio.');return {...response,...actions.result(response,item.context)};}
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
    async function image(input){
      if(busy)fail('CONFLICT','Espera a que termine la consulta o el fondo anterior.');
      busy=true;const at=generation,session=epoch();
      const check=async()=>{await guard(session);if(at!==generation)fail('CANCELLED','La generación del fondo se canceló.');};
      // Con Gemini conectado en modo personal, el fondo sale de la clave de Gemini; si no, de OpenRouter.
      const conGemini=!!gemini&&personalEnabled&&gemini.status().connected&&await personalMode();
      try{await check();const result=await (conGemini?gemini.image(input,{beforeSend:check}):provider.image(input,{beforeSend:check}));await check();return result;}finally{busy=false;}
    }
    const handlers={aiStatus:async()=>{await provider.ready;return {...provider.status(),reporting};},aiConnect:input=>provider.connect(input),aiDisconnect:()=>{cancel();prepared.clear();return provider.disconnect();},aiModels:()=>provider.listModels(),aiQuota:()=>provider.refreshQuota(),aiCancel:cancel,aiPrepare:prepare,aiAsk:ask,aiImage:image,aiCopy:copy,aiShare:share,aiReport:report,aiPersonalStatus:personalStatus};
    if(gemini)Object.assign(handlers,{
      aiGeminiKey:async value=>{if(value!==null)await requireGemini();cancel();prepared.clear();await gemini.storeKey(value);return personalStatus();},
      aiGeminiModels:async()=>{await requireGemini();return gemini.listModels();},
      aiPersonalEnable:async value=>{if(typeof value!=='boolean')fail('VALIDATION','Elige activar o desactivar el modo personal.');if(!await personalMode())fail('UNAVAILABLE','Esta biblioteca no tiene un paquete personal activo.');cancel();prepared.clear();personalEnabled=value;return personalStatus();},
      aiPersonalLogin:async id=>{if(id!=='gemini-api')fail('UNAVAILABLE','Las sesiones CLI de Windows no están disponibles en Android.');await requireGemini();if(!openExternal)fail('UNAVAILABLE','Falta conectar el navegador del dispositivo.');await openExternal('https://aistudio.google.com/apikey');return {instructions:true};}
    });
    for(const [name,fn]of Object.entries(handlers))handlers[name]=value=>{if(closed)fail('UNAVAILABLE','La sesión de IA está cerrada.');return fn(value);};
    return Object.freeze({handlers:()=>handlers,invalidate:()=>{cancel();prepared.clear();},close:()=>{closed=true;cancel();prepared.clear();return Promise.all([provider.close(),gemini?.close()]);},status:()=>({...provider.status(),reporting:reporter?'developer-channel':'not-configured'})});
  }
  return Object.freeze({create});
});
