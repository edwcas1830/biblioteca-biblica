const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('libraryDesktop',{
  getUpdateState:()=>ipcRenderer.invoke('library:update-state'),
  checkForUpdates:()=>ipcRenderer.invoke('library:update-check'),
  downloadUpdate:()=>ipcRenderer.invoke('library:update-download'),
  installUpdate:()=>ipcRenderer.invoke('library:update-install'),
  onUpdateState:callback=>{if(typeof callback!=='function')return;const listener=(_event,state)=>callback(state);ipcRenderer.on('library:update-state-event',listener);return()=>ipcRenderer.removeListener('library:update-state-event',listener);}
});
