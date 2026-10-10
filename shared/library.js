(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('../platform/bridge-contract.js'),require('./references.js'),require('./rtf.js'));
  else root.LibraryReader=factory(root.LibraryBridgeContract,root.LibraryReferences,root.LibraryRtf);
})(typeof globalThis!=='undefined'?globalThis:this,function(contract,refs,rtf){
  'use strict';
  const fail=(code,message)=>{throw new contract.BridgeError(code,message);};
  const yieldThread=()=>new Promise(resolve=>setTimeout(resolve,0));
  const topicKey=s=>rtf.clean(String(s).replace(/\s*\(\d+\)\s*$/,'').trim());
  function create({bible,manifest={},source,index}={}){
    if(!Array.isArray(bible?.books)||bible.books.length!==66||!source)fail('VALIDATION','Falta inicializar la biblioteca.');
    const books=structuredClone(bible.books),modules=new Map(),topics=new Map();let pending,revision;
    function validate(p){
      const text=books[p?.book]?.chapters[p?.chapter-1],n=Array.isArray(text)?text.length:0;
      if(!p||!Number.isInteger(p.book)||p.book<0||p.book>65||!Number.isInteger(p.chapter)||p.chapter<1||!text||!Number.isInteger(p.verse)||p.verse<1||p.verse>Math.max(n,p.book===63&&p.chapter===1?15:0))fail('VALIDATION','Referencia fuera del canon admitido.');
      return refs.anchor(p);
    }
    const ready=()=>pending||(pending=(async()=>{
      revision=await refs.digest(JSON.stringify(books));
      modules.set('rv1909',{...manifest,id:'rv1909',tipo:'biblia',rol:'version',titulo:'Reina-Valera 1909',abreviatura:'RV1909',sha256:revision,licencia:manifest.licencia||'Dominio público',versificacion:manifest.versificacion||'Numeración de la fuente RV1909',publico:true,iaPermitida:manifest.iaPermitida===true});
      const catalog=await source.catalog();
      for(const m of catalog.modules){if(modules.has(m.id))fail('CORRUPT','Identificador de fuente duplicado.');modules.set(m.id,m);}
      return catalog.warnings||[];
    })().catch(e=>{pending=null;modules.clear();throw e;}));
    async function get(id){await ready();const m=modules.get(id);if(!m)fail('NOT_FOUND','Este módulo no está instalado.');if(id!=='rv1909')await source.check(id);return m;}
    function parsed(row,book){
      if(typeof row.Scripture!=='string')fail('CORRUPT','Texto de versículo no válido.');
      return rtf.parseRtf(row.Scripture,{nt:book>=39,esword:true});
    }
    async function catalog(){const warnings=await ready();return {modules:[...modules.values()].map(m=>({...m})),warnings:[...warnings],versions:[...modules.values()].filter(m=>m.tipo==='biblia'&&m.rol==='version').map(m=>m.id),dictionaryGroups:[['strong-es'],['vine-at','vine-nt'],['drae-1','drae-2','drae-3'],['step-hebrew','step-greek']].filter(ids=>ids.some(id=>modules.has(id)))};}
    async function chapter({module='rv1909',book,chapter,strong=false}){
      validate({book,chapter,verse:1});const m=await get(module);if(m.tipo!=='biblia')fail('VALIDATION','La fuente elegida no es una Biblia.');
      const rows=module==='rv1909'?books[book].chapters[chapter-1].map((Scripture,i)=>({Verse:i+1,Scripture})):await source.chapter(module,book+1,chapter);
      let support=null;
      if(module==='rv1960'&&modules.has('rv1960-strong')){await get('rv1960-strong');support=new Map((await source.chapter('rv1960-strong',book+1,chapter)).map(r=>[r.Verse,r]));}
      let previous=0;
      const verses=rows.map(row=>{
        const p={book,chapter,verse:row.Verse,...(row.VerseEnd>row.Verse?{endVerse:row.VerseEnd}:{})};validate(p);if(p.endVerse)validate({...p,verse:p.endVerse});
        if(row.Verse<=previous||row.VerseEnd!==undefined&&row.VerseEnd!==null&&(!Number.isInteger(row.VerseEnd)||row.VerseEnd<row.Verse))fail('CORRUPT','Numeración de versículos no válida.');previous=row.Verse;
        let text=module==='rv1909'?{text:row.Scripture,strong:[],tokens:[{kind:'text',text:row.Scripture}]}:parsed(row,book);
        if(support?.has(row.Verse))text=rtf.withStrong(text,parsed(support.get(row.Verse),book));
        return {...p,reference:refs.anchor(p),text:text.text,html:rtf.html(text,{showStrong:strong,original:true})+(text.text?'':'<span class="muted">Esta referencia no tiene texto en esta fuente.</span>'),strong:text.strong,alignment:text.alignment??true};
      });return {module,revision:m.sha256,title:m.titulo,verses};
    }
    async function* biblePages(module){
      if(module==='rv1909'){for(let book=0;book<books.length;book++){const page=[];for(let c=0;c<books[book].chapters.length;c++)books[book].chapters[c].forEach((text,v)=>page.push({book,chapter:c+1,verse:v+1,text,strong:''}));yield page;}}
      else for await(const rows of source.biblePages(module))yield rows.map(r=>{const p={book:r.Book-1,chapter:r.Chapter,verse:r.Verse,...(r.VerseEnd>r.Verse?{endVerse:r.VerseEnd}:{})};validate(p);if(p.endVerse)validate({...p,verse:p.endVerse});const text=parsed(r,p.book);return {...p,text:text.text,strong:text.strong.join(' ')};});
    }
    async function search({module='rv1909',query='',mode='text'}){
      if(typeof query!=='string'||query.length>200||!['text','word','strong'].includes(mode))fail('VALIDATION','Consulta no válida.');
      await ready();
      if(mode==='strong'){
        if(!/^[HG]\d{1,5}$/i.test(query.trim()))fail('VALIDATION','Escribe un número como G25 o H7225.');
        if(!modules.get(module)?.strong&&modules.has('rv1960-strong'))module='rv1960-strong';
        query=query.trim()[0].toUpperCase()+Number(query.trim().slice(1));
      }
      const m=await get(module);if(m.tipo!=='biblia')fail('VALIDATION','Busca en una Biblia.');
      if(mode==='strong'&&!m.strong&&module!=='rv1960-strong')fail('UNAVAILABLE','Esta fuente no contiene números Strong.');
      const words=rtf.clean(query).match(/[\p{L}\p{N}]+/gu)||[];
      if(!words.length)return {module,revision:m.sha256,count:0,results:[]};
      if(index){const result=await index.search({module,revision:m.sha256,words,mode,pages:()=>biblePages(module),verify:()=>get(module)});return {...result,module,revision:m.sha256,results:result.results.map(p=>({...p,reference:validate(p)}))};}
      const results=[];let count=0;
      for await(const page of biblePages(module)){
        for(const row of page){const tokens=rtf.clean(mode==='strong'?row.strong:row.text).match(/[\p{L}\p{N}]+/gu)||[];if(words.every(w=>tokens.some(t=>mode==='text'?t.startsWith(w):t===w))){count++;if(results.length<100){const {strong,...p}=row;results.push({...p,reference:refs.anchor(p)});}}}
        await yieldThread();
      }
      await get(module);return {module,revision:m.sha256,count,results};
    }
    async function comments({module,book,chapter,verse,endVerse=verse}){
      validate({book,chapter,verse});validate({book,chapter,verse:endVerse});if(endVerse<verse)fail('VALIDATION','Rango de estudio invertido.');
      const m=await get(module);if(m.tipo!=='comentario')fail('VALIDATION','La fuente elegida no es un comentario.');
      const rows=await source.comments(module,{book:book+1,chapter,verse,endVerse});
      return {module,revision:m.sha256,entries:rows.map(row=>{if(typeof row.Comments!=='string')fail('CORRUPT','Comentario no válido.');const p=rtf.parseRtf(row.Comments,{esword:true});return {label:row.label,text:p.text,html:rtf.html(p)};})};
    }
    async function dictionary({group='strong-es',query=''}){
      if(typeof query!=='string'||query.length>100)fail('VALIDATION','Consulta de diccionario no válida.');
      if(!query.trim())return {entries:[]};await ready();
      const ids=group==='vine'?['vine-at','vine-nt']:group==='drae'?['drae-1','drae-2','drae-3']:[group];
      if(!ids.some(id=>modules.has(id)))fail('NOT_FOUND','Este diccionario no está instalado.');
      const raw=topicKey(query),needle=/^[hg]\d+$/i.test(raw)?raw[0]+Number(raw.slice(1)):raw,matches=[];
      for(const id of ids){
        if(!modules.has(id))continue;const m=await get(id);if(m.tipo!=='diccionario')fail('VALIDATION','La fuente elegida no es un diccionario.');
        const topicRow=row=>{if(typeof row.Topic!=='string'||row.Topic.length>1000)fail('CORRUPT','Entrada de diccionario no válida.');return {topic:row.Topic,key:topicKey(row.Topic),search:id.startsWith('step-')&&row.Definition?rtf.clean(rtf.parseRtf(row.Definition,{esword:true}).text):''};};
        if(index?.dictionary){
          matches.push(...await index.dictionary({module:id,revision:m.sha256,needle,rae:group==='drae',verify:()=>get(id),pages:async function*(){for await(const rows of source.topicPages(id))yield rows.map(topicRow);}}));continue;
        }
        let cached=topics.get(id);
        if(cached?.revision!==m.sha256){const values=[],seen=new Set();for await(const rows of source.topicPages(id)){
          for(const row of rows){if(seen.has(row.Topic))continue;seen.add(row.Topic);values.push(topicRow(row));}
          if(values.length>500000)fail('CORRUPT','Diccionario demasiado grande.');await yieldThread();
        }cached={revision:m.sha256,values};topics.set(id,cached);}
        for(const t of cached.values){
          const hit=group==='drae'?t.key.startsWith(needle):/^[hg]\d+$/.test(needle)?t.key===needle:t.key.includes(needle)||t.search.includes(needle);
          if(hit)matches.push({...t,module:id,revision:m.sha256,exact:t.key===needle});
        }
      }
      if(group==='drae')matches.sort((a,b)=>Number(b.exact)-Number(a.exact)||(a.key<b.key?-1:a.key>b.key?1:a.topic.localeCompare(b.topic,'es',{numeric:true})));
      const entries=[];
      for(const match of matches.slice(0,30))for(const row of await source.definitions(match.module,match.topic)){
        if(typeof row.Definition!=='string')fail('CORRUPT','Definición no válida.');const p=rtf.parseRtf(row.Definition,{esword:true});entries.push({module:match.module,revision:match.revision,title:row.Topic,text:p.text,html:rtf.html(p),exact:match.exact});if(entries.length>=30)break;
      }
      return {entries:entries.slice(0,30)};
    }
    async function compare({modules:ids,book,chapter:ch,verse}){
      validate({book,chapter:ch,verse:verse||1});if(!Array.isArray(ids)||ids.length<2||ids.length>3||new Set(ids).size!==ids.length)fail('VALIDATION','Elige dos o tres versiones diferentes.');
      const chapters=await Promise.all(ids.map(module=>chapter({module,book,chapter:ch})));
      const numbers=[...new Set(chapters.flatMap(c=>c.verses.flatMap(v=>Array.from({length:(v.endVerse||v.verse)-v.verse+1},(_,i)=>v.verse+i))))].sort((a,b)=>a-b).filter(n=>!verse||n===verse);
      return {versions:chapters.map(c=>({module:c.module,title:c.title,revision:c.revision})),rows:numbers.map(n=>({verse:n,cells:chapters.map(c=>c.verses.find(v=>v.verse===n)||(()=>{const joined=c.verses.find(v=>v.verse<n&&v.endVerse>=n);return joined?{...joined,text:verse?joined.text:'',rangeCovered:true}:null;})())})),notice:'Alineación por número de versículo de cada módulo; puede haber diferencias de versificación. Un espacio vacío indica texto ausente, no un versículo omitido por la app.'};
    }
    const metadata=async()=>books.map((b,i)=>({name:b.name,chapters:b.chapters.map((c,j)=>Math.max(c.length,i===63&&j===0?15:0))}));
    return Object.freeze({catalog,metadata,chapter,search,comments,dictionary,compare,get,validate,books});
  }
  return Object.freeze({create});
});
