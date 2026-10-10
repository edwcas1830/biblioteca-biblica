(function(){
  const bridge=window.libraryDesktop,button=document.querySelector('#check-updates'),dialog=document.querySelector('#update-dialog');
  if(!bridge)return;button.hidden=false;let current=null,manual=false;
  function render(state){
    current=state;document.querySelector('#update-current').textContent='Tu versión: '+state.currentVersion;
    document.querySelector('#update-title').textContent=state.status==='available'?'Hay una nueva versión':state.status==='ready'?'Lista para instalar':'Actualizaciones de tu biblioteca';
    document.querySelector('#update-message').textContent=state.message||'Busca nuevas versiones de Biblioteca Bíblica.';
    document.querySelector('#update-version').textContent=state.version?'Versión '+state.version:'';
    const progress=document.querySelector('#update-progress');progress.hidden=!['downloading','ready'].includes(state.status);progress.value=state.percent||0;
    document.querySelector('#update-download').hidden=state.status!=='available';document.querySelector('#update-install').hidden=state.status!=='ready';document.querySelector('#update-retry').hidden=!['idle','current','error'].includes(state.status);
    if((['available','ready'].includes(state.status)||manual)&&!dialog.open){dialog.showModal();manual=false;}
  }
  try{bridge.onUpdateState(render);}catch(error){if(error?.code!=='UNAVAILABLE')throw error;}bridge.getUpdateState().then(render).catch(()=>{});
  button.addEventListener('click',async()=>{manual=true;render(await bridge.getUpdateState());render(await bridge.checkForUpdates());});
  document.querySelector('#update-close').addEventListener('click',()=>dialog.close());
  document.querySelector('#update-download').addEventListener('click',async()=>{render(await bridge.downloadUpdate());});
  document.querySelector('#update-retry').addEventListener('click',async()=>{manual=true;render(await bridge.checkForUpdates());});
  document.querySelector('#update-install').addEventListener('click',async()=>{if(typeof save==='function'&&!save())return;await bridge.installUpdate();});
})();
