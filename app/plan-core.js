(function(root){
  'use strict';
  const clean=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[–—−]/g,'-');
  const aliases=[['genesis','gen','gn'],['exodo','ex','exo'],['levitico','lev','lv'],['numeros','num','nm'],['deuteronomio','deut','dt'],['josue','jos'],['jueces','jue'],['rut','ruth'],['1 samuel','1 sam','1sam','1 s'],['2 samuel','2 sam','2sam','2 s'],['1 reyes','1 rey','1re','1 r'],['2 reyes','2 rey','2re','2 r'],['1 cronicas','1 cro','1cr'],['2 cronicas','2 cro','2cr'],['esdras','esd'],['nehemias','neh'],['ester','est'],['job'],['salmos','salmo','sal','sl','ps'],['proverbios','prov','pr'],['eclesiastes','ecl','ec'],['cantares','cantar de los cantares','cant'],['isaias','isa','is'],['jeremias','jer','jr'],['lamentaciones','lam','lm'],['ezequiel','eze','ez'],['daniel','dan','dn'],['oseas','os'],['joel','jl'],['amos','am'],['abdias','abd','ab'],['jonas','jon'],['miqueas','miq','mi'],['nahum','nah'],['habacuc','hab'],['sofonias','sof'],['hageo','hag','ag'],['zacarias','zac'],['malaquias','mal'],['mateo','mat','mt'],['marcos','mar','mr','mc'],['lucas','luc','lc'],['juan','jn','jua'],['hechos','hech','hch'],['romanos','rom','ro'],['1 corintios','1 cor','1co'],['2 corintios','2 cor','2co'],['galatas','gal'],['efesios','efe','ef'],['filipenses','filip','fil','flp'],['colosenses','col'],['1 tesalonicenses','1 tes','1ts'],['2 tesalonicenses','2 tes','2ts'],['1 timoteo','1 tim','1tm'],['2 timoteo','2 tim','2tm'],['tito','tit'],['filemon','flm'],['hebreos','heb'],['santiago','sant','stg'],['1 pedro','1 ped','1pe'],['2 pedro','2 ped','2pe'],['1 juan','1 jn','1jn'],['2 juan','2 jn','2jn'],['3 juan','3 jn','3jn'],['judas','jud'],['apocalipsis','apoc','ap','revelacion']];
  const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const aliasBook=new Map();aliases.forEach((list,b)=>list.forEach(a=>aliasBook.set(a.replace(/\s/g,''),b)));
  const pattern=aliases.flat().sort((a,b)=>b.length-a.length).map(a=>escape(a).replace(/\s+/g,'\\s*')).join('|');
  const bookPattern=new RegExp('(^|[^a-z0-9])('+pattern+')\\.?\\s*(?=\\d)','g');
  const uid=()=> 'plan-'+Date.now()+'-'+Math.random().toString(36).slice(2,8);
  const limit=2000000;
  function formatRef(ref,books){return books[ref.book].name+' '+ref.chapter+(ref.verse?':'+ref.verse+(ref.endVerse&&ref.endVerse!==ref.verse?'-'+ref.endVerse:''):'');}
  function checkRef(ref,books){
    const ch=books[ref?.book]?.chapters[ref?.chapter-1];
    if(!Number.isInteger(ref?.book)||!Number.isInteger(ref?.chapter)||!ch)throw new Error('Libro o capítulo fuera de rango.');
    if(ref.verse!==undefined&&(!Number.isInteger(ref.verse)||ref.verse<1||ref.verse>ch.length))throw new Error('Versículo fuera de rango.');
    if(ref.endVerse!==undefined&&(!Number.isInteger(ref.endVerse)||ref.verse===undefined||ref.endVerse<ref.verse||ref.endVerse>ch.length))throw new Error('Rango de versículos fuera de rango.');
    return {book:ref.book,chapter:ref.chapter,...(ref.verse!==undefined?{verse:ref.verse}:{}),...(ref.endVerse!==undefined?{endVerse:ref.endVerse}:{})};
  }
  function parseReferences(value,books){
    const text=clean(value),matches=[...text.matchAll(bookPattern)],refs=[],ranges=[],warnings=[];
    for(let i=0;i<matches.length;i++){
      const match=matches[i],b=aliasBook.get(match[2].replace(/\s/g,''));
      let offset=match.index+match[0].length,segment=text.slice(offset,i+1<matches.length?matches[i+1].index:text.length),first=true;
      while(segment.length){
        const spec=segment.match(/^(\d+)(?:\s*:\s*(\d+))?(?:\s*-\s*(\d+)(?:\s*:\s*(\d+))?)?/);
        if(!spec)break;
        const c=Number(spec[1]),v=spec[2]===undefined?undefined:Number(spec[2]);
        const n=spec[3]===undefined?undefined:Number(spec[3]),lastV=spec[4]===undefined?undefined:Number(spec[4]);
        const endC=n===undefined?c:v!==undefined&&lastV===undefined?c:n;
        const readings=[];
        try{
          if(endC<c||endC-c>149)throw new Error('Rango de capítulos inválido o demasiado amplio.');
          for(let ch=c;ch<=endC;ch++){
            const ref={book:b,chapter:ch};
            if(v!==undefined){ref.verse=ch===c?v:1;ref.endVerse=endC===c?(n===undefined?v:lastV===undefined?n:lastV):(ch===endC?lastV:books[b]?.chapters[ch-1]?.length);}
            readings.push(checkRef(ref,books));
          }
          refs.push(...readings);ranges.push({start:first?match.index+match[1].length:offset,end:offset+spec[0].length,refs:readings});
        }catch(error){warnings.push(`${books[b].name} ${spec[0]}: ${error.message}`);}
        first=false;offset+=spec[0].length;segment=segment.slice(spec[0].length);
        const separator=segment.match(/^\s*(?:[,;]|y(?=\s))\s*(?=\d)/);
        if(!separator)break;offset+=separator[0].length;segment=segment.slice(separator[0].length);
      }
    }
    const unique=[...new Map(refs.map(r=>[JSON.stringify(r),r])).values()];
    return {refs:unique,ranges,warnings};
  }
  function plainRecord(value){
    let text='',spans=[];const parts=String(value).split(/(~~[\s\S]*?~~)/g);
    for(const part of parts){const strike=part.startsWith('~~')&&part.endsWith('~~'),content=strike?part.slice(2,-2):part;text+=content;spans.push({text:content,strike});}
    return {text,spans,checkbox:'none'};
  }
  function markOf(record,parsed,highlights=false){
    const text=clean(record.text);
    const checked=record.checkbox==='checked'||/\[\s*[x✓]\s*\]|[☑✅✓✔]/i.test(text)||/(?:^|[\t|])\s*(?:completado|leido|hecho|si)\s*$/.test(text);
    const unchecked=record.checkbox==='unchecked'||/\[\s*\]|☐/.test(text);
    const mask=[];
    for(const span of record.spans||[{text:record.text,strike:false}])for(const char of clean(span.text))mask.push(Boolean(span.strike||highlights&&span.highlight&&span.highlight!=='none'));
    const statuses=parsed.ranges.map(range=>{
      const indexes=[];for(let i=range.start;i<range.end;i++)if(/[a-z0-9]/.test(text[i]||''))indexes.push(i);
      const marked=indexes.filter(i=>mask[i]).length;return indexes.length&&marked===indexes.length?'all':marked?'partial':'none';
    });
    const all=Boolean(statuses.length)&&statuses.every(s=>s==='all');
    const partial=statuses.some(s=>s==='partial')||(statuses.some(s=>s==='all')&&!all);
    const outsideStrike=mask.some(Boolean)&&!all&&!partial;
    if(record.checkbox==='mixed'||checked&&unchecked||!highlights&&unchecked&&(all||partial))return {completed:false,ambiguous:true,reason:'Hay marcas contradictorias. Confirma el estado de este día.'};
    if(checked)return {completed:true,ambiguous:false,reason:'Casilla o marca de completado detectada.'};
    if(partial||outsideStrike)return {completed:false,ambiguous:true,reason:'Hay tachados parciales. Revisa si completaste todas las lecturas.'};
    if(all)return {completed:true,ambiguous:false,reason:'Todas las referencias están tachadas en el documento.'};
    return {completed:false,ambiguous:false,reason:''};
  }
  function dayHeading(text){
    const s=clean(text).trim().replace(/^(?:\[[ x✓]*\]|[☑☐✅✓✔])\s*/i,'');
    const day=s.match(/^(?:[-*]\s*)?(?:dia|day|jornada)\s*(\d{1,4})(?:\s*[.):-])?/);
    if(day)return {title:'Día '+day[1],kind:'explicit'};
    const date=s.match(/^(?:[-*]\s*)?(\d{1,2}[\/.\-]\d{1,2}(?:[\/.\-]\d{2,4})?)(?=\s|\t|[|:])/);
    if(date)return {title:date[1],kind:'date'};
    const month=s.match(/^(\d{1,2}\s+(?:de\s+)?(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)(?:\s+(?:de\s+)?\d{4})?)(?=\s|[|:])/);
    if(month)return {title:month[1],kind:'date'};
    const number=s.match(/^(?:[-*]\s*)?(\d{1,4})\s*(?:[.):-]|\t|\|)/);
    if(number)return {title:'Día '+number[1],kind:'explicit'};
    return null;
  }
  function parseRecords(records,filename,books){
    const groups=[],preface=[];let current=null;
    for(const record of records){
      if(!record.text.trim())continue;
      const parsed=parseReferences(record.text,books),heading=record.dayTitle?{title:record.dayTitle,kind:'explicit'}:dayHeading(record.text);
      if(heading||(parsed.refs.length||parsed.warnings.length)&&(!current||current.implicit)){
        current={title:heading?.title||'Día '+(groups.length+1),records:[],implicit:!heading};groups.push(current);
      }
      if(current)current.records.push(record);else preface.push(record.text);
    }
    if(!groups.length)throw new Error('No se detectaron días ni referencias. Usa líneas como «Día 1 · Génesis 1-3» o un plan JSON.');
    if(groups.length>1189)throw new Error('El plan supera los 1,189 días.');
    const entries=groups.map(group=>{
      const parsedRows=group.records.map(record=>{const parsed=parseReferences(record.text,books);return {record,parsed,mark:markOf(record,parsed)};});
      const readings=parsedRows.flatMap(row=>row.parsed.refs),relevant=parsedRows.filter(row=>row.parsed.refs.length);
      const hasCheck=parsedRows.some(row=>row.mark.completed&&row.mark.reason==='Casilla o marca de completado detectada.');
      const ambiguous=parsedRows.some(row=>row.mark.ambiguous);
      const completed=!ambiguous&&(hasCheck||relevant.length>0&&relevant.every(row=>row.mark.completed));
      const warnings=parsedRows.flatMap(row=>row.parsed.warnings);
      if(ambiguous)warnings.push('Tachado parcial o marcas contradictorias: confirma el día.');
      if(!readings.length)warnings.push('Sin pasajes reconocidos. Puede ser un descanso o requerir corrección.');
      const highlighted=relevant.length>0&&relevant.every(row=>{const mark=markOf(row.record,row.parsed,true);return mark.completed&&!mark.ambiguous;});
      const highlightColors=[...new Set(group.records.flatMap(record=>(record.spans||[]).filter(span=>span.highlight&&span.highlight!=='none').map(span=>span.highlight)))];
      return {title:group.title,sourceText:group.records.map(r=>r.text).join('\n').slice(0,20000),readings:[...new Map(readings.map(r=>[JSON.stringify(r),r])).values()],warnings:[...new Set(warnings)],highlightCandidate:highlighted&&!completed,highlightColors,detectedCompleted:completed,completionOrigin:completed?(hasCheck?'Marca de completado del archivo':'Referencias tachadas en el archivo'):''};
    });
    return {id:uid(),scope:'custom',title:filename.replace(/\.[^.]+$/,'').slice(0,200),sourceName:filename.slice(0,200),description:preface.join('\n').slice(0,20000),days:entries.length,entries,completed:entries.flatMap((entry,i)=>entry.detectedCompleted?[i]:[]),createdAt:new Date().toISOString()};
  }
  function importText(filename,text,books){
    if(typeof text!=='string'||text.length>limit||!text.trim())throw new Error('El plan está vacío o supera los 2 MB de texto.');
    return parseRecords(text.replace(/^\uFEFF/,'').split(/\r?\n/).map(plainRecord),filename,books);
  }
  function validateCustomPlan(data,books){
    if(!data||typeof data.title!=='string'||!data.title.trim()||!Array.isArray(data.entries)||!data.entries.length||data.entries.length>1189)throw new Error('El plan necesita un título y entre 1 y 1,189 días.');
    const entries=data.entries.map((entry,i)=>{
      if(!entry||typeof entry.title!=='string'||entry.title.length>200||typeof entry.sourceText!=='string'||entry.sourceText.length>20000||!Array.isArray(entry.readings)||entry.readings.length>300)throw new Error(`El día ${i+1} no tiene un formato válido.`);
      const warnings=Array.isArray(entry.warnings)?entry.warnings.map(w=>String(w).slice(0,500)).slice(0,30):[];
      return {title:entry.title,sourceText:entry.sourceText,readings:entry.readings.map(r=>checkRef(r,books)),warnings,highlightCandidate:entry.highlightCandidate===true,highlightColors:Array.isArray(entry.highlightColors)?entry.highlightColors.slice(0,10).map(c=>String(c).slice(0,30)):[],completionOrigin:typeof entry.completionOrigin==='string'?entry.completionOrigin.slice(0,200):''};
    });
    if(!Array.isArray(data.completed)||data.completed.some(i=>!Number.isInteger(i)||i<0||i>=entries.length))throw new Error('El avance del plan no es válido.');
    return {id:uid(),scope:'custom',title:data.title.trim().slice(0,200),sourceName:String(data.sourceName||'').slice(0,200),description:String(data.description||'').slice(0,20000),days:entries.length,entries,completed:[...new Set(data.completed)],createdAt:typeof data.createdAt==='string'?data.createdAt:new Date().toISOString()};
  }
  function importJson(filename,text,books){
    if(text.length>limit)throw new Error('El plan supera los 2 MB de texto.');
    const data=JSON.parse(text);
    if(data.scope==='custom'&&Array.isArray(data.entries)&&data.entries.every(e=>Array.isArray(e.readings)))return {...validateCustomPlan(data,books),sourceName:filename.slice(0,200)};
    if(!Array.isArray(data.days)||!data.days.length)throw new Error('El JSON necesita title y days. También puedes cargar un plan exportado por la app.');
    if(data.days.length>1189)throw new Error('El plan supera los 1,189 días.');
    const entries=data.days.map((day,i)=>{
      if(!day||typeof day.reading!=='string'||day.reading.length>20000||typeof day.completed!=='boolean')throw new Error('Cada día necesita reading de texto y completed verdadero o falso.');
      const parsed=parseReferences(day.reading,books);
      return {title:String(day.title||'Día '+(i+1)).slice(0,200),sourceText:day.reading,readings:parsed.refs,warnings:parsed.warnings.concat(parsed.refs.length?[]:['Sin pasajes reconocidos: revisa esta lectura.']),completionOrigin:day.completed?'Marcado en el archivo JSON':''};
    });
    return validateCustomPlan({title:data.title,sourceName:filename,description:data.description||'',entries,completed:data.days.flatMap((d,i)=>d.completed?[i]:[])},books);
  }
  const signature=entry=>clean(entry.title).replace(/\s+/g,' ').trim()+'|'+JSON.stringify(entry.readings);
  function mergePlan(old,incoming,books){
    if(old.scope!=='custom')throw new Error('Este plan no fue importado. Guarda el documento como un plan nuevo.');
    const next=validateCustomPlan(incoming,books),keys=new Map(next.entries.map((entry,i)=>[signature(entry),i]));
    if(keys.size!==next.entries.length)throw new Error('Hay días repetidos; corrige sus títulos antes de actualizar.');
    for(const entry of old.entries)if(!keys.has(signature(entry)))throw new Error('Este archivo quitó días o cambió sus lecturas. Guárdalo como otro plan para conservar el anterior.');
    const done=new Set(next.completed);
    old.completed.forEach(i=>done.add(keys.get(signature(old.entries[i]))));
    return {...next,id:old.id,completed:[...done].sort((a,b)=>a-b),createdAt:old.createdAt,updatedAt:new Date().toISOString()};
  }
  const api={clean,formatRef,parseReferences,plainRecord,parseRecords,importText,importJson,validateCustomPlan,mergePlan,signature};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.PlanCore=api;
})(typeof window==='object'?window:globalThis);
