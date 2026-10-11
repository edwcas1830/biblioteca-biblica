'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const actions=require('../shared/study-actions.js'),model=require('../shared/study-model.js');
function fixture(){
  const rev='a'.repeat(64),reads=[],modules=[{id:'rv1909',tipo:'biblia',iaPermitida:true,sha256:rev,titulo:'Fixture',licencia:'CC0'},{id:'comment',tipo:'comentario',iaPermitida:false,sha256:rev},{id:'step-greek',tipo:'diccionario',iaPermitida:true,sha256:rev,licencia:'CC BY 4.0'}],resources=[{id:'openbible-crossrefs',sha256:rev,license:'CC BY 4.0',author:'Fixture'}];
  const call=async(name,input)=>{reads.push({name,input});switch(name){case 'metadata':return [{name:'Libro',chapters:[176]}];case 'catalog':return {modules};case 'chapter':return {revision:rev,verses:Array.from({length:176},(_,i)=>({verse:i+1,text:'Texto local '+(i+1),strong:i===15?['G25']:[]}))};case 'dictionary':return {entries:[{module:'step-greek',revision:rev,title:'G25',text:'Definición local'},{module:'step-greek',revision:rev,title:'G999',text:'NO INCLUIR'}]};case 'comments':throw Error('No debe leer el comentario sin permiso');case 'studySources':return resources;case 'connections':return {items:[{book:0,chapter:1,verse:28,endBook:0,endChapter:1,endVerse:30}]};default:throw Error(name);}};
  return {engine:actions.create({call}),call,reads,modules,resources,input:{action:'exegesis',book:0,chapter:1,verse:16,endVerse:18,module:'rv1909',comment:'comment',notes:'SECRETO',prayers:'SECRETO'}};
}
test('Acciones respetan rangos unidos, permisos, material automático y ausencia de notas',async()=>{
  const f=fixture(),context=await f.engine.assemble(f.input),p=actions.prepare(f.input,context);
  assert.deepEqual(context.ref,{book:0,chapter:1,verse:16,endVerse:18});assert.match(p.prompt,/Texto local 16/);assert.doesNotMatch(p.prompt,/SECRETO/);assert.equal(f.reads.some(r=>r.name==='comments'),false);assert.ok(context.notices.some(n=>n.includes('párrafo')));
  f.modules[0].iaPermitida=false;await assert.rejects(f.engine.verify(context.sources),{code:'CONFLICT'});
});
test('Originales admite únicamente Strong realmente presentes y entradas correspondientes',async()=>{
  const f=fixture(),c=await f.engine.assemble({...f.input,action:'originales'});
  assert.equal(c.sources.filter(s=>s.kind==='dictionary').length,1);assert.equal(c.sources.at(-1).strong,'G25');assert.doesNotMatch(JSON.stringify(c),/G999|NO INCLUIR/);await f.engine.verify(c.sources);
  const empty=await f.engine.assemble({...f.input,action:'originales',verse:1,endVerse:1});assert.ok(empty.notices.some(n=>n.includes('No hay Strong')));
});
test('Paralelos utiliza el identificador real del manifiesto OpenBible y revoca al cambiar',async()=>{
  const f=fixture(),c=await f.engine.assemble({...f.input,action:'paralelos'});assert.equal(c.allowedConnections.length,1);assert.equal(c.sources.find(s=>s.kind==='resource').module,'openbible-crossrefs');assert.ok(c.sources.some(s=>s.parallel&&s.verse===28&&s.endVerse===30&&s.text.includes('Texto local 28')));await f.engine.verify(c.sources);f.resources[0].sha256='b'.repeat(64);await assert.rejects(f.engine.verify(c.sources),{code:'CONFLICT'});
});
test('Capítulo incluye los 176 versículos; rango invertido y referencia fuera del canon se rechazan',async()=>{
  const f=fixture(),c=await f.engine.assemble({...f.input,scope:'chapter'});assert.match(c.sources[0].text,/176\. Texto local 176/);await assert.rejects(f.engine.assemble({...f.input,endVerse:15}),{code:'VALIDATION'});await assert.rejects(f.engine.assemble({...f.input,book:66}),{code:'VALIDATION'});
});
test('Extractos provienen de la biblioteca, no del modelo; citas sin fuente se rotulan, tres seguimientos',async()=>{
  const f=fixture(),c=await f.engine.assemble(f.input),r=actions.result({brief:'Observación [1] [99]',texto:'Texto',fuentes:[{sourceId:1,extracto:'INVENTADO'},{sourceId:99}],seguimientos:[]},c);
  assert.doesNotMatch(JSON.stringify(r),/INVENTADO/);assert.match(r.brief,/fuente no verificada/);assert.match(r.fuentes[0].extracto,/Texto local/);assert.equal(r.seguimientos.length,3);
});
test('Migración compatible: ID antiguo intacto, rango nuevo distinto y respuesta nueva conservada',()=>{
  const old={scope:'verse',book:0,chapter:1,verse:16,module:'rv1909'},a=model.anchor({...old,endVerse:18});assert.equal(model.key(old),'rv1909:verse:0:1:16');assert.equal(model.key(a),'rv1909:verse:0:1:16-18');
  const thread={id:model.key(a),anchor:a,messages:[{id:'msg-fixture',role:'assistant',text:'Resumen',action:'exegesis',texto:'Observación',interpretacion:'Hipótesis',fuentes:[{sourceId:1,extracto:'Local'}],seguimientos:['Uno','Dos','Tres']} ]};const saved=model.validate([thread])[0];assert.equal(saved.anchor.endVerse,18);assert.equal(saved.messages[0].texto,'Observación');assert.equal(saved.messages[0].fuentes[0].extracto,'Local');assert.throws(()=>model.validate([{...thread,id:model.key(old)}]));
});

test('RV1960 no envía códigos del apoyo sin permiso; revisa también la huella del apoyo autorizado',async()=>{
const f=fixture();f.modules[0].id='rv1960';f.modules.push({id:'rv1960-strong',tipo:'biblia',iaPermitida:false,sha256:'a'.repeat(64)});const input={...f.input,module:'rv1960',action:'originales'};const denied=await f.engine.assemble(input);assert.ok(!denied.sources.some(s=>s.kind==='dictionary'));assert.doesNotMatch(JSON.stringify(denied.sources),/G25/);f.modules.at(-1).iaPermitida=true;const allowed=await f.engine.assemble(input);assert.ok(allowed.sources.some(s=>s.support));await f.engine.verify(allowed.sources);f.modules.at(-1).sha256='b'.repeat(64);await assert.rejects(f.engine.verify(allowed.sources),{code:'CONFLICT'});
});
