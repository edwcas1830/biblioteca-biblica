'use strict';
let activeJourney=null,pendingDev=null,devReviewPage=0,devEditingId=null,bookPage=0,bookPageCount=1;
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
function openJourney(kind,id,index){const item=state[kind==='plan'?'plans':'devotionals'].find(d=>d.id===id);if(!item)return;activeJourney={kind,id,index:index??(kind==='dev'?DevotionalCore.metadata(item).lastIndex:0)};showView('journey');renderJourney();rememberJourney();$('#journey-title').focus({preventScroll:true});$('#main-content').scrollTop=0;}
function rememberJourney(){const d=journeyData();if(d&&activeJourney.kind==='dev'){d.item.lastIndex=d.index;state.lastJourney={kind:'dev',id:d.item.id};save();}}
function layoutBook(){if(activeView!=='journey')return;const body=$('#journey-body'),sheet=body.parentElement,css=getComputedStyle(sheet),wide=sheet.clientWidth-parseFloat(css.paddingLeft)-parseFloat(css.paddingRight)>=1300;body.style.maxWidth=wide?'132ch':'68ch';body.style.columnCount=wide?'2':'1';const height=Math.max(240,Math.min(680,innerHeight-(body.getBoundingClientRect().top+$('#main-content').scrollTop+window.scrollY)-105));body.style.height=height+'px';const step=body.clientWidth+parseFloat(getComputedStyle(body).columnGap);bookPageCount=Math.max(1,Math.ceil((body.scrollWidth+parseFloat(getComputedStyle(body).columnGap)-2)/step));bookPage=Math.max(0,Math.min(bookPageCount-1,bookPage));body.scrollLeft=bookPage*step;$('#book-page-label').textContent=`${wide?'Doble página':'Página'} ${bookPage+1} de ${bookPageCount}`;$('#book-prev').disabled=bookPage===0;$('#book-next').disabled=bookPage===bookPageCount-1;}
function turnBook(delta){bookPage+=delta;layoutBook();const d=journeyData();if(d&&activeJourney.kind==='dev'){(d.item.pages??={})[d.index]=bookPage;rememberJourney();}}
async function saveImportedDev(dev){if(state.devotionals.length>=100)throw new Error('Tu biblioteca admite hasta 100 devocionales.');DevotionalCore.progress(dev);state.devotionals.unshift(dev);try{if(!save())throw new Error('No se pudo guardar el devocional.');await saveQueue;if(saveFailed)throw new Error('No se pudo guardar el devocional. Reintenta la importación.');}catch(e){state.devotionals=state.devotionals.filter(d=>d.id!==dev.id);throw e;}renderDevList();openJourney('dev',dev.id);return dev;}
function editCurrentDev(){const d=journeyData();if(!d||activeJourney.kind!=='dev')return;devEditingId=d.item.id;pendingDev=structuredClone(d.item);devReviewPage=Math.floor(d.index/10);$('#dev-review-title').value=d.item.title;$('#dev-title-case').checked=d.item.titleCase!==false;$('#dev-review-warnings').textContent='Estás editando una copia. Cancelar conserva el libro guardado.';showView('dev');$('#dev-review').hidden=false;renderDevReview();$('#dev-review').scrollIntoView({block:'start'});}

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
  const formatted=entry.blocks||contentCore.fromText(body);
  $('#journey-body').innerHTML=contentCore.render(contentCore.readingBlocks(formatted,entry.originalTitle||entry.title,books,planCore),books,planCore);
  $('#journey-body').style.setProperty('--book-font',(state.bookFont||20)+'px');bookPage=plan?0:(item.pages?.[index]||0);requestAnimationFrame(layoutBook);$('#journey-edit').hidden=plan;
  $('#journey-warnings').textContent=[...(entry.warnings||[]),...(item.importWarnings||[])].join(' ');$('#journey-warnings').hidden=!$('#journey-warnings').textContent;
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
  dev.entries.forEach(d=>{d.originalTitle=d.title;d.title=StudyCore.sentenceTitle(d.title);});dev.titleCase=true;dev.importWarnings=warnings;pendingDev=null;devEditingId=null;$('#dev-review').hidden=true;return saveImportedDev(dev);
}
function renderDevReview(){
  if(!pendingDev)return;const start=devReviewPage*10,end=Math.min(start+10,pendingDev.entries.length);
  $('#dev-review-days').innerHTML=pendingDev.entries.slice(start,end).map((d,j)=>{const i=start+j;return `<section class="dev-review-day"><label>Título o fecha<input data-dev-review-title="${i}" value="${esc(d.title)}" maxlength="200"></label><label>Contenido<textarea data-dev-review-body="${i}" rows="7" maxlength="100000">${esc(d.body)}</textarea></label><label class="checkbox-label"><input type="checkbox" data-dev-review-done="${i}" ${pendingDev.completed?.includes(i)?'checked':''}> Ya leído</label></section>`;}).join('');
  $('#dev-review-range').textContent=`${start+1}–${end} de ${pendingDev.entries.length} días o secciones`;
  $('#dev-review-prev').disabled=start===0;$('#dev-review-next').disabled=end===pendingDev.entries.length;
}
function bindJourneys(){
  new ResizeObserver(()=>requestAnimationFrame(layoutBook)).observe($('#journey-body'));window.addEventListener('resize',()=>requestAnimationFrame(layoutBook));$('#design-css').addEventListener('load',()=>requestAnimationFrame(layoutBook));
  $('#journey-index-toggle').addEventListener('click',()=>{const drawer=$('#journey-drawer');drawer.hidden=!drawer.hidden;$('#journey-index-toggle').setAttribute('aria-expanded',String(!drawer.hidden));});
  $('#journey-edit').addEventListener('click',editCurrentDev);$('#book-prev').addEventListener('click',()=>turnBook(-1));$('#book-next').addEventListener('click',()=>turnBook(1));
  for(const [id,delta]of [['journey-smaller',-1],['journey-larger',1]])$('#'+id).addEventListener('click',()=>{state.bookFont=Math.max(16,Math.min(30,(state.bookFont||20)+delta));$('#journey-body').style.setProperty('--book-font',state.bookFont+'px');layoutBook();save();});
  const full=async()=>{try{await desktop.readerFullscreen();}catch(e){toast(e.message);}};$('#journey-fullscreen').addEventListener('click',full);document.addEventListener('keydown',e=>{if(e.key==='F11'&&activeView==='journey'){e.preventDefault();full();}if(e.key==='Escape'&&activeView==='journey'){desktop.readerFullscreen(false);$('#journey-drawer').hidden=true;$('#journey-index-toggle').setAttribute('aria-expanded','false');}});
  desktop.onFullscreen(value=>{document.body.classList.toggle('book-fullscreen',value);$('#journey-fullscreen').textContent=value?'↙ Salir de pantalla completa':'⤢ Pantalla completa';requestAnimationFrame(layoutBook);});

  $('#journey-title-case').addEventListener('change',()=>{const d=journeyData();if(d&&activeJourney.kind==='dev'){d.item.titleCase=$('#journey-title-case').checked;renderJourney();save();}});
  $('#dev-title-case').addEventListener('change',()=>{if(!pendingDev)return;pendingDev.entries.forEach(d=>d.title=$('#dev-title-case').checked?StudyCore.sentenceTitle(d.originalTitle||d.title):(d.originalTitle||d.title));renderDevReview();});
  $('#journey-close').addEventListener('click',()=>{desktop.readerFullscreen(false);showView(activeJourney?.kind==='plan'?'plan':'dev');});
  $('#journey-return').addEventListener('click',()=>{if(activeJourney){showView('journey');renderJourney();}});
  $('#journey-index').addEventListener('click',event=>{const b=event.target.closest('[data-journey-day]');if(b){activeJourney.index=Number(b.dataset.journeyDay);renderJourney();rememberJourney();$('#journey-day-title').focus({preventScroll:true});}});
  for(const [id,delta] of [['journey-prev',-1],['journey-next',1],['journey-index-prev',-30],['journey-index-next',30]])$('#'+id).addEventListener('click',()=>{const d=journeyData();if(d){activeJourney.index=Math.max(0,Math.min(d.item.entries.length-1,d.index+delta));renderJourney();rememberJourney();$('#journey-day-title').focus({preventScroll:true});}});
  $('#journey-passages').addEventListener('click',event=>{const b=event.target.closest('[data-journey-reading]'),d=journeyData();if(!b||!d)return;const ref=d.readings[Number(b.dataset.journeyReading)];if(activeJourney.kind==='plan')readPlanDay(d.item.id,d.index,Number(b.dataset.journeyReading));else go(ref.book,ref.chapter,ref.verse||1,ref.endVerse);$('#journey-return').hidden=false;});
  document.addEventListener('click',event=>{const b=event.target.closest('[data-document-ref]');if(!b)return;const [book,chapter,verse,end]=b.dataset.documentRef.split(':').map(Number);go(book,chapter,verse,end);$('#journey-return').hidden=!activeJourney;});
  $('#journey-complete').addEventListener('click',()=>{const d=journeyData();if(!d)return;d.item.completed=d.done?d.item.completed.filter(i=>i!==d.index):[...(d.item.completed||[]),d.index];if(activeJourney.kind==='dev')DevotionalCore.progress(d.item);save();renderJourney();renderDevList();});
  $('#journey-note').addEventListener('input',event=>{const d=journeyData();if(!d||state.privateLocked||activeJourney.kind==='plan'&&!d.item.dayIds?.[d.index])return;const target=activeJourney.kind==='plan'?(state.planNotes??={}):state.devResponses;target[d.noteKey]=event.target.value;$('#journey-save-status').textContent=save()?'Guardando tu nota…':'No se pudo guardar. Exporta una copia.';saveQueue.then(()=>$('#journey-save-status').textContent=saveFailed?'No se pudo guardar. Exporta una copia.':'Nota guardada en este equipo.');});
  $('#dev-review-days').addEventListener('input',event=>{const el=event.target;
    if(el.matches('[data-dev-review-title]')){const d=pendingDev.entries[Number(el.dataset.devReviewTitle)];d.title=el.value;d.originalTitle=el.value;}
    if(el.matches('[data-dev-review-body]')){const d=pendingDev.entries[Number(el.dataset.devReviewBody)];d.body=el.value;d.blocks=contentCore.fromText(el.value);d.readings=planCore.parseReferences(el.value,books).refs;}
  });
  $('#dev-review-days').addEventListener('change',event=>{if(!event.target.matches('[data-dev-review-done]'))return;const i=Number(event.target.dataset.devReviewDone),done=new Set(pendingDev.completed||[]);event.target.checked?done.add(i):done.delete(i);pendingDev.completed=[...done];});
  $('#dev-review-prev').addEventListener('click',()=>{devReviewPage--;renderDevReview();});$('#dev-review-next').addEventListener('click',()=>{devReviewPage++;renderDevReview();});
  $('#dev-review-cancel').addEventListener('click',()=>{pendingDev=null;$('#dev-review').hidden=true;if(devEditingId){const id=devEditingId;devEditingId=null;openJourney('dev',id);}});
  $('#dev-review-save').addEventListener('click',async()=>{
    if(!pendingDev)return;const title=$('#dev-review-title').value.trim();if(!title){toast('Escribe un título.');return;}const dev={...pendingDev,title,titleCase:$('#dev-title-case').checked},old=devEditingId?state.devotionals.find(d=>d.id===devEditingId):null;$('#dev-review-save').disabled=true;
    try{if(old){DevotionalCore.progress(dev);state.devotionals=state.devotionals.map(d=>d.id===old.id?dev:d);if(!save())throw new Error('No se pudo guardar.');await saveQueue;if(saveFailed)throw new Error('No se pudo guardar.');openJourney('dev',dev.id);}else await saveImportedDev(dev);pendingDev=null;devEditingId=null;$('#dev-review').hidden=true;renderDevList();toast('Devocional guardado.');}
    catch(error){if(old)state.devotionals=state.devotionals.map(d=>d.id===old.id?old:d);toast(error.message);}finally{$('#dev-review-save').disabled=false;}
  });
}
