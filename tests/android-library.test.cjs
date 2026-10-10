'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),fsp=fs.promises,path=require('node:path'),zlib=require('node:zlib'),vm=require('node:vm'),{DatabaseSync}=require('node:sqlite');
const helpers=require('./mobile-fixtures.cjs'),native=require('../platform/android/library.js'),web=require('../platform/web/library.js'),resourceFactory=require('../platform/web/resources.js'),modules=require('../platform/web/modules.js'),fts=require('../platform/android/fts.js');
const sandbox={window:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../app/bible-data.js'),'utf8'),sandbox);const bible=JSON.parse(JSON.stringify(sandbox.window.BIBLE));
const appData=path.join(__dirname,'../app/data');
function resources(){return resourceFactory.create({baseUrl:'https://fixture.local/data/',fetch:async url=>{const p=new URL(url).pathname.slice('/data/'.length),b=await fsp.readFile(path.join(appData,p));return new Response(b);}});}
async function fixture(t){
  const root=await helpers.root(t),pack={paquete:'personal',modoPersonal:true,modulos:[]};
  await helpers.addModule(root,pack,'rv1960','biblia','version',"CREATE TABLE Bible(Book INT,Chapter INT,Verse INT,Scripture TEXT); INSERT INTO Bible VALUES(43,3,16,'{\\cf6 Padre santo.}{\\super\\cf6 (A)}'),(43,3,17,'El corazón recibió paz.'),(1,1,1,'{\\cf6 Palabra antigua.}');");
  await helpers.addModule(root,pack,'rv1960-strong','biblia','apoyo',"CREATE TABLE Bible(Book INT,Chapter INT,Verse INT,Scripture TEXT); INSERT INTO Bible VALUES(43,3,16,'Padre {\\super G3962} santo. {\\super G40}'),(43,3,17,'Otra redacción {\\super G1}');",{strong:true});
  await helpers.addModule(root,pack,'range-comment','comentario','comentario',"CREATE TABLE Books(Book INT,Comments TEXT); CREATE TABLE Chapters(Book INT,Chapter INT,Comments TEXT); CREATE TABLE Verses(Book INT,ChapterBegin INT,ChapterEnd INT,VerseBegin INT,VerseEnd INT,Comments TEXT); INSERT INTO Books VALUES(43,'Introducción inventada'); INSERT INTO Chapters VALUES(43,3,'Nota del capítulo'); INSERT INTO Verses VALUES(43,3,4,16,2,'Comentario inventado. Salmos 23:1. <script>texto</script>');");
  await helpers.addModule(root,pack,'strong-es','diccionario','diccionario',"CREATE TABLE Dictionary(Topic TEXT,Definition TEXT); INSERT INTO Dictionary VALUES('G3962','{\\f1 ἀγαπάω} Padre <img>'),('G40','Santo inventado');");
  for(let n=1;n<=3;n++)await helpers.addModule(root,pack,'drae-'+n,'diccionario','diccionario',"CREATE TABLE Dictionary(Topic TEXT,Definition TEXT); INSERT INTO Dictionary VALUES("+(n===1?"'amorío','Prefijo'":n===2?"'ámor(1)','Exacta primera'":"'amor(2)','Exacta segunda'")+");");
  await fsp.writeFile(path.join(root,'modulos/personal/manifest.json'),JSON.stringify(pack));const sql=helpers.sqlite(root);
  const service=await native.create({bible,manifest:{iaPermitida:true},filesystem:helpers.filesystem(root),sqlite:sql,resources:resources()});helpers.dispose(root,()=>service.close());return {root,pack,sql,service,api:service.handlers()};
}
test('Shared RTF is the exact desktop parser and Windows package includes its portable dependency',()=>{assert.equal(require('../lib/rtf.cjs'),require('../shared/rtf.js'));assert.ok(require('../package.json').build.files.includes('shared/**/*.js'));});
test('Native NC factory reads real synthetic modules, preserves red only in NT and alignment prevents invented word links',async t=>{
  const {api,sql}=await fixture(t),catalog=await api.catalog();assert.ok(catalog.modules.some(m=>m.id==='onbv2008'));assert.ok(catalog.modules.some(m=>m.id==='range-comment'));assert.ok(catalog.dictionaryGroups.some(g=>g.includes('drae-3')));
  const ch=await api.chapter({module:'rv1960',book:42,chapter:3});assert.match(ch.verses[0].html,/jesus-words/);assert.match(ch.verses[0].html,/data-original="G3962"/);assert.doesNotMatch(ch.verses[0].html,/\(A\)|strong-number/);assert.equal(ch.verses[1].alignment,false);assert.doesNotMatch(ch.verses[1].html,/data-original=/);
  assert.match((await api.chapter({module:'rv1960',book:42,chapter:3,strong:true})).verses[0].html,/strong-number/);assert.doesNotMatch((await api.chapter({module:'rv1960',book:0,chapter:1})).verses[0].html,/jesus-words/);
  const entries=(await api.dictionary({group:'strong-es',query:'G3962'})).entries;assert.ok(entries[0].text.includes('ἀγαπάω'));assert.match(entries[0].html,/&lt;img&gt;/);assert.ok(sql.opened()>0);
});
test('Native FTS5 really matches accent folding, whole words, prefixes, Strong and persistent revision cache',async t=>{
  const {api,sql}=await fixture(t);assert.equal((await api.search({module:'rv1960',query:'corazon'})).count,1);assert.equal((await api.search({module:'rv1960',query:'coraz',mode:'word'})).count,0);assert.equal((await api.search({module:'rv1960',query:'coraz'})).count,1);
  const code=await api.search({module:'rv1960',query:'g03962',mode:'strong'});assert.equal(code.module,'rv1960-strong');assert.equal(code.results[0].reference,'b043:3:16');const batches=sql.batches();await api.search({module:'rv1960',query:'santo'});assert.equal(sql.batches(),batches);
});
test('Comments cover chapter-spanning ranges and dictionary merges all three RAE parts with exact hits first',async t=>{
  const {api}=await fixture(t);const at=await api.comments({module:'range-comment',book:42,chapter:3,verse:15,endVerse:16});assert.equal(at.entries.length,3);assert.match(at.entries.at(-1).html,/&lt;script&gt;/);
  assert.equal((await api.comments({module:'range-comment',book:42,chapter:4,verse:2})).entries.length,2);assert.equal((await api.comments({module:'range-comment',book:42,chapter:4,verse:3})).entries.length,1);
  const entries=(await api.dictionary({group:'drae',query:'AMOR'})).entries;assert.equal(entries.length,3);assert.equal(entries[0].exact,true);assert.equal(entries[1].exact,true);assert.equal(entries[2].title,'amorío');
});
test('Native detects modified modules and rejects a package traversal while showing valid remaining modules',async t=>{
  const {api,root,pack,service}=await fixture(t),file=path.join(root,'modulos/personal/rv1960.bblx');await api.search({module:'rv1960',query:'santo'});await service.close();
  const db=new DatabaseSync(file);db.exec("UPDATE Bible SET Scripture='Changed synthetic text'");db.close();
  const m=pack.modulos.find(m=>m.id==='rv1960');m.archivo='../rv1960.bblx';await fsp.writeFile(path.join(root,'modulos/personal/manifest.json'),JSON.stringify(pack));const sql=helpers.sqlite(root),next=await native.create({bible,filesystem:helpers.filesystem(root),sqlite:sql,resources:resources()});helpers.dispose(root,()=>next.close());
  const catalog=await next.handlers().catalog();assert.ok(catalog.warnings.some(w=>w.includes('no válido')));assert.ok(!catalog.modules.some(m=>m.id==='rv1960'));await assert.rejects(next.handlers().chapter({module:'rv1960',book:42,chapter:3}),{code:'NOT_FOUND'});
});
test('FTS failure rolls back the entire index and a missing FTS5 engine never announces success',async t=>{
  const root=await helpers.root(t),sql=helpers.sqlite(root,{failInsert:true}),index=await fts.create({sqlite:sql});
  await assert.rejects(index.search({module:'fixture',revision:'a'.repeat(64),words:['amor'],mode:'word',pages:async function*(){yield [{book:0,chapter:1,verse:1,text:'amor',strong:''}];},verify:async()=>{}}),{code:'STORAGE'});await index.close();
  const db=new DatabaseSync(path.join(root,'biblioteca-indiceSQLite.db'),{readOnly:true});assert.equal(db.prepare('SELECT count(*) n FROM verses').get().n,0);assert.equal(db.prepare('SELECT count(*) n FROM indexed').get().n,0);db.close();
  const absent=helpers.sqlite(root,{noFts:true});await assert.rejects(fts.create({sqlite:absent}),{code:'UNAVAILABLE'});assert.equal(absent.opened(),0);assert.equal(absent.registered(),0);
});
test('An active reader detects a changed module before returning a cached FTS result',async t=>{
  const {api,root}=await fixture(t);await api.search({module:'rv1960',query:'santo'});
  const file=path.join(root,'modulos/personal/rv1960.bblx'),db=new DatabaseSync(file);
  db.exec("UPDATE Bible SET Scripture='Changed synthetic text' WHERE Book=43 AND Verse=16");db.close();
  const future=new Date(Date.now()+2000);await fsp.utimes(file,future,future);
  await assert.rejects(api.search({module:'rv1960',query:'santo'}),{code:'CORRUPT'});
});
test('Web free package, comparison joined ranges, dictionary and graphics use actual open resources and SHA checks',async()=>{
  const api=web.create({bible,manifest:{iaPermitida:true},resources:resources()}),catalog=await api.catalog();assert.deepEqual(catalog.versions,['rv1909','onbv2008']);assert.ok(catalog.modules.find(m=>m.id==='step-hebrew').iaPermitida);
  const lex=(await api.dictionary({group:'step-hebrew',query:'H1'})).entries;assert.match(lex[0].text,/אָב/);assert.match(lex[0].text,/Transliteración: av/);
  const comparison=await api.compare({modules:['rv1909','onbv2008'],book:42,chapter:3,verse:16});assert.equal(comparison.rows.length,1);assert.equal(comparison.rows[0].cells.length,2);
  const chapter=await api.graphicsChapter({book:41,chapter:2});assert.ok(chapter.places.some(p=>p.name.startsWith('Belén')));assert.ok(chapter.land.features.length);
  const people=await api.graphicsPeople({query:'Abraham'}),family=await api.graphicsGenealogy({id:people.items[0].id});assert.ok(family.groups.find(g=>g.kind==='children').items.some(p=>p.name==='Isaac'));assert.equal((await api.studySources()).find(m=>m.title.includes('Personas')).license,'CC BY-SA 4.0');
  assert.ok((await api.connections({book:42,chapter:3,verse:16})).items.length);await assert.rejects(api.comments({module:'not-installed',book:42,chapter:3,verse:16}),{code:'NOT_FOUND'});
});
test('Corrupted public resource and unknown resource path fail before exposing data',async()=>{
  const r=resourceFactory.create({baseUrl:'https://fixture.local/data/',fetch:async()=>new Response('corrupted')});await assert.rejects(r.file('free-package/fixture.json.gz','a'.repeat(64)),{code:'CORRUPT'});await assert.rejects(r.data('../secret'),{code:'NOT_FOUND'});
});
