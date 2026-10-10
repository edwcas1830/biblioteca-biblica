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
 assert.equal(report.context.sources.length,1);assert.equal(report.context.sources[0].module,'onbv2008');
 for(const key of ['license','attribution','origin','licenseUrl'])assert.ok(report.context.prompt.includes(report.context.sources[0][key]));
 assert.match(report.context.preview,/Biblica, Inc/);await screenshot('v06-ia-fuente-libre-atribucion');
 await evaluate(`closeAi();selectedVersion=${JSON.stringify(before)};document.querySelector('#version-select').value=selectedVersion;go(42,3,16)`);
 report.providerContacted=false;return report;
};
