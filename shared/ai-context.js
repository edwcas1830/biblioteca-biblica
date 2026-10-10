(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('../platform/bridge-contract.js'),()=>require('../app/guide-core.js'),()=>require('../app/core.js'));
  else root.LibraryAiContext=factory(root.LibraryBridgeContract,()=>root.GuideCore,()=>root.BibleCore);
})(typeof globalThis!=='undefined'?globalThis:this,function(contract,guides,bibleCore){
  'use strict';
  const fail=(code,message)=>{throw new contract.BridgeError(code,message);};
  function create({call}={}){
    async function context(input){
      const {scope='verse',book,chapter,module='rv1909',includeBible=false,includeComment=false,comment}=input;
      if(!['verse','chapter','book','general'].includes(scope))fail('VALIDATION','Alcance de estudio no válido.');
      if(scope==='general')return {reference:'Consulta general',sources:[],notices:['Solo se prepara tu pregunta. Sin módulos ni notas privadas.']};
      const books=await call('metadata'),chapters=books[book]?.chapters,n=chapters?.[chapter-1];
      let verse=input.verse??1,endVerse=input.endVerse??verse;
      if(scope==='chapter'||scope==='book'){verse=1;endVerse=Math.min(41,n||1);}
      if(!Number.isInteger(book)||!Number.isInteger(chapter)||!Number.isInteger(verse)||!Number.isInteger(endVerse)||!n||verse<1||endVerse>n||endVerse<verse||endVerse-verse>40)fail('VALIDATION','Elige una referencia válida de hasta 41 versículos.');
      const reference=scope==='book'?books[book].name:books[book].name+' '+chapter+':'+verse+(endVerse!==verse?'-'+endVerse:''),sources=[],notices=[],catalog=await call('catalog');
      if(scope==='book')notices.push('Se incluye un extracto del capítulo actual y su introducción, no el libro completo.');
      if((scope==='chapter'||scope==='book')&&n>41)notices.push('El extracto se limita a los versículos 1–41.');
      async function source(id,kind){
        const m=catalog.modules.find(m=>m.id===id);if(!m)fail('NOT_FOUND','La fuente elegida no está instalada.');
        if(m.tipo!==(kind==='bible'?'biblia':'comentario'))fail('VALIDATION','El tipo de fuente elegido no coincide.');
        if(m.iaPermitida!==true){notices.push('La fuente '+m.titulo+' no declara permiso para IA; no se incluye su texto.');return;}
        const result=await call(kind==='bible'?'chapter':'comments',{module:id,book,chapter,verse,endVerse});
        if(result.revision!==m.sha256)fail('CONFLICT','La fuente cambió. Prepara otra vez la pregunta.');
        const text=(kind==='bible'?result.verses.filter(v=>(v.endVerse||v.verse)>=verse&&v.verse<=endVerse).map(v=>v.verse+'. '+v.text+(v.strong?.length?' [Strong presentes: '+v.strong.join(', ')+']':'')):result.entries.filter(e=>scope==='book'||e.label!=='Introducción al libro').map(e=>e.label+'\n'+e.text)).join('\n').slice(0,18000);
        sources.push({kind,book,chapter,verse,endVerse,module:m.id,title:m.titulo,reference,revision:m.sha256,license:m.licencia,attribution:m.atribucion,origin:m.origen,licenseUrl:m.licenciaUrl,text});
      }
      if(includeBible===true)await source(module,'bible');if(includeComment===true)await source(comment,'comment');
      return {reference,sources,notices};
    }
    async function prepare(input){
      if(!input.series)return context(input);
      let spec;try{spec=guides().spec(input.series);}catch{fail('VALIDATION','Serie de estudio no válida.');}
      const passages=bibleCore().topics[spec.topic].passages.slice(0,spec.days),contexts=[];
      for(const [book,chapter]of passages)contexts.push(await context({...input,series:undefined,scope:'chapter',book,chapter,verse:1}));
      return {series:spec,reference:'Serie de '+spec.days+' días · '+bibleCore().topics[spec.topic].title,readings:contexts.map(c=>c.reference),sources:contexts.flatMap(c=>c.sources),notices:[...new Set(contexts.flatMap(c=>c.notices))]};
    }
    async function verify(sources){
      const catalog=await call('catalog');
      for(const s of sources){
        const m=catalog.modules.find(m=>m.id===s.module);
        if(!m||m.iaPermitida!==true||m.sha256!==s.revision)fail('CONFLICT','La fuente o su permiso cambió. Prepara otra vez la pregunta.');
        const checked=await call(s.kind==='bible'?'chapter':'comments',{module:s.module,book:s.book,chapter:s.chapter,verse:s.verse,endVerse:s.endVerse});
        if(checked.revision!==s.revision)fail('CONFLICT','La revisión de la fuente cambió.');
      }
      return true;
    }
    return Object.freeze({prepare,verify});
  }
  return Object.freeze({create});
});
