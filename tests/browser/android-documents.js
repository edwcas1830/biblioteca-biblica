'use strict';
window.testDocuments=async()=>{
  const service=LibraryWebDocuments.create({baseUrl:location.origin+'/'}),adapter=LibraryBridgeContract.createBridge({platform:'web',handlers:service.handlers()});
  window.libraryDesktop=adapter.bridge;let passed=0,heartbeats=0;const checks=[];
  const assert=(v,label)=>{if(!v)throw Error(label);};
  const check=async(label,fn)=>{await fn();checks.push(label);passed++;};
  const get=async name=>new Uint8Array(await (await fetch('/fixtures/'+name)).arrayBuffer());
  const timer=setInterval(()=>heartbeats++,10);
  try{
    await check('PDF local Worker conserva bytes del lector, dos días, acentos, negrita y cursiva',async()=>{
      const bytes=await get('original.pdf'),before=bytes.slice(),parsed=await adapter.bridge.readPdf(bytes);
      assert(bytes.length===before.length&&bytes.every((v,i)=>v===before[i]),'El archivo del lector fue separado o modificado');
      assert(parsed.pages===1,'Páginas');assert(parsed.records.some(r=>r.spans.some(s=>s.bold)),'Negrita');assert(parsed.records.some(r=>r.spans.some(s=>s.italic)),'Cursiva');
      const dev=ContentCore.recordsToDevotional(parsed.records,'prueba.pdf',BIBLE.books,PlanCore,parsed),plan=PlanCore.parseRecords(parsed.records,'plan.pdf',BIBLE.books);
      assert(dev.entries.length===2&&plan.days===2,'Días');assert(dev.entries[1].readings[0].verse===16,'Referencia Juan');
    });
    await check('PDF multipágina reconoce índice sin contar 56 días y mantiene portada e introducción',async()=>{
      const parsed=await adapter.bridge.readPdf(await get('indice.pdf')),dev=ContentCore.recordsToDevotional(parsed.records,'archivo.pdf',BIBLE.books,PlanCore,parsed);
      assert(parsed.pages===33&&dev.entries.length===28,'Índice duplicado');assert(dev.title==='Una pausa compartida','Título portada');assert(dev.subtitle==='Un recorrido de 28 días de lectura y gratitud','Subtítulo');
      assert(/Introducción/.test(dev.description)&&!dev.description.includes('CONTENIDO'),'Introducción');assert(parsed.warnings.some(w=>w.includes('2 páginas de índice')),'Aviso índice');
      assert(dev.entries.every(e=>e.body.includes('observación original')),'Contenido de días');assert(heartbeats>5,'La página quedó bloqueada durante la lectura');
    });
    await check('PDF escaneado y dañado dan errores humanos sin inventar texto; luego el lector se recupera',async()=>{
      for(const [name,code,word] of [['escaneado.pdf','VALIDATION','escaneado'],['corrupto.pdf','CORRUPT','dañado']]){
        let error;try{await adapter.bridge.readPdf(await get(name));}catch(e){error=e;}
        assert(error?.code===code&&error.message.includes(word),'Error '+name);
      }
      assert((await adapter.bridge.readPdf(await get('original.pdf'))).records.length>0,'Lector recuperado');
    });
    await check('Límites de archivo y 300 páginas, sin extraer un documento enorme',async()=>{
      for(const bytes of [new Uint8Array(0),new Uint8Array(10000001),await get('exceso-paginas.pdf')]){
        let error;try{await adapter.bridge.readPdf(bytes);}catch(e){error=e;}assert(error?.code==='VALIDATION','Límite PDF');
      }
    });
    await check('PlanDocuments reutiliza PDF por puente y DOCX/JSZip local con estilos y referencias',async()=>{
      for(const name of ['original.pdf','original.docx']){
        const result=await PlanDocuments.read(new File([await get(name)],name)),dev=ContentCore.recordsToDevotional(result.records,name,BIBLE.books,PlanCore,result);
        assert(dev.entries.length===2,'Importación '+name);assert(result.records.some(r=>r.spans?.some(s=>s.bold)),'Formato '+name);
        const html=ContentCore.render(ContentCore.blocks(result.records),BIBLE.books,PlanCore);assert(!html.includes('<script>'),'HTML literal no escapado');
      }
    });
    return {passed,checks,heartbeats};
  }finally{clearInterval(timer);service.close();}
};
