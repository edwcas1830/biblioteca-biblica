'use strict';
// «Preguntar a la Biblia» (IA integrada, CONSENSO-HABITO.md · entrega 4). La persona no conecta ninguna cuenta:
// la app busca los pasajes en SU Biblia, los manda con la pregunta a nuestro servidor (Cloudflare Workers AI) y,
// al volver, marca cada cita: «Cita encontrada en tu Biblia» o «No encontré esta cita». Teléfono, PC y web.
(function(){
  const C=window.IaBibliaCore,T=window.TemasCore,H=window.HoyCore;
  if(!C||!T||!H)return;
  const q=s=>document.querySelector(s);
  const URL_IA=()=>String(window.BIBLIA_IA_URL||'').replace(/\/$/,'');
  const LS_DISP='biblioteca-ia-dispositivo';
  let dlg=null,modo='tema',ultima=null,enviando=false,cuota=null;

  function dispositivo(){
    let d='';try{d=localStorage.getItem(LS_DISP)||'';}catch{}
    if(!/^[0-9a-f]{32}$/.test(d)){const a=new Uint8Array(16);crypto.getRandomValues(a);d=[...a].map(x=>x.toString(16).padStart(2,'0')).join('');try{localStorage.setItem(LS_DISP,d);}catch{}}
    return d;
  }
  const datos=()=>{if(!state.iaBiblia)state.iaBiblia={consentido:false,historial:[]};return state.iaBiblia;};
  const guardar=()=>{try{save();}catch{}};
  const nombreRef=r=>books[r.book].name+' '+r.chapter+':'+r.verse+(r.endVerse?'-'+r.endVerse:'');

  // ---------- Pasajes que acompañan la pregunta (sin red) ----------
  async function textoDe(r){
    if(window.HoyApp?.textoDe)return (await window.HoyApp.textoDe(r)).texto;
    const cap=books[r.book]?.chapters[r.chapter-1]||[];return cap.slice(r.verse-1,r.endVerse||r.verse).join(' ');
  }
  function refActual(){
    const p=state.position;
    if(typeof readerRange!=='undefined'&&readerRange&&readerRange.book===p.book&&readerRange.chapter===p.chapter)return {book:p.book,chapter:p.chapter,verse:readerRange.start,endVerse:readerRange.end};
    return {book:p.book,chapter:p.chapter,verse:p.verse};
  }
  async function pasajesPara(m,pregunta){
    const lista=[],vistos=new Set();
    const agregar=r=>{if(!r||!C.existe(r,books))return;const k=C.clave(r)+'-'+(r.endVerse||'');if(vistos.has(k)||lista.length>=14)return;vistos.add(k);lista.push(r);};
    if(m==='explicar'){
      const r=refActual(),total=books[r.book].chapters[r.chapter-1].length;
      // El pasaje con dos versículos de contexto a cada lado (máximo 12).
      const ini=Math.max(1,r.verse-2),fin=Math.min(total,Math.max(r.endVerse||r.verse,r.verse)+2,ini+11);
      agregar({book:r.book,chapter:r.chapter,verse:ini,endVerse:fin});
      try{const c=await window.libraryDesktop?.connections?.({book:r.book,chapter:r.chapter,verse:r.verse});for(const it of (c?.items||[]).slice(0,4)){const ref=it.reference||it;if(Number.isInteger(ref.book))agregar({book:ref.book,chapter:ref.chapter,verse:ref.verse,...(ref.endVerse>ref.verse?{endVerse:Math.min(ref.endVerse,ref.verse+2)}:{})});}}catch{}
    }else{
      const temas=T.detectar(pregunta,2);
      temas.forEach((t,i)=>t.citas.slice(0,i?4:10).map(H.parsear).forEach(r=>agregar(r&&r.endVerse&&r.endVerse-r.verse>5?{...r,endVerse:r.verse+5}:r)));
      // Además, versículos donde aparecen las palabras de la pregunta (en la Biblia elegida).
      for(const w of T.palabras(pregunta).slice(0,4)){
        if(lista.length>=14)break;
        try{const r=await window.libraryDesktop?.search?.({module:typeof selectedVersion!=='undefined'?selectedVersion:'rv1909',query:w,mode:'text'});for(const x of (r?.results||[]).slice(0,3)){const ref=x.reference||x;if(Number.isInteger(ref.book))agregar({book:ref.book,chapter:ref.chapter,verse:ref.verse});}}catch{}
      }
    }
    const conTexto=[];
    for(const r of lista)conTexto.push({...r,cita:nombreRef(r),texto:(await textoDe(r)).slice(0,700)});
    return conTexto;
  }

  // ---------- Respuesta con citas revisadas ----------
  function pintarRespuesta(texto,pasajes){
    const citas=C.verificar(texto,books.map(b=>b.name),books,pasajes);
    let html='',pos=0;
    for(const c of citas){
      html+=esc(texto.slice(pos,c.inicio));
      const etiqueta=c.existe?'Cita encontrada en tu Biblia':'No encontré esta cita en tu Biblia';
      html+=c.existe?`<button type="button" class="ia-cita" data-ref="${c.book}:${c.chapter}:${c.verse}:${c.endVerse||''}" title="${etiqueta}" aria-label="${esc(c.texto)} · ${etiqueta}">${esc(c.texto)}<span aria-hidden="true"> ✓</span></button>`:`<span class="ia-cita-dudosa" title="${etiqueta}">${esc(c.texto)} <span aria-hidden="true">⚠</span><span class="sr-only"> · ${etiqueta}</span></span>`;
      pos=c.fin;
    }
    html+=esc(texto.slice(pos));
    const parrafos=html.split(/\n{2,}|\n(?=[-•*] )/).map(p=>p.trim()).filter(Boolean).map(p=>'<p>'+p.replace(/\n/g,'<br>').replace(/\*\*(.+?)\*\*/g,'<b>$1</b>')+'</p>').join('');
    const buenas=citas.filter(c=>c.existe).length,malas=citas.length-buenas;
    return {html:parrafos,resumen:citas.length?(buenas+' cita'+(buenas===1?'':'s')+' encontrada'+(buenas===1?'':'s')+' en tu Biblia'+(malas?' · '+malas+' sin encontrar':'')):'Sin citas en la respuesta'};
  }

  // ---------- Servidor ----------
  async function llamar(ruta,cuerpo){
    const ctl=new AbortController(),t=setTimeout(()=>ctl.abort(),60000);
    try{
      const r=await fetch(URL_IA()+ruta,{method:cuerpo?'POST':'GET',headers:{'content-type':'application/json','x-dispositivo':dispositivo()},body:cuerpo?JSON.stringify(cuerpo):undefined,signal:ctl.signal});
      const j=await r.json().catch(()=>({}));
      return {ok:r.ok,estado:r.status,...j};
    }catch(e){return {ok:false,error:'RED',mensaje:e.name==='AbortError'?'La IA tardó demasiado. Intenta de nuevo.':'Sin conexión. La IA necesita internet; el resto de la app sigue funcionando.'};}
    finally{clearTimeout(t);}
  }
  async function actualizarCuota(){
    if(!URL_IA())return;
    const r=await llamar('/v1/estado');
    if(r.ok){cuota=r;const c=q('#ia-cuota');if(c)c.textContent=C.textoCuota(r.quedan,r.limite);}
  }

  // ---------- Pantalla ----------
  function construir(){
    dlg=document.createElement('dialog');dlg.id='ia-biblia';dlg.setAttribute('aria-labelledby','ia-titulo');
    dlg.innerHTML=`<div class="ia-cabeza"><h2 id="ia-titulo">Preguntar a la Biblia <span aria-hidden="true">✦</span></h2><button type="button" class="quiet" data-ia="cerrar" aria-label="Cerrar">✕</button></div>
<p class="ia-aviso">${esc(C.AVISO)}</p>
<section id="ia-consentimiento" hidden><p><b>Antes de la primera pregunta</b></p><p>Tu pregunta y los versículos que la app encuentre en tu Biblia se envían a nuestro servidor (Cloudflare) para que la IA responda. No se guarda tu nombre ni tu pregunta: solo contamos cuántas haces al día. Si tocas «Reportar», esa pregunta y su respuesta sí se guardan para revisarlas.</p><div class="ia-acciones"><button type="button" class="primary" data-ia="aceptar">Acepto</button><button type="button" class="quiet" data-ia="cerrar">Ahora no</button></div></section>
<section id="ia-formulario">
<div class="ia-modos" role="radiogroup" aria-label="Qué quieres hacer">${C.MODOS.map(m=>`<button type="button" role="radio" class="ia-modo" data-modo="${m.id}" aria-checked="false">${esc(m.nombre)}</button>`).join('')}</div>
<p id="ia-pasaje" class="ia-pasaje" hidden></p>
<label for="ia-pregunta" class="sr-only">Tu pregunta</label><textarea id="ia-pregunta" rows="3" maxlength="600"></textarea>
<div class="ia-acciones"><button type="button" class="primary" data-ia="enviar">Preguntar</button><span id="ia-cuota" class="ia-cuota" role="status"></span></div>
</section>
<section id="ia-resultado" aria-live="polite"></section>
<details id="ia-historial-caja" hidden><summary>Mis preguntas anteriores</summary><div id="ia-historial"></div></details>
<p class="ia-equipo">Código de este equipo: <span id="ia-equipo"></span></p>`;
    document.body.append(dlg);
    dlg.addEventListener('click',alClic);
    dlg.addEventListener('cancel',()=>{});
  }
  function elegirModo(m){
    modo=m;
    for(const b of dlg.querySelectorAll('.ia-modo'))b.setAttribute('aria-checked',String(b.dataset.modo===m));
    const info=C.MODOS.find(x=>x.id===m),area=q('#ia-pregunta'),pasaje=q('#ia-pasaje');
    area.placeholder=info.ejemplo;
    if(m==='explicar'){const r=refActual();pasaje.hidden=false;pasaje.textContent='Pasaje: '+nombreRef(r)+' · cámbialo eligiendo otro versículo en la Biblia.';if(!area.value)area.value='¿Qué significa este pasaje y cómo lo aplico hoy?';}
    else pasaje.hidden=true;
  }
  function pintarHistorial(){
    const h=datos().historial,caja=q('#ia-historial-caja');caja.hidden=!h.length;
    q('#ia-historial').innerHTML=h.map((x,i)=>`<button type="button" class="ia-hist" data-hist="${i}"><b>${esc(C.MODOS.find(m=>m.id===x.modo)?.nombre||'')}</b> ${esc(x.pregunta.slice(0,90))}</button>`).join('');
  }
  function mostrarRespuesta(x,pasajes){
    const r=pintarRespuesta(x.respuesta,pasajes||[]);
    q('#ia-resultado').innerHTML=`<article class="ia-respuesta"><p class="ia-pregunta-vista">${esc(x.pregunta)}</p>${r.html}<p class="ia-resumen">${esc(r.resumen)}</p><div class="ia-acciones"><button type="button" class="outline" data-ia="copiar">Copiar</button><button type="button" class="quiet" data-ia="reportar">Reportar</button><button type="button" class="quiet" data-ia="otra">Otra pregunta</button></div></article>`;
  }
  async function enviar(){
    if(enviando)return;
    const pregunta=q('#ia-pregunta').value.trim();
    if(!pregunta){q('#ia-pregunta').focus();return;}
    if(!URL_IA()){q('#ia-resultado').innerHTML='<p class="ia-error">La IA integrada se activa pronto. Mientras tanto, puedes usar «Estudio con IA» con tu propia cuenta (edición personal).</p>';return;}
    enviando=true;const boton=dlg.querySelector('[data-ia="enviar"]');boton.disabled=true;boton.textContent='Buscando en tu Biblia…';
    q('#ia-resultado').innerHTML='<p class="ia-espera" role="status">Buscando pasajes y preparando la respuesta…</p>';
    try{
      const pasajes=await pasajesPara(modo,pregunta);
      boton.textContent='La IA está respondiendo…';
      const r=await llamar('/v1/preguntar',{modo,pregunta,pasajes:pasajes.map(p=>({cita:p.cita,texto:p.texto})),version:typeof selectedVersion!=='undefined'?selectedVersion:'',idem:C.idem()});
      if(!r.ok||!r.respuesta){q('#ia-resultado').innerHTML=`<p class="ia-error">${esc(r.mensaje||'La IA no respondió. Intenta de nuevo.')}</p>`;if(r.quedan!==undefined){const c=q('#ia-cuota');if(c)c.textContent=C.textoCuota(r.quedan,r.limite||cuota?.limite);}return;}
      ultima={modo,pregunta,respuesta:r.respuesta,fecha:new Date().toISOString(),ref:modo==='explicar'?nombreRef(refActual()):''};
      mostrarRespuesta(ultima,pasajes);
      const d=datos();d.historial=C.validarHistorial([ultima,...d.historial]);guardar();pintarHistorial();
      if(r.quedan!==undefined){cuota={...cuota,quedan:r.quedan,limite:r.limite};q('#ia-cuota').textContent=C.textoCuota(r.quedan,r.limite);}
    }finally{enviando=false;boton.disabled=false;boton.textContent='Preguntar';}
  }
  async function alClic(ev){
    const b=ev.target.closest('button');if(!b)return;
    if(b.dataset.modo)return elegirModo(b.dataset.modo);
    if(b.classList.contains('ia-cita')){const [bk,ch,v,e]=b.dataset.ref.split(':').map(Number);dlg.close();go(bk,ch,v,e||undefined);return;}
    if(b.dataset.hist!==undefined){const x=datos().historial[Number(b.dataset.hist)];if(x){ultima=x;mostrarRespuesta(x,[]);}return;}
    const a=b.dataset.ia;
    if(a==='cerrar')dlg.close();
    else if(a==='aceptar'){datos().consentido=true;guardar();q('#ia-consentimiento').hidden=true;q('#ia-formulario').hidden=false;q('#ia-pregunta').focus();actualizarCuota();}
    else if(a==='enviar')enviar();
    else if(a==='otra'){q('#ia-resultado').innerHTML='';q('#ia-pregunta').value='';q('#ia-pregunta').focus();}
    else if(a==='copiar'&&ultima){const t=ultima.respuesta+'\n\n— '+C.AVISO;try{await navigator.clipboard.writeText(t);toast('Respuesta copiada.');}catch{toast('No se pudo copiar.');}}
    else if(a==='reportar'&&ultima){
      const r=await llamar('/v1/reportar',{modo:ultima.modo,pregunta:ultima.pregunta,respuesta:ultima.respuesta,motivo:'Reportado desde la app'});
      toast(r.ok?'Gracias. Revisaremos esta respuesta.':'No se pudo enviar el reporte. Intenta más tarde.');
    }
  }
  // Abre la pantalla. opciones: {modo:'explicar'|'tema'|'devocional'|'oracion', pregunta}
  function abrir(opciones={}){
    if(!dlg)construir();
    const d=datos();
    q('#ia-consentimiento').hidden=!!d.consentido;q('#ia-formulario').hidden=!d.consentido;
    if(opciones.pregunta)q('#ia-pregunta').value=opciones.pregunta;
    elegirModo(opciones.modo||modo);
    pintarHistorial();
    q('#ia-equipo').textContent=dispositivo().slice(0,8);
    if(!dlg.open)dlg.showModal();
    if(d.consentido){actualizarCuota();q('#ia-pregunta').focus({preventScroll:true});}
  }
  document.addEventListener('click',ev=>{const b=ev.target.closest('[data-action="ia-biblia-open"]');if(b){ev.preventDefault();abrir(b.dataset.iaModo?{modo:b.dataset.iaModo}:{});}});
  window.IaBiblia={abrir,pasajesPara,pintarRespuesta,dispositivo};
})();
