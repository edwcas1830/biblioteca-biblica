'use strict';
// 2B en la PC: «Hoy» (versículo del día, 4 pasos, marcar y contar) y las cabeceras compactas que pidió Edward
// el 12-oct: «Comparar versiones» y «Pantalla completa» en la fila de «Mi Biblia»; «Pantalla completa» y
// «Referencias cruzadas» en la fila de «Comentario». El texto de la Biblia gana alto.
const assert=require('node:assert/strict');
module.exports=async({evaluate,screenshot,wait})=>{
 const report={};
 report.disenos={};
 for(const d of ['a','b','c']){
 await evaluate(`state.appearance.design='${d}';settings();go(20,2,3)`);await wait(900);
 const c=await evaluate(`(()=>{
  const dentro=(s,sel)=>{const e=document.querySelector(s+' .pane-acciones '+sel);if(!e)return false;const r=e.getBoundingClientRect();return r.width>0&&r.height>0;};
  const r=e=>e?e.getBoundingClientRect():null,choca=(a,b)=>a&&b&&b.width>0&&a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
  const versos=r(document.querySelector('#verses')),cab=r(document.querySelector('#pane-biblia .pane-head'));
  const botones=[...document.querySelectorAll('.pane-acciones button')].filter(b=>b.getBoundingClientRect().width>0);
  return {compararArriba:dentro('#pane-biblia','#compare-toggle'),pantallaBiblia:dentro('#pane-biblia','.enfoque-abrir'),
   pantallaComentario:dentro('#pane-comentario','.enfoque-abrir'),refsArriba:dentro('#pane-comentario','.refs-abrir'),
   seccionComparar:getComputedStyle(document.querySelector('#comparison-controls')).display,resumenRefs:getComputedStyle(document.querySelector('#connections-box')).display,
   huecoSobreTexto:Math.round(versos.top-cab.bottom),altoTexto:Math.round(versos.height),
   fueraDeFila:botones.filter(b=>{const a=b.getBoundingClientRect(),p=b.closest('.pane').getBoundingClientRect();return a.right>p.right+1||a.left<p.left-1;}).map(b=>b.textContent),
   enLaFila:[...document.querySelectorAll('.pane-acciones')].filter(a=>a.getBoundingClientRect().width>0).every(a=>{const f=a.parentElement.firstElementChild;return f===a||f.getBoundingClientRect().width===0||a.getBoundingClientRect().top<f.getBoundingClientRect().bottom-4;}),
   tapanCerrar:botones.filter(b=>[...b.closest('.pane').querySelectorAll('.pane-close')].some(x=>choca(b.getBoundingClientRect(),x.getBoundingClientRect()))).map(b=>b.textContent)};})()`);
 report.disenos[d]=c;
 await screenshot('2b-cabeceras-'+d);
 assert.ok(c.compararArriba&&c.pantallaBiblia,d+': Comparar y Pantalla completa arriba en la Biblia: '+JSON.stringify(c));
 assert.ok(c.pantallaComentario&&c.refsArriba,d+': Pantalla completa y Referencias cruzadas arriba en Comentario: '+JSON.stringify(c));
 assert.equal(c.seccionComparar,'none',d+': sin la fila vacía de Comparar');assert.equal(c.resumenRefs,'none',d+': sin la fila de Referencias cruzadas');
 assert.ok(c.huecoSobreTexto<=4,d+': el texto empieza justo bajo la cabecera: '+c.huecoSobreTexto);
 assert.equal(c.fueraDeFila.length,0,d+': ningún botón se sale: '+c.fueraDeFila);assert.equal(c.tapanCerrar.length,0,d+': ningún botón tapa la ×: '+c.tapanCerrar);assert.ok(c.enLaFila,d+': las acciones quedan en la fila del título o de la cita');
 }
 await evaluate("state.appearance.design='a';settings()");await wait(600);
 // Comparar sigue funcionando desde arriba y Referencias cruzadas se abre y se cierra desde su botón.
 report.comparar=await evaluate("(async()=>{document.querySelector('#compare-toggle').click();await new Promise(r=>setTimeout(r,800));const o=!document.querySelector('#compare-options').hidden,d=getComputedStyle(document.querySelector('#comparison-controls')).display;document.querySelector('#compare-toggle').click();await new Promise(r=>setTimeout(r,400));return {opciones:o,seccion:d};})()");
 assert.ok(report.comparar.opciones&&report.comparar.seccion!=='none','al comparar aparecen las versiones: '+JSON.stringify(report.comparar));
 report.refs=await evaluate("(async()=>{const b=document.querySelector('.refs-abrir');b.click();await new Promise(r=>setTimeout(r,500));const abierta={open:document.querySelector('#connections-box').open,display:getComputedStyle(document.querySelector('#connections-box')).display,aria:b.getAttribute('aria-expanded'),items:document.querySelectorAll('#connections-list > *').length};b.click();await new Promise(r=>setTimeout(r,300));return {abierta,cerrada:!document.querySelector('#connections-box').open};})()");
 await screenshot('2b-referencias');
 assert.ok(report.refs.abierta.open&&report.refs.abierta.display!=='none'&&report.refs.abierta.aria==='true'&&report.refs.cerrada,'Referencias cruzadas se abre y se cierra: '+JSON.stringify(report.refs));
 // «Hoy» en la PC.
 await evaluate("document.querySelector('.rail [data-view=hoy]').click()");await wait(1200);
 report.hoy=await evaluate("({vista:!document.querySelector('#hoy-view').hidden,texto:document.querySelector('#hoy-vers-texto')?.textContent||'',pasos:document.querySelectorAll('.hoy-paso').length,cita:document.querySelector('.hoy-cita span')?.textContent})");
 assert.ok(report.hoy.vista&&report.hoy.texto.length>20&&report.hoy.pasos===4,'«Hoy» en la PC: '+JSON.stringify(report.hoy));
 await evaluate("(async()=>{document.querySelector('[data-hoy-abrir=conexion]').click();await new Promise(r=>setTimeout(r,300));document.querySelector('[data-hoy-hecho=conexion]').click();})()");await wait(800);
 report.marcado=await evaluate("({progreso:document.querySelector('.hoy-progreso').textContent,total:document.querySelector('.hoy-total').textContent,guardado:JSON.stringify(state.hoy.dias)})");
 assert.match(report.marcado.progreso,/1 de 4/);assert.match(report.marcado.total,/1 día/);
 await screenshot('2b-hoy-pc');
 return report;
};
