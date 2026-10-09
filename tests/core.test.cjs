const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const core=require('../app/core.js');
const sandbox={window:{}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','app','bible-data.js'),'utf8'),sandbox);
const books=sandbox.window.BIBLE.books;
test('El texto offline contiene el canon completo y versículos esperados',()=>{
  assert.equal(books.length,66);
  assert.equal(books.reduce((n,b)=>n+b.chapters.length,0),1189);
  assert.equal(books.reduce((n,b)=>n+b.chapters.reduce((s,c)=>s+c.length,0),0),31102);
  assert.match(books[18].chapters[22][0],/mi pastor/);
  assert.match(books[42].chapters[2][15],/amó Dios al mundo/);
});
test('Los planes cubren cada capítulo exactamente una vez',()=>{
  for(const [scope,days,count] of [['all',365,1189],['nt',90,260],['salmos',30,150]]) {
    const plan=core.createPlan(books,scope,days),refs=plan.entries.flat().map(p=>p.book+':'+p.chapter);
    assert.equal(refs.length,count);assert.equal(new Set(refs).size,count);assert.ok(plan.entries.every(day=>day.length>0));
    assert.equal(refs[0],scope==='all'?'0:1':scope==='nt'?'39:1':'18:1');
    assert.equal(refs.at(-1),scope==='salmos'?'18:150':'65:22');
  }
});
test('Los minutos se distribuyen y los pasajes existen en todos los temas',()=>{
  for(const topic of Object.keys(core.topics))for(const minutes of [5,15,60]) {
    const dev=core.createDevotional({topic,minutes,days:90,purpose:'Mi intención'},books);
    assert.equal(dev.entries.length,90);
    const segments=[...dev.entries[0].body.matchAll(/· (\d+) min/g)].map(m=>Number(m[1]));
    assert.equal(segments.reduce((n,x)=>n+x,0),minutes);assert.ok(segments.every(x=>x>0));
    assert.ok(dev.entries.every(e=>books[e.book].chapters[e.chapter-1]));
    assert.match(dev.origin,/plantilla local/);
  }
});
test('La importación conserva el texto y rechaza referencias y archivos inválidos',()=>{
  const text='Mi devocional\n<script>no debe ejecutarse</script>';
  assert.equal(core.importDevotional('Mi lectura.txt',text,books).entries[0].body,text);
  const data={title:'Mi plan',entries:[{title:'Primer día',body:'Reflexión',book:18,chapter:23}]};
  assert.equal(core.importDevotional('plan.json',JSON.stringify(data),books).entries[0].chapter,23);
  assert.throws(()=>core.importDevotional('plan.json',JSON.stringify({...data,entries:[{body:'Texto',book:99,chapter:1}]}),books));
  assert.throws(()=>core.importDevotional('vacío.txt',' ',books));
  assert.throws(()=>core.importDevotional('archivo.pdf','Texto',books));
  assert.throws(()=>core.importDevotional('inválido.json','{}',books));
});
test('Los parámetros fuera de rango no generan planes ni devocionales',()=>{
  assert.throws(()=>core.createPlan(books,'nt',261));
  assert.throws(()=>core.createPlan(books,'all',0));
  assert.throws(()=>core.createPlan(books,'desconocido',10));
  assert.throws(()=>core.createDevotional({topic:'paz',minutes:4,days:7},books));
  assert.throws(()=>core.createDevotional({topic:'paz',minutes:15,days:91},books));
  assert.throws(()=>core.createDevotional({topic:'paz',minutes:15,days:2.5},books));
});
