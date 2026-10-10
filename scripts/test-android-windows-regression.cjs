'use strict';
// Existing Windows 48-view matrix with synthetic auxiliary modules only.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{spawn}=require('node:child_process'),{DatabaseSync}=require('node:sqlite');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'biblia-android-windows-')),appRoot=path.resolve(__dirname,'..'),dir=path.join(root,'modulos','fixtures');
fs.mkdirSync(dir,{recursive:true});const modulos=[];
function moduleFixture(id,tipo,rol,sql){
  const archivo=id+'.'+{comentario:'cmtx',diccionario:'dctx'}[tipo],file=path.join(dir,archivo),db=new DatabaseSync(file);db.exec(sql);db.close();
  const data=fs.readFileSync(file);modulos.push({id,tipo,rol,archivo,titulo:'Fixture sintética '+id,bytes:data.length,sha256:crypto.createHash('sha256').update(data).digest('hex'),publico:true,iaPermitida:false,licencia:'Texto sintético creado para pruebas; no es un módulo de Edward.'});
}
moduleFixture('drae-1','diccionario','diccionario',"CREATE TABLE Dictionary(Topic TEXT,Definition TEXT); INSERT INTO Dictionary VALUES('padre','Entrada sintética para comprobar la disposición de paneles y el estado de lectura.');");
moduleFixture('fixture-comment','comentario','comentario',"CREATE TABLE Verses(Book INT,ChapterBegin INT,ChapterEnd INT,VerseBegin INT,VerseEnd INT,Comments TEXT); INSERT INTO Verses VALUES(43,3,3,1,36,'Comentario sintético de prueba. El contenido sirve para verificar paneles, tamaños y desplazamiento. No es una obra importada.');");
fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify({paquete:'fixtures',modulos}));
const {PersonalStore}=require('../lib/personal-store.cjs'),store=new PersonalStore(root);
store.bootstrap(null,{version:1,position:{book:42,chapter:3,verse:16},notes:{'42:3:16':'Nota sintética'},highlights:{},devResponses:{},planNotes:{},prayers:[],prayerDrafts:{},guideResponses:{},aiStudies:[],devotionals:[],plans:[{id:'plan-123',scope:'custom',title:'Plan sintético',days:1189,entries:Array.from({length:1189},(_,i)=>({title:'Día '+(i+1),sourceText:'Lectura sintética',readings:[{book:42,chapter:3}]})),completed:Array.from({length:329},(_,i)=>i)}],font:20,night:false});store.close();
const output=path.resolve(process.argv[2]||path.join(appRoot,'..','mesa','android-windows-regression'));
const child=spawn(process.execPath,[path.join(__dirname,'smoke-windows.cjs'),'--exe',require('electron'),'--project',appRoot,'--profile',root,'--output',output,'--phase','views'],{windowsHide:true,stdio:'inherit'});
child.on('error',error=>{console.error(error);process.exitCode=1;});
child.on('close',code=>{
  const resolved=path.resolve(root);
  if(resolved.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(resolved).startsWith('biblia-android-windows-'))fs.rmSync(resolved,{recursive:true,force:true,maxRetries:8,retryDelay:100});
  process.exitCode=code||0;
});
