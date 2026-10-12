'use strict';
// «Memorizar versículos» (entrega 3B): repaso espaciado de los versículos marcados «Para memorizar», con pistas que
// se van quitando. Teléfono, PC y web; sin red. El progreso viaja en state.memorizar (copias y traspaso).
(function(){
  const M=window.MemorizarCore,E=window.EstudioCore;
  if(!M||!E)return;
  const q=s=>document.querySelector(s);
  let dlg=null,actual=null,mostrarTodo=false,texto='';
  const est=()=>{if(!state.memorizar)state.memorizar={};return state.memorizar;};
  const nombre=r=>books[r.book].name+' '+r.chapter+':'+r.verse+(r.endVerse?'-'+r.endVerse:'');
  const guardar=()=>{try{save();}catch{}};
  const textoDe=async r=>window.HoyApp?.textoDe?(await window.HoyApp.textoDe(r)).texto:(books[r.book]?.chapters[r.chapter-1]||[]).slice(r.verse-1,r.endVerse||r.verse).join(' ');
  function construir(){
    dlg=document.createElement('dialog');dlg.id='memorizar';dlg.setAttribute('aria-labelledby','mem-titulo');
    dlg.innerHTML=`<div class="ia-cabeza"><h2 id="mem-titulo">Memorizar versículos</h2><button type="button" class="quiet" data-mem="cerrar" aria-label="Cerrar">✕</button></div><div id="mem-cuerpo"></div>`;
    document.body.append(dlg);
    dlg.addEventListener('click',alClic);
  }
  function pintarLista(){
    actual=null;
    const l=M.lista(state.estudio?.marcas||[],est()),hoy=l.filter(x=>x.toca).length,pos=state.position;
    q('#mem-cuerpo').innerHTML=`<p class="muted">${l.length?(hoy?`Para repasar hoy: ${hoy}. `:'Hoy no te toca repasar ninguno. ')+'Cada vez que lo sabes, vuelve más adelante (1, 3, 7, 14, 30 y 60 días).':'Todavía no tienes versículos para memorizar. Agrega el que estás leyendo o, en el teléfono, toca un versículo › ⋯ › Memorizar.'}</p>
<button type="button" class="outline" data-mem="agregar">+ Agregar ${esc(nombre(pos))}</button>
<ul class="mem-lista">${l.map(x=>`<li><button type="button" class="mem-item" data-mem-id="${x.id}"><b>${esc(nombre(x))}</b><small>${x.toca?'Toca repasar hoy':'Próximo repaso: '+esc(x.proximo)} · ${esc(M.NIVELES[M.nivelDe(x.caja)])}</small></button></li>`).join('')}</ul>`;
  }
  async function practicar(id){
    const x=M.lista(state.estudio?.marcas||[],est()).find(v=>v.id===id);if(!x)return pintarLista();
    actual=x;mostrarTodo=false;texto=await textoDe(x);pintarPractica();
  }
  function pintarPractica(){
    const x=actual,nivel=mostrarTodo?0:M.nivelDe(x.caja),partes=M.pistas(texto,nivel,x.id);
    q('#mem-cuerpo').innerHTML=`<button type="button" class="quiet" data-mem="volver">← Mis versículos</button><h3 class="mem-ref">${esc(nombre(x))}</h3><p class="mem-nivel">${esc(M.NIVELES[nivel])}${nivel?' · toca una palabra para verla':''}</p>
<p class="mem-texto">${partes.map((p,i)=>p.oculta?`<button type="button" class="mem-oculta" data-mem-palabra="${i}" aria-label="Palabra oculta, toca para verla">${esc(p.pista)}</button>`:esc(p.t)).join('')}</p>
<div class="ia-acciones"><button type="button" class="primary" data-mem="sabe">Me lo sé ✓</button><button type="button" class="outline" data-mem="aun-no">Todavía no</button>${nivel?'<button type="button" class="quiet" data-mem="todo">Mostrar todo</button>':''}</div>`;
    q('#mem-cuerpo').dataset.partes=JSON.stringify(partes.map(p=>p.t));
  }
  function calificar(acierto){
    state.memorizar=M.repasar(est(),actual,acierto);guardar();
    const p=state.memorizar[actual.id];
    toast(acierto?`¡Bien! Próximo repaso: ${p.proximo}.`:'Lo repasamos mañana otra vez.');
    pintarLista();
  }
  function alClic(ev){
    const b=ev.target.closest('button');if(!b)return;
    if(b.dataset.memId)return practicar(b.dataset.memId);
    if(b.dataset.memPalabra!==undefined){const t=JSON.parse(q('#mem-cuerpo').dataset.partes||'[]')[Number(b.dataset.memPalabra)];if(t){b.textContent=t;b.classList.add('vista');}return;}
    const a=b.dataset.mem;
    if(a==='cerrar')dlg.close();
    else if(a==='volver')pintarLista();
    else if(a==='sabe')calificar(true);
    else if(a==='aun-no')calificar(false);
    else if(a==='todo'){mostrarTodo=true;pintarPractica();}
    else if(a==='agregar'){
      const p=state.position,r={book:p.book,chapter:p.chapter,verse:p.verse};
      if(!E.tiene(state.estudio||E.vacio(),'memoria',r)){state.estudio=E.alternar(state.estudio||E.vacio(),'memoria',r);guardar();toast('Agregado a Para memorizar: '+nombre(r));}
      else toast('Ese versículo ya está en tu lista.');
      pintarLista();
    }
  }
  function abrir(){if(!dlg)construir();pintarLista();if(!dlg.open)dlg.showModal();}
  document.addEventListener('click',ev=>{const b=ev.target.closest('[data-action="memorizar-open"]');if(b){ev.preventDefault();abrir();}});
  window.MemorizarBiblia={abrir};
})();
