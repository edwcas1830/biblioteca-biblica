(function(root) {
  const clean = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const topics = {
    paz: { title: 'Paz en medio del camino', passages: [[18,23],[42,14],[49,4],[18,46],[39,6],[42,16],[22,26]], question: '¿Qué preocupación puedes poner hoy delante de Dios?' },
    fe: { title: 'Aprender a confiar', passages: [[57,11],[0,12],[40,4],[44,4],[58,1],[18,27],[42,20]], question: '¿Qué paso concreto de confianza puedes dar hoy?' },
    gratitud: { title: 'Una vida agradecida', passages: [[18,103],[41,17],[50,3],[51,5],[18,100],[49,4],[18,136]], question: '¿Qué regalo cotidiano has pasado por alto?' },
    esperanza: { title: 'Volver a la esperanza', passages: [[44,8],[24,3],[18,42],[59,1],[22,40],[44,15],[65,21]], question: '¿Qué parte de este pasaje te invita a perseverar?' }
  };
  function createDevotional({ topic, minutes, days, purpose }, books) {
    if (!topics[topic] || !Number.isInteger(minutes) || minutes<5 || minutes>60 || !Number.isInteger(days) || days<1 || days>90) throw new Error('Elige un tema, entre 5 y 60 minutos y entre 1 y 90 días.');
    const chosen = topics[topic];
    const read = Math.max(2,Math.round(minutes*.35)), reflect = Math.max(1,Math.round(minutes*.35));
    const pray = minutes-read-reflect;
    return { id: 'dev-'+Date.now()+'-'+Math.random().toString(36).slice(2,8), title: chosen.title, topic, minutes, purpose: String(purpose||'').trim().slice(0,500), origin: 'Creación guiada · plantilla local', createdAt: new Date().toISOString(), entries: Array.from({length:days},(_,i) => {
      const [book,chapter] = chosen.passages[i%chosen.passages.length];
      if (!books[book]?.chapters[chapter-1]) throw new Error('Falta el pasaje bíblico.');
      return { title: `Día ${i+1} · ${books[book].name} ${chapter}`, book, chapter, body: `LECTURA · ${read} min\nLee ${books[book].name} ${chapter} despacio. Observa las palabras que se repiten y lo que ocurre antes y después del pasaje.\n\nREFLEXIÓN · ${reflect} min\n${chosen.question}\n¿Qué revela el texto acerca de Dios? Escribe una observación del pasaje y una aplicación personal, distinguiendo ambas.\n\nORACIÓN Y RESPUESTA · ${pray} min\nHabla con Dios sobre lo que has leído. Elige una acción pequeña para practicar hoy.\n\nEsta guía organiza tu tiempo; las reflexiones las escribes tú.` };
    }) };
  }
  function createPlan(books, scope, days) {
    const from = scope==='nt'?39:scope==='salmos'?18:0;
    const to = scope==='salmos'?19:66;
    if (!['nt','salmos','all'].includes(scope)) throw new Error('Plan no válido.');
    const chapters = [];
    for(let b=from;b<to;b++) books[b].chapters.forEach((_c,i)=>chapters.push({book:b,chapter:i+1}));
    if (!Number.isInteger(days) || days<1 || days>chapters.length) throw new Error(`Elige entre 1 y ${chapters.length} días.`);
    return { id:'plan-'+Date.now(), scope, days, completed:[], entries:Array.from({length:days},(_,i)=>chapters.slice(Math.floor(i*chapters.length/days),Math.floor((i+1)*chapters.length/days))) };
  }
  function importDevotional(filename, text, books) {
    if (typeof text!=='string' || text.length>2000000 || !text.trim()) throw new Error('El archivo está vacío o supera el límite de 2 MB de texto.');
    let title=filename.replace(/\.[^.]+$/,''), entries;
    if (/\.json$/i.test(filename)) {
      const data=JSON.parse(text);
      if (typeof data.title!=='string' || !data.title.trim() || !Array.isArray(data.entries) || !data.entries.length || data.entries.length>366) throw new Error('El JSON debe incluir title y entre 1 y 366 entries.');
      title=data.title.slice(0,200);
      entries=data.entries.map((entry,i)=>{
        if (!entry || typeof entry.body!=='string' || entry.body.length>2000000) throw new Error('Cada día necesita un campo body de texto de hasta 2 MB.');
        const out={title: String(entry.title||`Día ${i+1}`).slice(0,200),body:entry.body};
        const content=typeof module==='object'&&module.exports?require('./content-core.js'):root.ContentCore;
        if(typeof entry.originalTitle==='string')out.originalTitle=entry.originalTitle.slice(0,200);
        if(entry.blocks)out.blocks=content.blocks(entry.blocks);
        if (entry.book!==undefined || entry.chapter!==undefined) {
          if (!Number.isInteger(entry.book) || !Number.isInteger(entry.chapter) || !books[entry.book]?.chapters[entry.chapter-1]) throw new Error('Referencia bíblica no válida: book comienza en 0 y chapter en 1.');
          out.book=entry.book;out.chapter=entry.chapter;
        }
        return out;
      });
    } else if (/\.(txt|md)$/i.test(filename)) entries=[{title,body:text}];
    else throw new Error('Por ahora puedes importar archivos TXT, MD y JSON.');
    return {id:'import-'+Date.now()+'-'+Math.random().toString(36).slice(2,8),title,origin:'Devocional importado',entries};
  }
  const api={clean,topics,createDevotional,createPlan,importDevotional};
  if(typeof module==='object' && module.exports) module.exports=api;
  else root.BibleCore=api;
})(typeof window==='object'?window:globalThis);
