const { app, BrowserWindow, Menu, ipcMain, safeStorage, shell, clipboard, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const {autoUpdater}=require('electron-updater');
const {createUpdateService}=require('./update-service.cjs');
const {Worker}=require('node:worker_threads');
const crypto=require('node:crypto');
const {AiService}=require('./lib/ai-service.cjs');
const aiCore=require('./app/ai-core.js');
const actions=require('./shared/study-actions.js');
const {MusicServer}=require('./lib/music-server.cjs'),musicCore=require('./app/music-core.js');
app.setName('Biblioteca Bíblica');
const hiddenTest = process.env.BIBLIOTECA_TEST_HIDDEN === '1';
const testProfile=process.env.BIBLIOTECA_TEST_PROFILE;
if(hiddenTest&&!testProfile)throw new Error('Las pruebas ocultas requieren un perfil separado.');
if(testProfile){const resolved=path.resolve(testProfile),real=path.resolve(app.getPath('userData'));if(resolved.toLowerCase()===real.toLowerCase())throw new Error('No se permite probar sobre el perfil real.');fs.mkdirSync(resolved,{recursive:true});app.setPath('userData',resolved);}
app.whenReady().then(async () => {
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

  let channel={enabled:false};
  try{channel=JSON.parse(fs.readFileSync(path.join(app.isPackaged?process.resourcesPath:__dirname,'update-channel.json'),'utf8'));}catch{}
  const updates=createUpdateService({app,updater:autoUpdater,enabled:channel.enabled===true,testing:hiddenTest||!!testProfile,notify:state=>{if(!win.isDestroyed())win.webContents.send('library:update-state-event',state);}});
  const music=new MusicServer(__dirname);app.on('before-quit',()=>music.stop());
  win.on('minimize',()=>{win.webContents.setAudioMuted(true);win.webContents.send('library:music-pause');});win.on('restore',()=>win.webContents.setAudioMuted(false));
  win.webContents.session.webRequest.onBeforeSendHeaders({urls:['https://www.youtube.com/embed/*','https://www.youtube-nocookie.com/embed/*']},(details,callback)=>{const headers={...details.requestHeaders};if(details.webContentsId===win.webContents.id&&music.origin&&details.referrer?.startsWith(music.origin+'/'))headers.Referer='https://com.edward.bibliotecabiblica/';callback({requestHeaders:headers});});
  const trusted=event=>event.sender===win.webContents&&event.senderFrame===win.webContents.mainFrame;
  ipcMain.handle('library:reader-fullscreen',(event,value)=>{if(!trusted(event)||value!==undefined&&typeof value!=='boolean')throw Error('Origen no autorizado.');const next=value??!win.isFullScreen();win.setFullScreen(next);win.webContents.send('library:fullscreen',next);return next;});
  win.on('enter-full-screen',()=>win.webContents.send('library:fullscreen',true));win.on('leave-full-screen',()=>win.webContents.send('library:fullscreen',false));
  ipcMain.handle('library:music-player',(event,url)=>{if(!trusted(event))throw new Error('Origen no autorizado.');return music.player(url);});
  ipcMain.handle('library:music-external',(event,url)=>{if(!trusted(event))throw new Error('Origen no autorizado.');return shell.openExternal(musicCore.parse(url).url);});
  if(hiddenTest&&testProfile)ipcMain.handle('library:test-mute',(event,muted)=>{if(!trusted(event)||typeof muted!=='boolean')throw new Error('Origen no autorizado');win.webContents.setAudioMuted(muted);});
  if(hiddenTest&&testProfile)ipcMain.handle('library:test-minimize',event=>{if(!trusted(event))throw new Error('Origen no autorizado');win.emit('minimize');const muted=win.webContents.isAudioMuted();return {muted,eventSimulated:true};});
  const {Circle}=require('./lib/circle.cjs'),circle=new Circle({root:app.getPath('userData'),safeStorage,books:await request('metadata')});
  if(hiddenTest&&testProfile)ipcMain.handle('library:test-circle-connect',(event,data)=>{if(!trusted(event))throw Error('Origen no autorizado');const folder=path.join(path.resolve(testProfile),'circle-shared-test');fs.mkdirSync(folder,{recursive:true});if(circle.config)return circle.status();return circle.connect({folder,name:data.name,code:data.code});});
  if(hiddenTest&&testProfile)ipcMain.handle('library:test-circle-protection',event=>{if(!trusted(event))throw Error('Origen no autorizado');const text=fs.readFileSync(circle.configFile,'utf8');return {protected:safeStorage.isEncryptionAvailable(),plaintext:text.includes(circle.config.secret)};});
  const circleAllowed=async event=>{if(!trusted(event))throw Error('Origen no autorizado.');if((await request('privacyStatus')).locked)throw Error('Abre tu cuaderno para entrar al círculo.');};
  for(const [name,action] of [['status','status'],['sync','sync'],['recovery','recovery'],['resolve','resolve'],['reading','reading'],['leave','leave']])ipcMain.handle('library:circle-'+name,async(event,data)=>{await circleAllowed(event);return circle[action](data);});
  ipcMain.handle('library:circle-connect',async(event,data)=>{await circleAllowed(event);if(!data||JSON.stringify(data).length>2000)throw Error('Datos inválidos.');const chosen=await dialog.showOpenDialog(win,{title:'Carpeta de OneDrive que ya compartes con Laura',properties:['openDirectory']});if(chosen.canceled)return null;return circle.connect({folder:chosen.filePaths[0],name:data.name,code:data.code});});
  ipcMain.handle('library:circle-preview',async(event,data)=>{await circleAllowed(event);return request('circleContext',data);});
  ipcMain.handle('library:circle-share',async(event,data)=>{await circleAllowed(event);if(!data||JSON.stringify(data).length>16000)throw Error('Selección inválida.');const current=await request('circleContext',data.selection);if(JSON.stringify(current)!==data.preview)throw Error('La selección cambió: revísala otra vez antes de compartir.');return circle.publish(current);});
  ipcMain.handle('library:circle-copy-code',async event=>{await circleAllowed(event);clipboard.writeText(circle.recovery());return true;});
  const circleTimer=setInterval(()=>{if(circle.config)circle.sync();},20000);circleTimer.unref();app.on('will-quit',()=>{clearInterval(circleTimer);circle.close();});
  ipcMain.handle('library:module-scan',async(event,{choose=false}={})=>{if(!trusted(event))throw Error('Origen no autorizado.');let directory=path.join(process.env['ProgramFiles(x86)']||'C:\\Program Files (x86)','e-Sword');if(hiddenTest&&testProfile&&fs.existsSync(path.join(testProfile,'fixture-import')))directory=path.join(testProfile,'fixture-import');if(choose||!fs.existsSync(directory)){const selected=await dialog.showOpenDialog(win,{title:'Carpeta de tu biblioteca e-Sword',properties:['openDirectory']});if(selected.canceled)return null;directory=selected.filePaths[0];}return request('moduleScan',{directory});});
  ipcMain.handle('library:module-install',async(event,tokens)=>{if(!trusted(event)||!Array.isArray(tokens)||tokens.length>500)throw Error('Selección no autorizada.');return request('moduleInstall',{tokens});});
  const ai=new AiService({books:()=>request('metadata'),root:app.getPath('userData'),safeStorage,openExternal:url=>shell.openExternal(url),notify:status=>{if(!win.isDestroyed())win.webContents.send('library:ai-state',status);}}),prepared=new Map();
  const {PersonalAi}=require('./lib/personal-ai.cjs'),personalAi=new PersonalAi({books:()=>request('metadata'),root:app.getPath('userData'),safeStorage,policy:()=>request('personalAiPolicy'),openExternal:url=>shell.openExternal(url)});
  const actionContext=require('./shared/ai-context.js').create({call:request});
  const bridgeContract=require('./platform/bridge-contract.js'),imageCore=require('./shared/ai-image.js'),imagePrompts=require('./shared/ai-image-prompts.js');
  let aiEpoch=0;
  ipcMain.handle('library:capabilities',event=>{if(!trusted(event))throw Error('Origen no autorizado.');return {version:1,platform:'desktop',storage:'sqlite',nativeVerified:false,operations:Object.fromEntries(Object.keys(bridgeContract.operations).map(name=>[name,{available:bridgeContract.preloadNames.includes(name)}]))};});
  ipcMain.handle('library:ai-image',async(event,data)=>{
    if(!trusted(event))throw Error('Origen no autorizado.');
    try{
      imageCore.validate(data);
      const check=async()=>{if((await request('privacyStatus')).locked)throw new imageCore.ImageError('LOCKED','Abre tu cuaderno antes de generar un fondo.');if(personalAi.busy)throw new imageCore.ImageError('CONFLICT','Espera a que termine la consulta anterior.');};
      // Con Gemini guardado en modo personal, el fondo sale de esa clave; si no, de OpenRouter.
      const conGemini=data.provider==='gemini-api'||data.provider===undefined&&await personalAi.geminiReady();
      await check();const value=conGemini?await personalAi.image(data,{beforeSend:async()=>{if((await request('privacyStatus')).locked)throw new imageCore.ImageError('LOCKED','Abre tu cuaderno antes de generar un fondo.');}}):await ai.image(data,{beforeSend:check});await check();return {ok:true,value};
    }catch(error){return {ok:false,error:error instanceof imageCore.ImageError?{code:error.code,message:error.message}:{code:'UNAVAILABLE',message:'No se pudo generar el fondo. Puedes usar una foto o un fondo local.'}};}
  });
  for(const [operation,mode] of [['ai-image-ideas','ideas'],['ai-image-prompt','prompt']])ipcMain.handle('library:'+operation,async(event,data)=>{
    if(!trusted(event))throw Error('Origen no autorizado.');
    try{
      const input=imagePrompts.request(data,mode),at=aiEpoch;
      const check=async()=>{if(at!==aiEpoch)throw new bridgeContract.BridgeError('CANCELLED','La idea se canceló.');if((await request('privacyStatus')).locked)throw new bridgeContract.BridgeError('LOCKED','Abre tu cuaderno antes de consultar.');};
      await check();const gemini=data.provider==='gemini-api'||data.provider===undefined&&await personalAi.geminiReady();
      if(gemini&&!input.model){const models=await personalAi.models();input.model=models.find(m=>/flash.*lite|flash-lite/.test(m.id))?.id||models.find(m=>/flash/.test(m.id))?.id;if(!input.model)throw new bridgeContract.BridgeError('UNAVAILABLE','No hay un modelo de texto disponible.');}
      if(!gemini&&!input.model)input.model='openrouter/free';
      await check();const response=gemini?await personalAi.ask({...input,provider:'gemini-api'}):await ai.ask(input);await check();
      return {ok:true,value:imagePrompts.result(response,mode)};
    }catch(e){return {ok:false,error:e instanceof bridgeContract.BridgeError||e instanceof imageCore.ImageError?{code:e.code,message:e.message}:{code:'UNAVAILABLE',message:'No se pudo preparar la idea. Puedes escribirla o usar un fondo local.'}};}
  });
  app.on('before-quit',()=>{ai.stop();personalAi.stop();});
  const {YoutubeService}=require('./lib/youtube-service.cjs'),youtube=new YoutubeService({root:app.getPath('userData'),safeStorage,mode:()=>personalAi.mode()});
  for(const [name,action] of [['status','status'],['key','store'],['remove-key','remove'],['search','search']])ipcMain.handle('library:youtube-'+name,(event,data)=>{if(!trusted(event))throw Error('Origen no autorizado.');return youtube[action](data);});
  ipcMain.handle('library:youtube-external',(event,query)=>{if(!trusted(event))throw Error('Origen no autorizado.');return shell.openExternal(youtube.external(query));});
  ipcMain.handle('library:youtube-cloud',event=>{if(!trusted(event))throw Error('Origen no autorizado.');return shell.openExternal('https://console.cloud.google.com/apis/library/youtube.googleapis.com');});
  ipcMain.handle('library:ai-personal-status',async event=>{if(!trusted(event))throw Error('Origen no autorizado.');personalAi.cache=null;return personalAi.status();});
  ipcMain.handle('library:ai-personal-enable',(event,value)=>{if(!trusted(event))throw Error('Origen no autorizado.');return personalAi.setEnabled(value);});
  ipcMain.handle('library:ai-personal-login',(event,provider)=>{if(!trusted(event))throw Error('Origen no autorizado.');return personalAi.login(provider);});
  ipcMain.handle('library:ai-gemini-key',(event,key)=>{if(!trusted(event))throw Error('Origen no autorizado.');return key===null?personalAi.removeKey():personalAi.storeKey(key);});
  ipcMain.handle('library:ai-gemini-models',event=>{if(!trusted(event))throw Error('Origen no autorizado.');return personalAi.models();});

  for(const [name,action] of [['status','status'],['connect','connect'],['disconnect','disconnect'],['models','listModels']])ipcMain.handle('library:ai-'+name,event=>{if(!trusted(event))throw new Error('Origen no autorizado.');return ai[action]();});
  ipcMain.handle('library:ai-prepare',async(event,data)=>{
    if(!trusted(event)||!data||JSON.stringify(data).length>15000)throw new Error('Consulta no válida.');
    if((await request('privacyStatus')).locked)throw Error('Abre tu cuaderno para consultar tu estudio.');
    const context=data.action!==undefined?await actionContext.prepare(data):await request(data.series?'aiSeriesContext':'aiContext',data),preview=data.action!==undefined?actions.prepare(data,context):aiCore.prepare({task:data.task,question:data.question,context,study:data.study===true,history:data.history||'',allowLiving:data.allowLiving===true}),id=crypto.randomBytes(24).toString('hex');
    preview.prompt=require('./shared/ai-citations.js').prompt(preview.prompt);
    if(prepared.size>=5)prepared.delete(prepared.keys().next().value);prepared.set(id,{...preview,context,createdAt:Date.now(),module:data.module});
    return {id,...preview,notices:context.notices};
  });
  const getPrepared=id=>{const item=prepared.get(id);if(!item||Date.now()-item.createdAt>30*60*1000)throw new Error('Prepara de nuevo la consulta.');return item;};
  ipcMain.handle('library:ai-ask',async(event,data)=>{
    if(!trusted(event)||!data)throw new Error('Origen no autorizado.');if((await request('privacyStatus')).locked)throw Error('Abre tu cuaderno para consultar tu estudio.');const item=getPrepared(data.id);if(item.action)await actionContext.verify(item.context.sources);else await request('verifyAiSources',item.sources);if(data.action!==undefined&&data.action!==item.action)throw Error('La acción cambió. Prepara otra vez la consulta.');const provider=data.provider||'openrouter';const onProgress=text=>{if(!win.isDestroyed()&&typeof text==='string')win.webContents.send('library:ai-progress',{id:data.id,text:text.slice(0,30000)});};const response=provider==='openrouter'?await ai.ask({prompt:item.prompt,model:data.model,allowData:data.allowData,paid:data.paid,study:item.study,action:item.action,onProgress}):await personalAi.ask({provider,prompt:item.prompt,model:data.model||'',study:item.study,action:item.action,onProgress});
    if(item.action){if((await request('privacyStatus')).locked)throw Error('Abre tu cuaderno.');await actionContext.verify(item.context.sources);return {...response,...actions.result(response,item.context)};}
    const citations=[];for(const ref of response.citations){try{const result=await request('chapter',{module:item.module||'rv1909',book:ref.book,chapter:ref.chapter}),verse=result.verses.find(v=>v.verse===ref.verse);if(verse)citations.push({...ref,title:result.title,text:verse.text,module:item.module||'rv1909',revision:result.revision});}catch{}}
    if(response.keywords){const actual=new Set(item.context.sources.filter(s=>s.kind==='bible').flatMap(s=>s.text.match(/[HG]\d{1,5}/g)||[]));const verified=[];for(const k of response.keywords.filter(k=>actual.has(k.code))){try{const found=await request('dictionary',{group:'strong-es',query:k.code});if(found.entries.some(e=>e.title===k.code))verified.push(k);}catch{}}response.keywords=verified;}const chat=require('./app/study-chat-core.js');return {...response,...(item.study?chat.result(response,item.allowLiving):{}),citations,sources:item.sources,allowLiving:item.allowLiving};
  });
  ipcMain.handle('library:ai-text-copy',(event,text)=>{if(!trusted(event)||typeof text!=='string'||text.length>50000)throw Error('Texto no válido.');clipboard.writeText(text);return true;});
  ipcMain.handle('library:ai-cancel',event=>{if(!trusted(event))throw Error('Origen no autorizado.');aiEpoch++;ai.controller?.abort();personalAi.stop();return true;});
  ipcMain.handle('library:ai-copy',async(event,{id,provider})=>{
    if(!trusted(event))throw new Error('Origen no autorizado.');if((await request('privacyStatus')).locked)throw Error('Abre tu cuaderno para consultar tu estudio.');const item=getPrepared(id);await request('verifyAiSources',item.sources);const url=provider?aiCore.external(provider,item.prompt):null;clipboard.writeText(item.prompt);if(url)await shell.openExternal(url);return {copied:true,opened:!!url};
  });
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
  for(const action of ['privacyStatus','unlock','lock','setPin','disablePin','exportBackup','restoreBackup'])ipcMain.handle('library:private-'+action,(event,data)=>{if(!trusted(event))throw new Error('Origen no autorizado.');if(JSON.stringify(data??null).length>12_000_000)throw new Error('Copia demasiado grande.');return request(action,data);});
  for(const action of ['bootstrap','save','catalog','metadata','chapter','search','comments','dictionary','connections','compare','studySources','graphicsChapter','graphicsChronology','graphicsPeople','graphicsGenealogy'])ipcMain.handle('library:data-'+action,(event,data)=>{if(!trusted(event))throw new Error('Origen no autorizado.');if(JSON.stringify(data??null).length>12_000_000)throw new Error('Datos demasiado grandes.');return request(action,data);});
  app.on('will-quit',()=>worker.terminate());
  for(const [name,action] of [['state','getState'],['check','check'],['download','download'],['install','install']])ipcMain.handle('library:update-'+name,event=>{if(!trusted(event))throw new Error('Origen no autorizado.');return updates[action]();});
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
  if(channel.enabled&&!hiddenTest&&!testProfile){const first=setTimeout(()=>updates.check(),10000),interval=setInterval(()=>updates.check(),6*60*60*1000);first.unref();interval.unref();app.on('before-quit',()=>{clearTimeout(first);clearInterval(interval);});}
});
app.on('window-all-closed', () => app.quit());
