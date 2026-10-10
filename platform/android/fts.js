(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('../bridge-contract.js'));
  else root.LibraryAndroidFts=factory(root.LibraryBridgeContract);
})(typeof globalThis!=='undefined'?globalThis:this,function(contract){
  'use strict';
  const VERSION='mobile-rtf-1';
  async function create({sqlite,database='biblioteca-indice'}={}){
    if(!sqlite||!/^[a-z0-9-]{1,80}$/.test(database))throw new contract.BridgeError('VALIDATION','Índice SQLite no válido.');
    let created=false,opened=false,queue=Promise.resolve(),closed=false;
    const options={database,readonly:false};
    const execute=statements=>sqlite.execute({...options,statements,transaction:false});
    const run=(statement,values=[])=>sqlite.run({...options,statement,values,transaction:false,returnMode:'no'});
    const query=async(statement,values=[])=>(await sqlite.query({...options,statement,values})).values||[];
    const closeNative=async()=>{try{if(opened){await sqlite.close(options);opened=false;}}finally{if(created){await sqlite.closeConnection(options);created=false;}}};
    try{
      await sqlite.createConnection({database,version:1,encrypted:false,mode:'no-encryption',readonly:false});created=true;await sqlite.open(options);opened=true;
      await execute("CREATE VIRTUAL TABLE IF NOT EXISTS verses USING fts5(module UNINDEXED,revision UNINDEXED,book UNINDEXED,chapter UNINDEXED,verse UNINDEXED,endVerse UNINDEXED,text,strong,tokenize='unicode61 remove_diacritics 2'); CREATE TABLE IF NOT EXISTS indexed(module TEXT PRIMARY KEY,revision TEXT NOT NULL); CREATE TABLE IF NOT EXISTS index_meta(key TEXT PRIMARY KEY,value TEXT);");
      await execute('CREATE TABLE IF NOT EXISTS topic_keys(module TEXT,revision TEXT,topic TEXT,folded TEXT,gloss TEXT,PRIMARY KEY(module,topic)); CREATE INDEX IF NOT EXISTS topic_lookup ON topic_keys(module,revision,folded); CREATE TABLE IF NOT EXISTS dictionary_indexed(module TEXT PRIMARY KEY,revision TEXT NOT NULL);');
      if((await query("SELECT value FROM index_meta WHERE key='parser'"))[0]?.value!==VERSION){await execute('BEGIN IMMEDIATE; DELETE FROM verses; DELETE FROM indexed; DELETE FROM topic_keys; DELETE FROM dictionary_indexed;');try{await run("INSERT OR REPLACE INTO index_meta VALUES('parser',?)",[VERSION]);await execute('COMMIT;');}catch(e){await execute('ROLLBACK;');throw e;}}
      // The probe must succeed before exposing FTS; an old WebView does not substitute a scan.
      await query("SELECT count(*) AS n FROM verses WHERE verses MATCH ?",['text:"prueba"']);
    }catch{await closeNative();throw new contract.BridgeError('UNAVAILABLE','Este SQLite no tiene un índice FTS5 disponible.');}
    function serial(fn){const next=queue.catch(()=>{}).then(()=>{if(closed)throw new contract.BridgeError('LOCKED','El índice está cerrado.');return fn();});queue=next;return next;}
    const search=({module,revision,words,mode,pages,verify})=>serial(async()=>{
      try{
        if((await query('SELECT revision FROM indexed WHERE module=?',[module]))[0]?.revision!==revision){
          await execute('BEGIN IMMEDIATE;');
          try{
            await run('DELETE FROM verses WHERE module=?',[module]);
            const statement='INSERT INTO verses(module,revision,book,chapter,verse,endVerse,text,strong) VALUES(?,?,?,?,?,?,?,?)';
            for await(const rows of pages())for(let offset=0;offset<rows.length;offset+=100){
              const set=rows.slice(offset,offset+100).map(r=>({statement,values:[module,revision,r.book,r.chapter,r.verse,r.endVerse||r.verse,r.text,r.strong]}));
              await sqlite.executeSet({...options,set,transaction:false,returnMode:'no'});
            }
            await verify();await run('INSERT OR REPLACE INTO indexed VALUES(?,?)',[module,revision]);await execute('COMMIT;');
          }catch(e){await execute('ROLLBACK;');throw e;}
        }
        const expression=words.map(w=>(mode==='strong'?'strong:':'text:')+'"'+w+'"'+(mode==='text'?'*':'')).join(' AND ');
        const count=(await query('SELECT count(*) AS n FROM verses WHERE verses MATCH ? AND module=? AND revision=?',[expression,module,revision]))[0].n;
        const results=await query('SELECT book,chapter,verse,endVerse,text FROM verses WHERE verses MATCH ? AND module=? AND revision=? ORDER BY CAST(book AS INTEGER),CAST(chapter AS INTEGER),CAST(verse AS INTEGER) LIMIT 100',[expression,module,revision]);
        await verify();return {count,results:results.map(r=>{const {endVerse,...rest}=r;return {...rest,book:Number(r.book),chapter:Number(r.chapter),verse:Number(r.verse),...(Number(endVerse)>Number(r.verse)?{endVerse:Number(endVerse)}:{})};})};
      }catch(e){if(e instanceof contract.BridgeError)throw e;throw new contract.BridgeError('STORAGE','No se pudo completar el índice de búsqueda.');}
    });
    const dictionary=({module,revision,needle,rae,pages,verify})=>serial(async()=>{
      try{
        if((await query('SELECT revision FROM dictionary_indexed WHERE module=?',[module]))[0]?.revision!==revision){
          await execute('BEGIN IMMEDIATE;');
          try{
            await run('DELETE FROM topic_keys WHERE module=?',[module]);
            let count=0;
            for await(const rows of pages()){
              count+=rows.length;if(count>500000)throw new contract.BridgeError('CORRUPT','Diccionario demasiado grande.');
              for(let offset=0;offset<rows.length;offset+=100)await sqlite.executeSet({...options,transaction:false,returnMode:'no',set:rows.slice(offset,offset+100).map(r=>({statement:'INSERT OR REPLACE INTO topic_keys VALUES(?,?,?,?,?)',values:[module,revision,r.topic,r.key,r.search]}))});
            }
            await verify();await run('INSERT OR REPLACE INTO dictionary_indexed VALUES(?,?)',[module,revision]);await execute('COMMIT;');
          }catch(e){await execute('ROLLBACK;');throw e;}
        }
        const code=/^[hg]\d+$/.test(needle),where=rae?'folded LIKE ? ESCAPE CHAR(92)':code?'folded=?':'(instr(folded,?)>0 OR instr(gloss,?)>0)',values=rae?[needle.replace(/[\\%_]/g,'\\$&')+'%']:code?[needle]:[needle,needle];
        const found=await query('SELECT topic,folded FROM topic_keys WHERE module=? AND revision=? AND '+where+' ORDER BY (folded=?) DESC,folded,topic LIMIT 300',[module,revision,...values,needle]);
        await verify();return found.map(r=>({topic:r.topic,key:r.folded,module,revision,exact:r.folded===needle}));
      }catch(e){if(e instanceof contract.BridgeError)throw e;throw new contract.BridgeError('STORAGE','No se pudo consultar el índice del diccionario.');}
    });
    const close=async()=>{await queue.catch(()=>{});closed=true;await closeNative();};
    return Object.freeze({search,dictionary,close});
  }
  return Object.freeze({create});
});
