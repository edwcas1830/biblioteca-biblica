(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('../bridge-contract.js'),require('../../shared/personal-model.js'),require('../../shared/references.js'));
  else root.LibraryAndroidStore=factory(root.LibraryBridgeContract,root.LibraryPersonalModel,root.LibraryReferences);
})(typeof globalThis!=='undefined'?globalThis:this,function(contract,models,refs){
  'use strict';
  const {BridgeError}=contract,SCHEMA=3,MAX_RECORD=32000000;
  const required={meta:['key','value'],annotations:['reference','note','highlight'],plans:['id','header'],plan_days:['id','plan_id','ordinal','entry','completed']};
  const fail=(code,message)=>{throw new BridgeError(code,message);};
  const normalize=e=>e instanceof BridgeError?e:new BridgeError(/ENOSPC|SQLITE_FULL|disk(?: is)? full|no space/i.test(String(e?.code)+' '+String(e?.message))?'QUOTA':'STORAGE','No se pudo acceder a SQLite. La biblioteca se conserva; libera espacio o vuelve a abrir la aplicación.');
  const json=value=>{try{if(typeof value!=='string'||value.length>MAX_RECORD)throw Error();return JSON.parse(value);}catch{fail('CORRUPT','Hay datos guardados que necesitan recuperación. No se reemplazarán.');}};
  class PersonalStore{
    constructor({sqlite,books,database='biblioteca-personal',backupDatabase='biblioteca-respaldos'}={}){
      if(!sqlite||!['createConnection','open','close','closeConnection','query','execute','run','executeSet','beginTransaction','commitTransaction','rollbackTransaction'].every(k=>typeof sqlite[k]==='function'))fail('UNAVAILABLE','Falta inicializar el plugin SQLite nativo.');
      if(!/^[a-z0-9-]{1,80}$/.test(database)||!/^[a-z0-9-]{1,80}$/.test(backupDatabase)||database===backupDatabase)fail('VALIDATION','Nombre de biblioteca SQLite no válido.');
      this.sqlite=sqlite;this.database=database;this.backupDatabase=backupDatabase;this.model=models.create({books});this.queue=Promise.resolve();this.opening=null;this.connections=new Map();this.closed=false;this.observedRevision=null;this.paused=false;this.writeBlocked=false;this.generation=0;
    }
    options(database=this.database){return {database,readonly:false};}
    async query(statement,values=[],database=this.database){return (await this.sqlite.query({...this.options(database),statement,values})).values||[];}
    execute(statements,database=this.database){return this.sqlite.execute({...this.options(database),statements,transaction:false});}
    run(statement,values=[],database=this.database){return this.sqlite.run({...this.options(database),statement,values,transaction:false,returnMode:'no'});}
    begin(){return this.sqlite.beginTransaction(this.options());}
    commitTransaction(){return this.sqlite.commitTransaction(this.options());}
    rollback(){return this.sqlite.rollbackTransaction(this.options());}
    async batch(set){for(let i=0;i<set.length;i+=100)await this.sqlite.executeSet({...this.options(),set:set.slice(i,i+100),transaction:false,returnMode:'no'});}
    serial(fn,{maintenance=false}={}){const work=this.queue.catch(()=>{}).then(async()=>{if(this.closed)fail('STORAGE','La biblioteca está cerrada. Abre una sesión nueva.');if(this.paused&&!maintenance)fail('LOCKED','Reinicia para recuperar el traspaso antes de abrir la biblioteca.');try{return await fn();}catch(e){throw normalize(e);}});this.queue=work;return work;}
    guardWrite(generation){if(this.writeBlocked||generation!==this.generation)fail('CONFLICT','Se instaló otra biblioteca. Recarga antes de guardar.');}
    async connect(database){
      if(this.connections.has(database))return;
      let created=false;
      try{await this.sqlite.createConnection({database,version:1,encrypted:false,mode:'no-encryption',readonly:false});created=true;await this.sqlite.open(this.options(database));this.connections.set(database,true);}
      catch(e){if(created){try{await this.sqlite.close(this.options(database));}finally{await this.sqlite.closeConnection(this.options(database));}}throw e;}
    }
    async release(database){if(!this.connections.has(database))return;try{await this.sqlite.close(this.options(database));}finally{await this.sqlite.closeConnection(this.options(database));this.connections.delete(database);}}
    async structure(){
      const rows=await this.query("SELECT name,type,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'");
      if(!rows.length)return false;
      if(rows.some(r=>!['table','index'].includes(r.type)||r.type==='table'&&(!Object.hasOwn(required,r.name)||/\bVIRTUAL\b/i.test(r.sql)))||rows.filter(r=>r.type==='table').length!==4)fail('CORRUPT','El esquema SQLite no es compatible. No se reemplazará.');
      for(const [table,columns]of Object.entries(required)){
        if((await this.query('PRAGMA table_info('+table+')')).map(r=>r.name).join(',')!==columns.join(','))fail('CORRUPT','La estructura de la biblioteca necesita recuperación.');
        const count=(await this.query('SELECT count(*) n FROM '+table))[0]?.n;
        if(!Number.isSafeInteger(count)||count>{meta:21,annotations:35000,plans:100,plan_days:400000}[table])fail('CORRUPT','La biblioteca supera los límites admitidos.');
      }
      const integrity=await this.query('PRAGMA integrity_check');if(integrity.length!==1||Object.values(integrity[0])[0]!=='ok'||(await this.query('PRAGMA foreign_key_check')).length)fail('CORRUPT','La biblioteca SQLite necesita recuperación.');
      return true;
    }
    open(){
      if(this.closed)return Promise.reject(new BridgeError('STORAGE','La biblioteca está cerrada.'));
      if(this.opening)return this.opening;
      if(this.connections.has(this.database))return Promise.resolve(this);
      this.opening=(async()=>{
        try{
          await this.connect(this.database);
          if(!await this.structure()){
            await this.begin();
            try{await this.execute('CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE annotations(reference TEXT PRIMARY KEY,note TEXT,highlight TEXT); CREATE TABLE plans(id TEXT PRIMARY KEY,header TEXT NOT NULL); CREATE TABLE plan_days(id TEXT PRIMARY KEY,plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,ordinal INTEGER NOT NULL,entry TEXT NOT NULL,completed INTEGER NOT NULL,UNIQUE(plan_id,ordinal));');await this.run("INSERT INTO meta VALUES('schema','3')");await this.commitTransaction();}
            catch(e){await this.rollback();throw e;}
          }
          // Validate existing/future/vault data before changing any setting or exposing persistence.
          await this.record();await this.query('PRAGMA foreign_keys=ON');await this.query('PRAGMA secure_delete=ON');
          const mode=await this.query('PRAGMA journal_mode=DELETE');if(String(Object.values(mode[0]||{})[0]).toLowerCase()!=='delete')fail('STORAGE','No se pudo consolidar el diario de SQLite.');
          return this;
        }catch(e){await this.release(this.database);throw normalize(e);}
      })().finally(()=>{this.opening=null;});return this.opening;
    }
    async record(){
      const meta=new Map((await this.query('SELECT key,value FROM meta')).map(r=>[r.key,r.value]));
      if(meta.get('schema')!==String(SCHEMA)||[...meta.keys()].some(k=>!['schema','state','android-revision','private-vault','pin-attempts'].includes(k)))fail('CORRUPT','La versión guardada no es compatible. No se reemplazará.');
      if(meta.has('private-vault'))fail('LOCKED','Esta biblioteca tiene un PIN. Se conserva cifrada; falta habilitar su apertura en Android.');
      const rev=meta.get('android-revision');if(rev!==undefined&&(!/^[1-9]\d*$/.test(rev)||!Number.isSafeInteger(Number(rev))))fail('CORRUPT','La revisión SQLite no es válida.');
      if(!meta.has('state')){if(meta.size!==1||(await this.query('SELECT count(*) n FROM annotations'))[0].n||(await this.query('SELECT count(*) n FROM plans'))[0].n||(await this.query('SELECT count(*) n FROM plan_days'))[0].n)fail('CORRUPT','La biblioteca está incompleta. No se reemplazará.');return null;}
      let size=meta.get('state').length;
      const annotations=await this.query('SELECT reference,note,highlight FROM annotations');size+=annotations.reduce((n,r)=>n+r.reference.length+(r.note?.length||0)+(r.highlight?.length||0),0);
      const plans=[];
      for(const p of await this.query('SELECT id,header FROM plans ORDER BY rowid')){
        const header=json(p.header);if(header?.id!==p.id)fail('CORRUPT','El identificador del plan no coincide.');size+=p.header.length;
        const rows=await this.query('SELECT id,ordinal,entry,completed FROM plan_days WHERE plan_id=? ORDER BY ordinal',[p.id]);
        const days=rows.map((r,i)=>{
          size+=r.id.length+r.entry.length;if(size>MAX_RECORD||r.ordinal!==i||![0,1].includes(r.completed))fail('CORRUPT','El orden o contenido de los días necesita recuperación.');
          let entry=json(r.entry);if(entry&&!Array.isArray(entry)&&Object.keys(entry).length&&Object.keys(entry).every(k=>/^\d+$/.test(k)))entry=Object.keys(entry).sort((a,b)=>Number(a)-Number(b)).map(k=>entry[k]);
          return {id:r.id,entry,completed:r.completed===1};
        });plans.push({header,days});
      }
      if(size>MAX_RECORD||plans.reduce((n,p)=>n+p.days.length,0)!==(await this.query('SELECT count(*) n FROM plan_days'))[0].n)fail('CORRUPT','La biblioteca está incompleta o supera su límite.');
      const result={schema:SCHEMA,state:json(meta.get('state')),annotations,plans,revision:rev===undefined?1:Number(rev)};this.model.decode(result);return result;
    }
    async readConsistent(){await this.open();await this.begin();try{const value=await this.record();await this.commitTransaction();return value;}catch(e){await this.rollback();throw e;}}
    readRecord(){return this.serial(()=>this.readConsistent());}
    load(){return this.serial(async()=>{const record=await this.readConsistent();this.observedRevision=record?.revision||0;return this.model.decode(record);});}
    checkRevision(record){if(this.observedRevision!==null&&this.observedRevision!==(record?.revision||0))fail('CONFLICT','La biblioteca cambió en otra sesión. Recarga antes de guardar.');}
    async openBackups(){
      if(this.connections.has(this.backupDatabase))return;
      await this.connect(this.backupDatabase);
      try{
        const rows=await this.query("SELECT name,type FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'",[],this.backupDatabase);
        if(!rows.length)await this.execute('CREATE TABLE backups(id TEXT PRIMARY KEY,kind TEXT NOT NULL,payload TEXT NOT NULL,at TEXT NOT NULL);',this.backupDatabase);
        else if(rows.some(r=>r.type!=='index'&&(r.type!=='table'||r.name!=='backups'))||(await this.query('PRAGMA table_info(backups)',[],this.backupDatabase)).map(r=>r.name).join(',')!=='id,kind,payload,at')fail('CORRUPT','El almacén de respaldos necesita recuperación.');
      }catch(e){await this.release(this.backupDatabase);throw e;}
    }
    async retain(id,kind,payload){await this.openBackups();await this.run('INSERT OR IGNORE INTO backups VALUES(?,?,?,?)',[id,kind,payload,new Date().toISOString()],this.backupDatabase);return id;}
    async commit(prepared,previous,{backup=false,fail:simulateFailure=false}={}){
      const revision=previous?.revision||0;if(revision>=Number.MAX_SAFE_INTEGER)fail('CORRUPT','La revisión de la biblioteca necesita recuperación.');
      await this.begin();
      try{
        const current=await this.record();if((current?.revision||0)!==revision)fail('CONFLICT','La biblioteca cambió en otra sesión. Recarga antes de guardar.');
        // The durable prior snapshot must succeed before modifying the active library.
        if(backup&&current){const payload=JSON.stringify(current);await this.retain('antes-de-restaurar-'+revision+'-'+(await refs.digest(payload)).slice(0,16)+'.json','snapshot',payload);}
        await this.execute('DELETE FROM annotations; DELETE FROM plan_days; DELETE FROM plans;');
        await this.run("INSERT OR REPLACE INTO meta VALUES('state',?)",[JSON.stringify(prepared.state)]);
        await this.batch(prepared.annotations.map(a=>({statement:'INSERT INTO annotations VALUES(?,?,?)',values:[a.reference,a.note,a.highlight]})));
        for(const p of prepared.plans){await this.run('INSERT INTO plans VALUES(?,?)',[p.header.id,JSON.stringify(p.header)]);await this.batch(p.days.map((d,i)=>({statement:'INSERT INTO plan_days VALUES(?,?,?,?,?)',values:[d.id,p.header.id,i,JSON.stringify(d.entry),Number(d.completed)]})));}
        await this.run("INSERT OR REPLACE INTO meta VALUES('android-revision',?)",[String(revision+1)]);
        const record={...prepared,revision:revision+1},result=this.model.decode(record);
        if(simulateFailure)fail('STORAGE','Fallo de transacción simulado.');
        await this.commitTransaction();this.observedRevision=revision+1;return result;
      }catch(e){await this.rollback();throw e;}
    }
    bootstrap({legacy=null,initial,legacyValid=true},options={}){
      const snapshot=structuredClone(initial);
      return this.serial(async()=>{
        const previous=await this.readConsistent();if(previous){this.observedRevision=previous.revision;this.writeBlocked=false;return {state:this.model.decode(previous),migrated:false};}
        if(!legacyValid)fail('CORRUPT','La copia anterior necesita recuperación. No se reemplazará.');
        let state=snapshot,backup=null;
        if(legacy!==null){if(typeof legacy!=='string'||legacy.length>12000000)fail('VALIDATION','Copia anterior no válida.');backup=await this.retain('legacy-v1-'+(await refs.digest(legacy)).slice(0,16)+'.json','legacy',legacy);try{state=JSON.parse(legacy);}catch{fail('CORRUPT','La copia anterior no se puede leer. Se conservó para recuperación.');}}
        const prepared=await this.model.encode(state);return {state:await this.commit(prepared,null,options),migrated:legacy!==null,backup};
      });
    }
    write(input,options={}){const snapshot=structuredClone(input),generation=this.generation;return this.serial(async()=>{this.guardWrite(generation);const previous=await this.readConsistent();if(!previous||this.observedRevision===null)fail('STORAGE','Abre la biblioteca antes de guardar.');this.checkRevision(previous);return this.commit(await this.model.encode(snapshot,this.model.decode(previous)),previous,options);});}
    exportBackup(){return this.serial(async()=>this.model.decode(await this.readConsistent()));}
    restoreBackup({state,privateVault},options={}){const snapshot=structuredClone(state),generation=this.generation;return this.serial(async()=>{this.guardWrite(generation);if(privateVault||snapshot?.privateVault||snapshot?.privacyEnabled||snapshot?.privateLocked)fail('UNAVAILABLE','Conserva esta copia cifrada: falta habilitar el PIN compatible. No se importaron datos.');const previous=await this.readConsistent();this.checkRevision(previous);return this.commit(await this.model.encode(snapshot,this.model.decode(previous)),previous,{...options,backup:true});});}
    privacyStatus(){return this.serial(async()=>{await this.readConsistent();return {enabled:false,locked:false,retryAt:0};});}
    listBackups(){return this.serial(async()=>{await this.openBackups();return this.query('SELECT id,kind,at FROM backups ORDER BY rowid',[],this.backupDatabase);});}
    backup(id){return this.serial(async()=>{await this.openBackups();const row=(await this.query('SELECT kind,payload FROM backups WHERE id=?',[id],this.backupDatabase))[0];if(!row)fail('NOT_FOUND','No se encontró ese respaldo.');return row.kind==='legacy'?row.payload:this.model.decode(json(row.payload));});}
    close(){if(this.closed)return Promise.resolve();if(this.closing)return this.closing;this.closing=this.serial(async()=>{await this.opening;for(const database of [...this.connections.keys()])await this.release(database);this.closed=true;},{maintenance:true}).finally(()=>{this.closing=null;});return this.closing;}
  }
  return Object.freeze({PersonalStore});
});
