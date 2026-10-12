'use strict';
// 0.6.9: diccionarios griego y hebreo en español de las Sociedades Bíblicas (CC BY-SA), velocidad de la voz y
// tema «Según el sistema» en la PC.
const assert=require('node:assert/strict');
module.exports=async({evaluate,screenshot,wait})=>{
 const report={};
 for(let i=0;i<60&&!(await evaluate("typeof storageReady!=='undefined'&&storageReady&&!!catalogData"));i++)await wait(500);
 report.modulos=await evaluate("catalogData.modules.filter(m=>m.id.startsWith('ubs-')).map(m=>({id:m.id,licencia:m.licencia}))");
 assert.equal(report.modulos.length,2,'los dos diccionarios en español están instalados');
 report.g25=await evaluate("(async()=>{const r=await desktop.dictionary({group:'ubs-griego',query:'G25'});return (r.entries[0]?.text||'').slice(0,60);})()");
 assert.match(report.g25,/ἀγαπάω/);assert.match(report.g25,/amor/);
 report.amor=await evaluate("(async()=>{const r=await desktop.dictionary({group:'ubs-griego',query:'amor'});return r.entries.length;})()");
 assert.ok(report.amor>0,'buscar «amor» encuentra entradas');
 report.opciones=await evaluate("[...document.querySelectorAll('#dictionary-select option')].map(o=>o.textContent)");
 assert.ok(report.opciones.some(t=>/Sociedades Bíblicas · Griego/.test(t)));
 report.tema=await evaluate("[...document.querySelectorAll('#theme-select option')].map(o=>o.value)");
 assert.ok(report.tema.includes('sistema'));
 report.velocidad=await evaluate("[...document.querySelectorAll('#voice-rate option')].map(o=>o.value)");
 assert.deepEqual(report.velocidad,['0.75','1','1.25','1.5']);
 await evaluate("document.querySelector('#dictionary-select').value='ubs-griego';document.querySelector('#dictionary-select').dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('#dictionary-query').value='G25';document.querySelector('#dictionary-form').requestSubmit()");await wait(1500);
 await evaluate("document.querySelector('#dictionary-content button')?.click()");await wait(1000);
 await screenshot('v069-diccionario-espanol');
 return report;
};
