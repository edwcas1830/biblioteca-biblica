const {contextBridge,ipcRenderer}=require('electron');
if(process.argv.includes('--biblioteca-test'))contextBridge.exposeInMainWorld('libraryTest',{capture:()=>ipcRenderer.invoke('library:test-capture'),resize:(width,height)=>ipcRenderer.invoke('library:test-resize',{width,height})});
contextBridge.exposeInMainWorld('libraryDesktop',{
  readPdf:bytes=>ipcRenderer.invoke('library:read-pdf',bytes),
  bootstrap:data=>ipcRenderer.invoke('library:data-bootstrap',data),
  savePersonal:data=>ipcRenderer.invoke('library:data-save',data),
  catalog:()=>ipcRenderer.invoke('library:data-catalog'),
  metadata:()=>ipcRenderer.invoke('library:data-metadata'),
  chapter:data=>ipcRenderer.invoke('library:data-chapter',data),
  search:data=>ipcRenderer.invoke('library:data-search',data),
  comments:data=>ipcRenderer.invoke('library:data-comments',data),
  dictionary:data=>ipcRenderer.invoke('library:data-dictionary',data),
  getUpdateState:()=>ipcRenderer.invoke('library:update-state'),
  checkForUpdates:()=>ipcRenderer.invoke('library:update-check'),
  downloadUpdate:()=>ipcRenderer.invoke('library:update-download'),
  installUpdate:()=>ipcRenderer.invoke('library:update-install'),
  onUpdateState:callback=>{if(typeof callback!=='function')return;const listener=(_event,state)=>callback(state);ipcRenderer.on('library:update-state-event',listener);return()=>ipcRenderer.removeListener('library:update-state-event',listener);}
});
