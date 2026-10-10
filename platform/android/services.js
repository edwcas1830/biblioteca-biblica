(function(root,factory){
  const api=typeof module==='object'&&module.exports?factory(require('../bridge-contract.js'),require('./personal-store.js'),require('../web/library.js'),require('../web/documents.js')):factory(root.LibraryBridgeContract,root.LibraryAndroidStore,root.LibraryWebReader,root.LibraryWebDocuments);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.LibraryAndroidServices=api.create();
})(typeof globalThis!=='undefined'?globalThis:this,function(contract,stores,readers,documents){
  'use strict';
  // Native repositories install their handlers after successful initialization.
  // No IndexedDB fallback and no empty success results for absent native services.
  function create(){
    const installed=new Map();let storage='none',attached=null,started=null,store=null,docs=null,phase='idle',failure=null;
    function register(handlers){
      for(const [name,fn]of Object.entries(handlers))if(!Object.hasOwn(contract.operations,name)||contract.operations[name].event||typeof fn!=='function')throw new contract.BridgeError('VALIDATION','Servicio Android no válido.');
      for(const [name,fn]of Object.entries(handlers))installed.set(name,fn);
      attached?.register(handlers);
    }
    function setStorage(value){
      if(!['none','sqlite'].includes(value)||value==='sqlite'&&(!installed.has('bootstrap')||!installed.has('savePersonal')))throw new contract.BridgeError('VALIDATION','Inicializa el repositorio SQLite antes de anunciarlo.');
      storage=value;
      attached?.setStorage(value);
    }
    function attach(adapter,{sqlite,bible,manifest,resources,resourceBase,documentBase}={}){
      if(!adapter||typeof adapter.register!=='function'||typeof adapter.setStorage!=='function'||!adapter.bridge?.getCapabilities)throw new contract.BridgeError('VALIDATION','Falta el adaptador Android del contrato.');
      if(attached){if(attached!==adapter)throw new contract.BridgeError('CONFLICT','Esta biblioteca ya tiene una sesión de inicio.');return started;}
      if(!Array.isArray(bible?.books)||bible.books.length!==66)throw new contract.BridgeError('VALIDATION','Faltan los datos públicos de la Biblia.');
      const reader=readers.create({bible,manifest,resources,resourceBase}),documentService=documents?.create({baseUrl:documentBase});
      attached=adapter;phase='preparing';attached.register(Object.fromEntries(installed));attached.setStorage('none');storage='none';
      // Reader data is portable logic, not an IndexedDB/native storage fallback.
      register(reader);
      docs=documentService;if(docs)register(docs.handlers());
      started=Promise.resolve().then(async()=>{
        try{
          store=new stores.PersonalStore({sqlite,books:bible.books});await store.open();
          setStorage('sqlite');phase='ready';return attached.bridge.getCapabilities();
        }catch(e){
          try{await store?.close();}catch{}phase='failed';failure=e instanceof contract.BridgeError?e:new contract.BridgeError('STORAGE','No se pudo preparar SQLite. La biblioteca se conserva.');throw failure;
        }
      });
      // Avoid unhandled rejection if the UI installs its loading/error view a little later.
      started.catch(()=>{});
      const deferred=method=>async value=>{await started;return store[method](value);};
      register({bootstrap:deferred('bootstrap'),savePersonal:deferred('write'),exportBackup:deferred('exportBackup'),restoreBackup:deferred('restoreBackup'),privacyStatus:deferred('privacyStatus')});
      return started;
    }
    const close=async()=>{docs?.close();try{await started;}catch{}await store?.close();setStorage('none');phase='closed';};
    return Object.freeze({register,handlers:()=>Object.freeze(Object.fromEntries(installed)),storage:()=>storage,setStorage,attach,close,status:()=>({state:phase,...(failure?{error:{code:failure.code,message:failure.message}}:{})})});
  }
  return Object.freeze({create});
});
