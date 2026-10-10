'use strict';
// Real Chromium IndexedDB without the app preload, native plugins, real profile or external network.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
async function browserWorker(){
  const {app,BrowserWindow}=require('electron'),http=require('node:http');
  const profile=process.argv[process.argv.indexOf('--test-profile')+1];
  if(!profile||!path.basename(profile).startsWith('biblia-web-test-')||!path.resolve(profile).startsWith(path.resolve(os.tmpdir())+path.sep))throw Error('Se requiere un perfil temporal de prueba.');
  app.setPath('userData',profile);await app.whenReady();
  const root=path.resolve(__dirname,'..'),allowed=new Set(['/tests/browser/android-store.html','/tests/browser/android-store.js','/app/prayer-core.js','/app/guide-core.js','/app/study-chat-core.js','/platform/bridge-contract.js','/shared/references.js','/shared/personal-model.js','/shared/sha256-stream.js','/shared/transfer.js','/platform/android/transfer.js','/platform/web/personal-store.js','/platform/web/library.js','/platform/web/bridge.js']);
  for(const file of ['/app/bible-data.js','/app/plan-core.js','/app/graphics-core.js','/shared/rtf.js','/shared/library.js','/shared/study-resources.js','/shared/private-vault.js','/platform/web/resources.js','/platform/web/modules.js','/platform/web/documents.js','/platform/android/private-vault.js','/platform/android/personal-store.js','/platform/android/repository.js','/platform/android/services.js'])allowed.add(file);
  for(const file of ['/app/ai-core.js','/shared/ai-context.js','/platform/ai/openrouter.js','/platform/ai/service.js'])allowed.add(file);
  // Only the known public bundled resources, never profiles/modules or arbitrary disk paths.
  for(const directory of ['free-package','openbible','atlas','natural-earth','bibledata','theographic'])for(const file of fs.readdirSync(path.join(root,'app/data',directory)))if(/^[a-z0-9-]+\.json(?:\.gz)?$/.test(file))allowed.add('/app/data/'+directory+'/'+file);
  const server=http.createServer((req,res)=>{
    if(req.method!=='GET'||!allowed.has(req.url)){res.writeHead(404);res.end();return;}
    res.writeHead(200,{'Content-Type':req.url.endsWith('.gz')?'application/gzip':req.url.endsWith('.json')?'application/json':req.url.endsWith('.html')?'text/html; charset=utf-8':'text/javascript; charset=utf-8','Content-Security-Policy':"default-src 'none'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'"});res.end(fs.readFileSync(path.join(root,req.url)));
  });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const win=new BrowserWindow({show:false,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}});
  const timer=setTimeout(()=>{console.error('Tiempo agotado en prueba web');app.exit(1);},55000);
  try{
    const url='http://127.0.0.1:'+server.address().port+'/tests/browser/android-store.html';
    await win.loadURL(url);const first=await win.webContents.executeJavaScript('window.testStorePhase1()');
    await win.loadURL(url);const second=await win.webContents.executeJavaScript('window.testStorePhase2()');
    console.log(JSON.stringify({platform:'Chromium web',nativeTested:false,passed:first.passed+second.passed,phases:[first,second]},null,2));
    clearTimeout(timer);win.destroy();server.close();app.exit(0);
  }catch(error){clearTimeout(timer);console.error(error.stack);win.destroy();server.close();app.exit(1);}
}
if(process.versions.electron){browserWorker().catch(error=>{console.error(error);require('electron').app.exit(1);});}
else{
  const {spawn}=require('node:child_process'),profile=fs.mkdtempSync(path.join(os.tmpdir(),'biblia-web-test-'));
  const child=spawn(require('electron'),[__filename,'--test-profile',profile],{windowsHide:true,stdio:'inherit'});
  child.on('error',error=>{console.error(error);process.exitCode=1;});
  child.on('close',code=>{
    const resolved=path.resolve(profile),temporaryRoot=path.resolve(os.tmpdir())+path.sep;
    // Verify the exact generated target stays inside temp before recursive cleanup.
    if(resolved.startsWith(temporaryRoot)&&path.basename(resolved).startsWith('biblia-web-test-'))fs.rmSync(resolved,{recursive:true,force:true,maxRetries:8,retryDelay:100});
    process.exitCode=code||0;
  });
}
