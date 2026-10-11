'use strict';
const assert=require('node:assert/strict');
module.exports=async({evaluate,screenshot,wait})=>{
 const report={modules:await evaluate("catalogData.modules.filter(m=>['rv1909','onbv2008','step-greek','step-hebrew'].includes(m.id)).map(m=>({id:m.id,permission:m.iaPermitida,attribution:m.atribucion}))")};
 assert.equal(report.modules.length,4);assert.ok(report.modules.every(m=>m.permission===true&&m.attribution));
 const before=await evaluate('selectedVersion');
 await evaluate("selectedVersion='onbv2008';document.querySelector('#version-select').value=selectedVersion;go(42,3,16);openAi({scope:'verse'})");await wait(200);
 await evaluate("document.querySelector('#ai-question').value='¿Qué puedo observar?';document.querySelector('#ai-prepare').click()");
 for(let i=0;i<100;i++){await wait(50);if(await evaluate('!!aiPrepared'))break;}
 report.context=await evaluate("({sources:aiPrepared.sources.map(s=>({module:s.module,license:s.license,attribution:s.attribution,origin:s.origin,licenseUrl:s.licenseUrl})),prompt:aiPrepared.prompt,preview:document.querySelector('#ai-sources').textContent})");
 const onbv=report.context.sources.find(s=>s.module==='onbv2008');assert.ok(onbv,'la fuente ONBV va en la consulta');
 for(const key of ['license','attribution','origin','licenseUrl'])assert.ok(report.context.prompt.includes(onbv[key]));
 report.vista={pedida:await evaluate("!document.querySelector('#ai-preview').hidden")};await evaluate('prepareAi()');await wait(400);report.vista.sinPedir=await evaluate("document.querySelector('#ai-preview').hidden");assert.ok(report.vista.pedida&&report.vista.sinPedir,'la vista de lo enviado solo aparece si se pide');await evaluate("document.querySelector('#ai-prepare').click()");await wait(400);
 // La atribución viaja con la fuente (se guarda y está en «Fuentes y licencias»); la vista previa solo nombra fuentes y referencias.
 assert.ok(report.context.sources.some(s=>/Biblica, Inc/.test(s.attribution||'')));assert.doesNotMatch(report.context.preview,/CC BY|Uso personal/);await screenshot('v06-ia-fuente-libre-atribucion');
 await evaluate(`closeAi();selectedVersion=${JSON.stringify(before)};document.querySelector('#version-select').value=selectedVersion;go(42,3,16)`);
 report.providerContacted=false;return report;
};
