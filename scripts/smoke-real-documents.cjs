'use strict';
// Private source files are supplied at runtime, never bundled or saved in this repository.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async({evaluate,call,screenshot,wait,args})=>{
 if(!args.documents)throw new Error('Indica --documents con las copias locales privadas.');
 const before=await evaluate('JSON.stringify(state)'),report={files:[],layouts:[]};
 const asFile=(bytes,name)=>`new File([Uint8Array.from(atob(${JSON.stringify(bytes.toString('base64'))}),c=>c.charCodeAt(0))],${JSON.stringify(name)})`;
 let pdfId;
 try{
  for(const name of fs.readdirSync(args.documents).filter(n=>/\.(pdf|docx)$/i.test(n))){
   await evaluate(`(async()=>{showView('dev');await importDevFile(${asFile(fs.readFileSync(path.join(args.documents,name)),name)})})()`);
   const row=await evaluate("(()=>{const d=journeyData().item;return {title:d.title,subtitle:d.subtitle,days:d.entries.length,introLength:d.description.length,bodyLengths:d.entries.map(e=>e.body.length),furniture:d.entries.some(e=>e.body.includes('M:7 BATTLE READY')),warnings:d.importWarnings.join(' '),saved:state.devotionals.some(s=>s.id===d.id),reviewHidden:document.querySelector('#dev-review').hidden};})()");assert.equal(row.saved,true);assert.equal(row.reviewHidden,true);
   if(/Palabras/i.test(name)){assert.equal(row.days,2);assert.match(row.title,/poder de las palabras/i);}
   if(/Jacob/i.test(name)){assert.match(row.title,/Devocional: El propósito en lo inusual/);assert.notEqual(row.title,path.basename(name,'.docx'));}
   if(/\.pdf$/i.test(name)){assert.equal(row.days,28);assert.equal(row.title,'No más esconderse');assert.equal(row.subtitle,'Una travesía de 28 días de preparación para la batalla');assert.ok(row.introLength>1000);assert.ok(row.bodyLengths.every(n=>n>1000));assert.equal(row.furniture,false);}
   report.files.push({name,...row});await screenshot('libro-'+path.extname(name).slice(1)+'-'+report.files.length);
   if(/\.pdf$/i.test(name)){
    await evaluate('saveQueue');pdfId=await evaluate('activeJourney.id');assert.ok(pdfId);
   }
  }
  assert.equal(report.files.length,3);assert.ok(pdfId);
  await call('Page.reload',{ignoreCache:true});for(let i=0;i<100;i++){await wait(100);if(await evaluate("typeof uiReady!=='undefined'&&uiReady"))break;}
  const restored=await evaluate(`state.devotionals.find(d=>d.id===${JSON.stringify(pdfId)})`);assert.equal(restored.entries.length,28);assert.equal(restored.subtitle,report.files.find(f=>f.name.endsWith('.pdf')).subtitle);assert.ok(restored.introBlocks.length);
  for(const design of ['a','b','c']){
   await evaluate(`state.appearance.design='${design}';state.appearance.theme='marfil';settings();window.libraryTest.resize(1366,729);openJourney('dev',${JSON.stringify(pdfId)},0);`);await wait(180);
   await evaluate("document.querySelector('#journey-intro').closest('details').open=true");await screenshot('pdf-'+design+'-introduccion','#journey-intro');
   const intro=await evaluate("document.querySelector('#journey-intro').textContent");assert.match(intro,/DECLARACIÓN INICIAL/);assert.match(intro,/NOTA PARA LA EDICIÓN EN ESPAÑOL/);
   await evaluate("document.querySelector('#journey-intro').closest('details').open=false");await screenshot('pdf-'+design+'-dia1','#journey-day-title');
   await evaluate(`openJourney('dev',${JSON.stringify(pdfId)},27)`);await screenshot('pdf-'+design+'-dia28','#journey-day-title');
   const layout=await evaluate("({design:document.documentElement.dataset.design,overflow:document.querySelector('main').scrollWidth>document.querySelector('main').clientWidth+2,bodyOverflow:document.querySelector('#journey-body').scrollWidth>document.querySelector('#journey-body').clientWidth+2,titleOutline:getComputedStyle(document.querySelector('#journey-title')).outlineStyle,paragraphs:document.querySelectorAll('#journey-body p').length,refs:document.querySelectorAll('#journey-body [data-document-ref]').length})");assert.equal(layout.overflow,false);assert.ok(await evaluate('bookPageCount>=1'));assert.equal(layout.titleOutline,'none');assert.ok(layout.paragraphs>5);assert.ok(layout.refs>0);report.layouts.push(layout);
  }
  await evaluate(`openJourney('dev',${JSON.stringify(pdfId)},0);document.querySelector('#journey-complete').click();document.querySelector('#journey-note').value='Reflexión de prueba local';document.querySelector('#journey-note').dispatchEvent(new Event('input'));`);await evaluate('saveQueue');
  await call('Page.reload',{ignoreCache:true});for(let i=0;i<100;i++){await wait(100);if(await evaluate("typeof uiReady!=='undefined'&&uiReady"))break;}
  await evaluate(`openJourney('dev',${JSON.stringify(pdfId)},0)`);assert.equal(await evaluate("document.querySelector('#journey-complete').getAttribute('aria-pressed')"),'true');assert.equal(await evaluate("document.querySelector('#journey-note').value"),'Reflexión de prueba local');
  await evaluate("document.querySelector('#journey-body [data-document-ref]').click()");await wait(250);assert.equal(await evaluate('activeView'),'read');await evaluate("document.querySelector('#journey-return').click()");assert.equal(await evaluate('activeView'),'journey');
  report.persistence={days:28,subtitle:true,introduction:true,read:true,note:true,passageNavigation:true};
 }finally{
  await evaluate(`state=validateState(JSON.parse(${JSON.stringify(before)}));activeJourney=null;pendingDev=null;settings();renderDevList();showView('read');save();`);await evaluate('saveQueue');
 }
 const after=await evaluate('JSON.stringify({notes:state.notes,plans:state.plans,devotionals:state.devotionals,devResponses:state.devResponses})'),previous=JSON.parse(before);assert.equal(after,JSON.stringify({notes:previous.notes,plans:previous.plans,devotionals:previous.devotionals,devResponses:previous.devResponses}));report.integrity={unchanged:true};return report;
};
