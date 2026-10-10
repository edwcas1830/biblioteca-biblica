'use strict';
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const books = window.BIBLE?.books;
const core = window.BibleCore;
const planCore = window.PlanCore;
const appearanceCore=window.AppearanceCore;
const STORE = 'biblioteca-biblica-v1';
const initial = () => ({ version:1, position:{book:18,chapter:23,verse:1}, notes:{}, highlights:{}, devResponses:{}, devotionals:[], plans:[], font:20, night:false, appearance:appearanceCore.normalize() });
let state = initial(), activeView='read', activeDev=null, activeDay=0, toastTimer, searchTimer;
const desktop=window.libraryDesktop;
let storageReady=false, saveQueue=Promise.resolve(), selectedVersion='rv1909', catalogData=null, readingGeneration=0, searchGeneration=0, studyGeneration=0, chapterData=null, savePending=0, saveFailed=false;
let pendingPlan=null, reviewPage=0, activePlanDay=null, readerRange=null, studySelection='chapter', dictionaryGeneration=0, dictionaryEntries=[];
const planPages=new Map(), planFilters=new Map();
const PLAN_PAGE=30, REVIEW_PAGE=25;
function toast(text) { $('#toast').textContent=text; $('#toast').hidden=false; clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('#toast').hidden=true,5500); }
function validPosition(pos) { return pos && Number.isInteger(pos.book) && Number.isInteger(pos.chapter) && Number.isInteger(pos.verse) && pos.verse>0 && pos.verse<=(books[pos.book]?.chapters[pos.chapter-1]?.length||0); }
function validateState(candidate) {
  if (!candidate || candidate.version!==1 || !validPosition(candidate.position)) throw new Error('La copia no pertenece a esta versión de la aplicación.');
  const result=initial(); result.position=candidate.position;
  for(const property of ['notes','highlights','devResponses']) {
    const values=candidate[property];
    if (!values || typeof values!=='object' || Array.isArray(values) || Object.keys(values).length>35000) throw new Error('Datos de notas no válidos.');
    for(const [key,value] of Object.entries(values)) {
      if(typeof value!=='string' || value.length>100000) throw new Error('Contenido de nota no válido.');
      if(property==='devResponses') { if(!/^(dev|import)-[a-z0-9-]+:\d+$/.test(key)) throw new Error('Referencia de devocional no válida.'); }
      else {
        if(!/^([a-z0-9-]{1,80}@)?\d+:\d+:\d+$/.test(key)) throw new Error('Referencia de nota no válida.');
        const [book,chapter,verse]=key.split('@').at(-1).split(':').map(Number);
        if(!validPosition({book,chapter,verse})) throw new Error('Referencia bíblica fuera de rango.');
      }
      if(property==='highlights' && !['gold','sage','rose'].includes(value)) throw new Error('Color de subrayado no válido.');
      result[property][key]=value;
    }
  }
  if(!Array.isArray(candidate.devotionals) || candidate.devotionals.length>100 || !Array.isArray(candidate.plans) || candidate.plans.length>100) throw new Error('Biblioteca personal no válida.');
  const ids=new Set();
  result.devotionals=candidate.devotionals.map(dev=>{
    if(!dev || !/^(dev|import)-[a-z0-9-]+$/.test(dev.id) || ids.has(dev.id)) throw new Error('Devocional no válido.');
    ids.add(dev.id);
    const validated=core.importDevotional('copia.json',JSON.stringify({title:dev.title,entries:dev.entries}),books);
    return {...validated,id:dev.id,origin:typeof dev.origin==='string'?dev.origin.slice(0,200):'Devocional recuperado',purpose:typeof dev.purpose==='string'?dev.purpose.slice(0,500):'',minutes:Number.isInteger(dev.minutes)?dev.minutes:undefined};
  });
  result.plans=candidate.plans.map(plan=>{
    if(!plan || !/^plan-\d+(?:-[a-z0-9]+)?$/.test(plan.id) || ids.has(plan.id)) throw new Error('Plan no válido.');
    ids.add(plan.id);
    const validated=plan.scope==='custom'?planCore.validateCustomPlan(plan,books):core.createPlan(books,plan.scope,plan.days);
    if(!Array.isArray(plan.completed) || plan.completed.some(day=>!Number.isInteger(day)||day<0||day>=plan.days)) throw new Error('Progreso de plan no válido.');
    return {...validated,id:plan.id,dayIds:Array.isArray(plan.dayIds)?plan.dayIds:undefined,completed:[...new Set(plan.completed)]};
  });
  result.font=Number.isInteger(candidate.font)?Math.max(16,Math.min(28,candidate.font)):20;
  result.night=candidate.night===true;
  result.appearance=appearanceCore.normalize(candidate.appearance);
  result.selectedVersion=typeof candidate.selectedVersion==='string'?candidate.selectedVersion:'rv1960';
  return result;
}
function save() {
  if(desktop?.savePersonal){
    if(!storageReady){toast('La copia anterior está protegida. Reinicia para reintentar la migración.');return false;}
    const snapshot=JSON.parse(JSON.stringify(state));savePending++;$('#save-status').textContent='Guardando…';
    saveQueue=saveQueue.catch(()=>{}).then(()=>desktop.savePersonal(snapshot)).then(saved=>{saveFailed=false;for(const plan of state.plans){const p=saved.plans.find(item=>item.id===plan.id);if(p&&JSON.stringify(p.entries)===JSON.stringify(plan.entries))plan.dayIds=p.dayIds;}$('#save-status').textContent='Guardado en este equipo.';}).catch(error=>{saveFailed=true;$('#save-status').textContent='No se pudo guardar. Exporta una copia.';toast(error.message);}).finally(()=>savePending--);
    return true;
  }
  try { localStorage.setItem(STORE,JSON.stringify(state)); $('#save-status').textContent='Guardado en este equipo.'; return true; }
  catch { $('#save-status').textContent='No se pudo guardar. Exporta una copia para conservar tus cambios.'; toast('El almacenamiento está lleno o no está disponible. Guarda una copia de tu biblioteca.'); return false; }
}
function key(verse=state.position.verse) { const p=state.position; return `${selectedVersion==='rv1909'?'':selectedVersion+'@'}${p.book}:${p.chapter}:${verse}`; }
function reference(p=state.position) { return `${books[p.book].name} ${p.chapter}:${p.verse}`; }
function settings() {
  state.appearance=appearanceCore.normalize(state.appearance);
  const root=document.documentElement,theme=appearanceCore.themeAt(state.appearance.theme);
  root.dataset.design=state.appearance.design;root.dataset.theme=theme;
  const link=$('#design-css'),href='designs/design-'+state.appearance.design+'.css';
  if(link.getAttribute('href')!==href)link.setAttribute('href',href);
  state.night=theme==='noche';document.body.classList.toggle('night',state.night);
  root.style.setProperty('--verse-size',state.font+'px');
  $('#design-select').value=state.appearance.design;$('#theme-select').value=state.appearance.theme;
  for(const [pane,size] of Object.entries(state.appearance.panes||{biblia:42,comentario:30,diccionario:28}))root.style.setProperty('--pane-'+pane,size+'fr');
  $('#night').textContent=state.night?'◐ Luz de día':'◐ Luz cálida';
}

