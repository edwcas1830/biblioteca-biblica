(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('../../shared/library.js'),require('../../shared/study-resources.js'),require('../web/resources.js'),require('../web/modules.js'),require('./modules.js'),require('./fts.js'));
  else root.LibraryAndroidReader=factory(root.LibraryReader,root.LibraryStudyResources,root.LibraryWebResources,root.LibraryJsonModules,root.LibraryAndroidModules,root.LibraryAndroidFts);
})(typeof globalThis!=='undefined'?globalThis:this,function(readers,study,resourcesFactory,jsonModules,nativeModules,fts){
  'use strict';
  async function create({bible,manifest,filesystem,sqlite,resources,resourceBase}={}){
    const personal=nativeModules.create({filesystem,sqlite});let index;
    try{
      resources=resources||resourcesFactory.create({baseUrl:resourceBase});
      const publicModules=jsonModules.create({resources,nativeIndex:true}),source=jsonModules.combine(publicModules,personal);
      index=await fts.create({sqlite});const reader=readers.create({bible,manifest,source,index});await reader.catalog();
      const {get,validate,books,...operations}=reader,handlers={...operations,...study.create({reader,resources})};
      return Object.freeze({handlers:()=>handlers,close:async()=>{await personal.close();await index.close();}});
    }catch(e){await personal.close();if(index)await index.close();throw e;}
  }
  return Object.freeze({create});
});
