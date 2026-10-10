const {contextBridge,ipcRenderer}=require('electron');
if(process.argv.includes('--biblioteca-test'))contextBridge.exposeInMainWorld('libraryTest',{muteAudio:muted=>ipcRenderer.invoke('library:test-mute',muted),minimizeEvent:()=>ipcRenderer.invoke('library:test-minimize'),capture:()=>ipcRenderer.invoke('library:test-capture'),resize:(width,height)=>ipcRenderer.invoke('library:test-resize',{width,height})});
contextBridge.exposeInMainWorld('libraryDesktop',{
  aiStatus:()=>ipcRenderer.invoke('library:ai-status'),aiConnect:()=>ipcRenderer.invoke('library:ai-connect'),aiDisconnect:()=>ipcRenderer.invoke('library:ai-disconnect'),aiModels:()=>ipcRenderer.invoke('library:ai-models'),
  aiPrepare:data=>ipcRenderer.invoke('library:ai-prepare',data),aiAsk:data=>ipcRenderer.invoke('library:ai-ask',data),aiCopy:data=>ipcRenderer.invoke('library:ai-copy',data),
  onAiState:callback=>{if(typeof callback!=='function')return;const listener=(_event,state)=>callback(state);ipcRenderer.on('library:ai-state',listener);return()=>ipcRenderer.removeListener('library:ai-state',listener);},
  privacyStatus:()=>ipcRenderer.invoke('library:private-privacyStatus'),unlock:pin=>ipcRenderer.invoke('library:private-unlock',{pin}),lockPrivate:()=>ipcRenderer.invoke('library:private-lock'),setPin:pin=>ipcRenderer.invoke('library:private-setPin',{pin}),disablePin:()=>ipcRenderer.invoke('library:private-disablePin'),exportBackup:()=>ipcRenderer.invoke('library:private-exportBackup'),restoreBackup:data=>ipcRenderer.invoke('library:private-restoreBackup',data),
  musicPlayer:url=>ipcRenderer.invoke('library:music-player',url),musicExternal:url=>ipcRenderer.invoke('library:music-external',url),onMusicPause:callback=>{const listener=()=>callback();ipcRenderer.on('library:music-pause',listener);return()=>ipcRenderer.removeListener('library:music-pause',listener);},
  readPdf:bytes=>ipcRenderer.invoke('library:read-pdf',bytes),
  bootstrap:data=>ipcRenderer.invoke('library:data-bootstrap',data),
  savePersonal:data=>ipcRenderer.invoke('library:data-save',data),
  graphicsChapter:data=>ipcRenderer.invoke('library:data-graphicsChapter',data),graphicsChronology:data=>ipcRenderer.invoke('library:data-graphicsChronology',data),graphicsPeople:data=>ipcRenderer.invoke('library:data-graphicsPeople',data),graphicsGenealogy:data=>ipcRenderer.invoke('library:data-graphicsGenealogy',data),
  connections:data=>ipcRenderer.invoke('library:data-connections',data),compare:data=>ipcRenderer.invoke('library:data-compare',data),studySources:()=>ipcRenderer.invoke('library:data-studySources'),
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
