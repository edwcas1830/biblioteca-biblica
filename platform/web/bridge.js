(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('../bridge-contract.js'),require('./personal-store.js'),require('./library.js'),require('./documents.js'),require('../ai/service.js'));
  else root.LibraryWebBridge=factory(root.LibraryBridgeContract,root.LibraryWebStore,root.LibraryWebReader,root.LibraryWebDocuments,root.LibraryMobileAi);
})(typeof globalThis!=='undefined'?globalThis:this,function(contract,stores,readers,documents,aiFactory){
  'use strict';
  function create({bible,manifest,dbName,indexedDB,resources,resourceBase,source,documentBase,handlers={},events=[],reasons={},aiOptions={}}={}){
    const store=new stores.PersonalStore({indexedDB,dbName,books:bible?.books}),reader=readers.create({bible,manifest,resources,resourceBase,source}),docs=documents?.create({baseUrl:documentBase});
    const adapter=contract.createBridge({platform:'web',storage:'indexeddb',events,reasons,handlers:{
      ...reader,...docs?.handlers(),
      bootstrap:data=>store.bootstrap(data),savePersonal:data=>store.write(data),exportBackup:()=>store.exportBackup(),restoreBackup:data=>store.restoreBackup(data),
      privacyStatus:async()=>({enabled:false,locked:false,retryAt:0}),
      ...handlers
    }});
    // Keep maintenance (backups and close) out of renderer's privileged API.
    const ai=aiFactory?.create({...aiOptions,call:(name,value)=>adapter.bridge[name](value),emit:(name,value)=>{try{adapter.emit(name,value);}catch(e){if(e?.code!=='UNAVAILABLE')throw e;}}});
    if(ai)adapter.register(ai.handlers());
    return Object.freeze({...adapter,store,documents:docs,ai,close:async()=>{await ai?.close();docs?.close();await store.close();}});
  }
  return Object.freeze({create});
});
