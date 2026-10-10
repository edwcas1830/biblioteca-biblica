'use strict';
// 0.6.3: botón ⤢ de pantalla completa en Biblia, Comentario y Diccionario (con A−/A+/Salir y Esc), y
// «Mi círculo con Laura» en el menú Mi biblioteca (el riel que lo tenía está oculto en el diseño A).
const assert=require('node:assert/strict');
module.exports=async({evaluate,screenshot,wait})=>{
 const report={};
 report.botones=await evaluate("['#pane-biblia','#pane-comentario','#pane-diccionario'].map(s=>!!document.querySelector(s+' .enfoque-abrir'))");
 assert.deepEqual(report.botones,[true,true,true]);
 report.paneles=[];
 for(const [panel,sel] of [['biblia','#pane-biblia'],['comentario','#pane-comentario'],['diccionario','#pane-diccionario']]){
  await evaluate(`document.querySelector('${sel} .enfoque-abrir').click()`);await wait(300);
  const r=await evaluate(`(()=>{const p=document.querySelector('${sel}').getBoundingClientRect(),otros=['#pane-biblia','#pane-comentario','#pane-diccionario'].filter(s=>s!=='${sel}').map(s=>{const e=document.querySelector(s);return e&&getComputedStyle(e).display!=='none'&&e.getBoundingClientRect().width>0;});return {modo:document.documentElement.dataset.enfoque||'',ancho:Math.round(p.width/innerWidth*100),otrosVisibles:otros.some(Boolean),barra:!document.querySelector('#enfoque-barra')?.hidden};})()`);
  report.paneles.push({panel,...r});
  assert.equal(r.modo,panel);assert.ok(r.ancho>=90,'el panel ocupa la pantalla');assert.equal(r.otrosVisibles,false);assert.equal(r.barra,true);
  if(panel==='biblia'){
   const antes=await evaluate("getComputedStyle(document.querySelector('#verses')).fontSize");
   await evaluate("document.querySelector('[data-enfoque-accion=\"mas\"]').click()");await wait(200);
   report.letra={antes,despues:await evaluate("getComputedStyle(document.querySelector('#verses')).fontSize")};
   assert.notEqual(report.letra.despues,antes);
   await evaluate("document.querySelector('[data-enfoque-accion=\"menos\"]').click()");await wait(150);
   await screenshot('v063-enfoque-biblia');
   await evaluate("document.querySelector('[data-enfoque-accion=\"salir\"]').click()");
  }else{
   await evaluate("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
  }
  await wait(250);
  assert.equal(await evaluate("document.documentElement.dataset.enfoque||''"),'','sale del modo enfoque');
 }
 await evaluate("document.querySelector('.library-menu').open=true");await wait(150);
 report.circuloEnMenu=await evaluate("!!document.querySelector('.library-menu-items [data-action=\"circle-open\"]')&&getComputedStyle(document.querySelector('.library-menu-items [data-action=\"circle-open\"]')).display!=='none'");
 assert.equal(report.circuloEnMenu,true);
 await screenshot('v063-menu-circulo');
 await evaluate("document.querySelector('.library-menu-items [data-action=\"circle-open\"]').click()");await wait(400);
 report.circuloAbre=await evaluate("document.querySelector('#circle-dialog').open");
 assert.equal(report.circuloAbre,true);
 await screenshot('v063-circulo-abierto');
 await evaluate("document.querySelector('#circle-close').click()");
 return report;
};
