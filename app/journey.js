'use strict';
let activeJourney=null,pendingDev=null,devReviewPage=0;
const contentCore=window.ContentCore;
function journeyData(){
  if(!activeJourney)return null;
  const item=state[activeJourney.kind==='plan'?'plans':'devotionals'].find(d=>d.id===activeJourney.id);
  if(!item)return null;
  const index=Math.max(0,Math.min(item.entries.length-1,activeJourney.index));activeJourney.index=index;
  const entry=activeJourney.kind==='plan'?dayOf(item,index):item.entries[index];
  const readings=entry.readings||((entry.book!==undefined)?[{book:entry.book,chapter:entry.chapter}]:planCore.parseReferences(entry.body||'',books).refs);
  return {item,index,entry,readings,done:(item.completed||[]).includes(index),noteKey:activeJourney.kind==='plan'?item.id+':'+item.dayIds?.[index]:item.id+':'+index};
}
function openJourney(kind,id,index=0){activeJourney={kind,id,index};showView('journey');renderJourney();$('#journey-title').focus();}
function renderJourney(){
  const data=journeyData();if(!data)return;const {item,index,entry,readings,done,noteKey}=data,total=item.entries.length,completed=item.completed?.length||0,plan=activeJourney.kind==='plan';
  $('#journey-title').textContent=item.title||{nt:'Nuevo Testamento',all:'Toda la Biblia',salmos:'Salmos'}[item.scope];
  $('#journey-subtitle').textContent=item.subtitle||'';$('#journey-subtitle').hidden=!item.subtitle;
  $('#journey-origin').textContent=item.origin||item.sourceName||'Plan de lectura personal';
  $('#journey-progress-label').textContent=`${completed} de ${total} días leídos · ${Math.round(completed/total*100)}%`;
  $('#journey-progress').value=completed;$('#journey-progress').max=total;
  const titleFor=day=>plan?day.title:item.titleCase===false?(day.originalTitle||day.title):StudyCore.sentenceTitle(day.title);$('#journey-title-case-label').hidden=plan||!item.entries.some(d=>(d.originalTitle||d.title)!==StudyCore.sentenceTitle(d.originalTitle||d.title));$('#journey-title-case').checked=item.titleCase!==false;
  const page=Math.floor(index/30),start=page*30,end=Math.min(start+30,total);
  $('#journey-index').innerHTML=item.entries.slice(start,end).map((day,j)=>{const i=start+j;return `<button class="journey-index-item ${i===index?'is-current':''}" data-journey-day="${i}" aria-current="${i===index?'step':'false'}"><span>${(item.completed||[]).includes(i)?'✓':'○'}</span><span>${esc(plan?dayOf(item,i).title:titleFor(day))}</span></button>`;}).join('');
  $('#journey-index-range').textContent=`${start+1}–${end} de ${total}`;$('#journey-index-prev').disabled=page===0;$('#journey-index-next').disabled=end===total;
  $('#journey-day-title').textContent=titleFor(entry);$('#journey-day-position').textContent=`DÍA ${index+1} DE ${total}`;
  $('#journey-intro').closest('details').hidden=!item.description&&!item.purpose;$('#journey-intro').innerHTML=item.introBlocks?.length?contentCore.render(item.introBlocks,books,planCore):esc(item.description||item.purpose||'');
  $('#journey-passages').innerHTML=readings.map((r,i)=>`<button class="outline" data-journey-reading="${i}">Abrir ${esc(planCore.formatRef(r,books))} ↗</button>`).join('');
  const body=entry.body||entry.sourceText||readings.map(r=>planCore.formatRef(r,books)).join('\n');
  const formatted=entry.blocks||contentCore.fromText(body),firstText=contentCore.textOf(formatted.slice(0,1));
  $('#journey-body').innerHTML=contentCore.render(formatted[0]?.kind==='heading'&&(/^\s*(día|dia|day|jornada)\s*\d+/i.test(firstText)||firstText===entry.title)?formatted.slice(1):formatted,books,planCore);
  $('#journey-warnings').textContent=entry.warnings?.join(' ')||'';
  $('#journey-complete').textContent=done?'✓ Leído · desmarcar':'Marcar como leído';$('#journey-complete').setAttribute('aria-pressed',String(done));
  $('#journey-prev').disabled=index===0;$('#journey-next').disabled=index===total-1;
  $('#journey-note').value=(plan?state.planNotes?.[noteKey]:state.devResponses[noteKey])||'';$('#journey-note').disabled=!!state.privateLocked||plan&&!item.dayIds?.[index];
  $('#journey-save-status').textContent=state.privateLocked?'Abre el candado para ver tu reflexión.':'Tu nota permanece en este equipo.';
  $('#journey-body').scrollTop=0;renderGuide();
}
async function importDevFile(file){
  let dev,warnings=[];
  if(/\.(pdf|docx)$/i.test(file.name)){
    const source=await window.PlanDocuments.read(file);dev=contentCore.recordsToDevotional(source.records,file.name,books,planCore,source);warnings=source.warnings;
  }else{
    if(file.size>2000000)throw new Error('El archivo de texto supera 2 MB.');dev=core.importDevotional(file.name,await file.text(),books);
    if(/\.(txt|md)$/i.test(file.name))dev=contentCore.recordsToDevotional(contentCore.fromText(dev.entries[0].body).map(b=>({text:contentCore.textOf([b]),spans:b.spans,kind:b.kind})),file.name,books,planCore);
  }
  dev.entries.forEach(d=>{d.originalTitle=d.title;d.title=StudyCore.sentenceTitle(d.title);});pendingDev=dev;$('#dev-title-case').checked=true;devReviewPage=0;$('#dev-review-title').value=dev.title;$('#dev-review-warnings').textContent=warnings.join(' ');$('#dev-review').hidden=false;renderDevReview();$('#dev-review').scrollIntoView({block:'start'});
}
function renderDevReview(){
  if(!pendingDev)return;const start=devReviewPage*10,end=Math.min(start+10,pendingDev.entries.length);
  $('#dev-review-days').innerHTML=pendingDev.entries.slice(start,end).map((d,j)=>{const i=start+j;return `<section class="dev-review-day"><label>Título o fecha<input data-dev-review-title="${i}" value="${esc(d.title)}" maxlength="200"></label><label>Contenido<textarea data-dev-review-body="${i}" rows="7" maxlength="100000">${esc(d.body)}</textarea></label><label class="checkbox-label"><input type="checkbox" data-dev-review-done="${i}" ${pendingDev.completed?.includes(i)?'checked':''}> Ya leído</label><div class="dev-preview document-prose">${contentCore.render(d.blocks||contentCore.fromText(d.body),books,planCore)}</div></section>`;}).join('');
  $('#dev-review-range').textContent=`${start+1}–${end} de ${pendingDev.entries.length} días o secciones`;
  $('#dev-review-prev').disabled=start===0;$('#dev-review-next').disabled=end===pendingDev.entries.length;
}
function bindJourneys(){
  $('#journey-title-case').addEventListener('change',()=>{const d=journeyData();if(d&&activeJourney.kind==='dev'){d.item.titleCase=$('#journey-title-case').checked;renderJourney();save();}});
  $('#dev-title-case').addEventListener('change',()=>{if(!pendingDev)return;pendingDev.entries.forEach(d=>d.title=$('#dev-title-case').checked?StudyCore.sentenceTitle(d.originalTitle||d.title):(d.originalTitle||d.title));renderDevReview();});
  $('#journey-close').addEventListener('click',()=>showView(activeJourney?.kind==='plan'?'plan':'dev'));
  $('#journey-return').addEventListener('click',()=>{if(activeJourney){showView('journey');renderJourney();}});
  $('#journey-index').addEventListener('click',event=>{const b=event.target.closest('[data-journey-day]');if(b){activeJourney.index=Number(b.dataset.journeyDay);renderJourney();$('#journey-day-title').focus();}});
  for(const [id,delta] of [['journey-prev',-1],['journey-next',1],['journey-index-prev',-30],['journey-index-next',30]])$('#'+id).addEventListener('click',()=>{const d=journeyData();if(d){activeJourney.index=Math.max(0,Math.min(d.item.entries.length-1,d.index+delta));renderJourney();$('#journey-day-title').focus();}});
  $('#journey-passages').addEventListener('click',event=>{const b=event.target.closest('[data-journey-reading]'),d=journeyData();if(!b||!d)return;const ref=d.readings[Number(b.dataset.journeyReading)];if(activeJourney.kind==='plan')readPlanDay(d.item.id,d.index,Number(b.dataset.journeyReading));else go(ref.book,ref.chapter,ref.verse||1,ref.endVerse);$('#journey-return').hidden=false;});
  document.addEventListener('click',event=>{const b=event.target.closest('[data-document-ref]');if(!b)return;const [book,chapter,verse,end]=b.dataset.documentRef.split(':').map(Number);go(book,chapter,verse,end);$('#journey-return').hidden=!activeJourney;});
  $('#journey-complete').addEventListener('click',()=>{const d=journeyData();if(!d)return;d.item.completed=d.done?d.item.completed.filter(i=>i!==d.index):[...(d.item.completed||[]),d.index];save();renderJourney();});
  $('#journey-note').addEventListener('input',event=>{const d=journeyData();if(!d||state.privateLocked||activeJourney.kind==='plan'&&!d.item.dayIds?.[d.index])return;const target=activeJourney.kind==='plan'?(state.planNotes??={}):state.devResponses;target[d.noteKey]=event.target.value;$('#journey-save-status').textContent=save()?'Guardando tu nota…':'No se pudo guardar. Exporta una copia.';saveQueue.then(()=>$('#journey-save-status').textContent=saveFailed?'No se pudo guardar. Exporta una copia.':'Nota guardada en este equipo.');});
  $('#dev-review-days').addEventListener('input',event=>{const el=event.target;
    if(el.matches('[data-dev-review-title]')){const d=pendingDev.entries[Number(el.dataset.devReviewTitle)];d.title=el.value;d.originalTitle=el.value;}
    if(el.matches('[data-dev-review-body]')){const d=pendingDev.entries[Number(el.dataset.devReviewBody)];d.body=el.value;d.blocks=contentCore.fromText(el.value);d.readings=planCore.parseReferences(el.value,books).refs;el.closest('.dev-review-day').querySelector('.dev-preview').innerHTML=contentCore.render(d.blocks,books,planCore);}
  });
  $('#dev-review-days').addEventListener('change',event=>{if(!event.target.matches('[data-dev-review-done]'))return;const i=Number(event.target.dataset.devReviewDone),done=new Set(pendingDev.completed||[]);event.target.checked?done.add(i):done.delete(i);pendingDev.completed=[...done];});
  $('#dev-review-prev').addEventListener('click',()=>{devReviewPage--;renderDevReview();});$('#dev-review-next').addEventListener('click',()=>{devReviewPage++;renderDevReview();});
  $('#dev-review-cancel').addEventListener('click',()=>{pendingDev=null;$('#dev-review').hidden=true;});
  $('#dev-review-save').addEventListener('click',async()=>{
    if(!pendingDev)return;const title=$('#dev-review-title').value.trim();if(!title){toast('Escribe un título.');return;}if(state.devotionals.length>=100){toast('La biblioteca admite hasta 100 devocionales.');return;}
    const dev={...pendingDev,title,titleCase:$('#dev-title-case').checked};state.devotionals.unshift(dev);$('#dev-review-save').disabled=true;
    try{if(!save())throw new Error('No se pudo guardar.');await saveQueue;if(saveFailed)throw new Error('No se pudo guardar.');pendingDev=null;$('#dev-review').hidden=true;renderDevList();openJourney('dev',dev.id);toast('Devocional guardado.');}
    catch(error){state.devotionals=state.devotionals.filter(d=>d.id!==dev.id);toast(error.message);}finally{$('#dev-review-save').disabled=false;}
  });
}
