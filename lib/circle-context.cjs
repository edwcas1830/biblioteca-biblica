'use strict';
function circleContext(store,library,selection){
 const state=store.load();if(!state)throw Error('Abre la biblioteca primero.');if(state.privateLocked)throw Error('Abre tu cuaderno antes de compartir.');
 if(selection.kind==='prayer'){const prayer=state.prayers.find(p=>p.id===selection.id);if(!prayer)throw Error('Petición no encontrada.');return {kind:'prayer',object:'prayer:'+prayer.id,value:{title:prayer.title,text:prayer.body.slice(0,12000),completed:prayer.status==='answered',refs:[]}};}
 if(selection.kind==='reading'){const plan=state.plans.find(p=>p.id===selection.plan),index=plan?.dayIds.indexOf(selection.day);if(!plan||index<0)throw Error('Día del plan no encontrado.');const entry=plan.entries[index],refs=(Array.isArray(entry)?entry:entry.readings||[]).slice(0,50).map(r=>({book:r.book,chapter:r.chapter,verse:r.verse||1,...(r.endVerse?{endVerse:r.endVerse}:{})}));for(const ref of refs){library.validate(ref);if(ref.endVerse)library.validate({...ref,verse:ref.endVerse});}return {kind:'reading',object:'reading:'+plan.dayIds[index],value:{title:(plan.title||'Plan de lectura')+' · Día '+(index+1),text:'',completed:plan.completed.includes(index),refs}};}
 if(selection.kind==='message'){library.validate(selection.ref);if(typeof selection.text!=='string'||!selection.text.trim()||selection.text.length>12000)throw Error('Escribe un mensaje de hasta 12.000 caracteres.');return {kind:'message',value:{title:'Conversación sobre el pasaje',text:selection.text,completed:false,refs:[{book:selection.ref.book,chapter:selection.ref.chapter,verse:selection.ref.verse}]}};}
 throw Error('Elige un día, una petición o un mensaje.');
}
module.exports={circleContext};
