'use strict';
// «Hoy» (CONSENSO-HABITO.md, entrega 2B): el versículo del día, 4 pasos cortos que se marcan a mano, la semana
// y «Continuar leyendo». Funciona sin conexión; lo marcado viaja en state.hoy (copias y traspaso).
// Teléfono y web: además, el cuestionario de bienvenida y el aviso diario (solo Android).
(function(){
  const H=window.HoyCore;
  if(!H)return;
  const q=s=>document.querySelector(s);
  const plataforma=()=>window.BibliaPlataforma||{};
  const enTelefono=()=>document.documentElement.dataset.telefono==='true';
  // Sin <details>: en el iPhone (WebKit) su estilo interno choca con la CSP de la app al crearlo desde JS.
  let abierto=null, generacion=0, animado=false, ajustesAbiertos=false;
  // Lo que es de ESTE aparato (no de la biblioteca): si ya vio la bienvenida y qué día abrió «Hoy» por última vez.
  // Así un traspaso desde la PC o recuperar una copia no repite la bienvenida ni vuelve a abrir «Hoy» el mismo día.
  const LS_BIENVENIDA='biblioteca-hoy-bienvenida', LS_DIA='biblioteca-hoy-ultimo-dia';
  const leerLS=k=>{try{return localStorage.getItem(k)||'';}catch{return '';}};
  const escribirLS=(k,v)=>{try{localStorage.setItem(k,v);}catch{/* sin almacenamiento: vale lo de la biblioteca */}};

  function datos(){if(!state.hoy)state.hoy=H.vacio();return state.hoy;}
  function guardar(){try{save();}catch{/* app.js avisa si no se pudo */}}
  // Texto plano del HTML del módulo: se quitan las etiquetas y un <textarea> traduce las entidades (&aacute;…).
  // Sin DOMParser: en el iPhone (WebKit) el documento que crea choca con la CSP de la app.
  const descodificador=document.createElement('textarea');
  const sinEtiquetas=html=>{descodificador.innerHTML=String(html||'').replace(/<sup[^>]*>.*?<\/sup>/gis,' ').replace(/<[^>]*>/g,'');return descodificador.value.replace(/\s+/g,' ').trim();};
  // El texto sale de la Biblia elegida en el lector; si no está disponible, de la Reina-Valera 1909 que viene con la app.
  async function textoDe(ref){
    const fin=ref.endVerse||ref.verse;
    if(window.libraryDesktop?.chapter&&typeof selectedVersion!=='undefined'){
      try{
        const r=await window.libraryDesktop.chapter({module:selectedVersion,book:ref.book,chapter:ref.chapter,strong:false});
        const filas=(r.verses||[]).filter(v=>(v.endVerse||v.verse)>=ref.verse&&v.verse<=fin);
        if(filas.length)return {texto:filas.map(v=>sinEtiquetas(v.html)).join(' '),edicion:r.title||''};
      }catch{/* se usa la RV1909 */}
    }
    const cap=books[ref.book]?.chapters[ref.chapter-1]||[];
    return {texto:cap.slice(ref.verse-1,fin).join(' ').replace(/^([A-ZÁÉÍÓÚÑ]{2,})(\s)/,(m,p,s)=>p.charAt(0)+p.slice(1).toLowerCase()+s),edicion:'Reina-Valera 1909'};
  }
  const fechaLarga=d=>{const t=d.toLocaleDateString('es',{weekday:'long',day:'numeric',month:'long'});return t.charAt(0).toUpperCase()+t.slice(1);};
  const resumen={conexion:()=>H.conexion(),versiculo:v=>v.cita,devocion:()=>'Lee · Piensa · Aplica',oracion:()=>'Una guía corta para orar'};

  function cuerpoDe(id,v,hecho){
    const d=H.devocion();
    const boton=`<button type="button" class="${hecho?'outline':'primary'} hoy-hecho" data-hoy-hecho="${id}" aria-pressed="${hecho}">${hecho?'Hecho ✓ · desmarcar':'Marcar como hecho'}</button>`;
    if(id==='conexion')return `<p class="hoy-pregunta">${esc(H.conexion())}</p><p class="muted">Tómate un minuto en silencio. No hace falta escribir nada.</p>${boton}`;
    if(id==='versiculo')return `<p>Lee <b>${esc(v.cita)}</b> despacio, dos veces. Si tienes tiempo, lee el capítulo completo.</p><button type="button" class="outline" data-hoy="leer">Leer ${esc(books[v.book].name)} ${v.chapter} ↗</button>${boton}`;
    if(id==='devocion')return `<h4>Lee</h4><p>${esc(v.cita)}: vuelve al versículo de arriba.</p><h4>Piensa</h4><ul>${d.piensa.map(p=>`<li>${esc(p)}</li>`).join('')}</ul><h4>Aplica</h4><p>${esc(d.aplica)}</p>${boton}`;
    return `<p class="hoy-oracion">${esc(H.oracion())}</p><p class="muted">Termina con tus propias palabras.</p><button type="button" class="outline" data-hoy="oracion">Abrir mi cuaderno de oración</button>${boton}`;
  }

  async function render(){
    const vista=q('#hoy-view');if(!vista)return;
    const e=datos(),hoy=new Date(),f=H.clave(hoy),v=H.delDia(hoy),gen=++generacion;
    if(e.ultimoDia!==f){e.ultimoDia=f;guardar();}
    escribirLS(LS_DIA,f);
    const hechos=H.pasosHechos(e,f),total=H.totalDias(e),p=state.position;
    const semana=H.semana(e,hoy).map(d=>`<li class="${d.hecho?'hecho':''} ${d.hoy?'hoy':''} ${d.futuro?'futuro':''}" aria-label="${esc(d.fecha)}${d.hecho?' · leído':''}"><span>${d.letra}</span><i aria-hidden="true">${d.hecho?'✓':d.hoy?'•':''}</i></li>`).join('');
    const pasos=H.PASOS.map(paso=>{const h=H.hecho(e,f,paso.id),ab=abierto===paso.id;return `<section class="hoy-paso ${h?'hecho':''}" data-paso="${paso.id}"><button type="button" class="hoy-paso-cabeza" data-hoy-abrir="${paso.id}" aria-expanded="${ab}" aria-controls="hoy-cuerpo-${paso.id}"><span class="hoy-check" aria-hidden="true">${h?'✓':''}</span><span class="hoy-paso-texto"><b>${paso.titulo}</b><small>${esc(resumen[paso.id](v))}</small></span><em>${paso.minutos} min</em></button><div class="hoy-paso-cuerpo" id="hoy-cuerpo-${paso.id}" ${ab?'':'hidden'}>${cuerpoDe(paso.id,v,h)}</div></section>`;}).join('');
    const avisos=!!plataforma().recordatorio;
    vista.innerHTML=`<header class="hoy-cabeza"><div><p class="eyebrow">HOY</p><h1>${esc(fechaLarga(hoy))}</h1></div><p class="hoy-total">${total===1?'1 día':total+' días'} en la Palabra</p></header>
<ol class="hoy-semana" aria-label="Tu semana">${semana}</ol>
<article class="hoy-versiculo ${animado?'':'hoy-entra'}" aria-labelledby="hoy-vers-titulo"><p class="eyebrow" id="hoy-vers-titulo">VERSÍCULO DEL DÍA</p><blockquote id="hoy-vers-texto">…</blockquote><p class="hoy-cita"><span>${esc(v.cita)}</span> <small id="hoy-vers-edicion"></small></p><div class="hoy-vers-acciones"><button type="button" class="outline" data-hoy="leer">Leer el capítulo</button><button type="button" class="quiet" data-hoy="copiar">Copiar</button></div></article>
<p class="hoy-progreso" role="status">${hechos===4?'Completaste tu día. Que esta palabra te acompañe.':hechos+' de 4 pasos · unos 8 minutos'}</p>
<div class="hoy-pasos">${pasos}</div>
<button type="button" class="outline hoy-seguir" data-hoy="seguir">Continuar leyendo · ${esc(books[p.book].name)} ${p.chapter}</button>
<nav class="hoy-mas" aria-label="Más para tu camino"><button type="button" class="quiet" data-hoy-ir="dev">Mis devocionales y series</button><button type="button" class="quiet" data-hoy-ir="plan">Mi plan de lectura</button><button type="button" class="quiet" data-hoy-ir="prayer">Oración y testimonios</button></nav>
<div class="hoy-ajustes"><button type="button" class="quiet hoy-ajustes-abrir" data-hoy="ajustes" aria-expanded="${ajustesAbiertos}" aria-controls="hoy-ajustes-cuerpo">Ajustes de «Hoy» ${ajustesAbiertos?'▴':'▾'}</button><div id="hoy-ajustes-cuerpo" ${ajustesAbiertos?'':'hidden'}>
<label class="checkbox-label"><input type="checkbox" id="hoy-abrir-primero" ${e.abrirEnHoy?'checked':''}> Abrir «Hoy» la primera vez de cada día</label>
${avisos?`<label>Aviso diario del versículo<input type="time" id="hoy-hora" value="${esc(e.perfil.hora)}"></label><button type="button" class="quiet" id="hoy-sin-aviso" ${e.perfil.hora?'':'hidden'}>Quitar el aviso diario</button><p class="fine-print" id="hoy-aviso-estado" role="status">${e.perfil.hora?'Un aviso al día a las '+esc(e.perfil.hora)+'.':'Sin aviso diario.'}</p>`:''}
</div></div>`;
    animado=true;
    const t=await textoDe(v);if(gen!==generacion)return;
    q('#hoy-vers-texto').textContent=t.texto||v.cita;q('#hoy-vers-edicion').textContent=t.edicion?'· '+t.edicion:'';
  }

  async function marcar(id){
    const e=datos(),f=H.clave();state.hoy=H.marcar(e,f,id,!H.hecho(e,f,id));guardar();
    const siguiente=H.PASOS.find(p=>!H.hecho(state.hoy,f,p.id));abierto=H.hecho(state.hoy,f,id)?(siguiente?.id||null):id;
    await render();
    if(abierto)q(`[data-paso="${abierto}"]`)?.scrollIntoView({block:'nearest',behavior:'smooth'});
  }
  async function copiar(){
    const v=H.delDia(),t=await textoDe(v),texto=`«${t.texto}» ${v.cita}`;
    try{await navigator.clipboard.writeText(texto);toast('Versículo copiado.');}catch{toast(texto);}
  }

  async function programarAvisos(){
    const rec=plataforma().recordatorio;if(!rec)return 0;
    const hora=datos().perfil.hora;
    try{
      if(!hora){await rec.cancelar();return 0;}
      const lista=[];
      for(const a of H.proximosAvisos(hora,14)){const t=await textoDe(a);lista.push({...a,texto:(t.texto||a.cita).slice(0,600)});}
      return await rec.programar(lista);
    }catch(error){console.warn('Aviso diario',error);return 0;}
  }
  async function elegirHora(hora){
    const e=datos(),rec=plataforma().recordatorio;
    if(hora&&rec){let ok=false;try{ok=await rec.permiso();}catch{}if(!ok){toast('Sin permiso de notificaciones no puedo avisarte. Puedes darlo en los ajustes de Android.');hora='';}}
    state.hoy={...e,perfil:{...e.perfil,hora:hora||''}};guardar();
    const n=await programarAvisos();
    const estado=q('#hoy-aviso-estado');if(estado)estado.textContent=state.hoy.perfil.hora?`Un aviso al día a las ${state.hoy.perfil.hora}.`:'Sin aviso diario.';
    const quitar=q('#hoy-sin-aviso');if(quitar)quitar.hidden=!state.hoy.perfil.hora;
    return n;
  }

  function enlazar(){
    const vista=q('#hoy-view');if(!vista||vista.dataset.enlazada)return;vista.dataset.enlazada='1';
    vista.addEventListener('click',ev=>{
      const b=ev.target.closest('button');if(!b)return;
      if(b.dataset.hoyAbrir){abierto=abierto===b.dataset.hoyAbrir?null:b.dataset.hoyAbrir;render();return;}
      if(b.dataset.hoyHecho){marcar(b.dataset.hoyHecho);return;}
      if(b.dataset.hoyIr){showView(b.dataset.hoyIr);return;}
      const accion=b.dataset.hoy;
      if(accion==='leer'){const v=H.delDia();go(v.book,v.chapter,v.verse,v.endVerse);}
      else if(accion==='seguir'){const p=state.position;go(p.book,p.chapter,p.verse);}
      else if(accion==='copiar')copiar();
      else if(accion==='oracion')showView('prayer');
      else if(accion==='ajustes'){ajustesAbiertos=!ajustesAbiertos;const c=q('#hoy-ajustes-cuerpo');if(c)c.hidden=!ajustesAbiertos;b.setAttribute('aria-expanded',String(ajustesAbiertos));b.textContent='Ajustes de «Hoy» '+(ajustesAbiertos?'▴':'▾');}
      else if(b.id==='hoy-sin-aviso'){const h=q('#hoy-hora');if(h)h.value='';elegirHora('');}
    });
    vista.addEventListener('change',ev=>{
      if(ev.target.id==='hoy-abrir-primero'){state.hoy={...datos(),abrirEnHoy:ev.target.checked};guardar();}
      if(ev.target.id==='hoy-hora')elegirHora(ev.target.value);
    });
    window.addEventListener('biblioteca:abrir-hoy',()=>showView('hoy'));
  }

  // ---------- Bienvenida (teléfono y web): 5 pantallas cortas, se puede saltar, todo queda en el teléfono ----------
  const PROPOSITO={leer:'Leer toda la Biblia',estudiar:'Estudiar a fondo',paz:'Encontrar paz y consuelo',orar:'Aprender a orar'};
  const TRADICION={evangelica:'Evangélica',catolica:'Católica',otra:'Otra',ninguna:'Prefiero no decir'};
  const necesitaBienvenida=()=>!datos().bienvenida&&!leerLS(LS_BIENVENIDA);
  function bienvenida(){
    return new Promise(resolver=>{
      const e=datos(),conAviso=!!plataforma().recordatorio;
      const versiones=[...(q('#version-select')?.options||[])].map(o=>[o.value,o.textContent]);
      const respuesta={version:typeof selectedVersion!=='undefined'?selectedVersion:'',proposito:e.perfil.proposito,meta:e.perfil.meta||4,hora:conAviso?(e.perfil.hora||'07:00'):'',tradicion:e.perfil.tradicion};
      const opcion=(nombre,valor,texto,actual)=>`<label class="hoy-op"><input type="radio" name="${nombre}" value="${esc(valor)}" ${String(actual)===String(valor)?'checked':''}><span>${esc(texto)}</span></label>`;
      const pantallas=[
        {titulo:'Tu Biblia de estudio',html:`<p>Lee, estudia y ora cada día, con o sin internet.</p><p class="muted">Cuatro preguntas rápidas para preparar tu «Hoy». Todo se guarda solo en este teléfono.</p>`},
        ...(versiones.length>1?[{titulo:'¿Qué Biblia quieres leer?',html:versiones.map(([v,t])=>opcion('version',v,t,respuesta.version)).join(''),campo:'version'}]:[]),
        {titulo:'¿Qué buscas en la Palabra?',html:Object.entries(PROPOSITO).map(([v,t])=>opcion('proposito',v,t,respuesta.proposito)).join(''),campo:'proposito'},
        {titulo:'Tu ritmo',html:`<p class="muted">¿Cuántos días por semana quieres leer? Si fallas un día no pasa nada: la semana se cumple igual.</p>${[3,4,5,7].map(n=>opcion('meta',n,n===7?'Todos los días':n+' días por semana',respuesta.meta)).join('')}${conAviso?`<label class="hoy-hora-bienvenida">Recordarme el versículo del día a las<input type="time" name="hora" value="${esc(respuesta.hora)}"></label><label class="checkbox-label"><input type="checkbox" name="sin-aviso"> Sin aviso diario</label>`:''}`,campo:'meta'},
        {titulo:'Tu tradición (opcional)',html:`<p class="muted">Nos ayuda a sugerirte planes. Puedes dejarlo en blanco.</p>${Object.entries(TRADICION).map(([v,t])=>opcion('tradicion',v,t,respuesta.tradicion||'')).join('')}`,campo:'tradicion'}
      ];
      let i=0;
      const dlg=document.createElement('dialog');dlg.id='hoy-bienvenida';dlg.setAttribute('aria-labelledby','hoy-bienvenida-titulo');
      document.body.append(dlg);
      const leer=()=>{const fd=new FormData(dlg.querySelector('form'));for(const [k,v] of fd.entries())respuesta[k]=v;if(fd.get('sin-aviso'))respuesta.hora='';};
      const terminar=async saltada=>{
        if(!saltada)leer();
        const actual=datos(),perfil={...actual.perfil};
        if(!saltada){
          if(H.PROPOSITOS.includes(respuesta.proposito))perfil.proposito=respuesta.proposito;
          const meta=Number(respuesta.meta);if(meta>=1&&meta<=7)perfil.meta=meta;
          perfil.tradicion=H.TRADICIONES.includes(respuesta.tradicion)?respuesta.tradicion:'';
          const sel=q('#version-select');if(sel&&respuesta.version&&sel.value!==respuesta.version&&[...sel.options].some(o=>o.value===respuesta.version)){sel.value=respuesta.version;sel.dispatchEvent(new Event('change',{bubbles:true}));}
        }
        state.hoy={...actual,bienvenida:saltada?'saltada':'hecha',perfil};guardar();escribirLS(LS_BIENVENIDA,state.hoy.bienvenida);
        dlg.close();dlg.remove();
        if(!saltada&&conAviso&&/^\d\d:\d\d$/.test(respuesta.hora||''))await elegirHora(respuesta.hora);
        showView('hoy');resolver(saltada?'saltada':'hecha');
      };
      const pintar=()=>{
        const p=pantallas[i],ultima=i===pantallas.length-1;
        dlg.innerHTML=`<form method="dialog" class="hoy-bienvenida-form"><p class="eyebrow">${i+1} DE ${pantallas.length}</p><h2 id="hoy-bienvenida-titulo" tabindex="-1">${esc(p.titulo)}</h2><div class="hoy-bienvenida-cuerpo">${p.html}</div><div class="hoy-bienvenida-acciones"><button type="button" class="quiet" data-b="saltar">Saltar</button>${i?'<button type="button" class="outline" data-b="atras">Atrás</button>':''}<button type="button" class="primary" data-b="seguir">${i===0?'Empezar':ultima?'Ir a «Hoy»':'Siguiente'}</button></div></form>`;
        dlg.querySelector('h2').focus({preventScroll:true});
      };
      dlg.addEventListener('click',ev=>{
        const b=ev.target.closest('[data-b]');if(!b)return;
        if(b.dataset.b==='saltar')return terminar(true);
        leer();
        if(b.dataset.b==='atras'){i=Math.max(0,i-1);return pintar();}
        if(i===pantallas.length-1)return terminar(false);
        i++;pintar();
      });
      dlg.addEventListener('cancel',ev=>{ev.preventDefault();terminar(true);});
      pintar();dlg.showModal();
    });
  }

  // Al abrir: la primera vez de cada día, «Hoy» (si la persona no lo apagó). Devuelve si lo abrió.
  function abrirSiToca(){const e=datos(),local=leerLS(LS_DIA);if(H.abrirPrimero({...e,ultimoDia:local>e.ultimoDia?local:e.ultimoDia})){showView('hoy');return true;}return false;}

  window.HoyApp={render,enlazar,marcar,programarAvisos,elegirHora,bienvenida,necesitaBienvenida,abrirSiToca,textoDe,enTelefono};
})();
