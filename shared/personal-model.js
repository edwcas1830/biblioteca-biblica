(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./references.js'),require('../platform/bridge-contract.js'),require('../app/prayer-core.js'),require('../app/guide-core.js'),require('./study-model.js'));
  else root.LibraryPersonalModel=factory(root.LibraryReferences,root.LibraryBridgeContract,root.PrayerCore,root.GuideCore,root.StudyChatCore);
})(typeof globalThis!=='undefined'?globalThis:this,function(refs,contract,prayer,guide,chat){
  'use strict';
  const SCHEMA=3,privateFields=['notes','devResponses','planNotes','prayers','prayerDrafts','guideResponses','aiStudies'];
  const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
  const clone=value=>JSON.parse(JSON.stringify(value));
  const fail=message=>{throw new contract.BridgeError('VALIDATION',message);};
  function create({books}={}){
    function position(p,{verseOptional=false}={}){
      if(!p||!Number.isInteger(p.book)||p.book<0||p.book>65||!Number.isInteger(p.chapter)||p.chapter<1||(!verseOptional||p.verse!==undefined)&&(!Number.isInteger(p.verse)||p.verse<1))fail('Referencia fuera del canon.');
      if(books){const chapter=books[p.book]?.chapters[p.chapter-1];if(!chapter)fail('Capítulo fuera del canon.');const count=Math.max(Array.isArray(chapter)?chapter.length:chapter,p.book===63&&p.chapter===1?15:0);if(p.verse>count||p.endVerse>count)fail('Versículo fuera del canon.');}
      if(p.endVerse!==undefined&&(!Number.isInteger(p.endVerse)||p.endVerse<(p.verse||1)))fail('Rango de versículos inválido.');
    }
    function map(value,kind){
      if(value===undefined)return {};
      if(!plain(value)||Object.keys(value).length>35000)fail('Notas personales no válidas.');
      for(const [key,text]of Object.entries(value)){
        if(typeof text!=='string'||text.length>100000)fail('Contenido personal no válido.');
        if(kind==='devResponses'){if(!/^(dev|import)-[a-z0-9-]+:\d+$/.test(key))fail('Referencia de devocional no válida.');}
        else if(kind==='planNotes'){if(!/^plan-\d+(?:-[a-z0-9]+)?:day-[a-f0-9]{32}$/.test(key))fail('Nota de día no válida.');}
        else{let canonical;try{canonical=refs.canonicalKey(key);}catch{fail('Referencia de nota no válida.');}const [book,chapter,verse]=refs.legacyKey(canonical).split('@').at(-1).split(':').map(Number);position({book,chapter,verse});if(kind==='highlights'&&!['gold','sage','rose'].includes(text))fail('Color de marca inválido.');}
      }
      return value;
    }
    function validate(input){
      let json;try{json=JSON.stringify(input);}catch{fail('Estado personal no válido.');}
      if(!json||json.length>12000000||!plain(input)||input.version!==1)fail('Estado personal no válido o demasiado grande.');
      if(input.privateVault||input.privacyEnabled||input.privateLocked)throw new contract.BridgeError('UNAVAILABLE','Esta vista previa todavía no abre cuadernos con PIN. Conserva la copia cifrada para la importación nativa.');
      const state=JSON.parse(json);position(state.position);
      for(const key of ['notes','highlights','devResponses','planNotes'])state[key]=map(state[key],key);
      if(!Array.isArray(state.plans)||state.plans.length>100||!Array.isArray(state.devotionals)||state.devotionals.length>100)fail('Biblioteca personal inválida.');
      const ids=new Set(),dayIds=new Set();
      for(const plan of state.plans){
        if(!plain(plan)||!/^plan-\d+(?:-[a-z0-9]+)?$/.test(plan.id)||ids.has(plan.id)||!Number.isInteger(plan.days)||plan.days<1||plan.days>4000||!Array.isArray(plan.entries)||plan.entries.length!==plan.days||!Array.isArray(plan.completed)||plan.completed.some(i=>!Number.isInteger(i)||i<0||i>=plan.days))fail('Plan o progreso inválido.');
        ids.add(plan.id);plan.completed=[...new Set(plan.completed)];
        if(plan.dayIds!==undefined&&(!Array.isArray(plan.dayIds)||plan.dayIds.length!==plan.days||plan.dayIds.some(id=>!/^day-[a-f0-9]{32}$/.test(id))))fail('Identificadores de días inválidos.');
        for(const id of plan.dayIds||[]){if(dayIds.has(id))fail('Identificador de día repetido.');dayIds.add(id);}
        for(const entry of plan.entries){
          if(!Array.isArray(entry)&&!plain(entry))fail('Lectura de día inválida.');
          const readings=Array.isArray(entry)?entry:entry.readings;
          if(!Array.isArray(readings)||!readings.length||readings.length>100)fail('Pasajes de día inválidos.');
          readings.forEach(p=>position(p,{verseOptional:true}));
        }
      }
      const devotionalIds=new Set();
      for(const dev of state.devotionals){
        if(!plain(dev)||! /^(dev|import)-[a-z0-9-]+$/.test(dev.id)||devotionalIds.has(dev.id)||typeof dev.title!=='string'||!Array.isArray(dev.entries)||!dev.entries.length||dev.entries.length>366||!Array.isArray(dev.completed)||dev.completed.some(i=>!Number.isInteger(i)||i<0||i>=dev.entries.length))fail('Devocional o progreso inválido.');
        devotionalIds.add(dev.id);
        for(const entry of dev.entries){if(!plain(entry)||typeof entry.body!=='string'||entry.body.length>2000000)fail('Día de devocional inválido.');if(entry.book!==undefined||entry.chapter!==undefined)position(entry,{verseOptional:true});if(entry.readings){if(!Array.isArray(entry.readings))fail('Lecturas inválidas.');entry.readings.forEach(p=>position(p,{verseOptional:true}));}}
      }
      try{
        if(!prayer||!guide||!chat)throw Error('Faltan validadores personales.');
        state.prayers=prayer.validate(state.prayers??[]);state.prayerDrafts=prayer.drafts(state.prayerDrafts??{});
        state.guideResponses=guide.responses(state.guideResponses??{});state.aiStudies=chat.validate(state.aiStudies??[]);
        for(const p of state.prayers)if(p.answer)position(p.answer.reference);
      }catch(error){if(error instanceof contract.BridgeError)throw error;fail('El cuaderno contiene datos no válidos.');}
      return state;
    }
    const encodeRef=p=>{const {book,...rest}=p;return {...rest,bookId:refs.bookId(book)};};
    const decodeRef=p=>{if(!/^b(?:00[1-9]|0[1-5]\d|06[0-6])$/.test(p.bookId))fail('Libro canónico inválido.');const {bookId,...rest}=p;return {...rest,book:Number(bookId.slice(1))-1};};
    const encodeEntry=entry=>Array.isArray(entry)?entry.map(encodeRef):{...entry,readings:entry.readings.map(encodeRef)};
    const decodeEntry=entry=>Array.isArray(entry)?entry.map(decodeRef):{...entry,readings:entry.readings.map(decodeRef)};
    async function encode(input,previous=null){
      const state=validate(input),all=new Set(),plans=[];
      for(const p of state.plans){
        const old=previous?.plans.find(v=>v.id===p.id),matches=new Map();
        if(old)old.entries.forEach((e,i)=>{const key=JSON.stringify(e);if(!matches.has(key))matches.set(key,[]);matches.get(key).push(i);});
        const days=[];
        for(let i=0;i<p.entries.length;i++){
          const entry=p.entries[i],same=matches.get(JSON.stringify(entry))||[];
          let id=p.dayIds?.[i];
          if(!id&&old){if(same.length===1)id=old.dayIds[same[0]];else if(JSON.stringify(old.entries[i])===JSON.stringify(entry))id=old.dayIds[i];}
          id=id||await refs.dayId(p.id,i,entry);
          if(all.has(id))fail('Identificador de día repetido.');all.add(id);
          days.push({id,entry:encodeEntry(entry),completed:p.completed.includes(i)});
        }
        const {entries,completed,dayIds,...header}=p;plans.push({header,days});
      }
      const {notes,highlights,plans:removed,...settings}=state;delete settings.privacyEnabled;delete settings.privateLocked;
      settings.position=encodeRef(settings.position);
      return {schema:SCHEMA,state:settings,plans,annotations:[...new Set([...Object.keys(notes),...Object.keys(highlights)])].map(key=>({reference:refs.canonicalKey(key),note:notes[key]??null,highlight:highlights[key]??null}))};
    }
    function decode(record){
      if(!record)return null;
      try{
        if(record.schema!==SCHEMA||!plain(record.state)||!Array.isArray(record.annotations)||!Array.isArray(record.plans))fail('Esquema de datos incompatible.');
        const state=clone(record.state);state.position=decodeRef(state.position);state.notes={};state.highlights={};
        const seen=new Set();
        for(const a of record.annotations){const key=refs.legacyKey(a.reference);if(seen.has(key))fail('Nota duplicada.');seen.add(key);if(a.note!==null)state.notes[key]=a.note;if(a.highlight!==null)state.highlights[key]=a.highlight;}
        state.plans=record.plans.map(p=>({...p.header,entries:p.days.map(d=>decodeEntry(d.entry)),dayIds:p.days.map(d=>d.id),completed:p.days.flatMap((d,i)=>d.completed?[i]:[])}));
        return {...validate(state),privacyEnabled:false,privateLocked:false};
      }catch{throw new contract.BridgeError('CORRUPT','La biblioteca guardada necesita recuperación. No se reemplazará.');}
    }
    return Object.freeze({validate,encode,decode,privateFields});
  }
  return Object.freeze({SCHEMA,create});
});
