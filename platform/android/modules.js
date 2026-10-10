(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('../bridge-contract.js'),require('./transfer.js'));
  else root.LibraryAndroidModules=factory(root.LibraryBridgeContract,root.LibraryAndroidTransfer);
})(typeof globalThis!=='undefined'?globalThis:this,function(contract,transfer){
  'use strict';
  const fail=(code,message)=>{throw new contract.BridgeError(code,message);};
  function create({filesystem,sqlite}={}){
    if(!filesystem||!sqlite)fail('UNAVAILABLE','Falta inicializar los archivos y SQLite nativos.');
    const files=transfer.createFiles(filesystem),modules=new Map(),connections=new Map();let loading;
    async function snapshot(file){for(const suffix of ['-wal','-shm','-journal'])if(await files.exists(file+suffix))fail('CORRUPT','El módulo necesita una copia SQLite consolidada.');}
    async function close(){for(const db of connections.values())await db.close();connections.clear();}
    async function connection(file){
      if(connections.has(file))return connections.get(file);
      const uri=(await filesystem.getUri({directory:'DATA',path:file})).uri,database=decodeURIComponent(uri.replace(/^file:\/\//,''));let created=false,opened=false;
      const release=async()=>{try{if(opened){await sqlite.close({database,readonly:true});opened=false;}}finally{if(created){await sqlite.closeNCConnection({databasePath:database});created=false;}}};
      try{
        await sqlite.createNCConnection({databasePath:database,version:1});created=true;await sqlite.open({database,readonly:true});opened=true;
        const db={query:async(statement,values=[])=>{try{return (await sqlite.query({database,statement,values,readonly:true})).values||[];}catch{fail('CORRUPT','No se pudo leer el módulo SQLite.');}},close:release};connections.set(file,db);return db;
      }catch(e){await release();if(e instanceof contract.BridgeError)throw e;fail('CORRUPT','Formato SQLite cifrado o no compatible.');}
    }
    async function inspect(m,file){
      const db=await connection(file),table={biblia:'Bible',diccionario:'Dictionary',comentario:'Verses'}[m.tipo],required={biblia:['Book','Chapter','Verse','Scripture'],diccionario:['Topic','Definition'],comentario:['Book','ChapterBegin','ChapterEnd','VerseBegin','VerseEnd','Comments']}[m.tipo];
      const schema=await db.query("SELECT name,type,sql FROM sqlite_schema WHERE type IN ('table','view','trigger')"),target=schema.find(r=>r.name===table);
      if(!target||target.type!=='table'||/\bVIRTUAL\b/i.test(target.sql)||schema.some(r=>r.type==='trigger'))fail('CORRUPT','Esquema de módulo no admitido.');
      const columns=(await db.query('PRAGMA table_info('+table+')')).map(r=>r.name);
      if(required.some(c=>!columns.includes(c)))fail('CORRUPT','Columnas de módulo no admitidas.');
      const records=(await db.query('SELECT count(*) AS n FROM '+table))[0]?.n;
      if(!Number.isSafeInteger(records)||records<1||records>500000||m.registros!==undefined&&m.registros!==records)fail('CORRUPT','La cobertura del módulo no coincide.');
      return {records,joined:columns.includes('VerseEnd'),tables:schema.filter(r=>r.type==='table').map(r=>r.name)};
    }
    const catalog=()=>loading||(loading=(async()=>{
      const warnings=[];await close();modules.clear();
      if(!await files.exists('modulos'))return {modules:[],warnings};
      for(const directory of await files.list('modulos')){
        if(directory.type!=='directory'||!/^[a-z0-9-]{1,80}$/.test(directory.name)){warnings.push('Se omitió una carpeta de paquete no válida.');continue;}
        const root='modulos/'+directory.name;
        let pack;try{pack=JSON.parse(await files.readText(root+'/manifest.json',2000000));if(!Array.isArray(pack.modulos)||pack.modulos.length>500)throw Error();}catch{warnings.push('Un manifiesto de paquete no se pudo leer.');continue;}
        for(const m of pack.modulos){
          let file;
          try{
            if(!m||typeof m.titulo!=='string'||m.titulo.length>400||!/^[a-z0-9-]{1,80}$/.test(m.id)||!['biblia','diccionario','comentario'].includes(m.tipo)||!['version','diccionario','comentario','apoyo'].includes(m.rol)||typeof m.archivo!=='string'||!/^[-a-zA-Z0-9_()[\] .\p{L}]+\.(bblx|cmtx|dctx)$/u.test(m.archivo)||m.archivo.startsWith('.')||!/^[a-f0-9]{64}$/.test(m.sha256)||!Number.isSafeInteger(m.bytes)||m.bytes<1||m.bytes>512*1024*1024||modules.has(m.id))fail('CORRUPT','Manifiesto de módulo no válido.');
            const extension={biblia:'.bblx',diccionario:'.dctx',comentario:'.cmtx'}[m.tipo];
            if(!m.archivo.endsWith(extension)||!(m.tipo==='biblia'?['version','apoyo']: [m.tipo]).includes(m.rol))fail('CORRUPT','El tipo del módulo no coincide con su archivo o función.');
            file=root+'/'+m.archivo;await snapshot(file);const stat=await files.stat(file);
            if(stat.type!=='file'||stat.size!==m.bytes||await files.sha256(file,m.bytes)!==m.sha256)fail('CORRUPT','La huella del módulo no coincide.');
            const coverage=await inspect(m,file),personal=directory.name==='personal'&&m.publico!==true;
            const metadata={...m,registros:coverage.records,unidos:coverage.joined,paquete:pack.paquete||directory.name,personalPackage:personal,personalDefault:personal&&pack.modoPersonal===true,publico:m.publico===true,iaPermitida:m.iaPermitida===true,licencia:m.licencia||pack.uso||'Licencia no declarada: módulo personal; no redistribuir.',versificacion:m.versificacion||'Referencias e-Sword; conserva rangos de la fuente',origen:m.origen||'Paquete local instalado'};
            modules.set(m.id,{metadata,file,stat,coverage});
          }catch(e){warnings.push((typeof m?.titulo==='string'?m.titulo.slice(0,100):'Módulo')+': '+(e instanceof contract.BridgeError?e.message:'No se pudo verificar.'));if(file&&connections.has(file)){await connections.get(file).close();connections.delete(file);}}
        }
      }
      return {modules:[...modules.values()].map(v=>v.metadata),warnings};
    })().catch(e=>{loading=null;throw e;}));
    async function get(id){await catalog();const m=modules.get(id);if(!m)fail('NOT_FOUND','Este módulo local no está instalado.');await snapshot(m.file);const stat=await files.stat(m.file);if(stat.type!=='file'||stat.size!==m.stat.size||stat.mtime!==m.stat.mtime){if(stat.type!=='file'||stat.size!==m.metadata.bytes||await files.sha256(m.file,stat.size)!==m.metadata.sha256){await connections.get(m.file)?.close();connections.delete(m.file);fail('CORRUPT','El módulo cambió. Revisa sus fuentes antes de seguir.');}m.stat=stat;}return m;}
    const check=async id=>{await get(id);};
    const db=async id=>connection((await get(id)).file);
    const chapter=async(id,book,chapter)=>(await db(id)).query('SELECT * FROM Bible WHERE Book=? AND Chapter=? ORDER BY Verse',[book,chapter]);
    async function* biblePages(id){const handle=await db(id);for(let offset=0;;offset+=400){const rows=await handle.query('SELECT * FROM Bible ORDER BY Book,Chapter,Verse LIMIT 400 OFFSET ?',[offset]);if(!rows.length)break;yield rows;}}
    async function* topicPages(id){const handle=await db(id),columns=id.startsWith('step-')?'Topic,Definition':'Topic';for(let offset=0;;offset+=400){const rows=await handle.query('SELECT '+columns+' FROM Dictionary ORDER BY rowid LIMIT 400 OFFSET ?',[offset]);if(!rows.length)break;yield rows;}}
    const definitions=async(id,topic)=>(await db(id)).query('SELECT Topic,Definition FROM Dictionary WHERE Topic=? LIMIT 30',[topic]);
    async function comments(id,{book,chapter,verse,endVerse}){
      const m=await get(id),handle=await db(id),rows=[];
      if(m.coverage.tables.includes('Books'))for(const r of await handle.query('SELECT Comments FROM Books WHERE Book=?',[book]))rows.push({...r,label:'Introducción al libro'});
      if(m.coverage.tables.includes('Chapters'))for(const r of await handle.query('SELECT Comments FROM Chapters WHERE Book=? AND Chapter=?',[book,chapter]))rows.push({...r,label:'Comentario del capítulo'});
      for(const r of await handle.query('SELECT * FROM Verses WHERE Book=? AND (ChapterBegin<? OR (ChapterBegin=? AND VerseBegin<=?)) AND (ChapterEnd>? OR (ChapterEnd=? AND VerseEnd>=?))',[book,chapter,chapter,endVerse,chapter,chapter,verse]))rows.push({...r,label:r.ChapterBegin+':'+r.VerseBegin+'–'+r.ChapterEnd+':'+r.VerseEnd});return rows;
    }
    const reload=async()=>{loading=null;return catalog();};
    return Object.freeze({catalog,check,chapter,biblePages,topicPages,definitions,comments,close,reload});
  }
  return Object.freeze({create});
});
