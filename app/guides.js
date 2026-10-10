'use strict';
let guidePerson=0,guideOpenIds=new Set(),aiSeries=null,aiDraftModel='';
function renderGuide(){
 if(state.privateLocked)$('#guide-response').value='';
 const d=journeyData(),dev=d&&activeJourney.kind==='dev';$('#journey-guide-open').hidden=!dev;$('#guide-card').hidden=!dev||!d.item.guide&&!guideOpenIds.has(d.item.id);
 if(!dev)return;const config=d.item.guide||{method:'oia',mode:'solo',participants:1,steps:{}},steps=GuideCore.methods[config.method],step=config.steps?.[d.index]||0;
 $('#guide-method').value=config.method;$('#guide-step-title').textContent=steps[step][0];$('#guide-step-question').textContent=steps[step][1];$('#guide-step-label').textContent=`${config.method.toUpperCase()} · pregunta ${step+1} de ${steps.length}`;
 $('#guide-person').innerHTML=Array.from({length:config.participants},(_,i)=>`<option value="${i}">${config.mode==='couple'?['Mi reflexión','Reflexión de mi pareja'][i]:config.mode==='family'?'Persona '+(i+1):'Mi reflexión'}</option>`).join('');guidePerson=Math.min(guidePerson,config.participants-1);$('#guide-person').value=guidePerson;$('#guide-person').closest('label').hidden=config.mode==='solo';
 $('#guide-response').value=state.guideResponses[`${d.item.id}:${d.index}:${config.method}:${step}:${guidePerson}`]||'';$('#guide-response').disabled=!!state.privateLocked;$('#guide-lock-notice').textContent=state.privateLocked?'Abre el candado para escribir o leer tus reflexiones.':'Se guarda en tu equipo. El candado protege estas respuestas.';
 $('#guide-prev').disabled=step===0;$('#guide-next').disabled=step===steps.length-1;
}
function guideMove(delta){const d=journeyData();if(!d||activeJourney.kind!=='dev')return;d.item.guide??={method:'oia',mode:'solo',participants:1,steps:{}};const g=d.item.guide;g.steps[d.index]=Math.max(0,Math.min(GuideCore.methods[g.method].length-1,(g.steps[d.index]||0)+delta));save();renderGuide();$('#guide-step-title').focus();}
function currentSeries(){const f=$('#series-form');return GuideCore.spec({topic:f.elements.topic.value,minutes:Number(f.elements.minutes.value),days:Number(f.elements.days.value),method:f.elements.method.value,mode:f.elements.mode.value,participants:Number(f.elements.participants.value)});}
function reviewAiDraft(){
 try{const text=$('#ai-draft-text').value,dev=contentCore.recordsToDevotional(contentCore.fromText(text).map(b=>({text:contentCore.textOf([b]),kind:b.kind,spans:b.spans})), 'borrador-ia.md',books,planCore);if(aiSeries&&dev.entries.length!==aiSeries.days)throw new Error(`Organiza el borrador con encabezados Día 1 hasta Día ${aiSeries.days} antes de revisarlo.`);dev.origin='Borrador generado con IA · '+aiDraftModel;dev.description='Borrador de IA pendiente de revisión. Comprueba las referencias e interpretaciones.';if(aiSeries)dev.guide=GuideCore.configuration({...aiSeries,steps:{}});pendingDev=dev;devReviewPage=0;$('#ai-dialog').close();showView('dev');$('#dev-review-title').value=dev.title;$('#dev-review-warnings').textContent='Generado con IA: revisa el contenido de cada día y sus referencias antes de guardarlo.';$('#dev-review').hidden=false;renderDevReview();$('#dev-review').scrollIntoView({block:'start'});}catch(error){$('#ai-status').textContent=error.message;}
}
function bindGuides(){
 $('#series-form').addEventListener('submit',async e=>{e.preventDefault();try{if(state.devotionals.length>=100)throw new Error('Tu biblioteca admite hasta 100 devocionales.');const dev=GuideCore.series(currentSeries(),books,core);state.devotionals.unshift(dev);if(!save())throw new Error('No se pudo guardar.');await saveQueue;if(saveFailed){state.devotionals=state.devotionals.filter(d=>d.id!==dev.id);throw new Error('No se pudo guardar.');}renderDevList();openJourney('dev',dev.id);toast('Tu serie está preparada para leer sin internet.');}catch(error){toast(error.message);}});
 $('#series-form').elements.mode.addEventListener('change',()=>$('#series-people').hidden=$('#series-form').elements.mode.value!=='family');
 $('#series-ai').addEventListener('click',async()=>{try{const spec=currentSeries();await openAi({series:spec});}catch(error){toast(error.message);}});
 $('#journey-guide-open').addEventListener('click',()=>{const d=journeyData();if(!d)return;guideOpenIds.add(d.item.id);renderGuide();$('#guide-card').scrollIntoView({block:'start'});});
 $('#guide-method').addEventListener('change',e=>{const d=journeyData();if(!d)return;const g=d.item.guide||{mode:'solo',participants:1};d.item.guide={...g,method:e.target.value,steps:{}};save();renderGuide();});
 $('#guide-person').addEventListener('change',e=>{guidePerson=Number(e.target.value);renderGuide();});$('#guide-prev').addEventListener('click',()=>guideMove(-1));$('#guide-next').addEventListener('click',()=>guideMove(1));
 $('#guide-response').addEventListener('input',e=>{const d=journeyData();if(!d||state.privateLocked)return;const g=d.item.guide||{method:'oia',steps:{}},step=g.steps?.[d.index]||0;state.guideResponses[`${d.item.id}:${d.index}:${g.method}:${step}:${guidePerson}`]=e.target.value;save();});
 $('#ai-draft-review').addEventListener('click',reviewAiDraft);
}
