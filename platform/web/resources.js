(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('../bridge-contract.js'),require('../../shared/sha256-stream.js'));
  else root.LibraryWebResources=factory(root.LibraryBridgeContract,root.LibrarySha256Stream);
})(typeof globalThis!=='undefined'?globalThis:this,function(contract,hash){
  'use strict';
  const routes={openbible:'crossrefs.json.gz',atlas:'data.json.gz','natural-earth':'data.json.gz',bibledata:'data.json.gz',theographic:'data.json.gz'};
  const fail=(code,message)=>{throw new contract.BridgeError(code,message);};
  async function inflate(bytes,max){
    if(typeof DecompressionStream!=='function')fail('UNAVAILABLE','Actualiza el visor web del dispositivo para abrir los recursos comprimidos.');
    const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')),reader=stream.getReader(),parts=[];let size=0;
    try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max)fail('CORRUPT','El recurso supera el tamaño permitido.');parts.push(value);}}
    catch(e){await reader.cancel().catch(()=>{});throw e;}finally{reader.releaseLock();}
    const result=new Uint8Array(size);let offset=0;for(const p of parts){result.set(p,offset);offset+=p.length;}return new TextDecoder('utf-8',{fatal:true}).decode(result);
  }
  function create({baseUrl,fetch:fetcher=globalThis.fetch,inflate:decompress=inflate}={}){
    const base=new URL(baseUrl||'data/',globalThis.document?.baseURI||'https://localhost/'),cache=new Map();
    const path=p=>{if(typeof p!=='string'||!/^[-a-z0-9/]+\.json(?:\.gz)?$/.test(p)||p.split('/').includes('..'))fail('VALIDATION','Recurso no válido.');const url=new URL(p,base);if(url.origin!==base.origin||!url.pathname.startsWith(base.pathname))fail('VALIDATION','Recurso externo no permitido.');return url.href;};
    const cached=(key,fn)=>{if(!cache.has(key))cache.set(key,fn().catch(e=>{cache.delete(key);if(e instanceof contract.BridgeError)throw e;fail('CORRUPT','No se pudo abrir un recurso local verificado.');}));return cache.get(key);};
    async function bytes(p,max){
      if(typeof fetcher!=='function')fail('UNAVAILABLE','No hay lector de recursos locales.');const response=await fetcher(path(p));if(!response.ok)fail('NOT_FOUND','Falta un recurso local de la biblioteca.');
      const length=Number(response.headers?.get('content-length'));if(length>max)fail('CORRUPT','El recurso comprimido es demasiado grande.');
      const reader=response.body?.getReader();if(!reader)fail('UNAVAILABLE','Falta lectura por bloques en el visor web.');
      const parts=[];let size=0;try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max)fail('CORRUPT','El recurso es demasiado grande.');parts.push(value);}}catch(e){await reader.cancel().catch(()=>{});throw e;}finally{reader.releaseLock();}
      const result=new Uint8Array(size);let offset=0;for(const p of parts){result.set(p,offset);offset+=p.length;}return result;
    }
    const manifest=id=>cached('manifest:'+id,async()=>{if(id!=='free-package'&&!Object.hasOwn(routes,id))fail('NOT_FOUND','Fuente de estudio no disponible.');const b=await bytes(id+'/manifest.json',500000);return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(b));});
    const file=(p,sha,max=30000000)=>cached('data:'+p+':'+sha,async()=>{if(!/^[a-f0-9]{64}$/.test(sha))fail('CORRUPT','Falta la huella del recurso.');const b=await bytes(p,10000000);if(hash.create().update(b).hex()!==sha)fail('CORRUPT','La huella del recurso no coincide.');const text=await decompress(b,max);if(text.length>max)fail('CORRUPT','El recurso supera el tamaño permitido.');return JSON.parse(text);});
    const data=async id=>{if(!Object.hasOwn(routes,id))fail('NOT_FOUND','Fuente de estudio no disponible.');const m=await manifest(id);return file(id+'/'+routes[id],m.sha256,id==='openbible'?30000000:20000000);};
    return Object.freeze({manifest,file,data});
  }
  return Object.freeze({create,inflate});
});
