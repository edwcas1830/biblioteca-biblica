const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const {autoUpdater}=require('electron-updater');
const {createUpdateService}=require('./update-service.cjs');
const {Worker}=require('node:worker_threads');
app.setName('Biblioteca Bíblica');
const hiddenTest = process.env.BIBLIOTECA_TEST_HIDDEN === '1';
const testProfile=process.env.BIBLIOTECA_TEST_PROFILE;
if(hiddenTest&&!testProfile)throw new Error('Las pruebas ocultas requieren un perfil separado.');
if(testProfile){const resolved=path.resolve(testProfile),real=path.resolve(app.getPath('userData'));if(resolved.toLowerCase()===real.toLowerCase())throw new Error('No se permite probar sobre el perfil real.');fs.mkdirSync(resolved,{recursive:true});app.setPath('userData',resolved);}
app.whenReady().then(() => {
  const worker=new Worker(path.join(__dirname,'lib','library-worker.cjs'),{workerData:{root:app.getPath('userData'),resources:app.isPackaged?process.resourcesPath:path.join(__dirname,'resources'),appRoot:__dirname}});
  let sequence=0, pending=new Map(), workerFailure=null;
  worker.on('message',message=>{const task=pending.get(message.id);if(!task)return;pending.delete(message.id);message.error?task.reject(new Error(message.error)):task.resolve(message.result);});
  const failWorker=error=>{workerFailure=error;for(const task of pending.values())task.reject(error);pending.clear();};
  worker.on('error',failWorker);worker.on('exit',code=>{if(code)failWorker(new Error('El servicio local se detuvo. Reinicia la app.'));});
  const request=(action,data)=>new Promise((resolve,reject)=>{if(workerFailure){reject(workerFailure);return;}const id=++sequence;pending.set(id,{resolve,reject});worker.postMessage({id,action,data});});
  Menu.setApplicationMenu(null);
  const win = new BrowserWindow({
    width: 1480, height: 960, minWidth: 960, minHeight: 700,
    backgroundColor: '#f3eee3', title: 'Biblioteca Bíblica', show: !hiddenTest,
    icon: path.join(__dirname, 'app', 'icon.ico'),
    webPreferences: { preload:path.join(__dirname,'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, backgroundThrottling:!hiddenTest, offscreen:hiddenTest, additionalArguments:hiddenTest&&testProfile?['--biblioteca-test']:[] }
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
  let channel={enabled:false};
  try{channel=JSON.parse(fs.readFileSync(path.join(app.isPackaged?process.resourcesPath:__dirname,'update-channel.json'),'utf8'));}catch{}
  const updates=createUpdateService({app,updater:autoUpdater,enabled:channel.enabled===true,testing:hiddenTest||!!testProfile,notify:state=>{if(!win.isDestroyed())win.webContents.send('library:update-state-event',state);}});
  const trusted=event=>event.sender===win.webContents&&event.senderFrame===win.webContents.mainFrame;
  let documentBusy=false;
  ipcMain.handle('library:read-pdf',async(event,bytes)=>{
    if(!trusted(event)||!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>10000000)throw new Error('PDF no autorizado o demasiado grande.');
    if(documentBusy)throw new Error('Espera a que termine la lectura del documento anterior.');
    documentBusy=true;
    try{return await new Promise((resolve,reject)=>{
      const parser=new Worker(path.join(__dirname,'lib','document-worker.cjs'),{workerData:{bytes},resourceLimits:{maxOldGenerationSizeMb:256}});
      let done=false;const finish=(error,result)=>{if(done)return;done=true;clearTimeout(timer);parser.terminate();error?reject(error):resolve(result);};
      const timer=setTimeout(()=>finish(new Error('La lectura del PDF tardó demasiado. Prueba un documento más pequeño.')),45000);
      parser.once('message',message=>finish(message.error?new Error(message.error):null,message.result));parser.once('error',error=>finish(error));parser.once('exit',code=>{if(!done)finish(new Error('No se pudo leer el PDF ('+code+').'));});
    });}finally{documentBusy=false;}
  });
  if(hiddenTest&&testProfile)ipcMain.handle('library:test-capture',async event=>{if(!trusted(event))throw new Error('Origen no autorizado');return (await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG().toString('base64');});
  if(hiddenTest&&testProfile)ipcMain.handle('library:test-resize',(event,{width,height})=>{if(!trusted(event)||!Number.isInteger(width)||!Number.isInteger(height)||width<960||width>1920||height<650||height>1080)throw new Error('Tamaño de prueba inválido');win.setContentSize(width,height);return {width,height};});
  for(const action of ['bootstrap','save','catalog','metadata','chapter','search','comments','dictionary'])ipcMain.handle('library:data-'+action,(event,data)=>{if(!trusted(event))throw new Error('Origen no autorizado.');if(JSON.stringify(data??null).length>12_000_000)throw new Error('Datos demasiado grandes.');return request(action,data);});
  app.on('will-quit',()=>worker.terminate());
  for(const [name,action] of [['state','getState'],['check','check'],['download','download'],['install','install']])ipcMain.handle('library:update-'+name,event=>{if(!trusted(event))throw new Error('Origen no autorizado.');return updates[action]();});
  if(channel.enabled&&!hiddenTest&&!testProfile){const first=setTimeout(()=>updates.check(),10000),interval=setInterval(()=>updates.check(),6*60*60*1000);first.unref();interval.unref();app.on('before-quit',()=>{clearTimeout(first);clearInterval(interval);});}
});
app.on('window-all-closed', () => app.quit());
