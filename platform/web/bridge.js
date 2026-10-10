(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('../bridge-contract.js'),require('./personal-store.js'),require('./library.js'));
  else root.LibraryWebBridge=factory(root.LibraryBridgeContract,root.LibraryWebStore,root.LibraryWebReader);
})(typeof globalThis!=='undefined'?globalThis:this,function(contract,stores,readers){
  'use strict';
  function create({bible,manifest,dbName, indexedDB,handlers={},events=[],reasons={}}={}){
    const store=new stores.PersonalStore({indexedDB,dbName,books:bible?.books}),reader=readers.create({bible,manifest});
    const adapter=contract.createBridge({platform:'web',storage:'indexeddb',events,reasons,handlers:{
      ...reader,
      bootstrap:data=>store.bootstrap(data),savePersonal:data=>store.write(data),exportBackup:()=>store.exportBackup(),restoreBackup:data=>store.restoreBackup(data),
      privacyStatus:async()=>({enabled:false,locked:false,retryAt:0}),
      ...handlers
    }});
    // Keep maintenance (backups and close) out of renderer's privileged API.
    return Object.freeze({...adapter,store});
  }
  return Object.freeze({create});
});
