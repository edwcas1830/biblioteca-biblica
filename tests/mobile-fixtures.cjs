'use strict';
const fs=require('node:fs'),fsp=fs.promises,path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{DatabaseSync}=require('node:sqlite');
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
const disposals=new Map();
const dispose=(root,fn)=>disposals.get(root).push(fn);
async function root(t){const dir=await fsp.mkdtemp(path.join(os.tmpdir(),'biblioteca-mobile-fixture-'));disposals.set(dir,[]);t.after(async()=>{for(const fn of disposals.get(dir).reverse())await fn();disposals.delete(dir);if(path.dirname(path.resolve(dir))!==path.resolve(os.tmpdir())||!path.basename(dir).startsWith('biblioteca-mobile-fixture-'))throw Error('Unsafe cleanup');await fsp.rm(dir,{recursive:true,force:true});});return dir;}
function filesystem(root,{absoluteRoot=root}={}){
  const absolute=p=>{const result=p.startsWith('file:')?require('node:url').fileURLToPath(p):path.resolve(root,p);if(result!==absoluteRoot&&!result.startsWith(absoluteRoot+path.sep))throw Error('Fixture path escaped');return result;};
  const stat=async({path:p})=>{const s=await fsp.lstat(absolute(p));return {size:s.size,type:s.isDirectory()?'directory':s.isFile()?'file':'symlink',mtime:s.mtimeMs};};
  return {
    stat,readdir:async({path:p})=>({files:await Promise.all((await fsp.readdir(absolute(p))).map(async name=>({name,...await stat({path:p+'/'+name})})))}),
    mkdir:async({path:p})=>fsp.mkdir(absolute(p),{recursive:true}),
    rmdir:async({path:p})=>fsp.rm(absolute(p),{recursive:true}),deleteFile:async({path:p})=>fsp.unlink(absolute(p)),
    readFile:async({path:p})=>({data:await fsp.readFile(absolute(p),'utf8')}),
    writeFile:async({path:p,data})=>{await fsp.mkdir(path.dirname(absolute(p)),{recursive:true});await fsp.writeFile(absolute(p),data);},
    rename:async({from,to})=>fsp.rename(absolute(from),absolute(to)),copy:async({from,to})=>fsp.copyFile(absolute(from),absolute(to)),
    getUri:async({path:p})=>({uri:require('node:url').pathToFileURL(absolute(p)).href}),
    readFileInChunks:async({path:p,chunkSize},callback)=>{queueMicrotask(async()=>{try{for await(const b of fs.createReadStream(absolute(p),{highWaterMark:chunkSize}))callback({data:b.toString('base64')});callback({data:''});}catch(e){callback(null,e);}});return 'fixture-stream';}
  };
}
function sqlite(root,{noFts=false,failInsert=false}={}){
  const definitions=new Map(),handles=new Map();let batches=0;
  function db(options){const handle=handles.get(options.database);if(!handle)throw Error('Connection is closed');return handle;}
  return {
    createConnection:async({database,readonly})=>{if(definitions.has(database))throw Error('Duplicate connection');definitions.set(database,{readonly,file:path.join(root,database+'SQLite.db')});},
    getUrl:async({database})=>{const spec=definitions.get(database);if(!spec)throw Error('Undefined connection');return {url:require('node:url').pathToFileURL(spec.file).href};},
    createNCConnection:async({databasePath})=>{if(definitions.has(databasePath))throw Error('Duplicate connection');definitions.set(databasePath,{readonly:true,file:databasePath});},
    open:async({database,readonly})=>{const spec=definitions.get(database);if(!spec||spec.readonly!==readonly)throw Error('Invalid connection');handles.set(database,new DatabaseSync(spec.file,{readOnly:readonly,allowExtension:false}));},
    close:async({database})=>{handles.get(database)?.close();handles.delete(database);},
    closeConnection:async({database})=>definitions.delete(database),closeNCConnection:async({databasePath})=>definitions.delete(databasePath),
    query:async options=>({values:db(options).prepare(options.statement).all(...options.values||[])}),
    beginTransaction:async options=>{db(options).exec('BEGIN IMMEDIATE;');return {changes:{changes:0}};},
    commitTransaction:async options=>{db(options).exec('COMMIT;');return {changes:{changes:0}};},
    rollbackTransaction:async options=>{db(options).exec('ROLLBACK;');return {changes:{changes:0}};},
    execute:async options=>{if(noFts&&/fts5/.test(options.statements))throw Error('No FTS5');db(options).exec(options.statements);return {changes:{changes:0}};},
    run:async options=>{const result=db(options).prepare(options.statement).run(...options.values||[]);return {changes:{changes:Number(result.changes)}};},
    executeSet:async options=>{batches++;if(failInsert)throw Error('Synthetic write failure');for(const row of options.set)db(options).prepare(row.statement).run(...row.values);return {changes:{changes:options.set.length}};},
    opened:()=>handles.size,registered:()=>definitions.size,batches:()=>batches
  };
}
async function addModule(root,pack,id,tipo,rol,sql,{strong=false}={}){
  const directory=path.join(root,'modulos/personal');await fsp.mkdir(directory,{recursive:true});const archivo=id+'.'+{biblia:'bblx',diccionario:'dctx',comentario:'cmtx'}[tipo],file=path.join(directory,archivo),db=new DatabaseSync(file);db.exec(sql);db.close();const b=await fsp.readFile(file);
  const meta={id,tipo,rol,archivo,titulo:'Fixture '+id,licencia:'CC0 · texto sintético',bytes:b.length,sha256:digest(b),strong};pack.modulos.push(meta);return meta;
}
module.exports={root,dispose,filesystem,sqlite,addModule,digest};
