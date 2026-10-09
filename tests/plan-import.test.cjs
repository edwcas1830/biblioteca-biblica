const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const p=require('../app/plan-core.js'),context={window:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../app/bible-data.js'),'utf8'),context);const books=context.window.BIBLE.books;
test('Interpreta libros completos, abreviaturas, capítulos y rangos de versículos',()=>{
  const parsed=p.parseReferences('Día 1 · Génesis 1-3; Sal. 23; Juan 3:16-18; 1 Corintios 13; Cantar de los Cantares 2',books);
  assert.equal(parsed.warnings.length,0);assert.equal(parsed.refs.length,7);
  assert.deepEqual(parsed.refs[4],{book:42,chapter:3,verse:16,endVerse:18});
  assert.equal(p.parseReferences('Jn 3:16-4:2',books).refs.length,2);
  assert.equal(p.parseReferences('Salmos 1, 2 y 3',books).refs.length,3);
  assert.equal(p.parseReferences('1Jn 1:1',books).refs[0].book,61);
});
test('Referencias inválidas se conservan como advertencias sin abrir un pasaje equivocado',()=>{
  for(const text of ['Juan 99','Juan 3:999','Génesis 3-1','Juan 3:18-16','Salmos 0']){
    const parsed=p.parseReferences(text,books);assert.equal(parsed.refs.length,0);assert.ok(parsed.warnings.length);
  }
});
test('Reconoce días en varias líneas y conserva instrucciones y marcas Markdown',()=>{
  const plan=p.importText('Mi plan.md','Mi recorrido\nLee con calma.\nDía 1\n~~Génesis 1-3~~\nDía 2 · Juan 3:16-18 [x]\nDía 3 · Salmos 23 [ ]',books);
  assert.equal(plan.days,3);assert.deepEqual(plan.completed,[0,1]);assert.match(plan.description,/Lee con calma/);assert.equal(plan.entries[0].readings.length,3);
});
test('Tachados parciales no completan un día y los resaltados requieren confirmación',()=>{
  const record={text:'Juan 3; Salmos 23',spans:[{text:'Juan 3',strike:true},{text:'; Salmos 23',strike:false}],checkbox:'none',dayTitle:'Día 1'};
  const plan=p.parseRecords([record],'Word.docx',books);assert.equal(plan.completed.length,0);assert.ok(plan.entries[0].warnings.length);
  const highlight={text:'Juan 3 [ ]',spans:[{text:'Juan 3',strike:false,highlight:'yellow'},{text:' [ ]',strike:false}],checkbox:'none',dayTitle:'Día 1'};
  const highlighted=p.parseRecords([highlight],'Word.docx',books);assert.equal(highlighted.completed.length,0);assert.equal(highlighted.entries[0].highlightCandidate,true);
});
test('Al actualizar conserva el avance previo y agrega el del archivo',()=>{
  const old=p.importText('Plan.txt','Día 1 · Juan 1\nDía 2 · Juan 2\nDía 3 · Juan 3',books);old.completed=[0];
  const next=p.importText('Plan.txt','Día 1 · Juan 1\nDía 2 · Juan 2 [x]\nDía 3 · Juan 3\nDía 4 · Juan 4',books);
  const merged=p.mergePlan(old,next,books);assert.equal(merged.id,old.id);assert.deepEqual(merged.completed,[0,1]);assert.equal(merged.days,4);
  assert.throws(()=>p.mergePlan(old,p.importText('Otro.txt','Día 1 · Juan 4',books),books));
});
test('El JSON personal y la exportación conservan títulos, contenido y avance',()=>{
  const plan=p.importJson('Personal.json',JSON.stringify({title:'Plan de paz',description:'Mi intención',days:[{title:'Mi lunes',reading:'Salmos 23',completed:true},{title:'Mi martes',reading:'Juan 14',completed:false}]}),books);
  const restored=p.importJson('Exportación.json',JSON.stringify(plan),books);assert.equal(restored.title,plan.title);assert.deepEqual(restored.completed,[0]);assert.equal(restored.entries[0].title,'Mi lunes');
  assert.throws(()=>p.importJson('Mal.json',JSON.stringify({title:'Mal',days:[{reading:'Juan 1',completed:'false'}]}),books));
});
