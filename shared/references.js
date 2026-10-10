(function(root,factory){
  const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.LibraryReferences=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function bookId(book){if(!Number.isInteger(book)||book<0||book>65)throw Error('Libro fuera del canon admitido.');return 'b'+String(book+1).padStart(3,'0');}
  function anchor(p){if(!p||!Number.isInteger(p.chapter)||p.chapter<1||!Number.isInteger(p.verse)||p.verse<1)throw Error('Referencia no válida.');return `${bookId(p.book)}:${p.chapter}:${p.verse}`;}
  function canonicalKey(key){const m=/^([a-z0-9-]{1,80}@)?(\d+):(\d+):(\d+)$/.exec(key);if(!m)throw Error('Referencia antigua inválida.');return (m[1]||'')+anchor({book:Number(m[2]),chapter:Number(m[3]),verse:Number(m[4])});}
  function legacyKey(key){const m=/^([a-z0-9-]{1,80}@)?b(\d{3}):(\d+):(\d+)$/.exec(key);if(!m||Number(m[2])<1||Number(m[2])>66)throw Error('Referencia canónica inválida.');const p={book:Number(m[2])-1,chapter:Number(m[3]),verse:Number(m[4])};anchor(p);return `${m[1]||''}${p.book}:${p.chapter}:${p.verse}`;}
  // Asynchronous on both web and Android; bytes match node:crypto's UTF-8 SHA-256.
  async function digest(value){
    if(!globalThis.crypto?.subtle)throw Error('Se necesita una conexión local segura para guardar.');
    const bytes=typeof value==='string'?new TextEncoder().encode(value):value;
    const hash=await globalThis.crypto.subtle.digest('SHA-256',bytes);
    return [...new Uint8Array(hash)].map(v=>v.toString(16).padStart(2,'0')).join('');
  }
  const dayId=async(plan,index,entry)=>'day-'+(await digest(JSON.stringify([plan,index,entry]))).slice(0,32);
  return Object.freeze({bookId,anchor,canonicalKey,legacyKey,digest,dayId});
});