function showView(view) {
  activeView=view;
  document.querySelectorAll('.view').forEach(el=>el.hidden=el.id!==view+'-view');
  document.querySelectorAll('[data-view]').forEach(el=>el.classList.toggle('active',el.dataset.view===view));
  if(view!=='read') { document.body.classList.remove('focus');updateReadingMode(); }
  if(view==='dev') renderDevList();
  if(view==='plan') renderPlans();
}
async function renderReader() {
  const p=state.position, book=books[p.book], chapter=book.chapters[p.chapter-1];
  $('#book').value=p.book;
  $('#chapter').innerHTML=book.chapters.map((_ch,i)=>`<option value="${i+1}">Cap. ${i+1}</option>`).join('');
  $('#chapter').value=p.chapter;
  $('#book-label').textContent=book.name.toUpperCase();
  $('#passage-heading').textContent=`${book.name} ${p.chapter}`;
  $('#chapter-footer').textContent=`CAPÍTULO ${p.chapter}`;
  chapterData=null;$('#verses').innerHTML=chapter.map((text,i)=>`<button class="verse ${i+1===p.verse?'selected':''} ${readerRange&&readerRange.book===p.book&&readerRange.chapter===p.chapter&&i+1>=readerRange.start&&i+1<=readerRange.end?'planned-range':''} ${state.highlights[key(i+1)]?'highlight-'+state.highlights[key(i+1)]:''}" data-verse="${i+1}" aria-pressed="${i+1===p.verse}" aria-label="${esc(book.name)} ${p.chapter}:${i+1}"><sup>${i+1}</sup>${esc(text)}</button>`).join('');
  decorateReading();
  $('#previous').disabled=p.book===0 && p.chapter===1;
  $('#next').disabled=p.book===65 && p.chapter===book.chapters.length;
  renderNote();
  if(desktop?.chapter){
    const generation=++readingGeneration;
    try{const result=await desktop.chapter({module:selectedVersion,book:p.book,chapter:p.chapter,strong:$('#show-strong').checked});if(generation!==readingGeneration)return;chapterData=result;
      $('#verses').innerHTML=result.verses.map(row=>`<button class="verse ${row.verse===state.position.verse?'selected':''} ${readerRange&&row.verse>=readerRange.start&&row.verse<=readerRange.end?'planned-range':''} ${state.highlights[key(row.verse)]?'highlight-'+state.highlights[key(row.verse)]:''}" data-verse="${row.verse}" aria-pressed="${row.verse===state.position.verse}"><sup>${row.verse}</sup>${row.html}</button>`).join('');
      decorateReading();$('#edition-footer').textContent=result.title;$('#cover-edition').textContent=result.title;
      if(result.verses.some(row=>!row.alignment))$('#module-status').textContent='En algunos versículos los números Strong se muestran al final porque el texto de apoyo difiere.';
      else $('#module-status').textContent='';
      if(state.position.verse===1)$('#verses').scrollTop=0;
      if(state.position.verse!==1)$('#verses').querySelector(`[data-verse="${state.position.verse}"]`)?.scrollIntoView({block:'nearest'});
    }catch(error){if(generation===readingGeneration){chapterData=null;$('#verses').textContent=error.message;toast(error.message);}}
  }
}
function renderNote() {
  const p=state.position;document.documentElement.dataset.studyScope=studySelection;$('#selected-ref').textContent=studySelection==='chapter'?`${books[p.book].name} ${p.chapter}`:studySelection==='range'&&readerRange?`${books[p.book].name} ${p.chapter}:${readerRange.start}–${readerRange.end}`:reference();$('#bible-ref').textContent=$('#selected-ref').textContent;syncDictionaryRef();$('#note-reference').textContent=reference()+' · '+($('#version-select option:checked')?.textContent||selectedVersion);
  $('#note').value=state.notes[key()] || '';
  $('#save-status').textContent=saveFailed?'No se pudo guardar. Exporta una copia.':selectedVersion!=='rv1909'&&Object.keys(state.notes).some(k=>!k.includes('@'))?'Notas de esta versión. Tus notas anteriores siguen en RV1909.':'Las notas se guardan en este equipo, vinculadas a esta versión.';
  renderComment();
}
function go(book,chapter,verse=1,endVerse) {
  if(!validPosition({book,chapter,verse})) { toast('No se encontró ese pasaje.'); return; }
  readerRange=endVerse?{book,chapter,start:verse,end:endVerse}:null;
  studySelection=endVerse?'range':verse!==1?'verse':'chapter';state.position={book,chapter,verse}; renderReader(); save(); showView('read');
  if(verse!==1) $('#verses').querySelector(`[data-verse="${verse}"]`)?.scrollIntoView({block:'center'});
}
function changeChapter(direction) {
  let {book,chapter}=state.position; chapter+=direction;
  if(chapter<1) {book--;chapter=books[book]?.chapters.length;}
  if(chapter>books[book]?.chapters.length) {book++;chapter=1;}
  go(book,chapter); window.scrollTo({top:0});
}
function renderDevList() {
  $('#dev-list').innerHTML=state.devotionals.length?state.devotionals.map(dev=>`<div class="dev-item"><div><h4>${esc(dev.title)}</h4><small>${esc(dev.origin)} · ${dev.entries.length} ${dev.entries.length===1?'lectura':'días'}${dev.minutes?' · '+dev.minutes+' min':''}</small></div><button class="outline" data-dev="${esc(dev.id)}">Abrir →</button></div>`).join(''):'<p class="empty">Tu biblioteca de devocionales comienza aquí.<br>Trae una lectura que amas o prepara una nueva.</p>';
}
function renderDev() {
  const dev=state.devotionals.find(item=>item.id===activeDev);
  if(!dev) { $('#dev-detail').hidden=true; return; }
  const day=dev.entries[activeDay];
  $('#dev-detail').hidden=false;
  $('#dev-detail').innerHTML=`<p class="eyebrow">${esc(dev.origin)}</p><div class="section-heading"><h3>${esc(dev.title)}</h3><select class="dev-day" aria-label="Día del devocional">${dev.entries.map((item,i)=>`<option value="${i}" ${i===activeDay?'selected':''}>${esc(item.title)}</option>`).join('')}</select></div>${dev.purpose?`<p class="muted">Mi intención: ${esc(dev.purpose)}</p>`:''}<h4>${esc(day.title)}</h4>${day.book!==undefined?`<button class="outline" data-read-book="${day.book}" data-read-chapter="${day.chapter}">Leer ${esc(books[day.book].name)} ${day.chapter} →</button>`:''}<p class="dev-body">${esc(day.body)}</p><label for="dev-response">Mi reflexión y oración</label><textarea id="dev-response" maxlength="100000" rows="5" placeholder="Escribe tu respuesta personal…">${esc(state.devResponses[dev.id+':'+activeDay]||'')}</textarea><small class="muted" id="dev-save-status">Se guarda en este equipo.</small>`;
}
function renderPlans() {
  const titles={nt:'Nuevo Testamento',all:'Toda la Biblia',salmos:'Salmos'};
  $('#plan-list').innerHTML=state.plans.length?state.plans.map(plan=>{
    const filter=planFilters.get(plan.id)||'all';
    const available=plan.entries.map((_day,i)=>i).filter(i=>filter==='all'||(filter==='done'?plan.completed.includes(i):!plan.completed.includes(i)));
    const pages=Math.max(1,Math.ceil(available.length/PLAN_PAGE)),page=Math.min(planPages.get(plan.id)||0,pages-1);planPages.set(plan.id,page);
    return `<section class="card" data-plan-card="${plan.id}"><div class="section-heading"><h3>${esc(plan.title||titles[plan.scope])}</h3><button class="outline" data-export-plan="${plan.id}">↓ Exportar plan</button></div><p class="muted plan-progress">${plan.completed.length} de ${plan.days} días completados · ${Math.round(plan.completed.length/plan.days*100)}%</p>${plan.sourceName?`<p class="fine-print">Importado de ${esc(plan.sourceName)}</p>`:''}${plan.description?`<details class="plan-context"><summary>Indicaciones del documento</summary><p class="source-description muted">${esc(plan.description)}</p></details>`:''}<div class="progress-track"><progress value="${plan.completed.length}" max="${plan.days}" aria-label="Progreso del plan"></progress></div><div class="plan-list-toolbar"><select data-plan-filter="${plan.id}" aria-label="Filtrar días"><option value="all" ${filter==='all'?'selected':''}>Todos los días</option><option value="todo" ${filter==='todo'?'selected':''}>Por leer</option><option value="done" ${filter==='done'?'selected':''}>Completados</option></select><button class="quiet" data-plan-resume="${plan.id}">Continuar donde voy →</button></div><div class="plan-days">${available.slice(page*PLAN_PAGE,(page+1)*PLAN_PAGE).map(i=>{
      const day=dayOf(plan,i),done=plan.completed.includes(i);
      return `<div class="day-card ${done?'completed':''}"><small class="day-number">DÍA ${i+1}</small><h4>${esc(day.title)}</h4>${day.readings.map((p,j)=>`<button class="quiet" data-plan-read="${plan.id}" data-day="${i}" data-reading="${j}">${esc(planCore.formatRef(p,books))} ↗</button>`).join('')}${day.warnings?.length?'<small class="review-warning">Revisar lectura</small>':''}${day.sourceText?`<details class="day-source"><summary>Texto de mi plan</summary><p>${esc(day.sourceText)}</p></details>`:''}<label><input type="checkbox" data-plan="${plan.id}" data-day="${i}" ${done?'checked':''}> ${done?'Completado':'Marcar como leído'}</label></div>`;
    }).join('')}</div>${!available.length?'<p class="muted">No hay días con este filtro.</p>':''}<div class="review-navigation"><button class="outline" data-plan-page="${plan.id}" data-direction="-1" ${page===0?'disabled':''}>← Anteriores</button><span class="muted">Página ${page+1} de ${pages} · ${available.length} días</span><button class="outline" data-plan-page="${plan.id}" data-direction="1" ${page+1>=pages?'disabled':''}>Siguientes →</button></div></section>`;
  }).join(''):'<p class="empty">Trae tu plan personal o crea uno desde la app.</p>';
}
function dayOf(plan,i){return plan.scope==='custom'?plan.entries[i]:{title:'Día '+(i+1),sourceText:'',readings:plan.entries[i],warnings:[]};}
function downloadJson(value,filename){
  const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
function readPlanDay(id,dayIndex,readingIndex=0){
  const plan=state.plans.find(p=>p.id===id),day=plan&&dayOf(plan,dayIndex),ref=day?.readings[readingIndex];if(!ref)return;
  activePlanDay={id,dayIndex};
  $('#plan-reading-session').hidden=false;$('#plan-reading-title').textContent=(plan.title||{nt:'Nuevo Testamento',all:'Toda la Biblia',salmos:'Salmos'}[plan.scope])+' · '+day.title;
  $('#plan-reading-reference').textContent=planCore.formatRef(ref,books);$('#complete-plan-day').textContent=plan.completed.includes(dayIndex)?'Día completado ✓':'Marcar día como leído';
  go(ref.book,ref.chapter,ref.verse||1,ref.endVerse||ref.verse);window.scrollTo({top:0});
}
function selectedImport(){
  if(!pendingPlan)throw new Error('No hay un plan para guardar.');
  const next=planCore.validateCustomPlan({...pendingPlan.plan,title:$('#import-plan-title').value},books);
  const target=$('#plan-import-target').value;
  if(target==='new')return state.plans.some(p=>p.id===next.id)?planCore.validateCustomPlan({...next,id:undefined,dayIds:undefined},books):next;
  return planCore.mergePlan(state.plans.find(p=>p.id===target),next,books);
}
function reviewSummary(){
  if(!pendingPlan)return;
  const plan=pendingPlan.plan,count=plan.entries.filter(e=>e.warnings.length).length;
  try{const next=selectedImport();$('#plan-review-summary').textContent=`${next.days} días · ${next.completed.length} completados · ${next.entries.reduce((n,e)=>n+e.readings.length,0)} capítulos o pasajes${count?' · '+count+' días para revisar':''}.`;$('#save-import-plan').disabled=false;}
  catch(error){$('#plan-review-summary').textContent=error.message;$('#save-import-plan').disabled=true;}
}
function renderReview(){
  if(!pendingPlan)return;
  const plan=pendingPlan.plan,start=reviewPage*REVIEW_PAGE,end=Math.min(start+REVIEW_PAGE,plan.days);
  $('#plan-review-days').innerHTML=plan.entries.slice(start,end).map((day,j)=>{const i=start+j;return `<section class="review-day" data-review-day="${i}"><div class="review-day-top"><span class="day-number">DÍA ${i+1}</span><label class="checkbox-label"><input type="checkbox" data-review-done="${i}" ${plan.completed.includes(i)?'checked':''}> Ya completado</label></div><label>Título o fecha<input data-review-title="${i}" maxlength="200" value="${esc(day.title)}"></label><label>Lectura indicada en tu archivo<textarea data-review-source="${i}" maxlength="20000" rows="2">${esc(day.sourceText)}</textarea></label><div class="detected-passages">${day.readings.map(ref=>`<span>${esc(planCore.formatRef(ref,books))}</span>`).join('')}</div>${day.highlightColors?.length?'<small class="muted">Resaltado en el documento original.</small>':''}${day.warnings.length?`<p class="review-warning">${esc(day.warnings.join(' '))}</p>`:''}</section>`;}).join('');
  $('#review-prev').disabled=reviewPage===0;$('#review-next').disabled=end>=plan.days;$('#review-page').textContent=`Días ${start+1}–${end} de ${plan.days}`;reviewSummary();
}
async function importPlanFile(file){
  $('#plan-import-status').textContent='Leyendo tu plan…';
  let plan,notices=[];
  if(/\.docx$/i.test(file.name)){
    const source=await window.PlanDocuments.readDocx(file);plan=planCore.parseRecords(source.records,file.name,books);notices=source.warnings;
  }else{
    if(file.size>2000000)throw new Error('El archivo de texto supera los 2 MB.');
    if(!/\.(txt|md|csv|json)$/i.test(file.name))throw new Error('Puedes cargar Word DOCX, TXT, MD, CSV o JSON.');
    const text=await file.text();plan=/\.json$/i.test(file.name)?planCore.importJson(file.name,text,books):planCore.importText(file.name,text,books);
  }
  pendingPlan={plan,baseCompleted:new Set(plan.completed),manualCompleted:new Map()};reviewPage=0;
  $('#import-plan-title').value=plan.title;
  $('#plan-import-target').innerHTML='<option value="new">Plan nuevo</option>'+state.plans.filter(p=>p.scope==='custom').map(p=>`<option value="${p.id}">Actualizar: ${esc(p.title)}</option>`).join('');
  $('#plan-import-description').textContent=plan.description;
  $('#plan-review-notice').textContent=notices.join(' ')+' Al actualizar un plan coincidente se conserva el avance de la app y se añade el del archivo.';
  $('#highlight-option').hidden=!plan.entries.some(e=>e.highlightColors?.length);$('#highlight-completed').checked=false;
  $('#plan-review').hidden=false;$('#plan-import-status').textContent='Lectura terminada. Confirma los pasajes y el avance antes de guardar.';
  renderReview();$('#plan-review').scrollIntoView({block:'start'});
}
function bindPlanImport(){
  $('#import-plan').addEventListener('click',()=>$('#plan-file').click());
  $('#plan-file').addEventListener('change',async event=>{
    const file=event.target.files[0];if(!file)return;$('#import-plan').disabled=true;
    try{await importPlanFile(file);}catch(error){$('#plan-import-status').textContent=error instanceof SyntaxError?'El archivo JSON no tiene un formato válido.':error.message;toast($('#plan-import-status').textContent);}finally{event.target.value='';$('#import-plan').disabled=false;}
  });
  $('#cancel-plan-import').addEventListener('click',()=>{pendingPlan=null;$('#plan-review').hidden=true;$('#plan-import-status').textContent='';});
  $('#review-prev').addEventListener('click',()=>{reviewPage--;renderReview();});$('#review-next').addEventListener('click',()=>{reviewPage++;renderReview();});
  $('#import-plan-title').addEventListener('input',reviewSummary);$('#plan-import-target').addEventListener('change',reviewSummary);
  $('#highlight-completed').addEventListener('change',event=>{
    const done=new Set(pendingPlan.baseCompleted);
    if(event.target.checked)pendingPlan.plan.entries.forEach((entry,i)=>{if(entry.highlightCandidate){done.add(i);entry.completionOrigin='Resaltado confirmado por el lector';}});
    pendingPlan.manualCompleted.forEach((completed,i)=>{if(completed)done.add(i);else done.delete(i);});pendingPlan.plan.completed=[...done];renderReview();
  });
  $('#plan-review-days').addEventListener('change',event=>{
    if(!event.target.matches('[data-review-done]'))return;const i=Number(event.target.dataset.reviewDone),done=new Set(pendingPlan.plan.completed);
    pendingPlan.manualCompleted.set(i,event.target.checked);if(event.target.checked)done.add(i);else done.delete(i);pendingPlan.plan.completed=[...done];reviewSummary();
  });
  $('#plan-review-days').addEventListener('input',event=>{
    if(event.target.matches('[data-review-title]'))pendingPlan.plan.entries[Number(event.target.dataset.reviewTitle)].title=event.target.value;
    if(event.target.matches('[data-review-source]')){
      const day=pendingPlan.plan.entries[Number(event.target.dataset.reviewSource)],parsed=planCore.parseReferences(event.target.value,books);day.sourceText=event.target.value;day.readings=parsed.refs;day.warnings=parsed.warnings.concat(parsed.refs.length?[]:['Sin pasajes reconocidos.']);
      const row=event.target.closest('.review-day');row.querySelector('.detected-passages').innerHTML=parsed.refs.map(ref=>`<span>${esc(planCore.formatRef(ref,books))}</span>`).join('');let warning=row.querySelector('.review-warning');if(!warning){warning=document.createElement('p');warning.className='review-warning';row.appendChild(warning);}warning.textContent=day.warnings.join(' ');
    }reviewSummary();
  });
  $('#save-import-plan').addEventListener('click',()=>{
    try{
      if(state.plans.length>=100&&$('#plan-import-target').value==='new')throw new Error('La biblioteca admite hasta 100 planes.');
      const plan=selectedImport(),old=state,existing=state.plans.find(p=>p.id===plan.id);
      state={...state,plans:existing?state.plans.map(p=>p.id===plan.id?plan:p):[plan,...state.plans]};
      if(!save()){state=old;return;}
      pendingPlan=null;$('#plan-review').hidden=true;$('#plan-import-status').textContent='Plan guardado. Puedes continuar tu lectura y marcar cada día.';planPages.set(plan.id,0);renderPlans();toast(existing?'Plan actualizado conservando el avance.':'Tu plan personal está listo.');
    }catch(error){toast(error.message);}
  });
  $('#plan-list').addEventListener('click',event=>{
    const read=event.target.closest('[data-plan-read]');if(read){readPlanDay(read.dataset.planRead,Number(read.dataset.day),Number(read.dataset.reading));return;}
    const page=event.target.closest('[data-plan-page]');if(page){planPages.set(page.dataset.planPage,(planPages.get(page.dataset.planPage)||0)+Number(page.dataset.direction));renderPlans();return;}
    const resume=event.target.closest('[data-plan-resume]');if(resume){const plan=state.plans.find(p=>p.id===resume.dataset.planResume),i=plan.entries.findIndex((_day,index)=>!plan.completed.includes(index)&&dayOf(plan,index).readings.length);if(i<0){toast('Todas las lecturas reconocidas están completadas.');return;}readPlanDay(plan.id,i);return;}
    const exportButton=event.target.closest('[data-export-plan]');if(exportButton){const plan=state.plans.find(p=>p.id===exportButton.dataset.exportPlan),custom=plan.scope==='custom'?plan:planCore.validateCustomPlan({id:plan.id,dayIds:plan.dayIds,title:{all:'Toda la Biblia',nt:'Nuevo Testamento',salmos:'Salmos'}[plan.scope],entries:plan.entries.map((_e,i)=>({...dayOf(plan,i),sourceText:dayOf(plan,i).readings.map(ref=>planCore.formatRef(ref,books)).join('; ')})),completed:plan.completed},books);downloadJson(custom,(custom.title.replace(/[<>:"/\\|?*]/g,'-')||'mi-plan')+'.json');}
  });
  $('#plan-list').addEventListener('change',event=>{if(event.target.matches('[data-plan-filter]')){planFilters.set(event.target.dataset.planFilter,event.target.value);planPages.set(event.target.dataset.planFilter,0);renderPlans();}});
  $('#back-to-plan').addEventListener('click',()=>{if(activePlanDay){planPages.set(activePlanDay.id,Math.floor(activePlanDay.dayIndex/PLAN_PAGE));planFilters.set(activePlanDay.id,'all');}showView('plan');});
  $('#complete-plan-day').addEventListener('click',()=>{if(!activePlanDay)return;const plan=state.plans.find(p=>p.id===activePlanDay.id);if(!plan)return;if(!plan.completed.includes(activePlanDay.dayIndex))plan.completed.push(activePlanDay.dayIndex);save();$('#complete-plan-day').textContent='Día completado ✓';toast('Día marcado como completado.');});
}
async function search() {
  if(desktop?.search){const generation=++searchGeneration,query=$('#search-input').value.trim();if(query.length<2){$('#search-count').textContent='Escribe al menos dos letras.';$('#search-results').innerHTML='';return;}$('#search-count').textContent='Buscando en tu biblioteca… La primera búsqueda prepara el índice.';try{const result=await desktop.search({module:selectedVersion,query,mode:$('#search-mode').value});if(generation!==searchGeneration)return;$('#search-count').textContent=`${result.count} coincidencias${result.count>100?' · primeras 100':''}.`;$('#search-results').innerHTML=result.results.map(p=>`<button class="search-result" data-search-book="${p.book}" data-search-chapter="${p.chapter}" data-search-verse="${p.verse}" data-revision="${esc(result.revision)}" data-module="${esc(result.module)}"><b>${esc(reference(p))}</b>${esc(p.text)}</button>`).join('');}catch(error){if(generation===searchGeneration)$('#search-count').textContent=error.message;}return;}
  const query=core.clean($('#search-input').value.trim()), results=[];
  $('#search-results').innerHTML='';
  if(query.length<2) { $('#search-count').textContent='Escribe al menos dos letras.'; return; }
  let count=0;
  books.forEach((book,b)=>book.chapters.forEach((chapter,c)=>chapter.forEach((text,v)=>{
    if(core.clean(text).includes(query)) { count++; if(results.length<100) results.push({book:b,chapter:c+1,verse:v+1,text}); }
  })));
  $('#search-count').textContent=`${count} coincidencias${count>100?' · mostrando las primeras 100':''}.`;
  $('#search-results').innerHTML=results.map(p=>`<button class="search-result" data-search-book="${p.book}" data-search-chapter="${p.chapter}" data-search-verse="${p.verse}"><b>${esc(reference(p))}</b>${esc(p.text)}</button>`).join('');
}
function bind() {
  document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>showView(button.dataset.view)));
  $('#book').addEventListener('change',()=>go(Number($('#book').value),1));
  $('#chapter').addEventListener('change',()=>go(state.position.book,Number($('#chapter').value)));
  $('#verses').addEventListener('click',event=>{
    const verse=event.target.closest('[data-verse]'); if(!verse)return;
    studySelection='verse';state.position.verse=Number(verse.dataset.verse);
    $('#verses').querySelectorAll('.verse').forEach(el=>{el.classList.toggle('selected',el===verse);el.setAttribute('aria-pressed',String(el===verse));});
    renderNote(); save();
    const strong=event.target.closest('[data-strong]'),word=event.target.closest('[data-word]');
    if(strong)queryFromReading(strong.dataset.strong,true);else if(word)queryFromReading(word.dataset.word);
  });
  $('#note').addEventListener('input',()=>{ if($('#note').value) state.notes[key()]=$('#note').value; else delete state.notes[key()]; save(); });
  document.querySelectorAll('[data-ink]').forEach(button=>button.addEventListener('click',()=>{
    if(button.dataset.ink==='none')delete state.highlights[key()];else state.highlights[key()]=button.dataset.ink;
    renderReader();save();
  }));
  $('#previous').addEventListener('click',()=>changeChapter(-1)); $('#next').addEventListener('click',()=>changeChapter(1));
  $('#larger').addEventListener('click',()=>{state.font=Math.min(28,state.font+1);settings();save();});
  $('#smaller').addEventListener('click',()=>{state.font=Math.max(16,state.font-1);settings();save();});
  $('#night').addEventListener('click',()=>{state.appearance.theme=document.documentElement.dataset.theme==='noche'?'marfil':'noche';settings();save();});
  $('#focus').addEventListener('click',()=>{showView('read');document.body.classList.toggle('focus');updateReadingMode();});
  $('#cover').addEventListener('click',()=>$('#books-dialog').showModal()); $('#books-close').addEventListener('click',()=>$('#books-dialog').close());
  $('#books-grid').addEventListener('click',event=>{const button=event.target.closest('[data-book]');if(button){$('#books-dialog').close();go(Number(button.dataset.book),1);}});
  $('#search-open').addEventListener('click',()=>{$('#search-dialog').showModal();$('#search-input').focus();});
  $('#search-close').addEventListener('click',()=>$('#search-dialog').close());
  $('#search-input').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(search,220);});
  $('#search-results').addEventListener('click',event=>{const button=event.target.closest('[data-search-book]');if(button){const module=catalogData?.modules.find(m=>m.id===button.dataset.module);if(button.dataset.module&&(!module||module.sha256!==button.dataset.revision)){toast('Fuente no disponible: esta cita corresponde a otra revisión.');return;}if(module?.rol==='version'){selectedVersion=module.id;state.selectedVersion=selectedVersion;$('#version-select').value=selectedVersion;}else if(button.dataset.module==='rv1960-strong'&&catalogData.modules.some(m=>m.id==='rv1960')){selectedVersion='rv1960';state.selectedVersion=selectedVersion;$('#version-select').value=selectedVersion;}$('#search-dialog').close();go(Number(button.dataset.searchBook),Number(button.dataset.searchChapter),Number(button.dataset.searchVerse));}});
  $('#dev-form').addEventListener('submit',event=>{
    event.preventDefault();const data=new FormData(event.target);
    try { const dev=core.createDevotional({topic:data.get('topic'),minutes:Number(data.get('minutes')),days:Number(data.get('days')),purpose:data.get('purpose')},books);state.devotionals.unshift(dev);save();renderDevList();activeDev=dev.id;activeDay=0;renderDev();$('#dev-detail').scrollIntoView({block:'start'});toast('Tu guía de devoción está preparada.'); }
    catch(error){toast(error.message);}
  });
  $('#dev-list').addEventListener('click',event=>{const button=event.target.closest('[data-dev]');if(button){activeDev=button.dataset.dev;activeDay=0;renderDev();$('#dev-detail').scrollIntoView({block:'start'});}});
  $('#dev-detail').addEventListener('change',event=>{if(event.target.matches('.dev-day')){activeDay=Number(event.target.value);renderDev();}});
  $('#dev-detail').addEventListener('input',event=>{if(event.target.id==='dev-response'){state.devResponses[activeDev+':'+activeDay]=event.target.value;$('#dev-save-status').textContent=save()?'Guardado en este equipo.':'No se pudo guardar. Exporta una copia.';}});
  document.addEventListener('click',event=>{const button=event.target.closest('[data-read-book]');if(button){go(Number(button.dataset.readBook),Number(button.dataset.readChapter));window.scrollTo({top:0});}});
  $('#import-dev').addEventListener('click',()=>$('#dev-file').click());
  $('#dev-file').addEventListener('change',async event=>{
    const file=event.target.files[0];if(!file)return;
    try { if(file.size>2000000)throw new Error('El archivo supera los 2 MB.');const dev=core.importDevotional(file.name,await file.text(),books);state.devotionals.unshift(dev);save();renderDevList();activeDev=dev.id;activeDay=0;renderDev();toast('Devocional cargado.'); }
    catch(error){toast(error instanceof SyntaxError?'El JSON no tiene un formato válido.':error.message);}
    finally{event.target.value='';}
  });
  $('#plan-form').addEventListener('submit',event=>{
    event.preventDefault();const data=new FormData(event.target);
    try {const plan=core.createPlan(books,data.get('scope'),Number(data.get('days')));while(state.plans.some(p=>p.id===plan.id))plan.id='plan-'+(Number(plan.id.slice(5))+1);state.plans.unshift(plan);save();renderPlans();toast('Tu plan de lectura está listo.');}catch(error){toast(error.message);}
  });
  $('#plan-form select').addEventListener('change',event=>{const days=$('#plan-form input');days.value={all:365,nt:90,salmos:30}[event.target.value];days.max={all:1189,nt:260,salmos:150}[event.target.value];});
  $('#plan-list').addEventListener('change',event=>{
    if(!event.target.matches('[data-plan]'))return;
    const plan=state.plans.find(p=>p.id===event.target.dataset.plan), day=Number(event.target.dataset.day);
    if(event.target.checked && !plan.completed.includes(day))plan.completed.push(day); else if(!event.target.checked)plan.completed=plan.completed.filter(d=>d!==day);
    const scroll=event.target.closest('.plan-days').scrollTop;save();renderPlans();
    $('#plan-list').querySelector(`[data-plan="${plan.id}"]`)?.closest('.plan-days').scrollTo({top:scroll});
  });
  $('#backup').addEventListener('click',()=>{
    const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;
    const date=new Date();const stamp=[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
    a.download=`mi-biblioteca-${stamp}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);toast('Copia preparada: notas, subrayados, devocionales y planes.');
  });
  $('#restore').addEventListener('click',()=>$('#restore-file').click());
  $('#restore-file').addEventListener('change',async event=>{
    const file=event.target.files[0];if(!file)return;
    try {if(file.size>10000000)throw new Error('La copia supera los 10 MB.');const incoming=validateState(JSON.parse(await file.text()));if(!window.confirm('Recuperar esta copia reemplazará tus notas, devocionales y planes actuales. ¿Continuar?'))return;state=incoming;activeDev=null;if(desktop?.catalog)await loadCatalog();save();settings();renderReader();renderDevList();renderDev();renderPlans();toast('Tu biblioteca ha sido recuperada.');}catch(error){toast(error instanceof SyntaxError?'La copia no es un archivo JSON válido.':error.message);}finally{event.target.value='';}
  });
}
async function start() {
  if(!books || books.length!==66){toast('Falta el texto bíblico. Ejecuta la preparación de la Biblia indicada en el proyecto.');return;}
  try {const saved=localStorage.getItem(STORE);let legacyValid=true;if(saved){try{state=validateState(JSON.parse(saved));}catch(error){legacyValid=false;if(!desktop?.bootstrap)throw error;}}if(desktop?.bootstrap){const migrated=await desktop.bootstrap({legacy:saved,initial:state,legacyValid});state=validateState(migrated.state);storageReady=true;if(migrated.migrated)toast('Tu biblioteca se conservó en SQLite. Hay una copia anterior para recuperación.');await loadCatalog();}}catch(error){storageReady=false;toast('No se reemplazará la copia anterior: '+error.message);}
  $('#book').innerHTML=books.map((book,i)=>`<option value="${i}">${esc(book.name)}</option>`).join('');
  $('#books-grid').innerHTML=books.map((book,i)=>`<button data-book="${i}">${esc(book.name)}</button>`).join('');
  $('#note').maxLength=100000;
  settings();renderReader();renderDevList();renderPlans();bind();bindPlanImport();
  bindLibrary();bindAppearance();
}
async function loadCatalog(){catalogData=await desktop.catalog();const versions=catalogData.modules.filter(m=>m.tipo==='biblia'&&m.rol==='version');selectedVersion=versions.some(m=>m.id===state.selectedVersion)?state.selectedVersion:versions.some(m=>m.id==='rv1960')?'rv1960':'rv1909';$('#version-select').innerHTML=versions.map(m=>`<option value="${esc(m.id)}">${esc(m.abreviatura||m.titulo)}</option>`).join('');$('#version-select').value=selectedVersion;const comments=catalogData.modules.filter(m=>m.rol==='comentario');$('#comment-select').innerHTML='<option value="">Elegir comentario</option>'+comments.map(m=>`<option value="${esc(m.id)}">${esc(m.titulo)}</option>`).join('');const options=[['strong-es','Strong español'],['vine','Vine · AT y NT'],['drae','RAE · Diccionario español']].filter(([id])=>id==='vine'?catalogData.modules.some(m=>m.id==='vine-at'||m.id==='vine-nt'):id==='drae'?catalogData.modules.some(m=>/^drae-[123]$/.test(m.id)):catalogData.modules.some(m=>m.id===id));$('#dictionary-select').innerHTML=options.map(([id,title])=>`<option value="${id}">${title}</option>`).join('');$('#show-strong').disabled=selectedVersion!=='rv1960'||!catalogData.modules.some(m=>m.id==='rv1960-strong');if($('#show-strong').disabled)$('#show-strong').checked=false;$('#comment-select').disabled=!comments.length;if(comments.length)$('#comment-select').value=comments.some(m=>m.id==='mundo-hispano')?'mundo-hispano':comments[0].id;for(const id of ['dictionary-select','dictionary-query','dictionary-submit'])$('#'+id).disabled=!options.length;renderSources();}
function renderSources(){if(!catalogData)return;$('#sources-list').innerHTML=catalogData.modules.map(m=>`<section class="source-card"><h4>${esc(m.titulo)}</h4><p>${esc(m.origen)} · ${esc(m.rol)}</p><p>${esc(m.licencia)}</p><p class="fine-print">${esc(m.versificacion)} · Revisión ${esc(m.sha256.slice(0,16))}</p>${m.sourceNotice?`<details><summary>Aviso incluido en la fuente</summary><p class="source-notice">${esc(m.sourceNotice)}</p></details>`:''}</section>`).join('');$('#sources-warning').textContent=catalogData.warnings.join('\n');}
async function renderComment(){
  const generation=++studyGeneration,content=$('#comment-content');
  $('#panes').dataset.sourcesReady=String(Boolean($('#comment-select').value&&$('#dictionary-select').value));
  $('#comment-scope').textContent=studySelection==='chapter'?'Comentario del capítulo':studySelection==='range'?'Comentario del rango seleccionado':'Comentario del versículo seleccionado';
  if(!desktop?.comments||!$('#comment-select').value){content.innerHTML='<p class="empty-slot">Elige una fuente para leer su comentario.</p>';content.setAttribute('aria-busy','false');return;}
  if(selectedVersion==='rv1909'){content.textContent='Elige RV1960, NVI o LBLA para consultar estos comentarios: la numeración de la fuente anterior puede diferir.';content.setAttribute('aria-busy','false');return;}
  content.setAttribute('aria-busy','true');content.textContent='Leyendo comentario…';
  try{
    const p=state.position,start=studySelection==='chapter'?1:studySelection==='range'?readerRange.start:p.verse,end=studySelection==='chapter'?books[p.book].chapters[p.chapter-1].length:studySelection==='range'?readerRange.end:start;
    const result=await desktop.comments({module:$('#comment-select').value,...p,verse:start,endVerse:end});if(generation!==studyGeneration)return;
    const chapter=result.entries.filter(e=>e.label==='Comentario del capítulo'),ranges=result.entries.filter(e=>!['Introducción al libro','Comentario del capítulo'].includes(e.label));
    const entries=studySelection==='chapter'&&chapter.length?chapter:ranges.length?ranges:chapter;
    content.innerHTML=(entries.length?entries.map(e=>`<section class="comment-entry"><h4>${esc(e.label)}</h4><div>${e.html}</div></section>`).join(''):'<p class="empty-slot">Esta fuente no tiene una nota para este pasaje.</p>')+result.entries.filter(e=>e.label==='Introducción al libro').map(e=>`<details class="comment-introduction"><summary>${esc(e.label)}</summary><div>${e.html}</div></details>`).join('');
    content.scrollTop=0;
  }catch(error){if(generation===studyGeneration)content.textContent=error.message;}
  finally{if(generation===studyGeneration)content.setAttribute('aria-busy','false');}
}
function showDictionaryEntry(index){
  const entry=dictionaryEntries[index];if(!entry)return;
  $('#dictionary-content').innerHTML=`<ul class="dictionary-results" aria-label="Resultados de diccionario">${dictionaryEntries.map((e,i)=>`<li><button class="dictionary-result" data-dictionary-entry="${i}" aria-pressed="${i===index}">${esc(e.title)}</button></li>`).join('')}</ul><article class="dictionary-entry"><h4>${esc(entry.title)}</h4><p class="source-caption">${esc(catalogData?.modules.find(m=>m.id===entry.module)?.titulo||entry.module)}</p><div>${entry.html}</div></article>`;
  $('#dictionary-content').scrollTop=0;
}
async function consultDictionary(){
  const generation=++dictionaryGeneration,content=$('#dictionary-content');syncDictionaryRef();content.setAttribute('aria-busy','true');content.textContent='Buscando…';
  try{const result=await desktop.dictionary({group:$('#dictionary-select').value,query:$('#dictionary-query').value});if(generation!==dictionaryGeneration)return;dictionaryEntries=result.entries;if(dictionaryEntries.length)showDictionaryEntry(0);else content.innerHTML='<p class="empty-slot">No hay entradas para esta consulta. Prueba otra palabra.</p>';$('#dictionary-status').textContent=`${dictionaryEntries.length} resultados${$('#dictionary-select').value==='drae'?' · palabra exacta primero, después prefijos':''}.`;}
  catch(error){if(generation===dictionaryGeneration){content.textContent=error.message;$('#dictionary-status').textContent='No se pudo consultar esta fuente.';}}
  finally{if(generation===dictionaryGeneration)content.setAttribute('aria-busy','false');}
}
// Presentation hooks shared by all three CSS designs; module text is never rewritten on disk.
function decorateReading(){
  for(const verse of $('#verses').children){
    const walker=document.createTreeWalker(verse,NodeFilter.SHOW_TEXT),nodes=[];
    while(walker.nextNode())nodes.push(walker.currentNode);
    for(const node of nodes){
      if(node.parentElement.closest('.module-heading')||node.parentElement===verse.querySelector('sup'))continue;
      const strong=Boolean(node.parentElement.closest('.strong-number'));
      const expression=strong?/([HG]\d{1,5})/g:/([\p{L}\p{M}]+(?:[’'-][\p{L}\p{M}]+)*)/gu;
      const fragment=document.createDocumentFragment();let last=0;
      for(const match of node.textContent.matchAll(expression)){
        fragment.append(node.textContent.slice(last,match.index));const span=document.createElement('span');
        span.textContent=match[0];span.className=strong?'strong-code':'reading-word';span.dataset[strong?'strong':'word']=match[0];
        fragment.append(span);last=match.index+match[0].length;
      }
      if(last){fragment.append(node.textContent.slice(last));node.replaceWith(fragment);}
    }
  }
}
function syncDictionaryRef(){
  const query=$('#dictionary-query').value.trim();
  $('#dictionary-ref').textContent=query?`${query} · ${reference()}`:'Toca una palabra o consulta aquí.';
}
function queryFromReading(query,strong=false){
  if(!desktop?.dictionary||$('#dictionary-select').disabled)return;
  const select=$('#dictionary-select'),groups=[...select.options].map(o=>o.value);
  if(strong&&groups.includes('strong-es'))select.value='strong-es';
  else if(!strong&&select.value==='strong-es')select.value=groups.includes('drae')?'drae':groups.includes('vine')?'vine':select.value;
  $('#dictionary-query').value=query;syncDictionaryRef();consultDictionary();
}
function updateReadingMode(){
  const solo=document.body.classList.contains('focus')||document.body.classList.contains('reading-only');
  $('#panes').dataset.active=String(!solo);$('#study-open').textContent=solo?'Abrir estudio':'Solo lectura';
  $('#study-open').setAttribute('aria-pressed',String(!solo));
  $('#focus').textContent=document.body.classList.contains('focus')?'✦ Volver a mi biblioteca':'✦ Modo intimidad';
}
function bindReaderSync(){
  const body=$('#verses');let intentUntil=0,timer;
  for(const name of ['wheel','pointerdown','keydown'])body.addEventListener(name,()=>{intentUntil=Date.now()+2500;},{passive:true});
  body.addEventListener('scroll',()=>{clearTimeout(timer);if(Date.now()>intentUntil)return;timer=setTimeout(()=>{
    if(activeView!=='read'||!storageReady||document.activeElement===$('#note'))return;
    const top=body.getBoundingClientRect().top+12;
    const verse=[...body.children].find(el=>el.getBoundingClientRect().bottom>top);
    if(!verse||Number(verse.dataset.verse)===state.position.verse)return;
    studySelection='verse';state.position.verse=Number(verse.dataset.verse);
    for(const el of body.children){el.classList.toggle('selected',el===verse);el.setAttribute('aria-pressed',String(el===verse));}
    renderNote();save();
  },250);},{passive:true});
}
function bindPaneResizers(){
  const defaults={biblia:42,comentario:30,diccionario:28};
  const apply=values=>{state.appearance.panes=values;for(const [id,size] of Object.entries(values))document.documentElement.style.setProperty('--pane-'+id,size+'fr');};
  for(const separator of document.querySelectorAll('.pane-resizer')){
    const [first,second]=separator.dataset.between.split(','),a=$(`[data-pane="${first}"]`),b=$(`[data-pane="${second}"]`);
    let drag=null;
    const axis=()=>getComputedStyle(separator).getPropertyValue('--resize-axis').trim()==='y'?'y':'x';
    const updateAria=()=>{const rectA=a.getBoundingClientRect(),rectB=b.getBoundingClientRect(),horizontal=axis()==='x',size=horizontal?'width':'height';separator.setAttribute('aria-orientation',horizontal?'vertical':'horizontal');separator.setAttribute('aria-valuenow',Math.round(100*rectA[size]/(rectA[size]+rectB[size]))||50);};
    const resize=(ratio,values,span)=>{
      const total=values[first]+values[second],minimum=Math.max(20,1000/total,Math.min(45,100*(axis()==='x'?220:140)/span));
      ratio=Math.max(minimum,Math.min(100-minimum,ratio));
      const next={...values,[first]:total*ratio/100,[second]:total*(1-ratio/100)};apply(next);updateAria();
    };
    separator.addEventListener('pointerdown',event=>{
      if(event.button!==0)return;event.preventDefault();
      const horizontal=axis()==='x',rectA=a.getBoundingClientRect(),rectB=b.getBoundingClientRect(),size=horizontal?'width':'height';
      drag={pointer:event.pointerId,start:horizontal?event.clientX:event.clientY,pixels:rectA[size],span:rectA[size]+rectB[size],values:{...(state.appearance.panes||defaults)}};
      separator.setPointerCapture(event.pointerId);document.body.classList.add('resizing');
    });
    separator.addEventListener('pointermove',event=>{if(!drag||event.pointerId!==drag.pointer)return;const delta=(axis()==='x'?event.clientX:event.clientY)-drag.start;resize(100*(drag.pixels+delta)/drag.span,drag.values,drag.span);});
    const finish=cancel=>{if(!drag)return;if(cancel)apply(drag.values);drag=null;document.body.classList.remove('resizing');if(!cancel)save();};
    separator.addEventListener('pointerup',()=>finish(false));separator.addEventListener('pointercancel',()=>finish(true));separator.addEventListener('lostpointercapture',()=>finish(false));
    separator.addEventListener('keydown',event=>{
      if(event.key==='Escape'&&drag){finish(true);return;}
      if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
      event.preventDefault();const rectA=a.getBoundingClientRect(),rectB=b.getBoundingClientRect(),size=axis()==='x'?'width':'height',span=rectA[size]+rectB[size];
      const ratio=100*rectA[size]/span,desired=event.key==='Home'?20:event.key==='End'?80:ratio+(['ArrowRight','ArrowDown'].includes(event.key)?5:-5);
      resize(desired,{...(state.appearance.panes||defaults)},span);save();
    });
    separator.addEventListener('dblclick',()=>{apply({...defaults});updateAria();save();});
    new ResizeObserver(updateAria).observe(separator);
  }
}
function bindAppearance(){
  $('#design-select').addEventListener('change',()=>{state.appearance.design=$('#design-select').value;settings();save();});
  $('#theme-select').addEventListener('change',()=>{state.appearance.theme=$('#theme-select').value;settings();save();});
  setInterval(()=>{if(state.appearance.theme==='auto')settings();},60000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.appearance.theme==='auto')settings();});
  const scrollAreas=()=>[document.scrollingElement,$('#main-content'),$('#verses')];
  const updateTop=()=>{const visible=window.scrollY>600||scrollAreas().some(el=>el&&el.scrollTop>600);const button=$('#back-to-top');button.classList.toggle('is-visible',visible);button.setAttribute('aria-hidden',String(!visible));button.tabIndex=visible?0:-1;};
  document.addEventListener('scroll',updateTop,true);window.addEventListener('resize',updateTop);updateTop();
  $('#back-to-top').addEventListener('click',()=>{const behavior=matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth';window.scrollTo({top:0,behavior});for(const el of scrollAreas())el?.scrollTo({top:0,behavior});$('#book').focus({preventScroll:true});});
  $('#study-open').addEventListener('click',()=>{const solo=document.body.classList.contains('focus')||document.body.classList.contains('reading-only');document.body.classList.remove('focus');document.body.classList.toggle('reading-only',!solo);updateReadingMode();});
  $('#dictionary-from-selection').addEventListener('click',()=>{const word=window.getSelection()?.toString().trim();if(!word||word.length>100){toast('Selecciona una palabra de la Biblia y pulsa Consultar selección.');return;}queryFromReading(word,/^[HG]\d{1,5}$/i.test(word));});
  bindPaneResizers();bindReaderSync();
  document.querySelectorAll('[data-action]').forEach(button=>button.addEventListener('click',()=>{const menu=button.closest('details');if(menu)menu.open=false;document.getElementById(button.dataset.action)?.click();}));
}

function bindLibrary(){if(!desktop?.catalog){$('#library-controls').hidden=true;return;}$('#version-select').addEventListener('change',()=>{selectedVersion=$('#version-select').value;state.selectedVersion=selectedVersion;$('#show-strong').disabled=selectedVersion!=='rv1960'||!catalogData.modules.some(m=>m.id==='rv1960-strong');if($('#show-strong').disabled)$('#show-strong').checked=false;stopVoice();renderReader();save();});$('#show-strong').addEventListener('change',renderReader);$('#comment-select').addEventListener('change',renderComment);$('#dictionary-form').addEventListener('submit',event=>{event.preventDefault();consultDictionary();});$('#dictionary-select').addEventListener('change',()=>{dictionaryGeneration++;dictionaryEntries=[];$('#dictionary-content').setAttribute('aria-busy','false');$('#dictionary-content').innerHTML='<p class="empty-slot">Consulta una palabra en esta fuente.</p>';$('#dictionary-query').placeholder=$('#dictionary-select').value==='drae'?'Palabra en español…':'Padre, G25, H7225…';$('#panes').dataset.sourcesReady=String(Boolean($('#comment-select').value&&$('#dictionary-select').value));});$('#dictionary-content').addEventListener('click',event=>{const button=event.target.closest('[data-dictionary-entry]');if(button){const index=Number(button.dataset.dictionaryEntry);showDictionaryEntry(index);$('#dictionary-content').querySelector(`[data-dictionary-entry="${index}"]`)?.focus({preventScroll:true});}});$('#sources-open').addEventListener('click',()=>$('#sources-dialog').showModal());$('#sources-close').addEventListener('click',()=>$('#sources-dialog').close());$('#sources-refresh').addEventListener('click',async()=>{try{await loadCatalog();await renderReader();toast('Fuentes y revisiones comprobadas.');}catch(error){toast(error.message);}});$('#search-mode').addEventListener('change',search);$('#voice-play').addEventListener('click',playVoice);$('#voice-pause').addEventListener('click',()=>{if(speechSynthesis.paused)speechSynthesis.resume();else speechSynthesis.pause();});$('#voice-stop').addEventListener('click',stopVoice);window.speechSynthesis?.addEventListener('voiceschanged',loadVoices);loadVoices();window.addEventListener('beforeunload',event=>{stopVoice();if(saveFailed){if(!window.confirm('Hay cambios sin guardar. Puedes cancelar y exportar una copia. ¿Cerrar y descartarlos?')){event.preventDefault();event.returnValue='';}return;}if(savePending){event.preventDefault();event.returnValue='';saveQueue.then(()=>{if(!saveFailed)window.close();});}});}
function loadVoices(){const voices=window.speechSynthesis?.getVoices().filter(v=>v.localService&&/^es/i.test(v.lang))||[];$('#voice-select').innerHTML=voices.map((v,i)=>`<option value="${i}">${esc(v.name)}</option>`).join('');$('#voice-play').disabled=!voices.length;$('#voice-status').textContent=voices.length?'Voz de Windows · sin conexión':'No hay una voz local en español. Añádela en Configuración de Windows → Idioma.';}
function stopVoice(){window.speechSynthesis?.cancel();}
function playVoice(){const voices=speechSynthesis.getVoices().filter(v=>v.localService&&/^es/i.test(v.lang));const voice=voices[Number($('#voice-select').value)];if(!voice||!chapterData){toast('Espera a que se cargue el capítulo y elige una voz local.');return;}stopVoice();const utterance=new SpeechSynthesisUtterance(chapterData.verses.map(v=>v.text).join('\n'));utterance.voice=voice;utterance.lang=voice.lang;utterance.onend=()=>$('#voice-status').textContent='Lectura terminada.';utterance.onerror=()=>$('#voice-status').textContent='La voz no pudo leer. Prueba otra voz de Windows.';$('#voice-status').textContent='Leyendo…';speechSynthesis.speak(utterance);}
start();
