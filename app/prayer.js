'use strict';
let prayerMethod='acas',prayerStep=0,prayerEditing=null,prayerTab='requests';
const dateToday=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');};
function renderPrayer(){
 $('#prayer-locked').hidden=!state.privateLocked;$('#prayer-content').hidden=!!state.privateLocked;
 if(state.privateLocked){$('#prayer-list').replaceChildren();$('#prayer-reflection').value='';$('#prayer-form').reset();prayerEditing=null;return;}
 const steps=PrayerCore.methods[prayerMethod],step=steps[prayerStep];$('#prayer-method').value=prayerMethod;
 $('#prayer-step-label').textContent=`${prayerMethod==='acas'?'ACAS':'Padre Nuestro'} · ${prayerStep+1} de ${steps.length}`;$('#prayer-step-title').textContent=step[0];$('#prayer-step-prompt').textContent=step[1];$('#prayer-reflection').value=state.prayerDrafts[prayerMethod+':'+prayerStep]||'';
 $('#prayer-prev').disabled=prayerStep===0;$('#prayer-next').disabled=prayerStep===steps.length-1;
 $('#prayer-list-title').textContent=prayerTab==='testimonies'?'Libro de testimonios':'Mis peticiones';
 const entries=state.prayers.filter(p=>prayerTab!=='testimonies'||p.status==='answered');
 $('#prayer-list').innerHTML=entries.map(p=>`<article class="prayer-entry"><p class="eyebrow">${esc({pending:'Pendiente',waiting:'En espera',answered:'Respondida'}[p.status])} · ${esc(p.created)}</p><h3>${esc(p.title)}</h3><p class="prayer-prose">${esc(p.body)}</p>${p.answer?`<section class="prayer-answer"><p class="eyebrow">Respuesta · ${esc(p.answer.date)}</p><p class="prayer-prose">${esc(p.answer.text)}</p><button class="passage-link" data-document-ref="${p.answer.reference.book}:${p.answer.reference.chapter}:${p.answer.reference.verse}:${p.answer.reference.verse}">${esc(reference(p.answer.reference))}</button></section>`:''}<button class="outline" data-prayer-edit="${esc(p.id)}">Editar petición y respuesta</button></article>`).join('')||'<p class="muted">Aquí puedes guardar lo que presentas en oración y recordar las respuestas recibidas, sin prisa.</p>';
 for(const b of document.querySelectorAll('[data-prayer-tab]'))b.setAttribute('aria-pressed',String(b.dataset.prayerTab===prayerTab));
}
function editPrayer(id){if(state.privateLocked)return;const p=state.prayers.find(p=>p.id===id);prayerEditing=p?.id||null;const f=$('#prayer-form');f.reset();f.elements.title.value=p?.title||'';f.elements.body.value=p?.body||'';f.elements.status.value=p?.status||'pending';f.elements.answer.value=p?.answer?.text||'';f.elements.date.value=p?.answer?.date||dateToday();f.elements.reference.value=p?.answer?reference(p.answer.reference):reference();$('#prayer-edit-title').textContent=p?'Tu petición y su respuesta':'Una nueva petición';$('#prayer-delete').hidden=!p;$('#prayer-answer-fields').hidden=f.elements.status.value!=='answered'&&!p?.answer;f.scrollIntoView({block:'start'});f.elements.title.focus();}
function bindPrayer(){
 $('#prayer-method').addEventListener('change',e=>{prayerMethod=e.target.value;prayerStep=0;renderPrayer();});
 for(const [id,delta]of[['prayer-prev',-1],['prayer-next',1]])$('#'+id).addEventListener('click',()=>{prayerStep+=delta;renderPrayer();$('#prayer-step-title').focus();});
 $('#prayer-reflection').addEventListener('input',e=>{if(state.privateLocked)return;state.prayerDrafts[prayerMethod+':'+prayerStep]=e.target.value;save();});
 for(const b of document.querySelectorAll('[data-prayer-tab]'))b.addEventListener('click',()=>{prayerTab=b.dataset.prayerTab;renderPrayer();});
 $('#prayer-new').addEventListener('click',()=>editPrayer());$('#prayer-list').addEventListener('click',e=>{const b=e.target.closest('[data-prayer-edit]');if(b)editPrayer(b.dataset.prayerEdit);});
 $('#prayer-form').elements.status.addEventListener('change',e=>$('#prayer-answer-fields').hidden=e.target.value!=='answered');
 $('#prayer-form').addEventListener('submit',async e=>{
  e.preventDefault();if(state.privateLocked)return;const f=e.target,data=new FormData(f),old=structuredClone(state.prayers),id=prayerEditing||'pray-'+Date.now()+'-'+Math.random().toString(36).slice(2,8),prior=state.prayers.find(p=>p.id===id);
  try{const answerText=String(data.get('answer')).trim();let answer;if(answerText){const parsed=planCore.parseReferences(String(data.get('reference')),books);if(parsed.refs.length!==1||parsed.warnings.length||!validPosition({...parsed.refs[0],verse:parsed.refs[0].verse||1}))throw new Error('Escribe un versículo válido, por ejemplo Juan 3:16.');const r=parsed.refs[0];answer={text:answerText,date:String(data.get('date')),reference:{book:r.book,chapter:r.chapter,verse:r.verse||1}};}
   const p={id,title:String(data.get('title')).trim(),body:String(data.get('body')),created:prior?.created||dateToday(),status:String(data.get('status')),...(answer?{answer}:{})};PrayerCore.validate([p]);state.prayers=state.prayers.filter(p=>p.id!==id);state.prayers.unshift(p);if(!save())throw new Error('No se pudo guardar.');await saveQueue;if(saveFailed)throw new Error('No se pudo guardar.');prayerEditing=null;f.reset();renderPrayer();toast('Tu petición quedó guardada en este equipo.');
  }catch(error){state.prayers=old;toast(error.message);}
 });
 $('#prayer-delete').addEventListener('click',()=>{if(state.privateLocked||!prayerEditing||!confirm('¿Eliminar esta petición y su respuesta?'))return;state.prayers=state.prayers.filter(p=>p.id!==prayerEditing);prayerEditing=null;$('#prayer-form').reset();save();renderPrayer();});
}
