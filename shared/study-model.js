(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('../app/study-chat-core.js'));
  else root.StudyChatCore=factory(root.StudyChatCore);
})(typeof globalThis!=='undefined'?globalThis:this,function(legacy){
  'use strict';
  const str=(v,n)=>typeof v==='string'?v.slice(0,n):'';
  function anchor(value){const a=legacy.anchor(value),endVerse=value.endVerse??a.verse;if(a.scope==='verse'&&(!Number.isInteger(endVerse)||endVerse<a.verse||endVerse>176))throw Error('Rango de estudio no válido.');return {...a,...(a.scope==='verse'?{endVerse}:{})};}
  function key(a){return legacy.key(a)+(a.scope==='verse'&&(a.endVerse??a.verse)!==a.verse?'-'+a.endVerse:'');}
  function validate(value){
    if(value===undefined)return [];
    if(!Array.isArray(value)||value.length>50||JSON.stringify(value).length>2200000)throw Error('Estudios de IA no válidos.');
    const seen=new Set();return value.map(t=>{
      const a=anchor(t.anchor);if(t.id!==key(a)||seen.has(t.id))throw Error('El hilo no coincide con su rango.');seen.add(t.id);
      const old=legacy.validate([{...t,id:legacy.key(a),anchor:a}])[0];
      old.id=t.id;old.anchor=a;old.messages=old.messages.map((m,i)=>{const raw=t.messages[i];
        if(m.role!=='assistant')return m;
        for(const k of ['action','brief','texto','interpretacion','conexiones'])if(raw[k]!==undefined)m[k]=str(raw[k],k==='action'?20:6000);
        if(Array.isArray(raw.seguimientos))m.seguimientos=raw.seguimientos.filter(v=>typeof v==='string').slice(0,3).map(v=>str(v,180));
        if(Array.isArray(raw.fuentes))m.fuentes=raw.fuentes.slice(0,40).filter(s=>s&&typeof s==='object').map(s=>({sourceId:s.sourceId,modulo:str(s.modulo,80),strong:str(s.strong,10),extracto:str(s.extracto,2500),title:str(s.title,200),license:str(s.license,1000),attribution:str(s.attribution,1500),...(s.ref&&legacy.ref(s.ref)?{ref:anchor({...s.ref,module:'rv1909'})}:{})}));
        m.sources=m.sources.map((s,j)=>({...s,...(Number.isInteger(raw.sources?.[j]?.endVerse)?{endVerse:raw.sources[j].endVerse}:{})}));return m;
      });return old;
    });
  }
  return {...legacy,anchor,key,validate};
});
