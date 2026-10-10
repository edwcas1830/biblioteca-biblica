(function(root){
 'use strict';
 const osis='Gen Exod Lev Num Deut Josh Judg Ruth 1Sam 2Sam 1Kgs 2Kgs 1Chr 2Chr Ezra Neh Esth Job Ps Prov Eccl Song Isa Jer Lam Ezek Dan Hos Joel Amos Obad Jonah Mic Nah Hab Zeph Hag Zech Mal Matt Mark Luke John Acts Rom 1Cor 2Cor Gal Eph Phil Col 1Thess 2Thess 1Tim 2Tim Titus Phlm Heb Jas 1Pet 2Pet 1John 2John 3John Jude Rev'.split(' ');
 function parseOsis(value){const parts=String(value).split('-').map(s=>{const match=s.match(/^([\dA-Za-z]+)\.(\d+)\.(\d+)$/);if(!match||!osis.includes(match[1]))throw Error('Referencia OSIS inválida');return {book:osis.indexOf(match[1]),chapter:Number(match[2]),verse:Number(match[3])};});if(parts.length>2)throw Error('Rango OSIS inválido');return {...parts[0],...(parts[1]?{endBook:parts[1].book,endChapter:parts[1].chapter,endVerse:parts[1].verse}:{})};}
 function sentenceTitle(value){const text=String(value);if(!/\p{L}/u.test(text)||text!==text.toLocaleUpperCase('es'))return text;return text.toLocaleLowerCase('es').replace(/\p{L}/u,c=>c.toLocaleUpperCase('es'));}
 function difference(text,base){const known=new Set(String(base).toLocaleLowerCase('es').match(/[\p{L}\p{M}\p{N}]+/gu)||[]);return String(text).split(/([\p{L}\p{M}\p{N}]+)/u).filter(Boolean).map(s=>({text:s,different:/[\p{L}\p{N}]/u.test(s)&&!known.has(s.toLocaleLowerCase('es'))}));}
 const api={osis,parseOsis,sentenceTitle,difference};if(typeof module==='object'&&module.exports)module.exports=api;else root.StudyCore=api;
})(typeof window==='object'?window:globalThis);
