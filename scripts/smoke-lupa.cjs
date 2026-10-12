'use strict';
// 0.6.8: lupa visible junto a libro y capítulo en la PC (y Ctrl+K) que abre el buscador del teléfono:
// «rey» sugiere 1 y 2 Reyes; «jn 3 16» lleva a Juan 3:16; una palabra pasa a la búsqueda de texto.
const assert=require('node:assert/strict');
module.exports=async({evaluate,screenshot,wait})=>{
 const report={};
 report.lupa=await evaluate("(()=>{const b=document.querySelector('#buscador-lupa');if(!b)return null;const r=b.getBoundingClientRect(),p=document.querySelector('#book').getBoundingClientRect();return {visible:r.width>0&&r.height>0&&getComputedStyle(b).display!=='none',ancho:Math.round(r.width),mismaFila:Math.abs((r.top+r.bottom)/2-(p.top+p.bottom)/2)<12,dentro:r.right<=innerWidth};})()");
 const medirCap="(()=>{const c=document.querySelector('#chapter'),b=document.querySelector('#book');const x=document.createElement('span');x.style.cssText='position:absolute;visibility:hidden;white-space:nowrap';x.style.font=getComputedStyle(c).font;x.textContent=c.selectedOptions[0]?.textContent||'';document.body.append(x);const t=x.getBoundingClientRect().width;x.remove();return {cap:Math.round(c.getBoundingClientRect().width),texto:Math.round(t),libro:Math.round(b.getBoundingClientRect().width)};})()";
 report.capConLupa=await evaluate(medirCap);
 await evaluate("document.querySelector('#buscador-lupa').hidden=true");report.capSinLupa=await evaluate(medirCap);await evaluate("document.querySelector('#buscador-lupa').hidden=false");
 assert.ok(report.lupa?.visible,'la lupa se ve');assert.ok(report.lupa.mismaFila,'junto a libro y capítulo');assert.ok(report.lupa.dentro);
 await evaluate("document.querySelector('#buscador-lupa').click()");await wait(300);
 report.abre=await evaluate("({abierto:!!document.querySelector('#buscador')?.open,foco:document.activeElement?.id,indice:document.querySelectorAll('.buscador-libros button').length})");
 assert.equal(report.abre.abierto,true);assert.equal(report.abre.foco,'buscador-campo');assert.equal(report.abre.indice,66,'índice de 66 libros');
 await screenshot('v068-lupa-indice');
 const escribir=t=>evaluate(`(()=>{const c=document.querySelector('#buscador-campo');c.value=${JSON.stringify(t)};c.dispatchEvent(new Event('input',{bubbles:true}));return [...document.querySelectorAll('#buscador .buscador-fila')].map(b=>b.textContent.trim());})()`);
 report.rey=await escribir('rey');
 assert.ok(report.rey.some(t=>/^1 Reyes/.test(t))&&report.rey.some(t=>/^2 Reyes/.test(t)),'«rey» sugiere 1 y 2 Reyes: '+report.rey.join(' | '));
 await screenshot('v068-lupa-rey');
 report.palabra=await escribir('misericordia');
 assert.ok(report.palabra.some(t=>t.includes('misericordia')),'ofrece buscar la palabra');
 await escribir('jn 3 16');
 await evaluate("document.querySelector('#buscador-campo').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))");await wait(600);
 report.juan=await evaluate("({cerrado:!document.querySelector('#buscador').open,ref:document.querySelector('#bible-ref')?.textContent||'',libro:document.querySelector('#book').selectedOptions[0]?.textContent,cap:document.querySelector('#chapter').value,pos:structuredClone(state.position)})");
 assert.equal(report.juan.cerrado,true);assert.match(report.juan.libro,/Juan/);assert.equal(String(report.juan.cap),'3');assert.equal(report.juan.pos.verse,16);
 await screenshot('v068-lupa-juan-3-16');
 report.cap150=[];
 for(const d of ['a','b','c']){
  await evaluate(`state.appearance.design='${d}';settings();go(18,150,1)`);await wait(500);
  const r=await evaluate("(()=>{const c=document.querySelector('#chapter'),cs=getComputedStyle(c);const x=document.createElement('span');x.style.cssText='position:absolute;visibility:hidden;white-space:nowrap';x.style.font=cs.font;x.textContent=c.selectedOptions[0]?.textContent||'';document.body.append(x);const t=x.getBoundingClientRect().width;x.remove();const libre=c.clientWidth-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight)-16;return {diseno:document.documentElement.dataset.design,texto:c.selectedOptions[0]?.textContent,cabe:t<=libre,ancho:Math.round(t),libre:Math.round(libre)};})()");
  report.cap150.push(r);await screenshot('v068-cap150-'+d);
  assert.ok(r.cabe,'«'+r.texto+'» cabe en el diseño '+d+': '+JSON.stringify(r));
 }
 await evaluate("state.appearance.design='a';settings()");
 await evaluate("document.dispatchEvent(new KeyboardEvent('keydown',{key:'k',ctrlKey:true,bubbles:true}))");await wait(300);
 report.ctrlK=await evaluate("!!document.querySelector('#buscador').open");assert.equal(report.ctrlK,true,'Ctrl+K abre el buscador');
 await evaluate("document.querySelector('#buscador').close()");
 return report;
};
