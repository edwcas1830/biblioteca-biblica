(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('../bridge-contract.js'),require('../../shared/references.js'));
  else root.LibraryAndroidRepositoryFactory=factory(root.LibraryBridgeContract,root.LibraryReferences);
})(typeof globalThis!=='undefined'?globalThis:this,function(contract,refs){
  'use strict';
  const fail=(code,message)=>{throw new contract.BridgeError(code,message);};
  const logical='biblioteca-personal.sqlite';
  // Capacitor SQLite uses the app's databases directory, not Directory.DATA/files.
  // Resolve its actual URI without opening/creating an empty database before recovery.
  async function create({store,filesystem,closeReader=async()=>{},reloadReader=async()=>{}}={}){
    if(!store||!filesystem||typeof store.sqlite.getUrl!=='function')fail('UNAVAILABLE','Falta la ubicación de SQLite para recuperar el traspaso.');
    let uri;
    await store.sqlite.createConnection({database:store.database,version:1,encrypted:false,mode:'no-encryption',readonly:false});
    try{uri=(await store.sqlite.getUrl(store.options())).url;}
    finally{await store.sqlite.closeConnection(store.options());}
    let parsed;try{parsed=new URL(uri);}catch{fail('STORAGE','No se pudo localizar la biblioteca SQLite.');}
    if(parsed.protocol!=='file:'||parsed.host||decodeURIComponent(parsed.pathname).split('/').at(-1)!==store.database+'SQLite.db')fail('STORAGE','La ubicación de SQLite no es compatible.');
    let exclusive=false;
    const active=p=>p===logical?uri:['-wal','-shm','-journal'].includes(p.slice(logical.length))&&p.startsWith(logical)?uri+p.slice(logical.length):null;
    function mapFilesystem(fs){
      if(fs!==filesystem)fail('VALIDATION','El traspaso debe usar los mismos archivos de la biblioteca.');
      const options=o=>{const path=active(o.path);if(!path)return o;const {directory,...rest}=o;return {...rest,path};};
      const absolute=async p=>active(p)||(await fs.getUri({directory:'DATA',path:p})).uri;
      const proxy={};
      for(const name of ['stat','readdir','mkdir','rmdir','deleteFile','readFile','writeFile','readFileInChunks'])proxy[name]=(...args)=>fs[name](options(args[0]),...args.slice(1));
      proxy.getUri=o=>active(o.path)?Promise.resolve({uri:active(o.path)}):fs.getUri(o);
      for(const name of ['rename','copy'])proxy[name]=async o=>{
        if(!active(o.from)&&!active(o.to))return fs[name](o);
        // Android interprets file:// paths as relative if directory is supplied.
        const {directory,toDirectory,...rest}=o;
        return fs[name]({...rest,from:await absolute(o.from),to:await absolute(o.to)});
      };
      return Object.freeze(proxy);
    }
    const requireExclusive=()=>{if(!exclusive)fail('CONFLICT','La sustitución requiere una sesión exclusiva.');};
    const revision=async()=>{
      const read=async()=>refs.digest(JSON.stringify(await store.readConsistent()));
      return exclusive?read():store.serial(read);
    };
    return Object.freeze({
      mapFilesystem,revision,
      exclusive:fn=>store.serial(async()=>{if(exclusive)fail('CONFLICT','Ya hay un traspaso en curso.');exclusive=true;try{return await fn();}finally{exclusive=false;}}),
      quiesce:async()=>{
        requireExclusive();store.paused=true;
        await closeReader();await store.opening;
        for(const database of [...store.connections.keys()])await store.release(database);
      },
      activate:async({database,modules,locked})=>{
        requireExclusive();if(database!==logical||modules!=='modulos/personal')fail('VALIDATION','Destinos del traspaso no válidos.');
        if(locked)fail('UNAVAILABLE','Esta copia tiene PIN. Se conserva el respaldo; falta habilitar su apertura en Android.');
        await store.open();const record=await store.readConsistent();
        if(!record)fail('CORRUPT','La biblioteca instalada no contiene datos.');
        const catalog=await reloadReader();
        let pack;try{pack=JSON.parse((await filesystem.readFile({directory:'DATA',path:modules+'/manifest.json',encoding:'utf8'})).data);}catch{fail('CORRUPT','No se pudo cargar el catálogo instalado.');}
        if(!Array.isArray(pack.modulos)||!Array.isArray(catalog?.modules)||pack.modulos.some(m=>!catalog.modules.some(v=>v.id===m.id&&v.sha256===m.sha256)))fail('CORRUPT','Un módulo instalado no pasó la revisión del lector. Se recuperará el respaldo.');
        store.observedRevision=null;
      },
      resume:async({installed,blockWritesUntilBootstrap})=>{
        requireExclusive();
        if(!installed){await store.open();await reloadReader();}
        store.writeBlocked=blockWritesUntilBootstrap;store.generation++;store.paused=false;
      }
    });
  }
  return Object.freeze({create});
});
