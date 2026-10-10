(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('../bridge-contract.js'));
  else root.LibraryAiCredentials=factory(root.LibraryBridgeContract);
})(typeof globalThis!=='undefined'?globalThis:this,function(contract){
  'use strict';
  const supported=store=>!!store&&['leer','guardar','borrar'].every(k=>typeof store[k]==='function');
  function create({store,name,valid}={}){
    if(!supported(store)||!['openrouter','gemini'].includes(name))throw new contract.BridgeError('UNAVAILABLE','El llavero seguro del dispositivo no está disponible.');
    let queue=Promise.resolve(),known=null;
    const serial=fn=>{const next=queue.then(fn);queue=next.catch(()=>{});return next;};
    const invoke=async(method,...args)=>{
      try{const result=await store[method](name,...args);if(result===false)throw Error();return result;}
      catch{throw new contract.BridgeError('STORAGE','No se pudo '+({leer:'abrir',guardar:'guardar',borrar:'borrar'}[method])+' la conexión en el llavero seguro. Reintenta; no se guardará sin protección.');}
    };
    const read=()=>serial(async()=>{const value=await invoke('leer');if(value!==null&&value!==undefined&&!valid(value))throw new contract.BridgeError('CORRUPT','La conexión guardada no es válida. Bórrala o conecta de nuevo.');known=value??null;return known;});
    const save=(value,accept=()=>true)=>serial(async()=>{
      if(!valid(value))throw new contract.BridgeError('VALIDATION','La clave no tiene un formato válido.');
      if(!accept())throw new contract.BridgeError('CANCELLED','La conexión se canceló.');
      const previous=known;await invoke('guardar',value);
      if(!accept()){
        // Restore inside this queue before a subsequent disconnect/new login is allowed to write.
        if(previous===null)await invoke('borrar');else await invoke('guardar',previous);
        throw new contract.BridgeError('CANCELLED','La conexión se canceló.');
      }
      known=value;return true;
    });
    const remove=()=>serial(async()=>{await invoke('borrar');known=null;return true;});
    const close=()=>serial(()=>{known=null;});
    return Object.freeze({read,save,remove,close});
  }
  return Object.freeze({create,supported});
});
