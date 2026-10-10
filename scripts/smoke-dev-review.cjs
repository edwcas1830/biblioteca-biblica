'use strict';
const assert=require('node:assert/strict');
module.exports=async({evaluate,call,screenshot,wait})=>{
 const before=await evaluate('JSON.stringify(state)'),report={layouts:[]};
 const text='Devocional de ensayo\n\n'+Array.from({length:28},(_,i)=>`## Día ${i+1}\nJuan 3:16\n${'Reflexión propia de prueba para revisar y guardar. '.repeat(30)}`).join('\n\n');
 const importDraft=()=>evaluate(`(async()=>{showView('dev');await importDevFile(new File([${JSON.stringify(text)}],'ensayo.md'));await desktop.reviewPending(true);})()`);
 try{
  await importDraft();assert.equal(await evaluate('pendingDev.entries.length'),28);assert.equal(await evaluate('state.devotionals.length'),JSON.parse(before).devotionals.length);assert.equal(await evaluate("document.querySelector('#dev-review').hidden"),false);
  const draft=await evaluate('JSON.stringify(pendingDev)');
  for(const design of ['a','b','c'])for(const [width,height]of [[1366,729],[1920,1041]]){
   await evaluate(`state.appearance.design='${design}';settings();window.libraryTest.resize(${width},${height});`);await wait(120);
   await evaluate("document.querySelector('#dev-review-days .dev-review-day:last-child').scrollIntoView({block:'start'})");await wait(80);
   const row=await evaluate("(()=>{const b=document.querySelector('#dev-review-save-top'),r=b.getBoundingClientRect(),m=document.querySelector('main').getBoundingClientRect();return {design:document.documentElement.dataset.design,width:innerWidth,visible:r.top>=m.top-2&&r.bottom<=m.bottom+2,sticky:getComputedStyle(b.closest('.dev-review-heading')).position,top:r.top,label:b.textContent,bottomLabel:document.querySelector('#dev-review-save').textContent,overflow:document.querySelector('main').scrollWidth>document.querySelector('main').clientWidth+2};})()");assert.equal(row.visible,true);assert.equal(row.sticky,'sticky');assert.equal(row.overflow,false);assert.equal(row.label,'Guardar devocional');assert.equal(row.bottomLabel,'Guardar devocional');report.layouts.push(row);await screenshot(`v06-revision-fija-${design}-${width}`,'#dev-review-days .dev-review-day:last-child');
  }
  await evaluate("window.libraryTest.reviewAnswer(false)");await evaluate("showView('read')");assert.equal(await evaluate('activeView'),'dev');assert.equal(await evaluate('JSON.stringify(pendingDev)'),draft);
  await evaluate("window.libraryTest.reviewAnswer(false)");await evaluate("document.querySelector('#dev-review-cancel').click()");assert.equal(await evaluate('JSON.stringify(pendingDev)'),draft);
  await evaluate('window.libraryTest.reviewAnswer(false)');await evaluate('window.libraryTest.reviewClose()');await wait(400);assert.equal(await evaluate('JSON.stringify(pendingDev)'),draft);report.closeBlocked=true;
  await evaluate('window.libraryTest.reviewAnswer(true)');await evaluate("showView('read')");assert.equal(await evaluate('pendingDev'),null);assert.equal(await evaluate('activeView'),'read');report.leaveConfirmed=true;
  await importDraft();await evaluate("document.querySelector('#dev-review-save-top').click()");await evaluate('saveQueue');await wait(150);assert.equal(await evaluate('pendingDev'),null);const id=await evaluate('activeJourney.id');assert.ok(id);assert.equal(await evaluate('state.devotionals.length'),JSON.parse(before).devotionals.length+1);assert.equal(await evaluate('activeView'),'journey');assert.equal(await evaluate("!!document.querySelector('#journey-fullscreen')"),false);assert.equal(await evaluate("getComputedStyle(document.querySelector('#journey-body')).columnCount"),'auto');report.savedByTop=true;
  await evaluate(`const d=state.devotionals.find(d=>d.id===${JSON.stringify(id)});d.completed=Array.from({length:27},(_,i)=>i);openJourney('dev',d.id,27);document.querySelector('#journey-complete').click()`);await evaluate('saveQueue');assert.equal(await evaluate('journeyData().item.status'),'finished');const date=await evaluate('journeyData().item.finishedAt');assert.ok(date);await evaluate("showView('dev')");assert.match(await evaluate("document.querySelector('#dev-list').textContent"),/Terminado/);
  await call('Page.reload',{ignoreCache:true});for(let i=0;i<100;i++){await wait(100);if(await evaluate("typeof uiReady!=='undefined'&&uiReady"))break;}assert.equal(await evaluate(`state.devotionals.find(d=>d.id===${JSON.stringify(id)}).finishedAt`),date);report.finishedDatePersists=true;
  await importDraft();await evaluate("document.querySelector('#dev-review-save').click()");await evaluate('saveQueue');await wait(100);assert.equal(await evaluate('pendingDev'),null);report.savedByBottom=true;
  await importDraft();await evaluate("storageReady=false;document.querySelector('#dev-review-save-top').click()");await wait(150);assert.ok(await evaluate('!!pendingDev'));assert.equal(await evaluate("document.querySelector('#dev-review-save-top').disabled"),false);report.failedSaveKeepsDraft=true;await evaluate('storageReady=true');
 }finally{
  await evaluate(`clearDevReview();state=validateState(JSON.parse(${JSON.stringify(before)}));activeJourney=null;settings();renderDevList();showView('read');save()`);await evaluate('saveQueue');
 }
 const previous=JSON.parse(before),fields=s=>JSON.stringify({notes:s.notes,plans:s.plans,devotionals:s.devotionals,devResponses:s.devResponses});assert.equal(await evaluate('JSON.stringify({notes:state.notes,plans:state.plans,devotionals:state.devotionals,devResponses:state.devResponses})'),fields(previous));report.integrity=true;return report;
};
