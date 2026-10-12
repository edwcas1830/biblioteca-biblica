(function(root,factory){
  const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.LibraryVoiceCore=api;
})(typeof window==='object'?window:globalThis,function(){
  'use strict';
  function chunks(text,limit=3000){
    const result=[];
    for(let line of text.split(/\n+/).map(s=>s.trim()).filter(Boolean)){
      while(line.length>limit){
        const space=line.lastIndexOf(' ',limit);let end=space>limit/2?space:limit;
        if(/[\uD800-\uDBFF]/.test(line[end-1])&&/[\uDC00-\uDFFF]/.test(line[end]))end--;
        result.push(line.slice(0,end));line=line.slice(end).trimStart();
      }
      if(line)result.push(line);
    }
    return result;
  }
  function create({bridge,speech,Utterance,onStatus=()=>{},onVoices=()=>{}}={}){
    let mode='none',voices=[],generation=0,discovery=0,active=null,stopQueue=Promise.resolve();
    const status=value=>onStatus(value);
    const stopEngine=()=>{
      if(mode==='bridge'){const next=stopQueue.catch(()=>{}).then(()=>bridge.stopVoice());stopQueue=next;return next;}
      speech?.cancel();return Promise.resolve();
    };
    async function stop(){generation++;const previous=active;active=null;previous?.finish();await stopEngine();}
    async function loadVoices(){
      const id=++discovery;let caps;
      if(bridge?.getCapabilities)caps=await bridge.getCapabilities();
      const useBridge=['playVoice','stopVoice','voiceOptions'].every(name=>caps?.operations[name]?.available===true);
      let nextMode='none',list=[];
      if(useBridge){
        const result=await bridge.voiceOptions();
        if(!Array.isArray(result))throw Error('El dispositivo no devolvió voces válidas.');
        nextMode='bridge';list=result.filter(v=>v&&typeof v.id==='string'&&v.id.length<=200&&typeof v.name==='string'&&typeof v.lang==='string'&&/^es/i.test(v.lang)&&v.localService!==false).map(v=>({...v}));
      }else if(caps?.platform!=='android'&&speech?.getVoices&&Utterance){
        nextMode='speech';list=speech.getVoices().filter(v=>v.localService&&/^es/i.test(v.lang)).map((v,i)=>({id:String(i),name:v.name,lang:v.lang,localService:true,native:v}));
      }
      if(id!==discovery)return voices;
      if(new Set(list.map(v=>v.id)).size!==list.length)throw Error('El dispositivo repitió un identificador de voz.');
      if(active)await stop();mode=nextMode;voices=list;
      onVoices(voices.map(({native,...v})=>v));
      status(voices.length?(mode==='speech'?'Voz del dispositivo · sin conexión':'Voz del dispositivo'):'No hay una voz disponible en español. Revisa las voces instaladas del dispositivo.');
      return voices.map(({native,...v})=>v);
    }
    async function run(session){
      const runId=++session.run;
      try{
        while(active===session&&!session.paused&&session.index<session.parts.length){
          await bridge.playVoice({text:session.parts[session.index],voice:session.voice.id,lang:session.voice.lang,rate:session.rate});
          if(active!==session||session.paused||session.run!==runId)return;
          session.index++;
        }
        if(active===session&&!session.paused&&session.run===runId){active=null;status('Lectura terminada.');session.finish();}
      }catch{
        if(active!==session||session.paused||session.run!==runId)return;
        active=null;status('La voz no pudo leer. Prueba otra voz del dispositivo.');session.finish();
      }
    }
    async function play(text,voiceId,rate=1){
      if(typeof text!=='string'||!text.trim()||text.length>200000)throw Error('No hay texto válido para leer.');
      const speed=Number.isFinite(Number(rate))?Math.min(2,Math.max(.5,Number(rate))):1;
      const voice=voices.find(v=>v.id===voiceId);if(!voice)throw Error('Elige una voz disponible en español.');
      const expected=generation+1;await stop();if(generation!==expected)return;
      let finish;const done=new Promise(resolve=>{finish=resolve;});
      const session={voice,finish,paused:false,index:0,parts:chunks(text),run:0,rate:speed};active=session;
      status('Leyendo…');
      if(mode==='bridge')void run(session);
      else{
        const utterance=new Utterance(text);utterance.voice=voice.native;utterance.lang=voice.lang;utterance.rate=speed;
        utterance.onend=()=>{if(active!==session)return;active=null;status('Lectura terminada.');finish();};
        utterance.onerror=()=>{if(active!==session)return;active=null;status('La voz no pudo leer. Prueba otra voz del dispositivo.');finish();};
        try{speech.speak(utterance);}catch(error){active=null;finish();throw error;}
      }
      return done;
    }
    async function togglePause(){
      const session=active;if(!session)return;
      if(mode==='speech'){
        if(session.paused){speech.resume();session.paused=false;status('Leyendo…');}
        else{speech.pause();session.paused=true;status('Lectura en pausa.');}
        return;
      }
      if(session.paused){
        await stopQueue;if(active!==session||!session.paused)return;
        session.paused=false;status('Leyendo…');void run(session);
      }else{
        session.paused=true;session.run++;
        try{await stopEngine();}catch(error){if(active===session){active=null;session.finish();}throw error;}
        if(active===session)status('Lectura en pausa. Al continuar se repite el versículo actual.');
      }
    }
    const changed=()=>{void loadVoices().catch(()=>{onVoices([]);status('No se pudieron consultar las voces del dispositivo.');});};
    speech?.addEventListener?.('voiceschanged',changed);
    async function destroy(){discovery++;speech?.removeEventListener?.('voiceschanged',changed);await stop();}
    return Object.freeze({loadVoices,play,stop,togglePause,destroy});
  }
  return Object.freeze({create,chunks});
});
