'use strict';
// Muestra una respuesta REAL guardada (Pasajes paralelos de Juan 3:16 con Gemini) en el panel, para revisar cómo se ve.
const fs=require('node:fs'),assert=require('node:assert/strict');
module.exports=async({evaluate,screenshot,wait,args})=>{
 const r=JSON.parse(fs.readFileSync(args.respuesta,'utf8'));
 await evaluate("go(42,3,16)");await wait(600);await evaluate("openAi()");await wait(800);
 await evaluate(`(()=>{const r=${JSON.stringify(r)};const t=aiThread();t.messages.push(aiMessage('user','Pasajes paralelos de Juan 3:16'));t.messages.push(aiMessage('assistant',r.text,{...r,...StudyChatCore.result(r,false)}));renderAiThread();})()`);await wait(500);
 const v=await evaluate("({partes:[...document.querySelectorAll('.ai-accion-respuesta h4')].map(h=>h.textContent),fuentes:document.querySelectorAll('.ai-accion-respuesta .ai-source').length,seguimientos:document.querySelectorAll('.ai-accion-respuesta [data-ai-followup]').length})");
 assert.ok(v.partes.includes('Lo que dice el texto')&&v.partes.includes('Interpretación'));assert.ok(v.fuentes>=3);assert.equal(v.seguimientos,3);
 await evaluate("document.querySelector('.ai-accion-respuesta').scrollIntoView({block:'start'})");await wait(300);await screenshot('v066-respuesta-paralelos');
 return v;
};
