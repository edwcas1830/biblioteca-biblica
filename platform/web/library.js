(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('../bridge-contract.js'),require('../../shared/references.js'));
  else root.LibraryWebReader=factory(root.LibraryBridgeContract,root.LibraryReferences);
})(typeof globalThis!=='undefined'?globalThis:this,function(contract,refs){
  'use strict';
  const fold=value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es');
  const escape=value=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function create({bible,manifest={}}={}){
    if(!Array.isArray(bible?.books)||bible.books.length!==66)throw new contract.BridgeError('VALIDATION','Se necesita el texto público de 66 libros.');
    const books=structuredClone(bible.books);let revision;
    const ready=()=>revision||(revision=refs.digest(JSON.stringify(books)));
    const get=id=>{if(id!==undefined&&id!=='rv1909')throw new contract.BridgeError('NOT_FOUND','Este módulo no está instalado en la vista previa.');};
    const moduleInfo=async()=>({...manifest,id:'rv1909',tipo:'biblia',rol:'version',titulo:'Reina-Valera 1909',abreviatura:'RV1909',sha256:await ready(),licencia:manifest.licencia||'Dominio público. RV1909; conserva las referencias de la fuente.',versificacion:manifest.versificacion||'Canon protestante de 66 libros; numeración de la fuente RV1909',publico:true,iaPermitida:manifest.iaPermitida===true});
    async function chapter({module='rv1909',book,chapter}){
      get(module);const data=books[book]?.chapters[chapter-1];if(!data)throw new contract.BridgeError('VALIDATION','Capítulo fuera del canon.');
      return {module,revision:await ready(),title:'Reina-Valera 1909',verses:data.map((text,i)=>{const p={book,chapter,verse:i+1};return {...p,reference:refs.anchor(p),text,html:escape(text),strong:[],alignment:true};})};
    }
    async function search({module='rv1909',query='',mode='text'}){
      get(module);if(mode==='strong')throw new contract.BridgeError('UNAVAILABLE','RV1909 no contiene números Strong. Instala un módulo compatible para consultarlos.');
      if(!['text','word'].includes(mode)||typeof query!=='string'||query.length>200)throw new contract.BridgeError('VALIDATION','Consulta no válida.');
      const tokens=fold(query).match(/[\p{L}\p{N}]+/gu)||[];if(!tokens.length)return {module,revision:await ready(),count:0,results:[]};
      const results=[];let count=0;
      for(let book=0;book<books.length;book++){
        for(let c=0;c<books[book].chapters.length;c++)for(let v=0;v<books[book].chapters[c].length;v++){
          const text=books[book].chapters[c][v],words=fold(text).match(/[\p{L}\p{N}]+/gu)||[];
          if(tokens.every(t=>words.some(w=>mode==='word'?w===t:w.startsWith(t)))){count++;if(results.length<100){const p={book,chapter:c+1,verse:v+1};results.push({...p,text,reference:refs.anchor(p)});}}
        }
        // Cooperative scan only for the web preview; native FTS5 is a later piece.
        if(book%4===3)await new Promise(resolve=>setTimeout(resolve,0));
      }
      return {module,revision:await ready(),count,results};
    }
    return Object.freeze({catalog:async()=>({modules:[await moduleInfo()],warnings:['Vista previa web: solo el texto público RV1909. Módulos e-Sword y FTS5 nativo pendientes.'],versions:['rv1909'],dictionaryGroups:[]}),metadata:async()=>books.map((b,i)=>({name:b.name,chapters:b.chapters.map((c,j)=>Math.max(c.length,i===63&&j===0?15:0))})),chapter,search});
  }
  return Object.freeze({create});
});
