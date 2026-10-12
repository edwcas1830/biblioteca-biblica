'use strict';
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const books = window.BIBLE?.books;
const core = window.BibleCore;
const planCore = window.PlanCore;
const appearanceCore=window.AppearanceCore;
const paneCore=window.PaneLayoutCore;
const STORE = 'biblioteca-biblica-v1';
const initial = () => ({ version:1, position:{book:18,chapter:23,verse:1}, notes:{}, highlights:{}, devResponses:{}, planNotes:{}, prayers:[], prayerDrafts:{}, guideResponses:{}, aiStudies:[], aiPrefs:{}, estudio:(window.EstudioCore?EstudioCore.vacio():{marcas:[],colores:{},historial:[]}), hoy:(window.HoyCore?HoyCore.vacio():{}), iaBiblia:{consentido:false,historial:[]}, privacyEnabled:false, privateLocked:false, music:{url:''}, devotionals:[], plans:[], font:20, night:false, appearance:appearanceCore.normalize() });
let state = initial(), activeView='read', activeDev=null, activeDay=0, toastTimer, searchTimer;
const desktop=window.libraryDesktop;
let uiReady=false, storageReady=false, saveQueue=Promise.resolve(), selectedVersion='rv1909', catalogData=null, readingGeneration=0, searchGeneration=0, studyGeneration=0, chapterData=null, savePending=0, saveFailed=false;
let pendingPlan=null, reviewPage=0, activePlanDay=null, readerRange=null, studySelection='chapter', dictionaryGeneration=0, dictionaryEntries=[];
let suppressReaderSyncUntil=0;
let readerVoiceController=null;
const paneScrollPositions=new Map();
const planPages=new Map(), planFilters=new Map();
const PLAN_PAGE=30, REVIEW_PAGE=25;
function toast(text) { $('#toast').textContent=text; $('#toast').hidden=false; clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('#toast').hidden=true,5500); }
function validPosition(pos) { return pos && Number.isInteger(pos.book) && Number.isInteger(pos.chapter) && Number.isInteger(pos.verse) && pos.verse>0 && pos.verse<=(Math.max(books[pos.book]?.chapters[pos.chapter-1]?.length||0,pos.book===63&&pos.chapter===1?15:0)); }
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
    if(dev.completed!==undefined&&(!Array.isArray(dev.completed)||dev.completed.some(i=>!Number.isInteger(i)||i<0||i>=dev.entries.length)))throw new Error('Avance de devocional no válido.');
    return {...validated,...DevotionalCore.metadata(dev),completed:[...new Set(dev.completed||[])],sourceName:String(dev.sourceName||'').slice(0,200),description:String(dev.description||'').slice(0,2000000),titleCase:dev.titleCase!==false,subtitle:String(dev.subtitle||'').slice(0,500),...(dev.introBlocks?{introBlocks:contentCore.blocks(dev.introBlocks)}:{}),...(dev.guide?{guide:GuideCore.configuration(dev.guide)}:{}),id:dev.id,origin:typeof dev.origin==='string'?dev.origin.slice(0,200):'Devocional recuperado',purpose:typeof dev.purpose==='string'?dev.purpose.slice(0,500):'',minutes:Number.isInteger(dev.minutes)?dev.minutes:undefined};
  });
  result.plans=candidate.plans.map(plan=>{
    if(!plan || !/^plan-\d+(?:-[a-z0-9]+)?$/.test(plan.id) || ids.has(plan.id)) throw new Error('Plan no válido.');
    ids.add(plan.id);
    const validated=plan.scope==='custom'?planCore.validateCustomPlan(plan,books):core.createPlan(books,plan.scope,plan.days);
    if(!Array.isArray(plan.completed) || plan.completed.some(day=>!Number.isInteger(day)||day<0||day>=plan.days)) throw new Error('Progreso de plan no válido.');
    return {...validated,id:plan.id,dayIds:Array.isArray(plan.dayIds)?plan.dayIds:undefined,completed:[...new Set(plan.completed)]};
  });
  if(candidate.planNotes!==undefined){if(!candidate.planNotes||typeof candidate.planNotes!=='object'||Array.isArray(candidate.planNotes)||Object.keys(candidate.planNotes).length>35000)throw new Error('Notas de días no válidas.');for(const [key,note] of Object.entries(candidate.planNotes)){if(!/^plan-\d+(?:-[a-z0-9]+)?:day-[a-f0-9]{32}$/.test(key)||typeof note!=='string'||note.length>100000)throw new Error('Nota de día no válida.');result.planNotes[key]=note;}}
  result.guideResponses=GuideCore.responses(candidate.guideResponses||{});
  result.prayers=PrayerCore.validate(candidate.prayers||[]);for(const p of result.prayers)if(p.answer&&!validPosition(p.answer.reference))throw new Error('Versículo del testimonio fuera de rango.');result.prayerDrafts=PrayerCore.drafts(candidate.prayerDrafts||{});result.privacyEnabled=candidate.privacyEnabled===true;result.privateLocked=candidate.privateLocked===true;
  result.aiStudies=StudyChatCore.validate(candidate.aiStudies);result.aiPrefs={provider:['openrouter','codex','claude','gemini-cli','gemini-api'].includes(candidate.aiPrefs?.provider)?candidate.aiPrefs.provider:'openrouter',width:Math.max(300,Math.min(600,Number(candidate.aiPrefs?.width)||350))};
  result.music=MusicCore.preference(candidate.music);
  // «Mi estudio» (paso 4 del teléfono): marcadores, etiquetas, memoria, nombres de colores e historial.
  if(window.EstudioCore)result.estudio=EstudioCore.validar(candidate.estudio,validPosition);
  // «Hoy» (entrega 2B): pasos marcados por día, perfil del cuestionario y hora del aviso.
  if(window.HoyCore)result.hoy=HoyCore.validar(candidate.hoy);
  // IA integrada (entrega 4): consentimiento y las últimas 30 preguntas, solo en este equipo y en sus copias.
  result.iaBiblia={consentido:candidate.iaBiblia?.consentido===true,historial:window.IaBibliaCore?IaBibliaCore.validarHistorial(candidate.iaBiblia?.historial):[]};
  result.font=Number.isInteger(candidate.font)?Math.max(16,Math.min(28,candidate.font)):20;
  result.night=candidate.night===true;
  result.appearance=appearanceCore.normalize(candidate.appearance);
  result.appearance.views=paneCore.normalize(result.appearance.views,result.appearance.panes);
  result.bookFont=Number.isInteger(candidate.bookFont)?Math.max(16,Math.min(30,candidate.bookFont)):20;
  result.lastJourney=candidate.lastJourney?.kind==='dev'&&result.devotionals.some(d=>d.id===candidate.lastJourney.id)?{kind:'dev',id:candidate.lastJourney.id}:null;
  result.selectedVersion=typeof candidate.selectedVersion==='string'?candidate.selectedVersion:'rv1960';
  return result;
}
function save() {
  if(desktop?.savePersonal){
    if(!storageReady){toast('La copia anterior está protegida. Reinicia para reintentar la migración.');return false;}
    const snapshot=JSON.parse(JSON.stringify(state));savePending++;$('#save-status').textContent='Guardando…';
    const stableEntries=entries=>JSON.stringify(entries,(_key,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.keys(value).sort().map(k=>[k,value[k]])):value);
    saveQueue=saveQueue.catch(()=>{}).then(()=>desktop.savePersonal(snapshot)).then(saved=>{saveFailed=false;for(const plan of state.plans){const p=saved.plans.find(item=>item.id===plan.id);if(p&&stableEntries(p.entries)===stableEntries(plan.entries))plan.dayIds=p.dayIds;}$('#save-status').textContent='Guardado en este equipo.';}).catch(error=>{saveFailed=true;$('#save-status').textContent='No se pudo guardar. Exporta una copia.';toast(error.message);}).finally(()=>savePending--);
    return true;
  }
  try { localStorage.setItem(STORE,JSON.stringify(state)); $('#save-status').textContent='Guardado en este equipo.'; return true; }
  catch { $('#save-status').textContent='No se pudo guardar. Exporta una copia para conservar tus cambios.'; toast('El almacenamiento está lleno o no está disponible. Guarda una copia de tu biblioteca.'); return false; }
}
function key(verse=state.position.verse) { const p=state.position; return `${selectedVersion==='rv1909'?'':selectedVersion+'@'}${p.book}:${p.chapter}:${verse}`; }
function reference(p=state.position) { return `${books[p.book].name} ${p.chapter}:${p.verse}`; }
function settings() {
  state.appearance=appearanceCore.normalize(state.appearance);
  state.appearance.views=paneCore.normalize(state.appearance.views,state.appearance.panes);
  const root=document.documentElement,theme=appearanceCore.themeAt(state.appearance.theme,undefined,!!window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  root.dataset.design=state.appearance.design;root.dataset.theme=theme;
  const link=$('#design-css'),href='designs/design-'+state.appearance.design+'.css';
  if(link.getAttribute('href')!==href)link.setAttribute('href',href);
  state.night=theme==='noche';document.body.classList.toggle('night',state.night);
  root.style.setProperty('--verse-size',state.font+'px');
  $('#design-select').value=state.appearance.design;$('#theme-select').value=state.appearance.theme;
  updateReadingMode();
  $('#night').textContent=state.night?'◐ Luz de día':'◐ Luz cálida';
}

function showView(view) {
  activeView=view;
  document.querySelectorAll('.view').forEach(el=>el.hidden=el.id!==view+'-view');
  document.querySelectorAll('[data-view]').forEach(el=>el.classList.toggle('active',el.dataset.view===view));
  if(view!=='read') { graphicsExpanded=false;document.body.classList.remove('focus');updateReadingMode(); }
  if(view==='dev') renderDevList();
  if(view==='plan') renderPlans();
  if(view==='journey')renderJourney();if(view==='prayer')renderPrayer();
  if(view==='hoy')window.HoyApp?.render();
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
      $('#verses').innerHTML=result.verses.map(row=>`<button class="verse ${row.verse<=state.position.verse&&(row.endVerse||row.verse)>=state.position.verse?'selected':''} ${readerRange&&row.verse>=readerRange.start&&row.verse<=readerRange.end?'planned-range':''} ${state.highlights[key(row.verse)]?'highlight-'+state.highlights[key(row.verse)]:''}" data-verse="${row.verse}" data-end-verse="${row.endVerse||row.verse}" aria-pressed="${row.verse<=state.position.verse&&(row.endVerse||row.verse)>=state.position.verse}"><sup>${row.verse}${row.endVerse?'–'+row.endVerse:''}</sup>${row.html}</button>`).join('');
      decorateReading();renderComparison();$('#edition-footer').textContent=result.title;$('#cover-edition').textContent=result.title;
      if(result.verses.some(row=>!row.alignment)){let visto=false;try{visto=localStorage.getItem('biblioteca-aviso-strong-alineado')==='1';localStorage.setItem('biblioteca-aviso-strong-alineado','1');}catch{}if(!visto)toast('En algunos versículos los números Strong se muestran al final porque el texto de apoyo difiere.');}// Edward (12-oct): se avisa una sola vez, sin ocupar espacio sobre el texto.
      else $('#module-status').textContent='';
      if(state.position.verse===1)$('#verses').scrollTop=0;
      if(state.position.verse!==1)[...$('#verses').querySelectorAll('[data-verse]')].find(el=>Number(el.dataset.verse)<=state.position.verse&&Number(el.dataset.endVerse||el.dataset.verse)>=state.position.verse)?.scrollIntoView({block:'nearest'});
    }catch(error){if(generation===readingGeneration){chapterData=null;$('#verses').textContent=error.message;toast(error.message);}}
  }
}
function renderNote() {
  const p=state.position;document.documentElement.dataset.studyScope=studySelection;$('#selected-ref').textContent=studySelection==='chapter'?`${books[p.book].name} ${p.chapter}`:studySelection==='range'&&readerRange?`${books[p.book].name} ${p.chapter}:${readerRange.start}–${readerRange.end}`:reference();$('#bible-ref').textContent=$('#selected-ref').textContent;syncDictionaryRef();$('#note-reference').textContent=reference()+' · '+($('#version-select option:checked')?.textContent||selectedVersion);
  $('#note').value=state.notes[key()] || '';$('#note').disabled=!!state.privateLocked;
  $('#save-status').textContent=saveFailed?'No se pudo guardar. Exporta una copia.':selectedVersion!=='rv1909'&&Object.keys(state.notes).some(k=>!k.includes('@'))?'Notas de esta versión. Tus notas anteriores siguen en RV1909.':'Las notas se guardan en este equipo, vinculadas a esta versión.';
  renderComment();renderConnections();
}
function go(book,chapter,verse=1,endVerse) {
  if(!validPosition({book,chapter,verse})) { toast('No se encontró ese pasaje.'); return; }
  readerRange=endVerse?{book,chapter,start:verse,end:endVerse}:null;
  studySelection=endVerse?'range':verse!==1?'verse':'chapter';state.position={book,chapter,verse};
  if(window.EstudioCore)state.estudio=EstudioCore.alHistorial(state.estudio||EstudioCore.vacio(),{book,chapter,verse});
  renderReader(); save(); showView('read');
  if(verse!==1) $('#verses').querySelector(`[data-verse="${verse}"]`)?.scrollIntoView({block:'center'});
}
function changeChapter(direction) {
  let {book,chapter}=state.position; chapter+=direction;
  if(chapter<1) {book--;chapter=books[book]?.chapters.length;}
  if(chapter>books[book]?.chapters.length) {book++;chapter=1;}
  go(book,chapter); window.scrollTo({top:0});
}
function renderDevList() {
 const card=dev=>{const m=DevotionalCore.metadata(dev),date=m.finishedAt?new Date(m.finishedAt).toLocaleDateString('es'):'';return `<div class="dev-item"><div><h4>${esc(dev.title)}</h4><small>${m.status==='finished'?'Terminado'+(date?' · '+esc(date):''):'En curso'} · ${dev.completed?.length||0} de ${dev.entries.length} días</small></div><div><button class="outline" data-dev="${esc(dev.id)}">${m.status==='finished'?'Releer':'Continuar'} →</button>${m.status==='finished'?`<button class="quiet" data-dev-restart="${esc(dev.id)}">Reiniciar recorrido</button>`:''}</div></div>`;};
 const underway=state.devotionals.filter(d=>DevotionalCore.metadata(d).status!=='finished'),finished=state.devotionals.filter(d=>DevotionalCore.metadata(d).status==='finished');
 $('#dev-list').innerHTML=state.devotionals.length?`<h3>En curso</h3>${underway.length?underway.map(card).join(''):'<p class="muted">Todos tus recorridos están terminados.</p>'}${finished.length?'<h3>Terminados</h3>'+finished.map(card).join(''):''}`:'<p class="empty">Tu biblioteca de devocionales comienza aquí.<br>Trae una lectura que amas o prepara una nueva.</p>';
}
function renderDev() { if(activeDev)openJourney('dev',activeDev,activeDay); }
function renderPlans() {
  const titles={nt:'Nuevo Testamento',all:'Toda la Biblia',salmos:'Salmos'};
  $('#plan-list').innerHTML=state.plans.length?state.plans.map(plan=>{
    const filter=planFilters.get(plan.id)||'all';
    const available=plan.entries.map((_day,i)=>i).filter(i=>filter==='all'||(filter==='done'?plan.completed.includes(i):!plan.completed.includes(i)));
    const pages=Math.max(1,Math.ceil(available.length/PLAN_PAGE)),page=Math.min(planPages.get(plan.id)||0,pages-1);planPages.set(plan.id,page);
    return `<section class="card" data-plan-card="${plan.id}"><div class="section-heading"><h3>${esc(plan.title||titles[plan.scope])}</h3><button class="outline" data-export-plan="${plan.id}">↓ Exportar plan</button></div><p class="muted plan-progress">${plan.completed.length} de ${plan.days} días completados · ${Math.round(plan.completed.length/plan.days*100)}%</p>${plan.sourceName?`<p class="fine-print">Importado de ${esc(plan.sourceName)}</p>`:''}${plan.description?`<details class="plan-context"><summary>Indicaciones del documento</summary><p class="source-description muted">${esc(plan.description)}</p></details>`:''}<div class="progress-track"><progress value="${plan.completed.length}" max="${plan.days}" aria-label="Progreso del plan"></progress></div><div class="plan-list-toolbar"><select data-plan-filter="${plan.id}" aria-label="Filtrar días"><option value="all" ${filter==='all'?'selected':''}>Todos los días</option><option value="todo" ${filter==='todo'?'selected':''}>Por leer</option><option value="done" ${filter==='done'?'selected':''}>Completados</option></select><button class="quiet" data-plan-resume="${plan.id}">Continuar donde voy →</button></div><div class="plan-days">${available.slice(page*PLAN_PAGE,(page+1)*PLAN_PAGE).map(i=>{
      const day=dayOf(plan,i),done=plan.completed.includes(i);
      return `<div class="day-card ${done?'completed':''}"><small class="day-number">DÍA ${i+1}</small><h4>${esc(day.title)}</h4><button class="outline" data-plan-journey="${plan.id}" data-day="${i}">Leer este día →</button>${day.readings.map((p,j)=>`<button class="quiet" data-plan-read="${plan.id}" data-day="${i}" data-reading="${j}">${esc(planCore.formatRef(p,books))} ↗</button>`).join('')}${day.warnings?.length?'<small class="review-warning">Revisar lectura</small>':''}${day.sourceText?`<details class="day-source"><summary>Texto de mi plan</summary><p>${esc(day.sourceText)}</p></details>`:''}<label><input type="checkbox" data-plan="${plan.id}" data-day="${i}" ${done?'checked':''}> ${done?'Completado':'Marcar como leído'}</label></div>`;
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
  if(/\.(docx|pdf)$/i.test(file.name)){
    const source=await window.PlanDocuments.read(file);plan=planCore.parseRecords(source.records,file.name,books);notices=source.warnings;
  }else{
    if(file.size>2000000)throw new Error('El archivo de texto supera los 2 MB.');
    if(!/\.(txt|md|csv|json)$/i.test(file.name))throw new Error('Puedes cargar PDF, Word DOCX, TXT, MD, CSV o JSON.');
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
      const day=pendingPlan.plan.entries[Number(event.target.dataset.reviewSource)],parsed=planCore.parseReferences(event.target.value,books);day.sourceText=event.target.value;if(day.blocks)day.blocks=contentCore.fromText(event.target.value);day.readings=parsed.refs;day.warnings=parsed.warnings.concat(parsed.refs.length?[]:['Sin pasajes reconocidos.']);
      const row=event.target.closest('.review-day');row.querySelector('.detected-passages').innerHTML=parsed.refs.map(ref=>`<span>${esc(planCore.formatRef(ref,books))}</span>`).join('');let warning=row.querySelector('.review-warning');if(!warning){warning=document.createElement('p');warning.className='review-warning';row.appendChild(warning);}warning.textContent=day.warnings.join(' ');
    }reviewSummary();
  });
  $('#save-import-plan').addEventListener('click',async()=>{
    if(!pendingPlan||$('#save-import-plan').disabled)return;
    $('#save-import-plan').disabled=true;let priorState=null;
    try{
      if(state.plans.length>=100&&$('#plan-import-target').value==='new')throw new Error('La biblioteca admite hasta 100 planes.');
      const plan=selectedImport(),old=state,existing=state.plans.find(p=>p.id===plan.id);
      priorState=old;
      state={...state,plans:existing?state.plans.map(p=>p.id===plan.id?plan:p):[plan,...state.plans]};
      if(!save()){state=old;return;}
      await saveQueue;if(saveFailed)throw new Error('No se pudo guardar el plan. Conserva la revisión y vuelve a intentarlo.');
      pendingPlan=null;$('#plan-review').hidden=true;$('#plan-import-status').textContent='Plan guardado. Puedes continuar tu lectura y marcar cada día.';planPages.set(plan.id,0);renderPlans();toast(existing?'Plan actualizado conservando el avance.':'Tu plan personal está listo.');
    }catch(error){if(priorState)state=priorState;toast(error.message);}finally{if(pendingPlan)reviewSummary();}
  });
  $('#plan-list').addEventListener('click',event=>{
    const journey=event.target.closest('[data-plan-journey]');if(journey){openJourney('plan',journey.dataset.planJourney,Number(journey.dataset.day));return;}
    const read=event.target.closest('[data-plan-read]');if(read){readPlanDay(read.dataset.planRead,Number(read.dataset.day),Number(read.dataset.reading));return;}
    const page=event.target.closest('[data-plan-page]');if(page){planPages.set(page.dataset.planPage,(planPages.get(page.dataset.planPage)||0)+Number(page.dataset.direction));renderPlans();return;}
    const resume=event.target.closest('[data-plan-resume]');if(resume){const plan=state.plans.find(p=>p.id===resume.dataset.planResume),i=plan.entries.findIndex((_day,index)=>!plan.completed.includes(index)&&dayOf(plan,index).readings.length);if(i<0){toast('Todas las lecturas reconocidas están completadas.');return;}openJourney('plan',plan.id,i);return;}
    const exportButton=event.target.closest('[data-export-plan]');if(exportButton){const plan=state.plans.find(p=>p.id===exportButton.dataset.exportPlan),custom=plan.scope==='custom'?plan:planCore.validateCustomPlan({id:plan.id,dayIds:plan.dayIds,title:{all:'Toda la Biblia',nt:'Nuevo Testamento',salmos:'Salmos'}[plan.scope],entries:plan.entries.map((_e,i)=>({...dayOf(plan,i),sourceText:dayOf(plan,i).readings.map(ref=>planCore.formatRef(ref,books)).join('; ')})),completed:plan.completed},books);downloadJson(custom,(custom.title.replace(/[<>:"/\\|?*]/g,'-')||'mi-plan')+'.json');}
  });
  $('#plan-list').addEventListener('change',event=>{if(event.target.matches('[data-plan-filter]')){planFilters.set(event.target.dataset.planFilter,event.target.value);planPages.set(event.target.dataset.planFilter,0);renderPlans();}});
  $('#back-to-plan').addEventListener('click',()=>{if(activePlanDay){planPages.set(activePlanDay.id,Math.floor(activePlanDay.dayIndex/PLAN_PAGE));planFilters.set(activePlanDay.id,'all');}if(activeJourney?.kind==='plan'){showView('journey');renderJourney();}else showView('plan');});
  $('#complete-plan-day').addEventListener('click',()=>{if(!activePlanDay)return;const plan=state.plans.find(p=>p.id===activePlanDay.id);if(!plan)return;if(!plan.completed.includes(activePlanDay.dayIndex))plan.completed.push(activePlanDay.dayIndex);save();$('#complete-plan-day').textContent='Día completado ✓';toast('Día marcado como completado.');});
}
async function search() {
  if(desktop?.search){const generation=++searchGeneration,query=$('#search-input').value.trim();if(query.length<2){$('#search-count').textContent='Escribe al menos dos letras.';$('#search-results').innerHTML='';return;}$('#search-count').textContent='Buscando en tu biblioteca… La primera búsqueda prepara el índice.';try{const result=await desktop.search({module:selectedVersion,query,mode:$('#search-mode').value});if(generation!==searchGeneration)return;$('#search-count').textContent=`${result.count} coincidencias${result.count>100?' · primeras 100':''}.`;$('#search-results').innerHTML=result.results.map(p=>`<button class="search-result" data-search-book="${p.book}" data-search-chapter="${p.chapter}" data-search-verse="${p.verse}" data-revision="${esc(result.revision)}" data-module="${esc(result.module)}"><b>${esc(reference(p))}${p.endVerse>p.verse?'–'+p.endVerse:''}</b>${esc(p.text)}</button>`).join('');}catch(error){if(generation===searchGeneration)$('#search-count').textContent=error.message;}return;}
  const query=core.clean($('#search-input').value.trim()), results=[];
  $('#search-results').innerHTML='';
  if(query.length<2) { $('#search-count').textContent='Escribe al menos dos letras.'; return; }
  let count=0;
  books.forEach((book,b)=>book.chapters.forEach((chapter,c)=>chapter.forEach((text,v)=>{
    if(core.clean(text).includes(query)) { count++; if(results.length<100) results.push({book:b,chapter:c+1,verse:v+1,text}); }
  })));
  $('#search-count').textContent=`${count} coincidencias${count>100?' · mostrando las primeras 100':''}.`;
  $('#search-results').innerHTML=results.map(p=>`<button class="search-result" data-search-book="${p.book}" data-search-chapter="${p.chapter}" data-search-verse="${p.verse}"><b>${esc(reference(p))}${p.endVerse>p.verse?'–'+p.endVerse:''}</b>${esc(p.text)}</button>`).join('');
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
    const original=event.target.closest('[data-original]');
    if(original){
      // Edward (11-oct): con la RV1960 la palabra tocada abre su original, pero también queda elegida para el
      // diccionario: Vine/RAE buscan la palabra en español y «Strong español» su número.
      const texto=(original.textContent||'').trim(),codigos=String(original.dataset.original||'').split(' ').filter(c=>/^[HG]\d{1,5}$/.test(c));
      const misma=palabraElegida&&palabraElegida.verse===Number(verse.dataset.verse)&&palabraElegida.text===texto&&original.classList.contains('palabra-elegida');
      if(misma){palabraElegida=null;marcarPalabraElegida();return;}
      palabraElegida={book:state.position.book,chapter:state.position.chapter,verse:Number(verse.dataset.verse),text:texto,codigo:codigos[0]||'',original:true};
      marcarPalabraElegida(original);prepararDiccionario();
      openOriginal(original.dataset.original,original.dataset.originalText);return;
    }
    const tocada=strong||word;
    if(tocada){
      // Edward (11-oct): la palabra queda elegida hasta que él la quite (tocándola otra vez); así puede pasar
      // por Comentario y por varios diccionarios sin volver a buscarla.
      const misma=palabraElegida&&palabraElegida.verse===Number(verse.dataset.verse)&&palabraElegida.text===(strong?strong.dataset.strong:word.dataset.word)&&tocada.classList.contains('palabra-elegida');
      if(misma){palabraElegida=null;marcarPalabraElegida();return;}
      palabraElegida={book:state.position.book,chapter:state.position.chapter,verse:Number(verse.dataset.verse),text:strong?strong.dataset.strong:word.dataset.word,strong:!!strong};
      marcarPalabraElegida(tocada);
    }
    if(strong)queryFromReading(strong.dataset.strong,true);else if(word)queryFromReading(word.dataset.word);
  });
  $('#note').addEventListener('input',()=>{if(state.privateLocked)return; if($('#note').value) state.notes[key()]=$('#note').value; else delete state.notes[key()]; save(); });
  document.querySelectorAll('[data-ink]').forEach(button=>button.addEventListener('click',()=>{
    if(button.dataset.ink==='none')delete state.highlights[key()];else state.highlights[key()]=button.dataset.ink;
    renderReader();save();
  }));
  $('#previous').addEventListener('click',()=>changeChapter(-1)); $('#next').addEventListener('click',()=>changeChapter(1));
  $('#larger').addEventListener('click',()=>{state.font=Math.min(28,state.font+1);settings();save();});
  $('#smaller').addEventListener('click',()=>{state.font=Math.max(16,state.font-1);settings();save();});
  $('#night').addEventListener('click',()=>{state.appearance.theme=document.documentElement.dataset.theme==='noche'?'marfil':'noche';settings();save();});
  $('#focus').addEventListener('click',()=>{graphicsExpanded=false;showView('read');document.body.classList.toggle('focus');updateReadingMode();});
  $('#cover').addEventListener('click',()=>$('#books-dialog').showModal()); $('#books-close').addEventListener('click',()=>$('#books-dialog').close());
  $('#books-grid').addEventListener('click',event=>{const button=event.target.closest('[data-book]');if(button){$('#books-dialog').close();go(Number(button.dataset.book),1);}});
  $('#search-open').addEventListener('click',()=>{$('#search-dialog').showModal();$('#search-input').focus();});
  $('#search-close').addEventListener('click',()=>$('#search-dialog').close());
  $('#search-input').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(search,220);});
  $('#search-results').addEventListener('click',event=>{const button=event.target.closest('[data-search-book]');if(button){const module=catalogData?.modules.find(m=>m.id===button.dataset.module);if(button.dataset.module&&(!module||module.sha256!==button.dataset.revision)){toast('Fuente no disponible: esta cita corresponde a otra revisión.');return;}if(module?.rol==='version'){selectedVersion=module.id;state.selectedVersion=selectedVersion;$('#version-select').value=selectedVersion;}else if(button.dataset.module==='rv1960-strong'&&catalogData.modules.some(m=>m.id==='rv1960')){selectedVersion='rv1960';state.selectedVersion=selectedVersion;$('#version-select').value=selectedVersion;}$('#search-dialog').close();go(Number(button.dataset.searchBook),Number(button.dataset.searchChapter),Number(button.dataset.searchVerse));}});
  $('#dev-form').addEventListener('submit',event=>{
    event.preventDefault();const data=new FormData(event.target);
    try { const dev=core.createDevotional({topic:data.get('topic'),minutes:Number(data.get('minutes')),days:Number(data.get('days')),purpose:data.get('purpose')},books);state.devotionals.unshift(dev);save();renderDevList();activeDev=dev.id;activeDay=0;renderDev();toast('Tu guía de devoción está preparada.'); }
    catch(error){toast(error.message);}
  });
  $('#dev-list').addEventListener('click',event=>{const restart=event.target.closest('[data-dev-restart]');if(restart){const dev=state.devotionals.find(d=>d.id===restart.dataset.devRestart);if(dev&&window.confirm('¿Reiniciar las marcas de lectura? Tus reflexiones se conservan.')){dev.completed=[];dev.lastIndex=0;dev.pages={};DevotionalCore.progress(dev);save();renderDevList();}return;}const button=event.target.closest('[data-dev]');if(button)openJourney('dev',button.dataset.dev);});
  document.addEventListener('click',event=>{const button=event.target.closest('[data-read-book]');if(button){go(Number(button.dataset.readBook),Number(button.dataset.readChapter));window.scrollTo({top:0});}});
  $('#import-dev').addEventListener('click',()=>$('#dev-file').click());
  $('#dev-file').addEventListener('change',async event=>{
    const file=event.target.files[0];if(!file)return;
    try { $('#import-dev').disabled=true;await importDevFile(file);toast('Devocional guardado en tu biblioteca.'); }
    catch(error){toast(error instanceof SyntaxError?'El JSON no tiene un formato válido.':error.message);}
    finally{event.target.value='';$('#import-dev').disabled=false;}
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
  $('#backup').addEventListener('click',async()=>{
    await saveQueue;if(saveFailed){toast('Guarda los cambios antes de hacer la copia.');return;}let exported;try{exported=desktop?.exportBackup?await desktop.exportBackup():state;}catch(e){toast(e.message);return;}
    const date=new Date();const stamp=[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-'),nombre=`mi-biblioteca-${stamp}.json`,texto=JSON.stringify(exported,null,2);
    // En el teléfono el «descargar» del navegador no hace nada: la plataforma guarda el archivo y abre «Compartir».
    if(window.BibliaPlataforma?.guardarArchivo){try{const r=await window.BibliaPlataforma.guardarArchivo({nombre,texto,titulo:'Mi biblioteca · copia de seguridad'});toast(r.compartido?'Copia guardada: notas, subrayados, devocionales y planes.':'No elegiste dónde guardarla. Vuelve a tocar «Guardar copia».');}catch(e){toast('No se pudo guardar la copia: '+e.message);}return;}
    const blob=new Blob([texto],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;
    a.download=nombre;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);toast('Copia preparada: notas, subrayados, devocionales y planes.');
  });
  $('#restore').addEventListener('click',()=>$('#restore-file').click());
  $('#restore-file').addEventListener('change',async event=>{
    const file=event.target.files[0];if(!file)return;
    try {await restoreLibrary(file);}catch(error){toast(error instanceof SyntaxError?'La copia no es un archivo JSON válido.':error.message);}finally{event.target.value='';}
  });
}
async function start() {
  if(!books || books.length!==66){toast('Falta el texto bíblico. Ejecuta la preparación de la Biblia indicada en el proyecto.');return;}
  try {const saved=localStorage.getItem(STORE);let legacyValid=true;if(saved){try{state=validateState(JSON.parse(saved));}catch(error){legacyValid=false;if(!desktop?.bootstrap)throw error;}}if(desktop?.bootstrap){const migrated=await desktop.bootstrap({legacy:saved,initial:state,legacyValid});state=validateState(migrated.state);storageReady=true;if(migrated.migrated)toast('Tu biblioteca se conservó en SQLite. Hay una copia anterior para recuperación.');await loadCatalog();}}catch(error){storageReady=false;toast('No se reemplazará la copia anterior: '+error.message);}
  $('#book').innerHTML=books.map((book,i)=>`<option value="${i}">${esc(book.name)}</option>`).join('');
  $('#books-grid').innerHTML=books.map((book,i)=>`<button data-book="${i}">${esc(book.name)}</button>`).join('');
  $('#note').maxLength=100000;
  settings();renderReader();renderDevList();renderPlans();bind();bindPlanImport();
  bindLibrary();bindAppearance();bindJourneys();bindAi();bindPrayer();bindPrivacy();bindGuides();bindMusic();bindStudy();bindGraphics();bindCircle();bindModuleImport();window.HoyApp?.enlazar();window.HoyApp?.programarAvisos();uiReady=true;if(state.lastJourney)openJourney('dev',state.lastJourney.id);
}
async function loadCatalog(){catalogData=await desktop.catalog();const versions=catalogData.modules.filter(m=>m.tipo==='biblia'&&m.rol==='version');selectedVersion=versions.some(m=>m.id===state.selectedVersion)?state.selectedVersion:versions.some(m=>m.id==='rv1960')?'rv1960':'rv1909';$('#version-select').innerHTML=versions.map(m=>`<option value="${esc(m.id)}">${esc(m.abreviatura||m.titulo)}</option>`).join('');$('#version-select').value=selectedVersion;const comments=catalogData.modules.filter(m=>m.rol==='comentario');$('#comment-select').innerHTML='<option value="">Elegir comentario</option>'+comments.map(m=>`<option value="${esc(m.id)}">${esc(m.titulo)}</option>`).join('');const options=[['strong-es','Strong español'],['vine','Vine · AT y NT'],['drae','RAE · Diccionario español']].filter(([id])=>id==='vine'?catalogData.modules.some(m=>m.id==='vine-at'||m.id==='vine-nt'):id==='drae'?catalogData.modules.some(m=>/^drae-[123]$/.test(m.id)):catalogData.modules.some(m=>m.id===id));for(const m of catalogData.modules.filter(m=>m.tipo==='diccionario'&&!['strong-es','vine-at','vine-nt','drae-1','drae-2','drae-3'].includes(m.id)))options.push([m.id,m.titulo]);$('#dictionary-select').innerHTML=options.map(([id,title])=>`<option value="${id}">${title}</option>`).join('');$('#show-strong').disabled=!(selectedVersion==='rv1960'&&catalogData.modules.some(m=>m.id==='rv1960-strong')||catalogData.modules.some(m=>m.id===selectedVersion&&m.strong));if($('#show-strong').disabled)$('#show-strong').checked=false;$('#comment-select').disabled=!comments.length;if(comments.length)$('#comment-select').value=(['diario-vivir','mundo-hispano'].find(id=>comments.some(m=>m.id===id))||comments[0].id);for(const id of ['dictionary-select','dictionary-query','dictionary-submit'])$('#'+id).disabled=!options.length;renderSources();}
function renderSources(){if(!catalogData)return;$('#sources-list').innerHTML=catalogData.modules.map(m=>`<section class="source-card"><h4>${esc(m.titulo)}</h4><p>${esc(m.origen)} · ${esc(m.rol)}</p><p>${esc(m.licencia)}</p><p class="fine-print">${esc(m.versificacion)} · Revisión ${esc(m.sha256.slice(0,16))}</p>${m.sourceNotice?`<details><summary>Aviso incluido en la fuente</summary><p class="source-notice">${esc(m.sourceNotice)}</p></details>`:''}</section>`).join('');$('#sources-warning').textContent=catalogData.warnings.join('\n');renderStudySources();}
async function renderComment(){
  if(graphicsMode!=='comment'){studyGeneration++;return renderGraphics();}
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
    content.querySelectorAll('.comment-entry>div,.comment-introduction>div').forEach(trimModuleOpening);
    content.scrollTop=0;paneScrollPositions.set('comentario',0);
  }catch(error){if(generation===studyGeneration)content.textContent=error.message;}
  finally{if(generation===studyGeneration)content.setAttribute('aria-busy','false');}
}
function showDictionaryEntry(index){
  const entry=dictionaryEntries[index];if(!entry)return;
  $('#dictionary-content').innerHTML=`<ul class="dictionary-results" aria-label="Resultados de diccionario">${dictionaryEntries.map((e,i)=>`<li><button class="dictionary-result" data-dictionary-entry="${i}" aria-pressed="${i===index}">${esc(e.title)}</button></li>`).join('')}</ul><article class="dictionary-entry"><h4>${esc(entry.title)}</h4><p class="source-caption">${esc(catalogData?.modules.find(m=>m.id===entry.module)?.titulo||entry.module)}</p><div>${entry.html}</div></article>`;
  trimModuleOpening($('#dictionary-content .dictionary-entry>div'));
  $('#dictionary-content').scrollTop=0;paneScrollPositions.set('diccionario',0);
}
async function consultDictionary(){
  closeOriginal();dictionaryPendiente=false;
  const generation=++dictionaryGeneration,content=$('#dictionary-content');syncDictionaryRef();content.setAttribute('aria-busy','true');content.textContent='Buscando…';
  try{const result=await desktop.dictionary({group:$('#dictionary-select').value,query:$('#dictionary-query').value});if(generation!==dictionaryGeneration)return;dictionaryEntries=result.entries;if(dictionaryEntries.length)showDictionaryEntry(0);else{const q=$('#dictionary-query').value.trim(),opcion=$('#dictionary-select').selectedOptions[0];content.innerHTML='<p class="empty-slot"></p>';content.firstChild.textContent=q?`«${q}» no aparece en ${opcion?opcion.textContent.trim():'este diccionario'}. Elige otro diccionario arriba: la palabra sigue elegida.`:'No hay entradas para esta consulta. Prueba otra palabra.';}$('#dictionary-status').textContent=`${dictionaryEntries.length} resultados${$('#dictionary-select').value==='drae'?' · palabra exacta primero, después prefijos':''}.`;}
  catch(error){if(generation===dictionaryGeneration){content.textContent=error.message;$('#dictionary-status').textContent='No se pudo consultar esta fuente.';}}
  finally{if(generation===dictionaryGeneration)content.setAttribute('aria-busy','false');}
}
// Presentation hooks shared by all three CSS designs; module text is never rewritten on disk.
function trimModuleOpening(container){
  // Trim blank presentation padding only; keep paragraphs, headings and the module's text.
  while(container?.firstChild){
    const first=container.firstChild;
    if(first.nodeType===Node.TEXT_NODE){first.textContent=first.textContent.trimStart();if(!first.textContent){first.remove();continue;}break;}
    if(first.nodeName==='BR'||first.nodeName==='SPAN'&&!first.textContent.trim()){first.remove();continue;}
    if(first.nodeName==='SPAN')trimModuleOpening(first);
    break;
  }
}
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
  marcarPalabraElegida();
}
// Palabra elegida en la Biblia: una sola, marcada en el texto, y se vuelve a marcar si el capítulo se redibuja.
let palabraElegida=null,dictionaryPendiente=false;
// Lo que el diccionario elegido debe buscar de la palabra: su número Strong en «Strong español», la palabra en los demás.
function consultaDePalabra(){const p=palabraElegida;if(!p)return '';return $('#dictionary-select').value==='strong-es'&&p.codigo?p.codigo:p.text;}
function prepararDiccionario(){const q=consultaDePalabra();if(!q)return;$('#dictionary-query').value=q;syncDictionaryRef();dictionaryPendiente=true;}
// Al mostrar el diccionario (pestaña del teléfono o panel), busca lo pendiente.
function consultarPendiente(){if(dictionaryPendiente&&$('#dictionary-query').value.trim())consultDictionary();}
function marcarPalabraElegida(span){
  $('#verses')?.querySelectorAll('.palabra-elegida').forEach(el=>el.classList.remove('palabra-elegida'));
  const p=palabraElegida;if(!p)return;
  if(p.book!==state.position.book||p.chapter!==state.position.chapter)return;
  const objetivo=span||[...($('#verses')?.querySelectorAll(`[data-verse="${p.verse}"] [data-${p.original?'original':p.strong?'strong':'word'}]`)||[])].find(el=>(p.original?(el.textContent||'').trim():p.strong?el.dataset.strong:el.dataset.word)===p.text);
  objetivo?.classList.add('palabra-elegida');
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
function effectivePanes(){return document.body.classList.contains('focus')||comparisonExpanded?['biblia']:graphicsExpanded?['biblia','comentario']:state.appearance.views.visible;}
function effectivePaneLayout(){return graphicsExpanded?'columns':typeof aiPaneOpen!=='undefined'&&aiPaneOpen&&$('#panes').clientWidth<730?'rows':state.appearance.views.layout;}
function updateReadingMode(){
  state.appearance.views=paneCore.normalize(state.appearance.views,state.appearance.panes);
  const views={...state.appearance.views,layout:effectivePaneLayout()},visible=effectivePanes(),solo=visible.length===1,container=$('#panes');
  const geometry=[state.appearance.design,views.layout,visible.join(',')].join('|'),changed=container.dataset.geometry!==geometry;
  if(changed){for(const pane of container.querySelectorAll('.pane:not([hidden])'))paneScrollPositions.set(pane.dataset.pane,pane.querySelector('.pane-body:not([hidden])').scrollTop);container.dataset.geometry=geometry;suppressReaderSyncUntil=Date.now()+500;}
  container.dataset.active=String(!solo);container.dataset.layout=views.layout;container.dataset.visible=visible.join(',');
  document.body.classList.toggle('reading-only',solo);
  for(const panel of container.querySelectorAll('.pane'))panel.hidden=!visible.includes(panel.dataset.pane);
  for(const button of document.querySelectorAll('[data-toggle-pane]'))button.setAttribute('aria-pressed',String(visible.includes(button.dataset.togglePane)));
  for(const button of document.querySelectorAll('[data-set-layout]'))button.setAttribute('aria-pressed',String(views.layout===button.dataset.setLayout));
  $('#study-open').textContent=solo?'Abrir estudio':'Solo lectura';$('#study-open').setAttribute('aria-pressed',String(!solo));
  $('#focus').textContent=document.body.classList.contains('focus')?'✦ Volver a mi biblioteca':'✦ Modo intimidad';
  updateComparisonExpansion();
  updateGraphicsExpansion();
  applyPaneSizes();
  const primary=$('#pane-resizer-primary'),secondary=$('#pane-resizer-secondary');
  primary.hidden=solo||graphicsExpanded;secondary.hidden=visible.length!==3;
  primary.dataset.axis=views.layout==='rows'?'y':'x';secondary.dataset.axis='x';
  primary.dataset.between=views.layout==='rows'&&visible.length===3?'biblia,comentario,diccionario':'biblia,'+(visible[1]||'comentario');
  for(const separator of [primary,secondary]){
    separator.setAttribute('aria-orientation',separator.dataset.axis==='y'?'horizontal':'vertical');
    const ids=separator.dataset.between.split(',');separator.setAttribute('aria-controls',ids.map(id=>'pane-'+id).join(' '));
    separator.setAttribute('aria-label',ids.length===3?'Ajustar Biblia y paneles de estudio':'Ajustar '+ids.map(id=>id==='biblia'?'Biblia':id==='comentario'?'Comentario':'Diccionario').join(' y '));
  }
  requestAnimationFrame(()=>{
    if(changed){$('#verses [data-verse="'+state.position.verse+'"]')?.scrollIntoView({block:'nearest'});for(const id of visible.slice(1)){const body=$('#pane-'+id+' .pane-body:not([hidden])');if(body)body.scrollTop=paneScrollPositions.get(id)||0;}}
    checkPaneFit();
  });
}
function applyPaneSizes(){
  const views={...state.appearance.views,layout:effectivePaneLayout()},config=graphicsExpanded?{weights:[38,62]}:paneCore.configuration(views,effectivePanes()),container=$('#panes');
  for(let i=0;i<3;i++)container.style.setProperty('--view-w'+(i+1),(config.weights[i]||1)+'fr');
  for(let i=0;i<2;i++)container.style.setProperty('--view-a'+(i+1),(config.aux?.[i]||50)+'fr');
}
function setPaneVisibility(id,show){
  comparisonExpanded=false;
  graphicsExpanded=false;
  const visible=effectivePanes();document.body.classList.remove('focus');
  state.appearance.views.visible=paneCore.panels.filter(p=>p==='biblia'||(p===id?show:visible.includes(p)));
  updateReadingMode();save();
}
function setPaneLayout(layout){graphicsExpanded=false;state.appearance.views.layout=layout==='rows'?'rows':'columns';updateReadingMode();save();}
function checkPaneFit(){
  if(activeView!=='read')return;
  const container=$('#panes'),cs=getComputedStyle(container),width=container.clientWidth-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight),height=container.clientHeight-parseFloat(cs.paddingTop)-parseFloat(cs.paddingBottom),visible=effectivePanes();
  const split=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--pane-split-size'))||12;
  const tooSmall=visible.length>1&&(container.dataset.layout==='rows'?height<332||width<(visible.length===3?440+split:220):width<visible.length*220+(visible.length-1)*split||height<160);
  const notice=$('#pane-layout-notice');if(notice.hidden===tooSmall)notice.hidden=!tooSmall;
  notice.querySelector('span').textContent='Esta disposición necesita más espacio. Amplía la ventana, cierra un panel o prueba la otra orientación.';
  $('#suggest-layout').textContent=container.dataset.layout==='rows'?'⫴ Probar lado a lado':'☰ Probar arriba y abajo';
}
function bindReaderSync(){
  const body=$('#verses');let intentUntil=0,timer;
  for(const name of ['wheel','pointerdown','keydown'])body.addEventListener(name,()=>{intentUntil=Date.now()+2500;},{passive:true});
  body.addEventListener('scroll',()=>{clearTimeout(timer);if(Date.now()>intentUntil)return;timer=setTimeout(()=>{
    if(activeView!=='read'||!storageReady||document.activeElement===$('#note')||Date.now()<suppressReaderSyncUntil)return;
    const top=body.getBoundingClientRect().top+12;
    const verse=[...body.children].find(el=>el.getBoundingClientRect().bottom>top);
    if(!verse||Number(verse.dataset.verse)===state.position.verse)return;
    studySelection='verse';state.position.verse=Number(verse.dataset.verse);
    for(const el of body.children){el.classList.toggle('selected',el===verse);el.setAttribute('aria-pressed',String(el===verse));}
    renderNote();save();
  },250);},{passive:true});
}
function paneResizeSpec(separator){
  if(graphicsExpanded)return null;
  const views=state.appearance.views,visible=effectivePanes(),isSecondary=separator.id==='pane-resizer-secondary';
  if(visible.length===1||isSecondary&&visible.length!==3)return null;
  const rows=views.layout==='rows',a=isSecondary?'comentario':'biblia',b=isSecondary?'diccionario':visible[1];
  return {a:$('#pane-'+a),b:$('#pane-'+b),axis:rows&&!isSecondary?'y':'x',field:rows&&isSecondary?'aux':'weights',first:isSecondary&&!rows?1:0,second:isSecondary&&!rows?2:1,key:paneCore.key(views.layout,visible)};
}
function bindPaneResizers(){
  for(const separator of document.querySelectorAll('.pane-resizer')){
    let drag=null;
    const measure=spec=>{const size=spec.axis==='x'?'width':'height',a=spec.a.getBoundingClientRect()[size],b=spec.b.getBoundingClientRect()[size];return {first:a,span:a+b,ratio:100*a/(a+b)};};
    const updateAria=()=>{const spec=paneResizeSpec(separator);if(!spec)return;const m=measure(spec),minimum=Math.min(50,100*(spec.axis==='x'?220:160)/m.span);separator.setAttribute('aria-valuenow',Math.round(m.ratio));separator.setAttribute('aria-valuemin',Math.ceil(minimum));separator.setAttribute('aria-valuemax',Math.floor(100-minimum));};
    const apply=(spec,config)=>{state.appearance.views.sizes[spec.key]=config;applyPaneSizes();updateAria();};
    const resize=(spec,config,ratio,span)=>apply(spec,paneCore.resize(config,spec.field,spec.first,spec.second,ratio,span,spec.axis==='x'?220:160));
    separator.addEventListener('pointerdown',event=>{
      const spec=paneResizeSpec(separator);if(event.button!==0||!spec)return;event.preventDefault();
      const m=measure(spec);drag={spec,pointer:event.pointerId,start:spec.axis==='x'?event.clientX:event.clientY,pixels:m.first,span:m.span,config:structuredClone(paneCore.configuration(state.appearance.views))};
      separator.setPointerCapture(event.pointerId);document.body.classList.add('resizing');document.body.dataset.resizeAxis=spec.axis;
    });
    const finish=cancel=>{if(!drag)return;if(cancel)apply(drag.spec,drag.config);drag=null;document.body.classList.remove('resizing');if(!cancel)save();};
    separator.addEventListener('pointermove',event=>{if(!drag||event.pointerId!==drag.pointer)return;if(paneResizeSpec(separator)?.key!==drag.spec.key){finish(true);return;}const delta=(drag.spec.axis==='x'?event.clientX:event.clientY)-drag.start;resize(drag.spec,drag.config,100*(drag.pixels+delta)/drag.span,drag.span);});
    separator.addEventListener('pointerup',()=>finish(false));separator.addEventListener('pointercancel',()=>finish(true));separator.addEventListener('lostpointercapture',()=>finish(false));
    separator.addEventListener('keydown',event=>{
      if(event.key==='Escape'&&drag){finish(true);return;}
      const spec=paneResizeSpec(separator),keys=spec?.axis==='y'?['ArrowUp','ArrowDown','Home','End']:['ArrowLeft','ArrowRight','Home','End'];
      if(!spec||!keys.includes(event.key))return;
      event.preventDefault();const m=measure(spec),ratio=event.key==='Home'?0:event.key==='End'?100:m.ratio+(['ArrowRight','ArrowDown'].includes(event.key)?5:-5);
      resize(spec,paneCore.configuration(state.appearance.views),ratio,m.span);save();
    });
    separator.addEventListener('dblclick',()=>{const spec=paneResizeSpec(separator);if(spec){apply(spec,paneCore.defaults(state.appearance.views.layout,effectivePanes()));save();}});
    new ResizeObserver(updateAria).observe(separator);
  }
  let frame;const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(checkPaneFit);};
  new ResizeObserver(schedule).observe($('#panes'));$('#design-css').addEventListener('load',schedule);
}
function bindAppearance(){
  $('#design-select').addEventListener('change',()=>{state.appearance.design=$('#design-select').value;settings();save();});
  $('#theme-select').addEventListener('change',()=>{state.appearance.theme=$('#theme-select').value;settings();save();});
  setInterval(()=>{if(state.appearance.theme==='auto')settings();},60000);
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change',()=>{if(state.appearance.theme==='sistema')settings();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.appearance.theme==='auto')settings();});
  const scrollAreas=()=>[document.scrollingElement,$('#main-content'),$('#verses')];
  const updateTop=()=>{const visible=window.scrollY>600||scrollAreas().some(el=>el&&el.scrollTop>600);const button=$('#back-to-top');button.classList.toggle('is-visible',visible);button.setAttribute('aria-hidden',String(!visible));button.tabIndex=visible?0:-1;};
  document.addEventListener('scroll',updateTop,true);window.addEventListener('resize',updateTop);updateTop();
  $('#back-to-top').addEventListener('click',()=>{const behavior=matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth';window.scrollTo({top:0,behavior});for(const el of scrollAreas())el?.scrollTo({top:0,behavior});$('#book').focus({preventScroll:true});});
  $('#study-open').addEventListener('click',()=>{if(comparisonExpanded||graphicsExpanded){comparisonExpanded=false;graphicsExpanded=false;updateReadingMode();return;}const solo=effectivePanes().length===1;document.body.classList.remove('focus');state.appearance.views.visible=solo?[...paneCore.panels]:['biblia'];updateReadingMode();save();});
  document.querySelectorAll('[data-toggle-pane]').forEach(button=>button.addEventListener('click',()=>setPaneVisibility(button.dataset.togglePane,!effectivePanes().includes(button.dataset.togglePane))));
  document.querySelectorAll('[data-hide-pane]').forEach(button=>button.addEventListener('click',()=>{setPaneVisibility(button.dataset.hidePane,false);$('#pane-'+(button.dataset.hidePane==='comentario'?'comment':'dictionary')+'-toggle').focus({preventScroll:true});}));
  document.querySelectorAll('[data-set-layout]').forEach(button=>button.addEventListener('click',()=>setPaneLayout(button.dataset.setLayout)));
  $('#suggest-layout').addEventListener('click',()=>setPaneLayout(state.appearance.views.layout==='rows'?'columns':'rows'));
  $('#dictionary-from-selection').addEventListener('click',()=>{const word=window.getSelection()?.toString().trim();if(!word||word.length>100){toast('Selecciona una palabra de la Biblia y pulsa Consultar selección.');return;}queryFromReading(word,/^[HG]\d{1,5}$/i.test(word));});
  bindPaneResizers();bindReaderSync();
  document.querySelectorAll('[data-action]').forEach(button=>button.addEventListener('click',()=>{const menu=button.closest('details');if(menu)menu.open=false;document.getElementById(button.dataset.action)?.click();}));
}

function bindLibrary(){if(!desktop?.catalog){$('#library-controls').hidden=true;return;}$('#version-select').addEventListener('change',()=>{selectedVersion=$('#version-select').value;state.selectedVersion=selectedVersion;$('#show-strong').disabled=!(selectedVersion==='rv1960'&&catalogData.modules.some(m=>m.id==='rv1960-strong')||catalogData.modules.some(m=>m.id===selectedVersion&&m.strong));if($('#show-strong').disabled)$('#show-strong').checked=false;stopVoice();renderReader();save();});$('#show-strong').addEventListener('change',renderReader);$('#comment-select').addEventListener('change',renderComment);$('#dictionary-form').addEventListener('submit',event=>{event.preventDefault();consultDictionary();});$('#dictionary-select').addEventListener('change',()=>{dictionaryGeneration++;dictionaryEntries=[];$('#dictionary-content').setAttribute('aria-busy','false');$('#dictionary-content').innerHTML='<p class="empty-slot">Consulta una palabra en esta fuente.</p>';if(palabraElegida){$('#dictionary-query').value=consultaDePalabra();syncDictionaryRef();}if($('#dictionary-query').value.trim())consultDictionary();$('#dictionary-query').placeholder=$('#dictionary-select').value==='drae'?'Palabra en español…':'Padre, G25, H7225…';$('#panes').dataset.sourcesReady=String(Boolean($('#comment-select').value&&$('#dictionary-select').value));});$('#dictionary-content').addEventListener('click',event=>{const button=event.target.closest('[data-dictionary-entry]');if(button){const index=Number(button.dataset.dictionaryEntry);showDictionaryEntry(index);$('#dictionary-content').querySelector(`[data-dictionary-entry="${index}"]`)?.focus({preventScroll:true});}});$('#sources-open').addEventListener('click',()=>$('#sources-dialog').showModal());$('#sources-close').addEventListener('click',()=>$('#sources-dialog').close());$('#sources-refresh').addEventListener('click',async()=>{try{await loadCatalog();await renderReader();toast('Fuentes y revisiones comprobadas.');}catch(error){toast(error.message);}});$('#search-mode').addEventListener('change',search);$('#voice-play').addEventListener('click',playVoice);$('#voice-pause').addEventListener('click',()=>{void toggleVoicePause();});$('#voice-stop').addEventListener('click',stopVoice);void loadVoices();window.addEventListener('beforeunload',event=>{stopVoice();if(saveFailed){if(!window.confirm('Hay cambios sin guardar. Puedes cancelar y exportar una copia. ¿Cerrar y descartarlos?')){event.preventDefault();event.returnValue='';}return;}if(savePending){event.preventDefault();event.returnValue='';saveQueue.then(()=>{if(!saveFailed)window.close();});}});}
function voiceController(){
  if(!readerVoiceController)readerVoiceController=window.LibraryVoiceCore.create({
    bridge:desktop,speech:window.speechSynthesis,Utterance:window.SpeechSynthesisUtterance,
    onStatus:text=>$('#voice-status').textContent=text,
    onVoices:voices=>{const previous=$('#voice-select').value;$('#voice-select').innerHTML=voices.map(v=>`<option value="${esc(v.id)}" data-uri="${esc(v.uri||'')}">${esc(v.name)}</option>`).join('');if(voices.some(v=>v.id===previous))$('#voice-select').value=previous;$('#voice-play').disabled=!voices.length;$('#voice-pause').disabled=!voices.length;}
  });
  return readerVoiceController;
}
async function loadVoices(){try{await voiceController().loadVoices();}catch{$('#voice-play').disabled=true;$('#voice-pause').disabled=true;$('#voice-status').textContent='No se pudieron consultar las voces del dispositivo.';}}
function stopVoice(){clearTimeout(voiceTimer);voiceUntil=0;const nat=window.BibliaPlataforma?.lectura;if(nat&&nativeVoice.active){nativeVoice.active=false;return nat.detener().catch(()=>{});}if(readerVoiceController)return readerVoiceController.stop().catch(()=>{$('#voice-status').textContent='No se pudo detener la voz del dispositivo.';});window.speechSynthesis?.cancel();return Promise.resolve();}
async function toggleVoicePause(){const nat=window.BibliaPlataforma?.lectura;if(nat&&nativeVoice.active){try{await(nativeVoice.paused?nat.reanudar():nat.pausar());}catch{}return;}try{await voiceController().togglePause();}catch{$('#voice-status').textContent='No se pudo pausar la voz del dispositivo.';}}
let voiceUntil=0,voiceTimer=null;
// Teléfono: la lectura la hace un servicio nativo (sigue con la pantalla apagada, controles en la pantalla bloqueada).
// Se le manda el capítulo actual y los siguientes (hasta 12); la app sigue el capítulo que suena.
const nativeVoice={active:false,paused:false,until:'seguir',listening:false};
async function playNativeVoice(nat,until){
  const queue=[];let {book,chapter}=state.position;const count=until==='capitulo'?1:12;
  for(let i=0;i<count;i++){
    const verses=i===0?chapterData.verses:(await desktop.chapter({module:selectedVersion,book,chapter})).verses;
    queue.push({titulo:books[book].name+' '+chapter,libro:book,capitulo:chapter,partes:verses.map(v=>v.text)});
    chapter++;if(chapter>books[book].chapters.length){book++;chapter=1;}if(book>=books.length)break;
  }
  if(!nativeVoice.listening){
    nativeVoice.listening=true;
    nat.al('capitulo',e=>{if(e.item>0&&(state.position.book!==e.libro||state.position.chapter!==e.capitulo))go(e.libro,e.capitulo);});
    nat.al('estado',e=>{nativeVoice.active=!!e.activo;nativeVoice.paused=!!e.pausado;$('#voice-status').textContent=!e.activo?'Lectura terminada.':e.pausado?'Lectura en pausa.':'Leyendo…';});
    nat.al('temporizador',()=>toast('Se apagó la lectura (temporizador).'));
    nat.al('error',e=>toast(e.mensaje||'La voz no pudo leer.'));
    nat.al('terminado',async()=>{nativeVoice.active=false;if(nativeVoice.until!=='seguir')return;const {book,chapter}=state.position;if(book===books.length-1&&chapter===books[book].chapters.length)return;changeChapter(1);for(let i=0;i<60&&!chapterData;i++)await new Promise(r=>setTimeout(r,250));if(chapterData)await playNativeVoice(nat,'seguir');});
  }
  nativeVoice.until=until;nativeVoice.active=true;nativeVoice.paused=false;
  const min=Number(until),voice=$('#voice-select').selectedOptions[0]?.dataset.uri||'';
  await nat.iniciar({cola:queue,voz:voice,velocidad:Number($('#voice-rate')?.value||1),apagarMs:min>0?min*60000:0});
  $('#voice-status').textContent='Leyendo… (sigue con la pantalla apagada)';
}
async function playVoice(event,continuing=false){
  if(!chapterData){toast('Espera a que se cargue el capítulo y elige una voz.');return;}
  const until=$('#voice-until')?.value||'seguir';
  const nat=window.BibliaPlataforma?.lectura;
  if(nat){try{await playNativeVoice(nat,until);}catch(error){toast(error.message||'No se pudo leer en segundo plano.');}return;}
  // Temporizador: se arma al tocar «Escuchar» (no en cada capítulo siguiente) y apaga la voz aunque esté a mitad de capítulo.
  if(!continuing){clearTimeout(voiceTimer);voiceUntil=0;const min=Number(until);if(min>0){voiceUntil=Date.now()+min*60000;voiceTimer=setTimeout(()=>{voiceUntil=0;void stopVoice();toast('Se apagó la lectura (temporizador).');},min*60000);}}
  let result;
  try{result=await voiceController().play(chapterData.verses.map(v=>v.text).join('\n'),$('#voice-select').value,Number($('#voice-rate')?.value||1));}catch(error){toast(error.message);return;}
  if(!result?.completado||until==='capitulo'||(voiceUntil&&Date.now()>=voiceUntil))return;
  const {book,chapter}=state.position;if(book===books.length-1&&chapter===books[book].chapters.length)return; // Apocalipsis 22: fin
  changeChapter(1);
  for(let i=0;i<60&&!chapterData;i++)await new Promise(r=>setTimeout(r,250));
  if(chapterData)await playVoice(null,true);
}
// La velocidad y «Leer hasta…» se recuerdan en este equipo (preferencias, no datos de estudio).
for(const [id,clave] of [['voice-rate','biblioteca-voz-velocidad'],['voice-until','biblioteca-voz-hasta']]){const r=document.getElementById(id);if(!r)continue;try{const v=localStorage.getItem(clave);if(v&&[...r.options].some(o=>o.value===v))r.value=v;}catch{}r.addEventListener('change',()=>{try{localStorage.setItem(clave,r.value);}catch{}});}
start();
