'use strict';
let aiPrepared=null,aiWorking=false,aiGeneration=0;
let aiWasConnected=false,aiPersonal={available:false,enabled:false,providers:[]};
const personalProvider=()=>aiPersonal.enabled?$('#ai-provider').value:'openrouter';
function personalReady(){const id=personalProvider(),p=aiPersonal.providers.find(p=>p.id===id);return id==='gemini-cli'?p?.installed:p?.connected;}

function updateAiStatus(status){
  $('#ai-account-status').textContent=status.waiting?'Termina la autorización en tu navegador.':status.connected?'Tu cuenta está conectada a este equipo.':'Conecta tu propia cuenta para consultar dentro de la app.';
  $('#ai-connect').disabled=status.waiting||!status.secure;$('#ai-disconnect').hidden=!status.connected&&!status.waiting;
  $('#ai-ask').disabled=!(personalProvider()==='openrouter'?status.connected:personalReady())||!aiPrepared||aiWorking;
  if(status.connected&&!aiWasConnected)refreshAiModels();aiWasConnected=status.connected;
}
async function refreshAiModels(){
  $('#ai-model-refresh').disabled=true;try{const models=await desktop.aiModels();$('#ai-model').innerHTML=models.map(m=>`<option value="${esc(m.id)}">${esc(m.name)}</option>`).join('');$('#ai-status').textContent='Modelos gratuitos actualizados.';}catch(error){$('#ai-status').textContent='No se pudieron consultar los modelos. Puedes usar copiar y abrir. '+error.message;}finally{$('#ai-model-refresh').disabled=false;}
}
function invalidateAi(){aiGeneration++;aiPrepared=null;$('#ai-preview').hidden=true;$('#ai-result').hidden=true;$('#ai-ask').disabled=true;for(const b of document.querySelectorAll('[data-ai-copy]'))b.disabled=true;}
async function openAi(options={}){
  aiSeries=options.series?GuideCore.spec(options.series):null;
  invalidateAi();$('#ai-dialog').showModal();$('#ai-reference').textContent=aiSeries?'Serie de '+aiSeries.days+' días · '+core.topics[aiSeries.topic].title:reference();if(aiSeries){$('#ai-task').value='draft';$('#ai-question').value='';}
  const module=catalogData?.modules.find(m=>m.id===$('#comment-select').value),allowed=module?.iaPermitida===true;
  $('#ai-include-comment').disabled=!allowed;$('#ai-include-comment').checked=false;
  $('#ai-comment-permission').textContent=allowed?'Puedes elegir enviar este comentario.':'El comentario personal no declara permiso para enviarlo; permanece local.';
  try{aiPersonal=await desktop.aiPersonalStatus();renderPersonalAi();updateAiStatus(await desktop.aiStatus());}catch(error){$('#ai-status').textContent=error.message;}
  $('#ai-task').focus();
}
function renderPersonalAi(){
 $('#ai-personal-mode').hidden=!aiPersonal.available;$('#ai-personal-enabled').checked=aiPersonal.enabled;$('#ai-provider-choice').hidden=!aiPersonal.enabled;const id=personalProvider(),p=aiPersonal.providers.find(p=>p.id===id),cli=!['openrouter','gemini-api'].includes(id);$('#ai-openrouter-account').hidden=id!=='openrouter';$('#ai-cli-model-row').hidden=!cli;$('#ai-gemini-key-row').hidden=id!=='gemini-api';$('#ai-personal-login').hidden=id==='openrouter';$('#ai-personal-login').textContent=id==='gemini-api'?'Obtener clave en AI Studio ↗':'Iniciar sesión oficial ↗';$('#ai-personal-refresh').hidden=id==='openrouter';
 $('#ai-personal-status').textContent=id==='openrouter'?'':id==='gemini-api'?(p?.connected?'Clave protegida en este equipo.':'Pega tu clave de AI Studio para conectar.'):(p?.connected?'Sesión oficial disponible.':p?.installed?(id==='gemini-cli'?'CLI instalada. La sesión se verifica al consultar.':'CLI instalada: inicia sesión con tu plan.'):'CLI oficial no instalada o no detectada.');
 $('#ai-provider-help').textContent={openrouter:'',codex:'Usa tu sesión oficial de Codex con ChatGPT y sus límites. Iniciar sesión abre una terminal; al terminar, pulsa Comprobar conexión.',claude:'Usa Claude Code con tu plan compatible y sus límites. Iniciar sesión abre una terminal; al terminar, pulsa Comprobar conexión.', 'gemini-cli':'Usa la autenticación oficial guardada por Gemini CLI. Si falta, inicia Gemini, elige Sign in with Google y después vuelve a esta app.','gemini-api':'Obtén tu propia clave en Google AI Studio. No necesitas introducir tu contraseña aquí.'}[id]||'';
 $('#ai-ask').disabled=!aiPrepared||aiWorking||id!=='openrouter'&&!personalReady();
}
async function refreshPersonalAi(){aiPersonal=await desktop.aiPersonalStatus();renderPersonalAi();updateAiStatus(await desktop.aiStatus());}
async function geminiModels(){try{const models=await desktop.aiGeminiModels();$('#ai-gemini-model').innerHTML=models.map(m=>`<option value="${esc(m.id)}">${esc(m.name)}</option>`).join('');}catch(e){$('#ai-status').textContent=e.message;}}
function bindAi(){
 $('#ai-personal-enabled').addEventListener('change',async e=>{try{aiPersonal=await desktop.aiPersonalEnable(e.target.checked);invalidateAi();renderPersonalAi();updateAiStatus(await desktop.aiStatus());}catch(error){$('#ai-status').textContent=error.message;e.target.checked=aiPersonal.enabled;}});
 $('#ai-provider').addEventListener('change',async()=>{invalidateAi();renderPersonalAi();updateAiStatus(await desktop.aiStatus());if(personalProvider()==='gemini-api'&&personalReady())await geminiModels();});
 $('#ai-personal-refresh').addEventListener('click',async()=>{try{await refreshPersonalAi();}catch(e){$('#ai-status').textContent=e.message;}});
 $('#ai-personal-login').addEventListener('click',async()=>{try{await desktop.aiPersonalLogin(personalProvider());$('#ai-status').textContent=personalProvider()==='gemini-api'?'Crea tu clave en AI Studio y pégala en el campo de conexión.':'Completa la instalación o sesión oficial y después pulsa Comprobar conexión.';}catch(e){$('#ai-status').textContent=e.message;}});
 $('#ai-gemini-connect').addEventListener('click',async()=>{try{aiPersonal=await desktop.aiGeminiKey($('#ai-gemini-key').value.trim());$('#ai-gemini-key').value='';invalidateAi();renderPersonalAi();await geminiModels();}catch(e){$('#ai-status').textContent=e.message;}});
 $('#ai-gemini-disconnect').addEventListener('click',async()=>{try{aiPersonal=await desktop.aiGeminiKey(null);$('#ai-gemini-key').value='';invalidateAi();renderPersonalAi();}catch(e){$('#ai-status').textContent=e.message;}});$('#ai-gemini-refresh').addEventListener('click',geminiModels);

  for(const button of document.querySelectorAll('[data-action="ai-open"]'))button.addEventListener('click',openAi);
  $('#ai-close').addEventListener('click',()=>$('#ai-dialog').close());desktop?.onAiState(updateAiStatus);
  $('#ai-connect').addEventListener('click',async()=>{try{updateAiStatus(await desktop.aiConnect());}catch(error){$('#ai-status').textContent=error.message;}});
  $('#ai-disconnect').addEventListener('click',async()=>{try{updateAiStatus(await desktop.aiDisconnect());}catch(error){$('#ai-status').textContent=error.message;}});
  $('#ai-model-refresh').addEventListener('click',refreshAiModels);
  for(const id of ['ai-task','ai-question','ai-include-bible','ai-include-comment'])$('#'+id).addEventListener('input',invalidateAi);
  $('#ai-prepare').addEventListener('click',async()=>{
    invalidateAi();const generation=aiGeneration;$('#ai-prepare').disabled=true;try{
      const p=state.position,end=readerRange?.book===p.book&&readerRange?.chapter===p.chapter?readerRange.end:p.verse;
      const prepared=await desktop.aiPrepare({...p,endVerse:end,module:selectedVersion,comment:$('#comment-select').value,task:$('#ai-task').value,...(aiSeries?{series:aiSeries}:{}),question:$('#ai-question').value,includeBible:$('#ai-include-bible').checked,includeComment:$('#ai-include-comment').checked});
      if(generation!==aiGeneration)return;aiPrepared=prepared;
      $('#ai-context').value=aiPrepared.prompt;$('#ai-sources').textContent=aiPrepared.sources.map(s=>s.title+' · '+s.reference+' · '+s.license).join('\n')||'Solo referencia y pregunta; no se envía texto de módulos.';
      $('#ai-status').textContent=aiPrepared.notices.join(' ');$('#ai-preview').hidden=false;for(const b of document.querySelectorAll('[data-ai-copy]'))b.disabled=false;updateAiStatus(await desktop.aiStatus());
    }catch(error){invalidateAi();$('#ai-status').textContent=error.message;}finally{$('#ai-prepare').disabled=false;}
  });
  $('#ai-ask').addEventListener('click',async()=>{
    if(!aiPrepared||aiWorking)return;const generation=aiGeneration;aiWorking=true;$('#ai-ask').disabled=true;$('#ai-prepare').disabled=true;$('#ai-status').textContent='Consultando las fuentes elegidas…';
    try{
      const result=await desktop.aiAsk({id:aiPrepared.id,provider:personalProvider(),model:personalProvider()==='openrouter'?$('#ai-model').value:personalProvider()==='gemini-api'?$('#ai-gemini-model').value:$('#ai-personal-model').value.trim(),allowData:$('#ai-allow-data').checked});
      if(generation!==aiGeneration)return;
      $('#ai-result-text').textContent=result.text;$('#ai-result-source').textContent='Generado con IA · '+result.model+' · revisa las interpretaciones y fuentes.';
      $('#ai-citations').innerHTML=result.citations.map(r=>`<section><button class="passage-link" data-document-ref="${r.book}:${r.chapter}:${r.verse}:${r.verse}">${esc(reference(r))}</button><p>${esc(r.text)}</p><small>${esc(r.title)} · texto de tu biblioteca local</small></section>`).join('');
      $('#ai-draft').hidden=aiPrepared.task!=='draft';if(aiPrepared.task==='draft'){$('#ai-draft-text').value=result.text;aiDraftModel=result.model;}
      $('#ai-result').hidden=false;$('#ai-status').textContent=result.structured?'Consulta terminada.':'Respuesta de texto; el modelo no entregó citas estructuradas.';
    }catch(error){$('#ai-status').textContent=error.message;}finally{aiWorking=false;$('#ai-prepare').disabled=false;updateAiStatus(await desktop.aiStatus());}
  });
  for(const b of document.querySelectorAll('[data-ai-copy]'))b.addEventListener('click',async()=>{
    if(!aiPrepared)return;try{await desktop.aiCopy({id:aiPrepared.id,provider:b.dataset.aiCopy||undefined});$('#ai-status').textContent=b.dataset.aiCopy?'Consulta copiada. Pégala en la conversación del proveedor.':'Consulta copiada.';}catch(error){$('#ai-status').textContent=error.message;}
  });
  $('#ai-citations').addEventListener('click',event=>{if(event.target.closest('[data-document-ref]'))$('#ai-dialog').close();});
}
