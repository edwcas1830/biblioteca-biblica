const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const {autoUpdater}=require('electron-updater');
const {createUpdateService}=require('./update-service.cjs');
app.setName('Biblioteca Bíblica');
const hiddenTest = process.env.BIBLIOTECA_TEST_HIDDEN === '1';
if (hiddenTest && process.env.BIBLIOTECA_TEST_PROFILE) app.setPath('userData', process.env.BIBLIOTECA_TEST_PROFILE);
app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  const win = new BrowserWindow({
    width: 1480, height: 960, minWidth: 960, minHeight: 700,
    backgroundColor: '#f3eee3', title: 'Biblioteca Bíblica', show: !hiddenTest,
    icon: path.join(__dirname, 'app', 'icon.ico'),
    webPreferences: { preload:path.join(__dirname,'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true }
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
  let channel={enabled:false};
  try{channel=JSON.parse(fs.readFileSync(path.join(app.isPackaged?process.resourcesPath:__dirname,'update-channel.json'),'utf8'));}catch{}
  const updates=createUpdateService({app,updater:autoUpdater,enabled:channel.enabled===true,testing:hiddenTest,notify:state=>{if(!win.isDestroyed())win.webContents.send('library:update-state-event',state);}});
  const trusted=event=>event.sender===win.webContents&&event.senderFrame===win.webContents.mainFrame;
  for(const [name,action] of [['state','getState'],['check','check'],['download','download'],['install','install']])ipcMain.handle('library:update-'+name,event=>{if(!trusted(event))throw new Error('Origen no autorizado.');return updates[action]();});
  if(channel.enabled&&!hiddenTest){const first=setTimeout(()=>updates.check(),10000),interval=setInterval(()=>updates.check(),6*60*60*1000);first.unref();interval.unref();app.on('before-quit',()=>{clearTimeout(first);clearInterval(interval);});}
});
app.on('window-all-closed', () => app.quit());
