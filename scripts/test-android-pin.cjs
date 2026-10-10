'use strict';
// Hidden Chromium with a disposable profile; only generated ciphertext and local vendor scripts.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
async function run(){
  const {app,BrowserWindow}=require('electron'),http=require('node:http'),crypto=require('../lib/private-vault.cjs');
  const profile=process.argv[process.argv.indexOf('--test-profile')+1];if(!profile||!path.basename(profile).startsWith('biblia-pin-test-')||!path.resolve(profile).startsWith(path.resolve(os.tmpdir())+path.sep))throw Error('Perfil temporal requerido.');
  app.setPath('userData',profile);await app.whenReady();const root=path.resolve(__dirname,'..'),files=new Map();
  for(const p of ['/tests/browser/android-pin.html','/tests/browser/android-pin.js','/platform/bridge-contract.js','/platform/android/private-vault.js','/platform/android/vault-worker.mjs','/platform/android/vault-engine.mjs'])files.set(p,path.join(root,p));
  const vendor=path.join(root,'app/vendor/noble-hashes');for(const file of fs.readdirSync(vendor))if(file.endsWith('.js'))files.set('/vendor/noble-hashes/'+file,path.join(vendor,file));
  const denied=[],requests=[],server=http.createServer((req,res)=>{
    if(req.method!=='GET'||!files.has(req.url)){denied.push(req.url);res.writeHead(404);res.end();return;}requests.push(req.url);
    res.writeHead(200,{'Content-Type':req.url.endsWith('.html')?'text/html; charset=utf-8':'text/javascript; charset=utf-8','Content-Security-Policy':"default-src 'none'; script-src 'self'; worker-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'"});res.end(fs.readFileSync(files.get(req.url)));
  });await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
  const win=new BrowserWindow({show:false,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}});win.webContents.session.webRequest.onBeforeRequest((d,cb)=>cb({cancel:!d.url.startsWith(origin+'/')}));
  const timer=setTimeout(()=>{console.error('Prueba del candado agotada');app.exit(1);},55000);
  try{
    const key=crypto.derive('123456','11'.repeat(16)),vault=crypto.encrypt(crypto.privatePart({notes:{'18:23:1':'Texto privado inventado'}}),key,'11'.repeat(16));await win.loadURL(origin+'/tests/browser/android-pin.html');const result=await win.webContents.executeJavaScript('window.testPin('+JSON.stringify(vault)+')');
    if(crypto.decrypt(result.encrypted,key).notes['18:23:1']!=='Texto nuevo inventado')throw Error('Windows no descifra el resultado');key.fill(0);if(denied.length||!requests.includes('/vendor/noble-hashes/scrypt.js'))throw Error('Recursos locales incompletos');
    const {encrypted,...report}=result;console.log(JSON.stringify({platform:'Chromium PIN Worker',nativeTested:false,...report,windowsCompatibility:true,externalRequests:0},null,2));clearTimeout(timer);win.destroy();server.close();app.exit(0);
  }catch(e){clearTimeout(timer);console.error(e.message);win.destroy();server.close();app.exit(1);}
}
if(process.versions.electron)run().catch(e=>{console.error(e.message);require('electron').app.exit(1);});
else{
  const {spawn}=require('node:child_process'),profile=fs.mkdtempSync(path.join(os.tmpdir(),'biblia-pin-test-')),child=spawn(require('electron'),[__filename,'--test-profile',profile],{windowsHide:true,stdio:'inherit'});
  child.on('error',e=>{console.error(e.message);process.exitCode=1;});child.on('close',code=>{const p=path.resolve(profile);if(p.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(p).startsWith('biblia-pin-test-'))fs.rmSync(p,{recursive:true,force:true,maxRetries:8,retryDelay:100});process.exitCode=code||0;});
}
