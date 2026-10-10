'use strict';
// Serve only original CC0 fixtures and packaged public scripts. No app preload or network.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
async function run(){
  const {app,BrowserWindow}=require('electron'),http=require('node:http'),fixtures=require('../tests/document-fixtures.cjs');
  const profile=process.argv[process.argv.indexOf('--test-profile')+1];
  if(!profile||!path.basename(profile).startsWith('biblia-pdf-test-')||!path.resolve(profile).startsWith(path.resolve(os.tmpdir())+path.sep))throw Error('Perfil temporal requerido.');
  app.setPath('userData',profile);await app.whenReady();const root=path.resolve(__dirname,'..');
  const bytes=fixtures.pdf(),tooMany=fixtures.pdf(false,301);
  const documents=new Map([['/fixtures/original.pdf',bytes],['/fixtures/indice.pdf',fixtures.indexedPdf()],['/fixtures/escaneado.pdf',fixtures.pdf(true)],['/fixtures/corrupto.pdf',Buffer.from('not a PDF')],['/fixtures/exceso-paginas.pdf',tooMany],['/fixtures/original.docx',await fixtures.docx()]]);
  const files=new Map(['/tests/browser/android-documents.html','/tests/browser/android-documents.js','/app/bible-data.js','/app/plan-core.js','/app/content-core.js','/app/plan-documents.js','/app/vendor/jszip.min.js','/platform/bridge-contract.js','/platform/web/documents.js','/platform/web/pdf-worker.mjs','/shared/pdf-document.js'].map(p=>[p,path.join(root,p)]));
  const vendor=path.join(root,'app/vendor/pdfjs');
  function addVendor(directory,relative='') {for(const file of fs.readdirSync(directory,{withFileTypes:true})){const r=relative+file.name;if(file.isDirectory())addVendor(path.join(directory,file.name),r+'/');else files.set('/vendor/pdfjs/'+r,path.join(directory,file.name));}}addVendor(vendor);
  const requests=[],denied=[];
  const server=http.createServer((req,res)=>{
    if(req.method!=='GET'||!files.has(req.url)&&!documents.has(req.url)){denied.push(req.url);res.writeHead(404);res.end();return;}
    requests.push(req.url);const p=req.url;
    res.writeHead(200,{'Content-Type':p.endsWith('.html')?'text/html; charset=utf-8':/\.(js|mjs)$/.test(p)?'text/javascript; charset=utf-8':p.endsWith('.wasm')?'application/wasm':'application/octet-stream','Content-Security-Policy':"default-src 'none'; script-src 'self'; worker-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'"});
    res.end(documents.get(p)||fs.readFileSync(files.get(p)));
  });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const win=new BrowserWindow({show:false,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}}),origin='http://127.0.0.1:'+server.address().port;
  win.webContents.session.webRequest.onBeforeRequest((details,callback)=>callback({cancel:!details.url.startsWith(origin+'/')}));
  const timer=setTimeout(()=>{console.error('Prueba PDF agotada');app.exit(1);},55000);
  try{
    await win.loadURL(origin+'/tests/browser/android-documents.html');const result=await win.webContents.executeJavaScript('window.testDocuments()');
    if(!requests.includes('/platform/web/pdf-worker.mjs')||!requests.includes('/vendor/pdfjs/pdf.worker.mjs')||denied.length)throw Error('Recursos Worker incompletos: '+JSON.stringify(denied));
    console.log(JSON.stringify({platform:'Chromium Worker',nativeTested:false,...result,workerRequests:requests.filter(p=>p.includes('worker.mjs')).length},null,2));
    clearTimeout(timer);win.destroy();server.close();app.exit(0);
  }catch(e){clearTimeout(timer);console.error(e.stack);win.destroy();server.close();app.exit(1);}
}
if(process.versions.electron)run().catch(e=>{console.error(e);require('electron').app.exit(1);});
else{
  const {spawn}=require('node:child_process'),profile=fs.mkdtempSync(path.join(os.tmpdir(),'biblia-pdf-test-'));
  const child=spawn(require('electron'),[__filename,'--test-profile',profile],{windowsHide:true,stdio:'inherit'});
  child.on('error',e=>{console.error(e);process.exitCode=1;});child.on('close',code=>{
    const resolved=path.resolve(profile);if(resolved.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(resolved).startsWith('biblia-pdf-test-'))fs.rmSync(resolved,{recursive:true,force:true,maxRetries:8,retryDelay:100});process.exitCode=code||0;
  });
}
