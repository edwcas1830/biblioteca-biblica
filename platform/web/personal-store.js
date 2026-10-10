(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('../bridge-contract.js'),require('../../shared/personal-model.js'),require('../../shared/references.js'));
  else root.LibraryWebStore=factory(root.LibraryBridgeContract,root.LibraryPersonalModel,root.LibraryReferences);
})(typeof globalThis!=='undefined'?globalThis:this,function(contract,models,refs){
  'use strict';
  const {BridgeError}=contract;
  const copy=value=>structuredClone(value);
  function databaseError(error){
    if(error instanceof BridgeError)return error;
    if(error?.name==='QuotaExceededError')return new BridgeError('QUOTA','No hay espacio para guardar. Exporta una copia antes de liberar espacio.');
    if(error?.name==='VersionError')return new BridgeError('CORRUPT','La biblioteca pertenece a una versión más nueva. No se reemplazará.');
    return new BridgeError('STORAGE','No se pudo acceder al almacenamiento de este navegador. No se reemplazará la biblioteca.');
  }
  class PersonalStore{
    constructor({indexedDB=globalThis.indexedDB,dbName='biblioteca-preview-v1',books}={}){
      if(!indexedDB)throw new BridgeError('UNAVAILABLE','Este navegador no admite el guardado local requerido.');
      if(typeof dbName!=='string'||!dbName.trim())throw new BridgeError('VALIDATION','Nombre de biblioteca no válido.');
      this.indexedDB=indexedDB;this.dbName=dbName;this.model=models.create({books});this.queue=Promise.resolve();this.db=null;this.opening=null;this.closed=false;this.observedRevision=null;
    }
    open(){
      if(this.closed)return Promise.reject(new BridgeError('STORAGE','La biblioteca está cerrada. Abre una sesión nueva.'));
      if(this.db)return Promise.resolve(this.db);if(this.opening)return this.opening;
      this.opening=new Promise((resolve,reject)=>{
        let blocked=false;const request=this.indexedDB.open(this.dbName,1);
        request.onupgradeneeded=()=>{const db=request.result;db.createObjectStore('records',{keyPath:'key'});db.createObjectStore('backups',{keyPath:'id'});};
        request.onblocked=()=>{blocked=true;reject(new BridgeError('STORAGE','Cierra las otras pestañas de esta biblioteca e inténtalo otra vez.'));};
        request.onerror=()=>reject(databaseError(request.error));
        request.onsuccess=()=>{
          const db=request.result;if(blocked||this.closed){db.close();return;}
          db.onversionchange=()=>{db.close();this.db=null;this.closed=true;};
          if(!db.objectStoreNames.contains('records')||!db.objectStoreNames.contains('backups')){db.close();reject(new BridgeError('CORRUPT','La base guardada no tiene el formato esperado.'));return;}
          this.db=db;resolve(db);
        };
      }).finally(()=>{this.opening=null;});return this.opening;
    }
    async transaction(stores,mode,work){
      const db=await this.open();return new Promise((resolve,reject)=>{
        let result,failure,tx;
        try{tx=db.transaction(stores,mode);tx.oncomplete=()=>resolve(result);tx.onerror=()=>{};tx.onabort=()=>reject(failure||databaseError(tx.error));
          const abort=error=>{failure=databaseError(error);try{tx.abort();}catch{reject(failure);}};
          work(tx,value=>{result=value;},abort);
        }catch(error){try{tx?.abort();}catch{}reject(databaseError(error));}
      });
    }
    async readRecord(){return this.transaction(['records'],'readonly',(tx,result,abort)=>{const request=tx.objectStore('records').get('personal');request.onsuccess=()=>{const record=request.result?.value??null;if(record&&(!Number.isSafeInteger(record.revision)||record.revision<1)){abort(new BridgeError('CORRUPT','La revisión guardada no es válida. No se reemplazará.'));return;}result(record);};});}
    async load(){const record=await this.readRecord(),state=this.model.decode(record);this.observedRevision=record?.revision||0;return state;}
    checkRevision(record){if(this.observedRevision!==null&&(record?.revision||0)!==this.observedRevision)throw new BridgeError('CONFLICT','La biblioteca cambió en otra pestaña. Recarga antes de guardar.');}
    serialized(work){const next=this.queue.then(work);this.queue=next.catch(()=>{});return next;}
    async retainLegacy(raw){
      const id='legacy-v1-'+(await refs.digest(raw)).slice(0,16)+'.json';
      await this.transaction(['backups'],'readwrite',tx=>{const store=tx.objectStore('backups'),r=store.get(id);r.onsuccess=()=>{if(!r.result)store.put({id,kind:'legacy',raw,at:new Date().toISOString()});};});return id;
    }
    async commit(prepared,previous,{backup=false,fail=false}={}){
      const revision=previous?.revision||0,record={...prepared,revision:revision+1};
      const saved=await this.transaction(backup?['records','backups']:['records'],'readwrite',(tx,result,abort)=>{
        const store=tx.objectStore('records'),request=store.get('personal');
        request.onsuccess=()=>{
          try{
            const actual=request.result?.value??null;
            if(actual&&actual.schema!==models.SCHEMA)throw new BridgeError('CORRUPT','El esquema de la biblioteca cambió. No se reemplazará.');
            if((actual?.revision||0)!==revision)throw new BridgeError('CONFLICT','La biblioteca cambió en otra pestaña. Recarga antes de guardar.');
            if(backup&&actual){const id='antes-de-restaurar-'+revision+'.json';tx.objectStore('backups').put({id,kind:'snapshot',record:actual,at:new Date().toISOString()});}
            store.put({key:'personal',value:record});
            // Test seam is available only on the store, never on window.libraryDesktop.
            if(fail)throw new BridgeError('STORAGE','Fallo de transacción simulado.');
            result(this.model.decode(record));
          }catch(error){abort(error);}
        };
      });this.observedRevision=record.revision;return saved;
    }
    bootstrap({legacy=null,initial,legacyValid=true},options={}){
      const snapshot=copy(initial);
      return this.serialized(async()=>{
        const previous=await this.readRecord();if(previous){const state=this.model.decode(previous);this.observedRevision=previous.revision;return {state,migrated:false};}
        if(!legacyValid)throw new BridgeError('CORRUPT','La copia anterior necesita recuperación. No se reemplazará.');
        let state=snapshot,backup=null;
        if(legacy!==null){if(typeof legacy!=='string'||legacy.length>12000000)throw new BridgeError('VALIDATION','Copia anterior no válida.');backup=await this.retainLegacy(legacy);try{state=JSON.parse(legacy);}catch{throw new BridgeError('CORRUPT','La copia anterior no se puede leer. Se conservó para recuperación.');}}
        const prepared=await this.model.encode(state);return {state:await this.commit(prepared,null,options),migrated:legacy!==null,backup};
      });
    }
    write(input,options={}){
      const snapshot=copy(input);
      return this.serialized(async()=>{const previous=await this.readRecord();if(!previous||this.observedRevision===null)throw new BridgeError('STORAGE','Abre la biblioteca antes de guardar.');this.checkRevision(previous);const prepared=await this.model.encode(snapshot,this.model.decode(previous));return this.commit(prepared,previous,options);});
    }
    exportBackup(){return this.serialized(async()=>this.model.decode(await this.readRecord()));}
    restoreBackup({state,privateVault},options={}){
      const snapshot=copy(state);
      return this.serialized(async()=>{
        if(privateVault||snapshot.privateVault||snapshot.privacyEnabled||snapshot.privateLocked)throw new BridgeError('UNAVAILABLE','Conserva esta copia cifrada: el PIN se habilitará con la bóveda compatible. No se importaron datos.');
        const previous=await this.readRecord();if(previous)this.model.decode(previous);this.checkRevision(previous);
        const prepared=await this.model.encode(snapshot,this.model.decode(previous));return this.commit(prepared,previous,{...options,backup:true});
      });
    }
    listBackups(){return this.serialized(()=>this.transaction(['backups'],'readonly',(tx,result)=>{const r=tx.objectStore('backups').getAll();r.onsuccess=()=>result(r.result);}));}
    async backup(id){return this.serialized(()=>this.transaction(['backups'],'readonly',(tx,result,abort)=>{const r=tx.objectStore('backups').get(id);r.onsuccess=()=>{if(!r.result){abort(new BridgeError('NOT_FOUND','No se encontró ese respaldo.'));return;}result(r.result.kind==='legacy'?r.result.raw:this.model.decode(r.result.record));};}));}
    async close(){await this.queue;this.closed=true;this.db?.close();this.db=null;}
  }
  return Object.freeze({PersonalStore});
});
