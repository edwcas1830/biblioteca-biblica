'use strict';
const crypto=require('node:crypto');
const bookId=book=>{if(!Number.isInteger(book)||book<0||book>65)throw new Error('Libro fuera del canon admitido.');return 'b'+String(book+1).padStart(3,'0');};
const anchor=p=>{if(!p||!Number.isInteger(p.chapter)||p.chapter<1||!Number.isInteger(p.verse)||p.verse<1)throw new Error('Referencia no válida.');return `${bookId(p.book)}:${p.chapter}:${p.verse}`;};
// Unqualified annotations belong to the original RV1909 dataset. Imported
// editions have a namespace: numbering equivalence is never assumed.
const legacyKey=key=>{const m=/^([a-z0-9-]{1,80}@)?b(\d{3}):(\d+):(\d+)$/.exec(key);if(!m)throw new Error('Referencia canónica inválida.');return `${m[1]||''}${Number(m[2])-1}:${m[3]}:${m[4]}`;};
const canonicalKey=key=>{const m=/^([a-z0-9-]{1,80}@)?(\d+):(\d+):(\d+)$/.exec(key);if(!m)throw new Error('Referencia antigua inválida.');return (m[1]||'')+anchor({book:Number(m[2]),chapter:Number(m[3]),verse:Number(m[4])});};
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
const dayId=(plan,index,entry)=>'day-'+digest(JSON.stringify([plan,index,entry])).slice(0,32);
module.exports={bookId,anchor,legacyKey,canonicalKey,digest,dayId};
