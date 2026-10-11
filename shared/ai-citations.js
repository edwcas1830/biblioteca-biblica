(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(()=>require('../app/plan-core.js'));
  else root.LibraryAiCitations=factory(()=>root.PlanCore);
})(typeof globalThis!=='undefined'?globalThis:this,function(getPlan){
  'use strict';
  const ref=r=>r&&Number.isInteger(r.book)&&r.book>=0&&r.book<66&&Number.isInteger(r.chapter)&&r.chapter>0&&r.chapter<=150&&Number.isInteger(r.verse)&&r.verse>0&&r.verse<=176&&(r.endVerse===undefined||Number.isInteger(r.endVerse)&&r.endVerse>=r.verse&&r.endVerse<=176);
  function prompt(text){return text.replace(/"citations"\s*:\s*\[\s*\{[^{}]*"book"[^{}]*\}\s*\]/g,'"citations":[{"ref":"Juan 3:16"}]');}
  function instruction(text){return prompt(text)+' Las citas nuevas deben usar citations:[{"ref":"Juan 3:16"}], con el nombre o abreviatura del libro y la referencia REAL que corresponda. El ejemplo no es una cita requerida. No envíes índices numéricos de libros. La aplicación convierte el nombre a su canon local; nunca suministres texto bíblico dentro de citations.';}
  function normalize(value,books){
    const canon=Array.isArray(books)?books.map(b=>({...b,chapters:(b?.chapters||[]).map(c=>Number.isInteger(c)?{length:c}:c)})):null;
    const out=[],seen=new Set();
    for(const citation of (Array.isArray(value)?value:[]).slice(0,30)){
      let rows=[];
      // A supplied named ref is authoritative; invalid names never fall back to ambiguous numbers.
      if(citation&&Object.hasOwn(citation,'ref')){
        if(typeof citation.ref!=='string'||citation.ref.length>200||!canon)continue;
        try{const parsed=getPlan().parseReferences(citation.ref,canon);if(parsed.warnings.length)continue;rows=parsed.refs;}catch{continue;}
      }else if(ref(citation))rows=[citation]; // Historical contract: zero based; never guess/subtract one.
      for(const r of rows){
        if(!ref(r)||canon&&(!canon[r.book]?.chapters[r.chapter-1]||r.verse>canon[r.book].chapters[r.chapter-1].length||(r.endVerse||r.verse)>canon[r.book].chapters[r.chapter-1].length))continue;
        const clean={book:r.book,chapter:r.chapter,verse:r.verse,...(r.endVerse!==undefined&&r.endVerse!==r.verse?{endVerse:r.endVerse}:{})};
        const key=JSON.stringify(clean);if(!seen.has(key)){seen.add(key);out.push(clean);}if(out.length===5)return out;
      }
    }
    return out;
  }
  return Object.freeze({instruction,prompt,normalize});
});
