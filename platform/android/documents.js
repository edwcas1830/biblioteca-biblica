(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('../web/documents.js'));
  else root.LibraryAndroidDocuments=factory(root.LibraryWebDocuments);
})(typeof globalThis!=='undefined'?globalThis:this,function(documents){
  'use strict';
  // PDF runs in local WebView workers; no storage capability or native plugin is implied.
  return Object.freeze({create:options=>documents.create(options)});
});
