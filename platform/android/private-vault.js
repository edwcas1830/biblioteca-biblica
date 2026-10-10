(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('../bridge-contract.js'));
  else root.LibraryAndroidVault=factory(root.LibraryBridgeContract);
})(typeof globalThis!=='undefined'?globalThis:this,function(contract){
  'use strict';
  function create({workerFactory,baseUrl,onFailure=()=>{},timeout=120000}={}){
    const available=!!workerFactory||typeof Worker==='function'&&!!globalThis.crypto?.subtle;
    let worker=null,sequence=0,closed=false;const pending=new Map();
    const messages={VALIDATION:'Usa un PIN de 6 a 12 cifras.',LOCKED:'PIN incorrecto o cuaderno cerrado.',CORRUPT:'La copia cifrada no es compatible.',CONFLICT:'Termina el cambio del candado anterior.',UNAVAILABLE:'El candado necesita un Worker y cifrado local disponibles.',STORAGE:'No se pudo completar el candado local. Tus datos se conservan.'};
    function stop(error){worker?.terminate();worker=null;for(const task of pending.values()){clearTimeout(task.timer);task.reject(error);}pending.clear();onFailure();}
    function start(){
      if(closed||!available)throw new contract.BridgeError('UNAVAILABLE',messages.UNAVAILABLE);
      if(worker)return;
      try{worker=workerFactory?workerFactory():new Worker(new URL('platform/android/vault-worker.mjs',baseUrl||document.baseURI),{type:'module'});}
      catch{throw new contract.BridgeError('UNAVAILABLE',messages.UNAVAILABLE);}
      worker.onmessage=({data})=>{const task=pending.get(data?.id);if(!task)return;pending.delete(data.id);clearTimeout(task.timer);if(data.error){const code=Object.hasOwn(messages,data.error.code)?data.error.code:'STORAGE';task.reject(new contract.BridgeError(code,messages[code]));}else task.resolve(data.result);};
      worker.onerror=event=>{event.preventDefault?.();stop(new contract.BridgeError('UNAVAILABLE',messages.UNAVAILABLE));};
      worker.onmessageerror=()=>stop(new contract.BridgeError('STORAGE',messages.STORAGE));
    }
    const call=(name,value)=>new Promise((resolve,reject)=>{
      try{start();const id=++sequence,timer=setTimeout(()=>stop(new contract.BridgeError('CANCELLED','El candado tardó demasiado. Vuelve a abrirlo.')),timeout);pending.set(id,{resolve,reject,timer});worker.postMessage({id,name,value});}
      catch(e){stop(e instanceof contract.BridgeError?e:new contract.BridgeError('STORAGE',messages.STORAGE));reject(e);}
    });
    return Object.freeze({available,initialize:()=>call('ready'),call,close:()=>{closed=true;stop(new contract.BridgeError('CANCELLED','El candado está cerrado.'));}});
  }
  return Object.freeze({create});
});
