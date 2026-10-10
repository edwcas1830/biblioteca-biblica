(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('../bridge-contract.js'));
  else root.LibraryWebDocuments=factory(root.LibraryBridgeContract);
})(typeof globalThis!=='undefined'?globalThis:this,function(contract){
  'use strict';
  function create({Worker:WorkerClass=globalThis.Worker,baseUrl=globalThis.document?.baseURI,timeoutMs=120000}={}){
    const jobs=new Set();let closed=false;
    const fail=(code,message)=>new contract.BridgeError(code,message,'readPdf');
    if(typeof WorkerClass!=='function'||!baseUrl)return Object.freeze({handlers:()=>({}),close:()=>{closed=true;}});
    const base=new URL(baseUrl),url=new URL('platform/web/pdf-worker.mjs',base);
    if(!['http:','https:'].includes(base.protocol)||url.origin!==base.origin)throw fail('UNAVAILABLE','El lector PDF necesita los recursos locales de la aplicación.');
    if(!Number.isFinite(timeoutMs)||timeoutMs<1||timeoutMs>300000)throw fail('VALIDATION','Tiempo de lectura PDF no válido.');
    async function readPdf(bytes){
      if(closed)throw fail('UNAVAILABLE','El lector PDF ya está cerrado.');
      if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>10000000)throw fail('VALIDATION','El PDF debe tener hasta 10 MB.');
      if(jobs.size)throw fail('CONFLICT','Espera a que termine la lectura del PDF anterior.');
      return new Promise((resolve,reject)=>{
        let worker,timer,settled=false;
        const finish=(error,result)=>{if(settled)return;settled=true;clearTimeout(timer);worker?.terminate();jobs.delete(cancel);if(error)reject(error);else resolve(result);};
        const cancel=()=>finish(fail('CANCELLED','Se canceló la lectura del PDF.'));jobs.add(cancel);
        try{
          worker=new WorkerClass(url.href,{type:'module',name:'biblioteca-pdf-document'});
          worker.onmessage=({data})=>{
            if(data?.error){const {code,message}=data.error;finish(fail(['VALIDATION','CORRUPT','UNAVAILABLE'].includes(code)?code:'CORRUPT',typeof message==='string'?message:'No se pudo leer el PDF.'));return;}
            const result=data?.result;
            if(!result||!Array.isArray(result.records)||result.records.length>20000||!Number.isInteger(result.pages)||result.pages<1||result.pages>300||typeof result.title!=='string'||typeof result.subtitle!=='string'||!Array.isArray(result.warnings)||!result.indexTitles){finish(fail('CORRUPT','El lector no devolvió un documento válido.'));return;}
            finish(null,result);
          };
          worker.onerror=event=>{event.preventDefault?.();finish(fail('UNAVAILABLE','No se pudo iniciar el lector PDF local. Comprueba los recursos de la aplicación.'));};
          worker.onmessageerror=()=>finish(fail('CORRUPT','No se pudo recibir el contenido del PDF.'));
          timer=setTimeout(()=>finish(fail('CANCELLED','Este PDF tarda demasiado. Divide el documento y vuelve a importarlo.')),timeoutMs);
          // Transfer our copy; PDF.js can detach it without detaching the caller's file.
          const copy=new Uint8Array(bytes);worker.postMessage({type:'readPdf',bytes:copy},[copy.buffer]);
        }catch{finish(fail('UNAVAILABLE','No se pudo iniciar el lector PDF local.'));}
      });
    }
    return Object.freeze({handlers:()=>({readPdf}),close:()=>{closed=true;for(const cancel of [...jobs])cancel();}});
  }
  return Object.freeze({create});
});
