(function(root,factory){
  const api=typeof module==='object'&&module.exports?factory(require('../bridge-contract.js')):factory(root.LibraryBridgeContract);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.LibraryAndroidServices=api.create();
})(typeof globalThis!=='undefined'?globalThis:this,function(contract){
  'use strict';
  // Native repositories install their handlers after successful initialization.
  // No IndexedDB fallback and no empty success results for absent native services.
  function create(){
    const installed=new Map();let storage='none';
    function register(handlers){
      for(const [name,fn]of Object.entries(handlers))if(!Object.hasOwn(contract.operations,name)||contract.operations[name].event||typeof fn!=='function')throw new contract.BridgeError('VALIDATION','Servicio Android no válido.');
      for(const [name,fn]of Object.entries(handlers))installed.set(name,fn);
    }
    function setStorage(value){
      if(!['none','sqlite'].includes(value)||value==='sqlite'&&(!installed.has('bootstrap')||!installed.has('savePersonal')))throw new contract.BridgeError('VALIDATION','Inicializa el repositorio SQLite antes de anunciarlo.');
      storage=value;
    }
    return Object.freeze({register,handlers:()=>Object.freeze(Object.fromEntries(installed)),storage:()=>storage,setStorage});
  }
  return Object.freeze({create});
});
