(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('../bridge-contract.js'),require('../../shared/transfer.js'),require('../../shared/sha256-stream.js'));
  else root.LibraryAndroidTransfer=factory(root.LibraryBridgeContract,root.LibraryTransfer,root.LibrarySha256Stream);
})(typeof globalThis!=='undefined'?globalThis:this,function(contract,transfer,hash){
  'use strict';
  const fail=(code,message)=>{throw new contract.BridgeError(code,message);};
  function createFiles(fs){
    const path=p=>{
      if(typeof p!=='string'||p.length>500||p.startsWith('/')||p.includes('\\')||p.split('/').some(n=>!n||n==='.'||n==='..'||/[\u0000-\u001f:]/.test(n)))fail('VALIDATION','Ruta interna no válida.');
      return p;
    };
    const options=p=>({directory:'DATA',path:path(p)});
    const error=e=>{
      if(e instanceof contract.BridgeError)throw e;
      if(/ENOSPC|no space|disk full/i.test(String(e?.code)+' '+String(e?.message)))fail('QUOTA','No hay espacio suficiente para el traspaso y el respaldo.');
      fail('STORAGE','No se pudo acceder a los archivos locales del traspaso.');
    };
    const guarded=fn=>async(...args)=>{try{return await fn(...args);}catch(e){error(e);}};
    const fromBase64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
    const stat=guarded(async p=>fs.stat(options(p)));
    const exists=async p=>{
      try{await fs.stat(options(p));return true;}catch(e){
        // Never mistake a permission/I/O failure for a missing old library.
        if(['OS-PLUG-FILE-0008','ENOENT'].includes(e?.code)||/does not exist|not found|no such file/i.test(String(e?.message)))return false;
        error(e);
      }
    };
    const files={
      stat,exists,
      list:guarded(async p=>(await fs.readdir(options(p))).files.map(f=>({name:f.name,type:f.type}))),
      mkdir:guarded(async p=>{if(await exists(p)){if((await stat(p)).type!=='directory')fail('STORAGE','Se necesita una carpeta local.');return;}await fs.mkdir({...options(p),recursive:true});}),
      remove:guarded(async p=>{const info=await fs.stat(options(p));if(info.type==='directory')await fs.rmdir({...options(p),recursive:true});else await fs.deleteFile(options(p));}),
      rename:guarded(async(from,to)=>fs.rename({directory:'DATA',from:path(from),to:path(to)})),
      copy:guarded(async(from,to)=>fs.copy({directory:'DATA',from:path(from),to:path(to)})),
      readText:guarded(async(p,max)=>{
        const info=await fs.stat(options(p));if(info.type!=='file'||info.size>max)fail('CORRUPT','El manifiesto supera el tamaño permitido.');
        const result=await fs.readFile({...options(p),encoding:'utf8'});
        if(typeof result.data!=='string'||result.data.length>max)fail('CORRUPT','Manifiesto no válido.');return result.data;
      }),
      writeAtomic:guarded(async(p,text)=>{
        const temporary=path(p)+'.tmp';
        await fs.writeFile({...options(temporary),data:text,encoding:'utf8',recursive:true});
        await fs.rename({directory:'DATA',from:temporary,to:path(p)});
      }),
      sha256:guarded(async(p,max)=>{
        const hasher=hash.create();let bytes=0;
        return await new Promise((resolve,reject)=>{
          let done=false;const stop=e=>{if(!done){done=true;reject(e);}};
          // API 8.1.4: an empty chunk marks EOF; the returned ID is not completion.
          fs.readFileInChunks({...options(p),chunkSize:262144},(chunk,err)=>{
            if(done)return;if(err){stop(err);return;}
            try{
              if(!chunk||chunk.data===''){done=true;if(bytes!==max)reject(new contract.BridgeError('CORRUPT','La copia de archivos está incompleta.'));else resolve(hasher.hex());return;}
              if(typeof chunk.data!=='string')fail('CORRUPT','Bloque de archivo no válido.');
              const data=fromBase64(chunk.data);bytes+=data.length;
              if(bytes>max)fail('CORRUPT','El archivo cambió durante la verificación.');hasher.update(data);
            }catch(e){stop(e);}
          }).catch(stop);
        });
      })
    };
    return Object.freeze(files);
  }
  function create({filesystem,sqlite,books,repository}={}){
    if(!filesystem||!sqlite||typeof filesystem.readFileInChunks!=='function')fail('UNAVAILABLE','El traspaso requiere archivos nativos y SQLite.');
    filesystem=repository?.mapFilesystem?repository.mapFilesystem(filesystem):filesystem;
    const files=createFiles(filesystem);
    const openDatabase=async relative=>{
      const {uri}=await filesystem.getUri({directory:'DATA',path:relative});
      const databasePath=decodeURIComponent(uri.replace(/^file:\/\//,''));
      let created=false,opened=false;
      const close=async()=>{
        try{if(opened)await sqlite.close({database:databasePath,readonly:true});}
        finally{if(created)await sqlite.closeNCConnection({databasePath});}
      };
      try{
        await sqlite.createNCConnection({databasePath,version:1});created=true;
        await sqlite.open({database:databasePath,readonly:true});opened=true;
        return {query:async(statement,values=[])=>(await sqlite.query({database:databasePath,statement,values,readonly:true})).values||[],close};
      }catch{await close();fail('CORRUPT','No se pudo abrir la copia temporal de SQLite.');}
    };
    return transfer.create({files,openDatabase,books,repository});
  }
  return Object.freeze({create,createFiles});
});
