(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('../platform/bridge-contract.js'),()=>require('../app/graphics-core.js'),()=>require('../app/plan-core.js'));
  else root.LibraryStudyResources=factory(root.LibraryBridgeContract,()=>root.GraphicsCore,()=>root.PlanCore);
})(typeof globalThis!=='undefined'?globalThis:this,function(contract,getGraphics,getPlan){
  'use strict';
  const fail=(code,message)=>{throw new contract.BridgeError(code,message);};
  function create({reader,resources}={}){
    if(!reader||!resources)fail('UNAVAILABLE','Falta inicializar el estudio.');
    const data=id=>resources.data(id),info=id=>resources.manifest(id);
    async function connections({book,chapter,verse,comment}){
      reader.validate({book,chapter,verse});const [index,manifest]=await Promise.all([data('openbible'),info('openbible')]);
      const rows=(index[[book,chapter,verse].join(':')]||[]).slice(0,50).map(r=>({book:r[0],chapter:r[1],verse:r[2],endBook:r[3],endChapter:r[4],endVerse:r[5],score:r[6],source:'OpenBible.info'}));
      if(comment){const plan=getPlan();if(!plan?.parseReferences)fail('UNAVAILABLE','Falta el lector de referencias del comentario.');const m=await reader.get(comment),result=await reader.comments({module:comment,book,chapter,verse});for(const entry of result.entries.filter(e=>e.label!=='Introducción al libro'))for(const r of plan.parseReferences(entry.text,reader.books).refs)rows.push({...r,verse:r.verse||1,endBook:r.book,endChapter:r.chapter,endVerse:r.endVerse||r.verse||1,score:null,source:m.titulo});}
      const unique=new Map();
      for(const r of rows){reader.validate(r);reader.validate({book:r.endBook,chapter:r.endChapter,verse:r.endVerse});const key=[r.book,r.chapter,r.verse,r.endBook,r.endChapter,r.endVerse].join(':');if(!unique.has(key))unique.set(key,{...r,sources:[r.source]});else if(!unique.get(key).sources.includes(r.source))unique.get(key).sources.push(r.source);}
      return {items:[...unique.values()].slice(0,60),license:manifest.license,title:manifest.title};
    }
    async function graphicsChapter({book,chapter}){
      const core=getGraphics();if(!core)fail('UNAVAILABLE','Falta cargar el núcleo gráfico.');
      reader.validate({book,chapter,verse:1});const [atlas,chron,land]=await Promise.all([data('atlas'),data('bibledata'),data('natural-earth')]),key=book+':'+chapter;
      return {places:(atlas.chapters[key]||[]).map(id=>({...atlas.places[id],refs:atlas.places[id].refs.filter(r=>r[0]===book&&r[1]===chapter)})),land,events:chron.events.filter(e=>e.ref?.[0]===book&&e.ref?.[1]===chapter),epochs:chron.epochs.filter(e=>chron.personChapters[key]?.includes(e.personId)),outline:core.outline(book,reader.books[book].chapters.length),harmonies:core.harmonies};
    }
    async function graphicsChronology({query='',kind='events',all=false,book=0,chapter=1}){
      const core=getGraphics();if(!core)fail('UNAVAILABLE','Falta cargar el núcleo gráfico.');
      if(typeof query!=='string'||query.length>150||!['events','kings'].includes(kind))fail('VALIDATION','Filtro inválido.');reader.validate({book,chapter,verse:1});
      const value=await data('bibledata'),q=core.fold(query),key=book+':'+chapter;
      let rows=kind==='events'?value.events:value.epochs.filter(r=>['Reign','Prophet'].includes(r.kind));
      if(!all)rows=rows.filter(r=>r.ref?.[0]===book&&r.ref?.[1]===chapter||kind==='kings'&&value.personChapters[key]?.includes(r.personId));
      rows=rows.filter(r=>core.fold(r.name+' '+r.person+' '+r.id).includes(q)).sort((a,b)=>(Number(a.year||a.start)||Infinity)-(Number(b.year||b.start)||Infinity));return {count:rows.length,items:rows.slice(0,120)};
    }
    const person=(p,people)=>({id:p.id,name:p.name,original:p.original,lookup:p.lookup,ambiguous:p.ambiguous,parents:[...p.father,...p.mother].map(id=>people[id]).filter(Boolean).map(p=>({name:p.name,original:p.original}))});
    async function graphicsPeople({query=''}){
      const core=getGraphics();if(!core)fail('UNAVAILABLE','Falta cargar el núcleo gráfico.');
      if(typeof query!=='string'||query.length>100)fail('VALIDATION','Nombre inválido.');const people=(await data('theographic')).people,q=core.fold(query);
      const rows=Object.values(people).filter(p=>core.fold(core.personName(p)+' '+p.name+' '+p.original+' '+p.lookup).includes(q)).sort((a,b)=>core.personName(a).localeCompare(core.personName(b),'es'));return {count:rows.length,items:rows.slice(0,50).map(p=>person(p,people))};
    }
    async function graphicsGenealogy({id}){
      if(typeof id!=='string'||id.length>100)fail('VALIDATION','Persona no válida.');const people=(await data('theographic')).people,p=Object.hasOwn(people,id)?people[id]:null;if(!p)fail('NOT_FOUND','Persona no encontrada.');
      return {person:person(p,people),groups:['father','mother','partners','children','siblings'].map(kind=>({kind,items:p[kind].map(id=>people[id]).filter(Boolean).map(p=>person(p,people))}))};
    }
    const studySources=()=>Promise.all(['openbible','atlas','natural-earth','bibledata','theographic'].map(async id=>{const manifest=await info(id);return {...manifest,id:manifest.id||id};}));
    return Object.freeze({connections,graphicsChapter,graphicsChronology,graphicsPeople,graphicsGenealogy,studySources});
  }
  return Object.freeze({create});
});
