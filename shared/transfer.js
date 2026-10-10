(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('../platform/bridge-contract.js'),require('./personal-model.js'));
  else root.LibraryTransfer=factory(root.LibraryBridgeContract,root.LibraryPersonalModel);
})(typeof globalThis!=='undefined'?globalThis:this,function(contract,models){
  'use strict';
  const DB='biblioteca-personal.sqlite',MODULES='modulos/personal',JOURNAL='traspaso-journal.json';
  const limits={database:64*1024*1024,module:512*1024*1024,total:4*1024*1024*1024,manifest:2*1024*1024};
  const fail=(code,message)=>{throw new contract.BridgeError(code,message);};
  const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
  const json=(text,max)=>{try{if(typeof text!=='string'||text.length>max)throw Error();return JSON.parse(text);}catch{fail('CORRUPT','El traspaso contiene datos dañados.');}};
  const safeName=n=>typeof n==='string'&&/^[\p{L}\p{N}_()\[\] .-]{1,120}$/u.test(n)&&n.trim()===n&&!n.startsWith('.')&&!n.endsWith('.');
  const nonnegative=n=>Number.isSafeInteger(n)&&n>=0;
  const sha=h=>typeof h==='string'&&/^[a-f0-9]{64}$/.test(h);
  const id=()=>Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');
  const requiredTables={meta:['key','value'],annotations:['reference','note','highlight'],plans:['id','header'],plan_days:['id','plan_id','ordinal','entry','completed']};

  function manifest(transfer,pack,selection){
    if(!object(transfer)||transfer.formato!=='biblioteca-biblica-traspaso'||transfer.version!==1||transfer.origen!=='Windows'||!Number.isFinite(Date.parse(transfer.creado))||!object(transfer.paquete)||!object(transfer.conteos)||!Array.isArray(transfer.archivos)||transfer.archivos.length<3||transfer.archivos.length>502)fail('CORRUPT','Formato de traspaso no compatible.');
    if(!object(pack)||!Array.isArray(pack.modulos)||!pack.modulos.length||pack.modulos.length>500||typeof pack.modoPersonal!=='boolean'||String(pack.version)!==String(transfer.paquete.version)||pack.modoPersonal!==transfer.paquete.modoPersonal||pack.modulos.length!==transfer.paquete.modulos)fail('CORRUPT','El manifiesto del paquete no coincide con el traspaso.');
    const selected=new Map(selection.map(f=>[f.nombre,f])),files=new Map(),folded=new Set();let bytes=0;
    for(const f of transfer.archivos){
      if(!object(f)||!safeName(f.archivo)||folded.has(f.archivo.toLowerCase())||!['datos','modulo','manifiesto'].includes(f.tipo)||!nonnegative(f.bytes)||!f.bytes||!sha(f.sha256))fail('CORRUPT','Lista de archivos no válida.');
      if((f.tipo==='datos'&&(f.archivo!==DB||f.bytes>limits.database))||(f.tipo==='manifiesto'&&(f.archivo!=='manifest.json'||f.bytes>limits.manifest))||(f.tipo==='modulo'&&(!/\.(bblx|cmtx|dctx)$/i.test(f.archivo)||f.bytes>limits.module)))fail('CORRUPT','Archivo no permitido o demasiado grande.');
      const chosen=selected.get(f.archivo);if(!chosen||chosen.bytes!==f.bytes)fail('CORRUPT','Faltan archivos o su tamaño no coincide.');
      files.set(f.archivo,f);folded.add(f.archivo.toLowerCase());bytes+=f.bytes;
    }
    if(!files.has(DB)||!files.has('manifest.json')||files.size!==pack.modulos.length+2||selected.size!==files.size+1||!selected.has('traspaso.json')||bytes>limits.total)fail('CORRUPT','Selecciona exactamente todos los archivos de esta carpeta de traspaso.');
    const ids=new Set(),names=new Set();
    for(const m of pack.modulos){
      if(!object(m)||typeof m.id!=='string'||!/^[a-z0-9-]{1,80}$/.test(m.id)||ids.has(m.id)||!safeName(m.archivo)||names.has(m.archivo)||!['biblia','diccionario','comentario'].includes(m.tipo)||typeof m.titulo!=='string'||!m.titulo.trim()||m.titulo.length>400||!sha(m.sha256)||!nonnegative(m.bytes))fail('CORRUPT','Módulo del paquete no válido.');
      const f=files.get(m.archivo),extension={biblia:'bblx',diccionario:'dctx',comentario:'cmtx'}[m.tipo];
      if(!f||f.tipo!=='modulo'||f.id!==m.id||f.sha256!==m.sha256||f.bytes!==m.bytes||!m.archivo.toLowerCase().endsWith('.'+extension))fail('CORRUPT','Un módulo no coincide con sus dos manifiestos.');
      ids.add(m.id);names.add(m.archivo);
    }
    for(const key of ['diasPlan','diasCompletados','devocionales'])if(!nonnegative(transfer.conteos[key]))fail('CORRUPT','Conteos del traspaso no válidos.');
    return {files:[...files.values()],bytes};
  }

  // Read the original Windows schema without constructing PersonalStore or rewriting IDs.
  async function inspect(query,{books}={}){
    try{
      const integrity=await query('PRAGMA integrity_check');
      if(integrity.length!==1||Object.values(integrity[0])[0]!=='ok'||(await query('PRAGMA foreign_key_check')).length)fail('CORRUPT','La base del traspaso está dañada.');
      const schema=await query("SELECT name,type,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'");
      if(schema.some(r=>!['table','index'].includes(r.type)||r.type==='table'&&(!Object.hasOwn(requiredTables,r.name)||/\bVIRTUAL\b/i.test(r.sql)))||schema.filter(r=>r.type==='table').length!==4)fail('CORRUPT','La base tiene un esquema no compatible.');
      for(const [table,columns]of Object.entries(requiredTables)){
        const rows=await query('PRAGMA table_info('+table+')');
        if(rows.map(r=>r.name).join(',')!==columns.join(','))fail('CORRUPT','La estructura de la base no es compatible.');
        const count=(await query('SELECT count(*) AS n FROM '+table))[0]?.n;
        const max={meta:20,annotations:35000,plans:100,plan_days:400000}[table];
        if(!nonnegative(count)||count>max)fail('CORRUPT','La base supera los límites de la biblioteca.');
      }
      const meta=new Map((await query('SELECT key,value FROM meta')).map(r=>[r.key,r.value]));
      if(meta.get('schema')!=='3'||!meta.has('state')||[...meta.keys()].some(k=>!['schema','state','private-vault','pin-attempts'].includes(k)))fail('CORRUPT','La versión de la base no es compatible.');
      const state=json(meta.get('state'),12000000),vault=meta.has('private-vault')?json(meta.get('private-vault'),16001000):null;
      if(!object(state))fail('CORRUPT','El estado de lectura no es válido.');
      if(vault&&(!object(vault)||vault.v!==1||!/^[a-f0-9]{32}$/.test(vault.salt)||!/^[a-f0-9]{24}$/.test(vault.iv)||!/^[a-f0-9]{32}$/.test(vault.tag)||typeof vault.data!=='string'||vault.data.length>16000000||!vault.data.length||vault.data.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(vault.data)))fail('CORRUPT','El cuaderno con PIN no es compatible.');
      const annotations=await query('SELECT reference,note,highlight FROM annotations');
      if(vault&&(annotations.some(a=>a.note!==null)||models.create().privateFields.some(k=>state[k]!==undefined&&Object.keys(state[k]||{}).length)))fail('CORRUPT','La copia mezcla cuaderno cifrado y datos privados abiertos.');
      // Validation of public fields must never unwrap a vault or write plaintext to staging.
      delete state.privacyEnabled;delete state.privateLocked;delete state.privateVault;
      const plans=[];
      for(const p of await query('SELECT id,header FROM plans ORDER BY rowid')){
        const header=json(p.header,12000000);if(!object(header)||header.id!==p.id)fail('CORRUPT','Identificador de plan incoherente.');
        const rows=await query('SELECT id,ordinal,entry,completed FROM plan_days WHERE plan_id=? ORDER BY ordinal',[p.id]);
        const days=rows.map((r,i)=>{
          if(r.ordinal!==i||![0,1].includes(r.completed))fail('CORRUPT','Orden o progreso de días no válido.');
          let entry=json(r.entry,2000000);
          if(object(entry)&&Object.keys(entry).length&&Object.keys(entry).every(k=>/^\d+$/.test(k)))entry=Object.keys(entry).sort((a,b)=>Number(a)-Number(b)).map(k=>entry[k]);
          return {id:r.id,entry,completed:r.completed===1};
        });
        plans.push({header,days});
      }
      const total=(await query('SELECT count(*) AS n FROM plan_days'))[0].n;
      if(plans.reduce((n,p)=>n+p.days.length,0)!==total)fail('CORRUPT','Existen días sin un plan válido.');
      const model=models.create({books}),decoded=model.decode({schema:3,state,annotations,plans});
      const counts={diasPlan:total,diasCompletados:decoded.plans.reduce((n,p)=>n+p.completed.length,0),devocionales:decoded.devotionals.length,...(vault?{estadoCifrado:true}:{oraciones:decoded.prayers.length,estadoCifrado:false})};
      return {counts,pin:!!vault};
    }catch(error){if(error instanceof contract.BridgeError&&error.code==='CORRUPT')throw error;fail('CORRUPT','No se pudo validar la base del traspaso.');}
  }

  function create({files,openDatabase,books,repository,now=()=>Date.now()}={}){
    if(!files||typeof openDatabase!=='function')fail('UNAVAILABLE','Falta inicializar el lector nativo del traspaso.');
    const installable=repository&&['revision','exclusive','quiesce','activate','resume'].every(k=>typeof repository[k]==='function');
    let pending=null,busy=false;
    const remove=async path=>{if(await files.exists(path))await files.remove(path);};
    async function verified(path,entry){
      const stat=await files.stat(path);
      if(stat.type!=='file'||stat.size!==entry.bytes||await files.sha256(path,entry.bytes)!==entry.sha256)fail('CORRUPT','Una huella SHA-256 no coincide. Vuelve a copiar el traspaso.');
    }
    async function checkDatabase(path){const db=await openDatabase(path);try{return await inspect(db.query,{books});}finally{await db.close();}}
    function journalId(j){if(!object(j)||j.v!==1||!/^[a-f0-9]{32}$/.test(j.id)||typeof j.oldDatabase!=='boolean'||typeof j.oldModules!=='boolean')fail('CORRUPT','El traspaso interrumpido necesita recuperación.');return j.id;}
    async function recoverFiles(){
      if(!await files.exists(JOURNAL))return {recovered:false};
      const j=json(await files.readText(JOURNAL,4096),4096),key=journalId(j),backup='respaldos/traspaso-'+key,mark='traspaso-commit-'+key;
      if(!await files.exists(mark)){
        for(const [target,old,stored]of [[DB,j.oldDatabase,backup+'/'+DB],[MODULES,j.oldModules,backup+'/personal']]){
          if(await files.exists(stored)){await remove(target);await files.rename(stored,target);}
          else if(!old)await remove(target);
        }
      }
      await remove(JOURNAL);await remove(mark);
      return {recovered:true};
    }
    async function recover(){
      if(busy)fail('CONFLICT','Espera a que termine el traspaso.');busy=true;
      try{return await recoverFiles();}finally{busy=false;}
    }
    async function transferScan(input){
      contract.operations.transferScan.validate(input);
      if(busy)fail('CONFLICT','Espera a que termine el traspaso anterior.');busy=true;
      let candidate;
      try{
        if(await files.exists(JOURNAL))fail('LOCKED','Recupera el traspaso interrumpido antes de continuar.');
        const listed=await files.list(input.carpeta),chosen=new Set(input.archivos.map(f=>f.nombre));
        if(listed.length!==chosen.size||listed.some(f=>f.type!=='file'||!chosen.has(f.name)))fail('CORRUPT','La carpeta debe contener solo los archivos seleccionados.');
        for(const f of input.archivos){const stat=await files.stat(f.ruta);if(stat.type!=='file'||stat.size!==f.bytes)fail('CORRUPT','La copia de archivos está incompleta.');}
        const transfer=json(await files.readText(input.carpeta+'/traspaso.json',524288),524288),pack=json(await files.readText(input.carpeta+'/manifest.json',limits.manifest),limits.manifest);
        const details=manifest(transfer,pack,input.archivos),key=id();candidate='traspaso-listo/'+key;
        if(pending){await remove(pending.candidate);pending=null;}
        await files.mkdir(candidate);
        for(const entry of details.files){
          const source=input.carpeta+'/'+entry.archivo;await verified(source,entry);
          await files.copy(source,candidate+'/'+entry.archivo);await verified(candidate+'/'+entry.archivo,entry);
        }
        const actual=await checkDatabase(candidate+'/'+DB);
        for(const k of ['diasPlan','diasCompletados','devocionales'])if(actual.counts[k]!==transfer.conteos[k])fail('CORRUPT','El resumen declarado no coincide con la base.');
        if(!actual.pin&&transfer.conteos.oraciones!==undefined&&actual.counts.oraciones!==transfer.conteos.oraciones)fail('CORRUPT','El conteo de oraciones no coincide.');
        const expiresAt=now()+30*60*1000,token='transfer-'+key;
        const summary={conteos:actual.counts,modulos:pack.modulos.map(m=>({id:m.id,tipo:m.tipo,titulo:m.titulo})),modoPersonal:pack.modoPersonal,versionPaquete:String(pack.version),bytes:details.bytes,conservaPin:actual.pin};
        pending={token,candidate,entries:details.files,summary,expiresAt,revision:installable?await repository.revision():null};
        return {token,expiresAt,resumen:structuredClone(summary),requiereConfirmacion:true};
      }catch(error){if(candidate)await remove(candidate);throw error;}finally{busy=false;}
    }
    async function transferInstall(input){
      contract.operations.transferInstall.validate(input);
      if(!installable)fail('UNAVAILABLE','Inicializa el repositorio SQLite antes de instalar el traspaso.');
      if(busy)fail('CONFLICT','Espera a que termine el traspaso anterior.');
      if(!pending||pending.token!==input.token||pending.expiresAt<=now())fail('CONFLICT','Vuelve a revisar el traspaso antes de instalarlo.');
      busy=true;const p=pending;
      try{return await repository.exclusive(async()=>{
        if(await files.exists(JOURNAL))fail('LOCKED','Recupera el traspaso interrumpido antes de continuar.');
        if(await repository.revision()!==p.revision)fail('CONFLICT','La biblioteca cambió desde el resumen. Revísalo otra vez.');
        for(const entry of p.entries)await verified(p.candidate+'/'+entry.archivo,entry);
        await checkDatabase(p.candidate+'/'+DB);
        const key=p.token.slice(9),backup='respaldos/traspaso-'+key,prepared=p.candidate+'/personal',mark='traspaso-commit-'+key;
        await files.mkdir(prepared);
        for(const entry of p.entries.filter(f=>f.tipo!=='datos'))await files.rename(p.candidate+'/'+entry.archivo,prepared+'/'+entry.archivo);
        let paused=false;
        try{
          paused=true;await repository.quiesce();
          if(await files.exists(DB+'-wal')||await files.exists(DB+'-shm')||await files.exists(DB+'-journal'))fail('LOCKED','Cierra las conexiones de la biblioteca antes del traspaso.');
          const j={v:1,id:key,oldDatabase:await files.exists(DB),oldModules:await files.exists(MODULES)};
          await files.mkdir(backup);await files.mkdir('modulos');
          await files.writeAtomic(JOURNAL,JSON.stringify(j));
          if(j.oldDatabase)await files.rename(DB,backup+'/'+DB);
          if(j.oldModules)await files.rename(MODULES,backup+'/personal');
          await files.rename(p.candidate+'/'+DB,DB);await files.rename(prepared,MODULES);
          // activate MUST read the installed DB and bind the module catalog before it resolves.
          await repository.activate({database:DB,modules:MODULES,locked:p.summary.conservaPin,generation:key});
          // The old renderer must not autosave its old state over the newly imported DB.
          await repository.resume({installed:true,blockWritesUntilBootstrap:true});paused=false;
          await files.writeAtomic(mark,'committed');pending=null;
        }catch(error){
          if(await files.exists(JOURNAL)){
            // Close anything activate may have opened before restoring files.
            paused=true;
            try{await repository.quiesce();await recoverFiles();}
            catch{paused=false;pending=null;fail('LOCKED','El traspaso quedó interrumpido. Reinicia para recuperar el respaldo antes de abrir la biblioteca.');}
          }
          pending=null;throw error;
        }finally{if(paused)await repository.resume({installed:false,blockWritesUntilBootstrap:false});}
        // Housekeeping cannot turn a committed install into a reported failure. Recovery finishes it.
        try{await recoverFiles();await remove(p.candidate);}catch{ /* durable commit marker preserves success */ }
        return {instalado:true,resumen:structuredClone(p.summary),respaldo:backup,requiereRecarga:true};
      });}catch(error){pending=null;try{await remove(p.candidate);}catch{ /* staging stays app-private */ }throw error;}finally{busy=false;}
    }
    return Object.freeze({handlers:()=>({transferScan,...(installable?{transferInstall}:{})}),transferScan,transferInstall,recover});
  }
  return Object.freeze({create,inspect,manifest,limits,paths:Object.freeze({database:DB,modules:MODULES,journal:JOURNAL})});
});
