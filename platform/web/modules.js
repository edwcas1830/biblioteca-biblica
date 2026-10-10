(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('../bridge-contract.js'));
  else root.LibraryJsonModules=factory(root.LibraryBridgeContract);
})(typeof globalThis!=='undefined'?globalThis:this,function(contract){
  'use strict';
  const fail=(code,message)=>{throw new contract.BridgeError(code,message);};
  function create({resources,packageManifest,nativeIndex=false}={}){
    const modules=new Map(),loaded=new Map();let ready;
    const catalog=()=>ready||(ready=(async()=>{
      if(!resources)return {modules:[],warnings:['Vista previa sin recursos adicionales; solo RV1909.']};
      const pack=packageManifest||await resources.manifest('free-package');
      if(!Array.isArray(pack.modulos)||pack.modulos.length>500)fail('CORRUPT','Paquete libre no válido.');
      for(const m of pack.modulos){
        if(!/^[a-z0-9-]{1,80}$/.test(m.id)||modules.has(m.id)||!['biblia','diccionario','comentario'].includes(m.tipo)||!['version','diccionario','comentario','apoyo'].includes(m.rol)||!/^[-a-z0-9]+\.json\.gz$/.test(m.dataFile)||!/^[a-f0-9]{64}$/.test(m.dataSha256)||!Number.isSafeInteger(m.registros)||m.registros<1)fail('CORRUPT','Fuente libre no válida.');
        modules.set(m.id,{...m,sha256:m.dataSha256,revisionKind:'gzip-json',publico:true});
      }
      return {modules:[...modules.values()].map(({dataFile,...m})=>m),warnings:[...(pack.modulos.some(m=>m.tipo==='comentario')?[]:['El paquete libre no contiene comentarios. Los comentarios personales se leen desde un paquete instalado en Android.']), ...(nativeIndex?[]:['La vista web busca de forma cooperativa; el índice FTS5 corresponde al adaptador SQLite nativo.'])]};
    })().catch(e=>{ready=null;modules.clear();throw e;}));
    async function get(id){await catalog();const m=modules.get(id);if(!m)fail('NOT_FOUND','Este módulo libre no está instalado.');return m;}
    async function data(id){const m=await get(id);if(!loaded.has(id))loaded.set(id,resources.file('free-package/'+m.dataFile,m.dataSha256).then(rows=>{if(!Array.isArray(rows)||rows.length!==m.registros)fail('CORRUPT','La cobertura del módulo no coincide.');return rows;}).catch(e=>{loaded.delete(id);throw e;}));return loaded.get(id);}
    const bibleRow=r=>({Book:r[0],Chapter:r[1],Verse:r[2],VerseEnd:r[3],Scripture:r[4]});
    async function chapter(id,book,ch){return (await data(id)).filter(r=>r[0]===book&&r[1]===ch).map(bibleRow).sort((a,b)=>a.Verse-b.Verse);}
    async function* biblePages(id){const rows=await data(id);for(let offset=0;offset<rows.length;offset+=400)yield rows.slice(offset,offset+400).map(bibleRow);}
    async function* topicPages(id){const rows=await data(id);for(let offset=0;offset<rows.length;offset+=400)yield rows.slice(offset,offset+400).map(r=>({Topic:r[0],Definition:r[1]}));}
    async function definitions(id,topic){return (await data(id)).filter(r=>r[0]===topic).map(r=>({Topic:r[0],Definition:r[1]}));}
    async function comments(id,{book,chapter,verse,endVerse}){
      // Comment JSON, when supplied by a licensed package, mirrors e-Sword tables.
      // Rows: [Book,ChapterBegin,ChapterEnd,VerseBegin,VerseEnd,Comments].
      return (await data(id)).filter(r=>r[0]===book&&(r[1]<chapter||r[1]===chapter&&r[3]<=endVerse)&&(r[2]>chapter||r[2]===chapter&&r[4]>=verse)).map(r=>({label:r[1]+':'+r[3]+'–'+r[2]+':'+r[4],Comments:r[5]}));
    }
    return Object.freeze({catalog,check:async id=>{await get(id);},chapter,biblePages,topicPages,definitions,comments});
  }
  function combine(...sources){
    const owners=new Map();let ready;
    const catalog=()=>ready||(ready=(async()=>{const modules=[],warnings=[];for(const source of sources){const found=await source.catalog();for(const m of found.modules){if(owners.has(m.id))fail('CORRUPT','Identificador duplicado entre paquetes.');owners.set(m.id,source);modules.push(m);}warnings.push(...found.warnings||[]);}return {modules,warnings};})().catch(e=>{ready=null;owners.clear();throw e;}));
    const owner=async id=>{await catalog();if(!owners.has(id))fail('NOT_FOUND','Este módulo no está instalado.');return owners.get(id);};
    const out={catalog};for(const name of ['check','chapter','definitions','comments'])out[name]=async(id,...args)=>(await owner(id))[name](id,...args);
    for(const name of ['biblePages','topicPages'])out[name]=async function*(id){yield* (await owner(id))[name](id);};return Object.freeze(out);
  }
  return Object.freeze({create,combine});
});
