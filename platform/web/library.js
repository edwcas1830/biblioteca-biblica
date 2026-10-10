(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('../../shared/library.js'),require('./resources.js'),require('./modules.js'),require('../../shared/study-resources.js'));
  else root.LibraryWebReader=factory(root.LibraryReader,root.LibraryWebResources,root.LibraryJsonModules,root.LibraryStudyResources);
})(typeof globalThis!=='undefined'?globalThis:this,function(readers,resourceFactory,modules,study){
  'use strict';
  function create({bible,manifest,resources,resourceBase,source}={}){
    resources=resources||(globalThis.document?resourceFactory.create({baseUrl:resourceBase}):null);
    const reader=readers.create({bible,manifest,source:source||modules.create({resources})});
    const {get,validate,books,...handlers}=reader;
    return Object.freeze({...handlers,...(resources?study.create({reader,resources}):{})});
  }
  return Object.freeze({create});
});
