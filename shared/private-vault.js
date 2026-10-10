(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('../app/prayer-core.js'),require('../app/guide-core.js'),require('../app/study-chat-core.js'));
  else root.LibraryPrivateVault=factory(root.PrayerCore,root.GuideCore,root.StudyChatCore);
})(typeof globalThis!=='undefined'?globalThis:this,function(prayer,guide,chat){
  'use strict';
  const fields=['notes','devResponses','planNotes','prayers','prayerDrafts','guideResponses','aiStudies'];
  const empty=()=>({notes:{},devResponses:{},planNotes:{},prayers:[],prayerDrafts:{},guideResponses:{},aiStudies:[]});
  const privatePart=state=>Object.fromEntries(fields.map(f=>[f,state[f]??empty()[f]]));
  function validate(envelope){
    if(!envelope||envelope.v!==1||!/^[a-f0-9]{32}$/.test(envelope.salt)||!/^[a-f0-9]{24}$/.test(envelope.iv)||!/^[a-f0-9]{32}$/.test(envelope.tag)||typeof envelope.data!=='string'||!envelope.data.length||envelope.data.length>16000000||envelope.data.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(envelope.data))throw Error('La copia privada está dañada o no es compatible.');
    return {v:1,salt:envelope.salt,iv:envelope.iv,tag:envelope.tag,data:envelope.data};
  }
  function validatePrivate(part,books){
    if(!part||typeof part!=='object'||Array.isArray(part))throw Error('Cuaderno privado no válido.');const out=privatePart(part);
    const validRef=r=>Number.isInteger(r.book)&&r.book>=0&&r.book<66&&Number.isInteger(r.chapter)&&r.chapter>0&&Number.isInteger(r.verse)&&r.verse>0&&(!books||r.verse<=Math.max(books[r.book]?.chapters[r.chapter-1]?.length||0,r.book===63&&r.chapter===1?15:0));
    for(const field of ['notes','devResponses','planNotes']){
      const values=out[field];if(!values||typeof values!=='object'||Array.isArray(values)||Object.keys(values).length>35000)throw Error('Notas privadas no válidas.');
      for(const [key,text]of Object.entries(values)){
        if(typeof text!=='string'||text.length>100000)throw Error('Contenido privado no válido.');
        if(field==='devResponses'){if(!/^(dev|import)-[a-z0-9-]+:\d+$/.test(key))throw Error('Referencia privada no válida.');}
        else if(field==='planNotes'){if(!/^plan-\d+(?:-[a-z0-9]+)?:day-[a-f0-9]{32}$/.test(key))throw Error('Nota de día no válida.');}
        else{if(!/^([a-z0-9-]{1,80}@)?\d+:\d+:\d+$/.test(key))throw Error('Referencia privada no válida.');const [book,chapter,verse]=key.split('@').at(-1).split(':').map(Number);if(!validRef({book,chapter,verse}))throw Error('Referencia privada fuera del canon.');}
      }
    }
    out.prayers=prayer.validate(out.prayers);for(const p of out.prayers)if(p.answer&&!validRef(p.answer.reference))throw Error('Versículo privado fuera del canon.');
    out.prayerDrafts=prayer.drafts(out.prayerDrafts);out.guideResponses=guide.responses(out.guideResponses);out.aiStudies=chat.validate(out.aiStudies);return out;
  }
  return Object.freeze({fields,empty,privatePart,validate,validatePrivate});
});
