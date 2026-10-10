const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const content=require('../app/content-core.js'),plan=require('../app/plan-core.js'),{readPdf}=require('../lib/pdf-document.cjs'),fixtures=require('./document-fixtures.cjs');
const sandbox={window:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../app/bible-data.js'),'utf8'),sandbox);const books=sandbox.window.BIBLE.books;
test('PDF real local conserva días, referencias, acentos y formato; un escaneado avisa sin inventar',async()=>{
  const parsed=await readPdf(new Uint8Array(fixtures.pdf()));
  assert.equal(parsed.pages,1);assert.match(parsed.records.map(r=>r.text).join('\n'),/Día 1 · Detenerse/);
  const dev=content.recordsToDevotional(parsed.records,'recorrido.pdf',books,plan);assert.equal(dev.entries.length,2);assert.equal(dev.entries[0].readings[0].book,18);assert.equal(dev.entries[1].readings[0].verse,16);
  assert.ok(parsed.records.some(r=>r.spans.some(s=>s.bold)));assert.ok(parsed.records.some(r=>r.spans.some(s=>s.italic)));
  const imported=plan.parseRecords(parsed.records,'plan.pdf',books);assert.equal(imported.days,2);assert.equal(imported.completed.length,0);
  await assert.rejects(()=>readPdf(new Uint8Array(fixtures.pdf(true))),/escaneado/);await assert.rejects(()=>readPdf(new Uint8Array([1,2,3])),/PDF|Invalid/);
});
test('Los párrafos seguros generan listas y enlaces bíblicos sin interpretar HTML ni perder énfasis',()=>{
  const value=[{kind:'list',spans:[{text:'Lee '},{text:'Juan 3:',bold:true},{text:'16',italic:true},{text:' <img src=x onerror=alert(1)>'}]}];
  const rendered=content.render(value,books,plan);assert.match(rendered,/<ul><li>/);assert.match(rendered,/data-document-ref="42:3:16:16"/);assert.match(rendered,/<strong>Juan 3:<\/strong>/);assert.match(rendered,/<em>16<\/em>/);assert.doesNotMatch(rendered,/<img/);
  const date=content.recordsToDevotional([{text:'9 de octubre de 2026',kind:'heading'},{text:'Una observación.'},{text:'10 de octubre de 2026',kind:'heading'},{text:'Una segunda observación.'}],'fechas.docx',books,plan);assert.equal(date.entries.length,2);
  assert.throws(()=>content.blocks([{spans:[{text:4}]}]),/Texto/);
});
test('Actualizar un plan leído desde SQLite conserva avance e IDs aunque cambie el orden de campos de referencia',()=>{
  const incoming=plan.importText('plan.txt','Día 1 · Juan 3:16\nDía 2 · Salmos 23',books);
  const old={...incoming,completed:[0],dayIds:['day-'+ 'a'.repeat(32),'day-'+ 'b'.repeat(32)],entries:incoming.entries.map(e=>({...e,readings:e.readings.map(({book,...r})=>({...r,book}))}))};
  const merged=plan.mergePlan(old,incoming,books);assert.deepEqual(merged.completed,[0]);assert.deepEqual(merged.dayIds,old.dayIds);
});
