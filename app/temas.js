'use strict';
// «Temas de la Biblia» (Explorar · búsqueda por tema, entrega 3A): los 44 temas elegidos a mano, cada uno con sus
// pasajes clave y el texto de la Biblia instalada. Sin red. Desde aquí se puede leer o preguntarle a la IA.
(function(){
  const T=window.TemasCore,H=window.HoyCore;
  if(!T||!H)return;
  const q=s=>document.querySelector(s);
  let dlg=null,generacion=0;
  const textoDe=async r=>window.HoyApp?.textoDe?(await window.HoyApp.textoDe(r)).texto:(books[r.book]?.chapters[r.chapter-1]||[]).slice(r.verse-1,r.endVerse||r.verse).join(' ');
  function construir(){
    dlg=document.createElement('dialog');dlg.id='temas-biblia';dlg.setAttribute('aria-labelledby','temas-titulo');
    dlg.innerHTML=`<div class="ia-cabeza"><h2 id="temas-titulo">Temas de la Biblia</h2><button type="button" class="quiet" data-temas="cerrar" aria-label="Cerrar">✕</button></div>
<label for="temas-filtro" class="sr-only">Buscar un tema</label><input id="temas-filtro" type="search" placeholder="Busca un tema: ansiedad, perdón, familia…" autocomplete="off">
<div id="temas-lista" class="temas-lista"></div><section id="temas-detalle" hidden></section>`;
    document.body.append(dlg);
    dlg.addEventListener('click',alClic);
    q('#temas-filtro').addEventListener('input',pintarLista);
  }
  function pintarLista(){
    const f=T.normal(q('#temas-filtro').value);
    const lista=T.TEMAS.filter(t=>!f||T.normal(t.nombre).includes(f)||t.claves.some(c=>T.normal(c).includes(f)));
    q('#temas-lista').innerHTML=lista.length?lista.map(t=>`<button type="button" class="temas-tema" data-tema="${t.id}">${esc(t.nombre)}</button>`).join(''):'<p class="muted">No encontré ese tema. Prueba con otra palabra o pregúntale a la IA.</p>';
    q('#temas-lista').hidden=false;q('#temas-detalle').hidden=true;
  }
  async function abrirTema(id){
    const t=T.TEMAS.find(x=>x.id===id);if(!t)return;
    const gen=++generacion,det=q('#temas-detalle');
    q('#temas-lista').hidden=true;det.hidden=false;
    const PORTADA={ansiedad:'paz',paz:'paz',perdon:'perdon',familia:'familia',matrimonio:'matrimonio',esperanza:'esperanza',fe:'fe',gratitud:'gratitud',oracion:'oracion'}[t.id];
    det.innerHTML=`<button type="button" class="quiet" data-temas="volver">← Todos los temas</button>${PORTADA?`<img class="temas-portada" src="imagenes/portadas/${PORTADA}.webp" alt="">`:''}<h3>${esc(t.nombre)}</h3><ol class="temas-pasajes">${t.citas.map((c,i)=>`<li><button type="button" class="temas-cita" data-cita="${esc(c)}">${esc(c)}</button><p id="tema-texto-${i}">…</p></li>`).join('')}</ol>${window.IaBiblia?`<button type="button" class="outline temas-ia" data-temas="ia">✦ Pregúntale a la Biblia sobre «${esc(t.nombre.toLowerCase())}»</button>`:''}`;
    det.dataset.tema=id;det.scrollTop=0;
    for(const [i,c] of t.citas.entries()){const r=H.parsear(c),tx=await textoDe(r.endVerse&&r.endVerse-r.verse>3?{...r,endVerse:r.verse+3}:r);if(gen!==generacion)return;const p=q('#tema-texto-'+i);if(p)p.textContent=tx+(r.endVerse&&r.endVerse-r.verse>3?' …':'');}
  }
  function alClic(ev){
    const b=ev.target.closest('button');if(!b)return;
    if(b.dataset.tema)return abrirTema(b.dataset.tema);
    if(b.dataset.cita){const r=H.parsear(b.dataset.cita);dlg.close();go(r.book,r.chapter,r.verse,r.endVerse);return;}
    const a=b.dataset.temas;
    if(a==='cerrar')dlg.close();
    else if(a==='volver')pintarLista();
    else if(a==='ia'){const t=T.TEMAS.find(x=>x.id===q('#temas-detalle').dataset.tema);dlg.close();window.IaBiblia?.abrir({modo:'tema',pregunta:'¿Qué dice la Biblia sobre '+t.nombre.toLowerCase()+'?'});}
  }
  function abrir(id){if(!dlg)construir();q('#temas-filtro').value='';pintarLista();if(!dlg.open)dlg.showModal();if(id)abrirTema(id);}
  document.addEventListener('click',ev=>{const b=ev.target.closest('[data-action="temas-open"]');if(b){ev.preventDefault();abrir();}});
  window.TemasBiblia={abrir};
})();
