'use strict';
let aiPrepared=null,aiWorking=false,aiGeneration=0;
let aiWasConnected=false,aiPersonal={available:false,enabled:false,providers:[]};
const personalProvider=()=>aiPersonal.enabled?$('#ai-provider').value:'openrouter';
function personalReady(){const id=personalProvider(),p=aiPersonal.providers.find(p=>p.id===id);return id==='gemini-cli'?p?.installed:p?.connected;}

function updateAiStatus(status){
  $('#ai-account-status').textContent=status.waiting?'Termina la autorización en tu navegador.':status.connected?'Tu cuenta está conectada a este equipo.':'Conecta tu propia cuenta para consultar dentro de la app.';
  $('#ai-connect').disabled=status.waiting||!status.secure;$('#ai-disconnect').hidden=!status.connected&&!status.waiting;
  $('#ai-ask').disabled=!(personalProvider()==='openrouter'?status.connected:personalReady())||aiWorking;
  if(status.connected&&!aiWasConnected)refreshAiModels();aiWasConnected=status.connected;
}
async function refreshAiModels(){
  $('#ai-model-refresh').disabled=true;try{const models=await desktop.aiModels();$('#ai-model').innerHTML=models.map(m=>`<option value="${esc(m.id)}">${esc(m.name)}</option>`).join('');$('#ai-settings-status').textContent='Modelos gratuitos actualizados.';}catch(error){$('#ai-settings-status').textContent='No se pudieron consultar los modelos. Puedes usar copiar y abrir. '+error.message;}finally{$('#ai-model-refresh').disabled=false;}
}
function invalidateAi(){aiGeneration++;aiPrepared=null;$('#ai-preview').hidden=true;$('#ai-result').hidden=true;$('#ai-ask').disabled=aiWorking||!(personalProvider()==='openrouter'?aiWasConnected:personalReady());for(const b of document.querySelectorAll('[data-ai-copy]'))b.disabled=true;}
function renderPersonalAi(){
 $('#ai-personal-mode').hidden=!aiPersonal.available;$('#ai-personal-enabled').checked=aiPersonal.enabled;$('#ai-provider-choice').hidden=!aiPersonal.enabled;const id=personalProvider(),p=aiPersonal.providers.find(p=>p.id===id),cli=!['openrouter','gemini-api'].includes(id);$('#ai-openrouter-account').hidden=id!=='openrouter';$('#ai-cli-model-row').hidden=!cli;$('#ai-gemini-key-row').hidden=id!=='gemini-api';$('#ai-personal-login').hidden=id==='openrouter';$('#ai-personal-login').textContent=id==='gemini-api'?'Obtener clave en AI Studio ↗':'Iniciar sesión oficial ↗';$('#ai-personal-refresh').hidden=id==='openrouter';
 $('#ai-personal-status').textContent=id==='openrouter'?'':id==='gemini-api'?(p?.connected?'Clave protegida en este equipo.':'Pega tu clave de AI Studio para conectar.'):(p?.connected?'Sesión oficial disponible.':p?.installed?(id==='gemini-cli'?'CLI instalada. La sesión se verifica al consultar.':'CLI instalada: inicia sesión con tu plan.'):'CLI oficial no instalada o no detectada.');
 $('#ai-provider-help').textContent={openrouter:'',codex:'Usa tu sesión oficial de Codex con ChatGPT y sus límites. Iniciar sesión abre una terminal; al terminar, pulsa Comprobar conexión.',claude:'Usa Claude Code con tu plan compatible y sus límites. Iniciar sesión abre una terminal; al terminar, pulsa Comprobar conexión.', 'gemini-cli':'Usa la autenticación oficial guardada por Gemini CLI. Si falta, inicia Gemini, elige Sign in with Google y después vuelve a esta app.','gemini-api':'Obtén tu propia clave en Google AI Studio. No necesitas introducir tu contraseña aquí.'}[id]||'';
 $('#ai-ask').disabled=aiWorking||id!=='openrouter'&&!personalReady();
}
async function refreshPersonalAi(){aiPersonal=await desktop.aiPersonalStatus();renderPersonalAi();updateAiStatus(await desktop.aiStatus());}
async function geminiModels(){try{const models=await desktop.aiGeminiModels();$('#ai-gemini-model').innerHTML=models.map(m=>`<option value="${esc(m.id)}">${esc(m.name)}</option>`).join('');}catch(e){$('#ai-settings-status').textContent=e.message;}}
function bindAiAccounts(){
 $('#ai-personal-enabled').addEventListener('change',async e=>{cancelAi();try{aiPersonal=await desktop.aiPersonalEnable(e.target.checked);invalidateAi();renderPersonalAi();updateAiStatus(await desktop.aiStatus());}catch(error){$('#ai-settings-status').textContent=error.message;e.target.checked=aiPersonal.enabled;}});
 $('#ai-provider').addEventListener('change',async()=>{cancelAi();invalidateAi();renderPersonalAi();updateAiStatus(await desktop.aiStatus());if(personalProvider()==='gemini-api'&&personalReady())await geminiModels();});
 $('#ai-personal-refresh').addEventListener('click',async()=>{try{await refreshPersonalAi();}catch(e){$('#ai-settings-status').textContent=e.message;}});
 $('#ai-personal-login').addEventListener('click',async()=>{try{await desktop.aiPersonalLogin(personalProvider());$('#ai-settings-status').textContent=personalProvider()==='gemini-api'?'Crea tu clave en AI Studio y pégala en el campo de conexión.':'Completa la instalación o sesión oficial y después pulsa Comprobar conexión.';}catch(e){$('#ai-settings-status').textContent=e.message;}});
 $('#ai-gemini-connect').addEventListener('click',async()=>{try{aiPersonal=await desktop.aiGeminiKey($('#ai-gemini-key').value.trim());$('#ai-gemini-key').value='';invalidateAi();renderPersonalAi();await geminiModels();}catch(e){$('#ai-settings-status').textContent=e.message;}});
 $('#ai-gemini-disconnect').addEventListener('click',async()=>{try{aiPersonal=await desktop.aiGeminiKey(null);$('#ai-gemini-key').value='';invalidateAi();renderPersonalAi();}catch(e){$('#ai-settings-status').textContent=e.message;}});$('#ai-gemini-refresh').addEventListener('click',geminiModels);

}
