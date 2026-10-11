'use strict';
// Estudiar con IA: seis acciones a la vista, objetivo y casillas en «Avanzado», una sola salida «Llevar a otra IA».
const assert=require('node:assert/strict');
module.exports=async({evaluate,screenshot,wait})=>{
 await evaluate("go(18,107,1)");await wait(600);
 await evaluate("openAi()");await wait(800);
 const r=await evaluate("({acciones:[...document.querySelectorAll('#ai-acciones .ai-accion')].map(b=>b.textContent),tareaVisible:!document.querySelector('#ai-task').hidden&&getComputedStyle(document.querySelector('#ai-task')).display!=='none',avanzado:document.querySelector('#ai-context-options summary').textContent,verEnAvanzado:!!document.querySelector('#ai-context-options #ai-prepare'),llevar:!!document.querySelector('#ai-llevar'),consultar:document.querySelector('#ai-ask').textContent})");
 assert.deepEqual(r.acciones,['Contexto histórico','Exégesis','Pasajes paralelos','Palabras originales','Qué enseña de Dios','Para mi vida']);
 assert.equal(r.tareaVisible,false);assert.equal(r.avanzado,'Avanzado');assert.equal(r.verEnAvanzado,true);assert.equal(r.llevar,true);
 await evaluate("document.querySelector('#ai-acciones [data-accion=\"exegesis\"]').click()");await wait(1500);
 r.pregunta=await evaluate("document.querySelector('#ai-question').value");r.estado=await evaluate("document.querySelector('#ai-status').textContent");
 assert.match(r.pregunta,/^Exégesis de Salmos 107/);
 await screenshot('v066-acciones');
 return r;
};
