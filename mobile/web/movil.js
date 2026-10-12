'use strict';
// Capa de teléfono: navegación inferior, hoja de estudio (Comentario / Diccionario / Original),
// menú «Más» y popover de la palabra original. No reemplaza controladores: delega en los
// botones y controles que ya existen en app/index.html, para que escritorio y teléfono
// sigan compartiendo la misma lógica.
(function () {
  const ANCHO_TELEFONO = 600;
  const html = document.documentElement;
  const consulta = window.matchMedia(`(max-width:${ANCHO_TELEFONO - 1}px)`);
  const $ = (sel, raiz = document) => raiz.querySelector(sel);
  const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];
  const estado = { hoja: 'plegada', pestana: 'comentario', fijada: false, construida: false };

  function botonPorTexto(selector, texto) {
    return $$(selector).find(b => b.textContent.replace(/\s+/g, ' ').trim().toLowerCase().includes(texto));
  }
  function crear(etiqueta, attrs = {}, hijos = []) {
    const el = document.createElement(etiqueta);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'texto') { if (v === '✕' && window.BibliaIconos) el.append(window.BibliaIconos.svg('x')); else el.textContent = v; }
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v);
    }
    for (const h of hijos) el.append(h);
    return el;
  }

  // Iconos Lucide (mobile/iconos.js, CONSENSO-BIBLIAS.md): un solo sistema, sin emojis.
  const I = n => (window.BibliaIconos ? window.BibliaIconos.svg(n) : document.createTextNode(''));
  const conI = (b, n) => (window.BibliaIconos ? window.BibliaIconos.enBoton(b, n) : b);

  // ---------- Vista activa ----------
  function vistaActiva() {
    return $$('main > section.view').find(v => !v.hidden && getComputedStyle(v).display !== 'none')?.id || 'read-view';
  }
  function marcarDestino() {
    const vista = vistaActiva();
    html.dataset.vistaMovil = vista;
    marcarPestana();
  }

  // ---------- Menú «Más» ----------
  let hojaMas, ajustesMas, anclaAjustes;
  // Los controles reales de Diseño y Tema se mueven (conservan sus eventos):
  // al «Más» en vertical y de vuelta a la cabecera si el teléfono gira o es tableta.
  function moverAjustes(alMas) {
    const barra = $('.topbar-actions');
    if (!barra || !ajustesMas) return;
    if (!anclaAjustes) { anclaAjustes = document.createComment('ajustes'); barra.querySelector('label.appearance-control')?.before(anclaAjustes); }
    const labels = $$('label.appearance-control');
    if (alMas) labels.forEach(l => ajustesMas.append(l));
    else if (anclaAjustes.parentNode) labels.forEach(l => anclaAjustes.before(l));
  }
  function construirMas() {
    hojaMas = crear('dialog', { id: 'movil-mas', 'aria-label': 'Más opciones' });
    const ajustes = crear('div', { class: 'movil-mas-ajustes' });
    const opSistema = $('#theme-select option[value="sistema"]'); if (opSistema) opSistema.textContent = 'Según el teléfono';
    ajustesMas = ajustes;
    moverAjustes(true);
    const lista = crear('div', { class: 'movil-mas-lista' });
    // Paso 1 del diseño: la fila ♪ · IA · Estudio · Lectura · A− · A+ se quita de arriba; lo suyo vive aquí.
    const letra = crear('div', { class: 'movil-mas-letra', role: 'group', 'aria-label': 'Tamaño de letra' }, [
      crear('span', { texto: 'Letra' }),
      crear('button', { type: 'button', class: 'outline', 'aria-label': 'Letra más pequeña', texto: 'A−', onclick: () => $('#smaller')?.click() }),
      crear('button', { type: 'button', class: 'outline', 'aria-label': 'Letra más grande', texto: 'A+', onclick: () => $('#larger')?.click() })
    ]);
    ajustes.append(letra);
    // Números Strong a la vista (Edward, 11-oct): interruptor propio, sincronizado con el de la app.
    const origenStrong = $('#show-strong');
    if (origenStrong) {
      const caja = crear('input', { type: 'checkbox', id: 'movil-strong', role: 'switch' });
      caja.addEventListener('change', () => { origenStrong.checked = caja.checked; origenStrong.dispatchEvent(new Event('change', { bubbles: true })); });
      origenStrong.addEventListener('change', () => { caja.checked = origenStrong.checked; });
      caja.checked = origenStrong.checked;
      ajustes.append(crear('label', { class: 'movil-mas-strong', for: 'movil-strong' }, [crear('span', { texto: 'Números Strong en el texto' }), caja]));
    }
    // Lectura en voz alta: voz y velocidad (CONSENSO-BIBLIAS.md). Se mueven los selectores reales.
    const voz = $('#voice-select'), velocidad = $('#voice-rate'), hasta = $('#voice-until');
    if (voz && velocidad) ajustes.append(crear('div', { class: 'movil-mas-voz' }, [
      crear('label', { for: 'voice-select', texto: 'Voz de lectura' }), voz,
      crear('label', { for: 'voice-rate', texto: 'Velocidad' }), velocidad,
      ...(hasta ? [crear('label', { for: 'voice-until', texto: 'Leer hasta' }), hasta] : [])
    ]));
    const extras = [
      ['image', 'Imagen con versículos', () => window.BibliaImagen?.abrir()],
      ['sparkles', 'Estudio con IA', () => botonPorTexto('.reading-actions button', 'ia')?.click()],
      ['map', 'Atlas y contexto', () => $('#graphics-open')?.click()],
      ['maximize-2', 'Pantalla completa', () => $('#pane-biblia .enfoque-abrir')?.click()],
      ['volume-2', 'Mostrar Strong y escuchar', () => { html.dataset.herramientas = 'abiertas'; try { localStorage.setItem('biblia-herramientas', 'abiertas'); } catch { /* sin almacenamiento */ } pintarPlegar(); setTimeout(ajustarAltoLectura, 0); }]
    ];
    // Edición tienda: «Apoyar el proyecto» (CONSENSO-PLAY: aporte con Google Play Billing; hasta que la app esté en
    // Google Play, la pantalla es una vista previa y no cobra nada).
    if (window.BIBLIA_EDICION === 'tienda') extras.unshift(['hand-heart', 'Apoyar el proyecto', abrirApoyo]);
    for (const [ico, texto, fn] of extras) lista.append(conI(crear('button', { type: 'button', class: 'quiet', texto, onclick: () => { cerrarMas(); fn(); } }), ico));
    const ICONO_MENU = [[/fuentes/i, 'file-text'], [/guardar copia/i, 'download'], [/recuperar copia/i, 'upload'], [/música/i, 'music'], [/oración/i, 'heart'],
      [/círculo/i, 'users'], [/proteger/i, 'lock'], [/inteligencia/i, 'sliders-horizontal'], [/actualizaciones/i, 'refresh-cw']];
    for (const b of $$('.library-menu-items button')) {
      const t = b.textContent.trim();
      if (lista.querySelector(`[data-original="${CSS.escape(t)}"]`)) continue;
      const nuevo = crear('button', { type: 'button', class: 'quiet', 'data-original': t, texto: t, onclick: () => { cerrarMas(); b.click(); } });
      lista.append(conI(nuevo, (ICONO_MENU.find(([re]) => re.test(t)) || [, 'chevron-right'])[1]));
    }
    hojaMas.append(
      crear('div', { class: 'movil-mas-cabecera' }, [
        crear('h2', { texto: 'Más' }),
        crear('button', { type: 'button', class: 'quiet', 'aria-label': 'Cerrar', texto: '✕', onclick: cerrarMas })
      ]),
      ajustes, lista
    );
    // Secciones (paso 2): Mi camino · Herramientas · Mi biblioteca y ajustes.
    const plan = conI(crear('button', { type: 'button', class: 'quiet', texto: 'Plan de lectura', onclick: () => { cerrarMas(); botonPorTexto('.compact-nav button', 'mi plan')?.click(); } }), 'calendar-check');
    lista.prepend(plan);
    const miEstudio = VISTAS_ESTUDIO.map(v => conI(crear('button', { type: 'button', class: 'quiet', 'data-estudio': v.id, texto: v.texto, onclick: () => { cerrarMas(); abrirMiEstudio(v.id); } }), v.icono));
    lista.prepend(...miEstudio);
    const SECCIONES = [
      ['Mi estudio', 'estudio'],
      ['Mi camino', /plan de lectura|oración|círculo/i],
      ['Herramientas', /imagen|estudio con ia|atlas|pantalla completa|escuchar|música/i],
      ['Mi biblioteca y ajustes', /./]
    ];
    const botones = $$('button', lista);
    lista.replaceChildren();
    const usados = new Set();
    for (const [titulo, re] of SECCIONES) {
      const grupo = botones.filter(b => !usados.has(b) && (re === 'estudio' ? !!b.dataset.estudio : re.test(b.textContent)));
      if (!grupo.length) continue;
      grupo.forEach(b => usados.add(b));
      lista.append(crear('h3', { class: 'movil-mas-seccion', texto: titulo }), ...grupo);
    }
    hojaMas.addEventListener('click', e => { if (e.target === hojaMas) cerrarMas(); });
    ocultarSinCapacidad(lista);
    document.body.append(hojaMas);
  }
  // Lo que la plataforma aún no ofrece no se muestra (en vez de un botón que falla).
  const OPERACION_DE = [
    [/actualizaciones/i, 'checkForUpdates'], [/proteger/i, 'setPin'], [/inteligencia artificial|estudio con ia/i, 'aiStatus'],
    [/música/i, 'musicPlayer'], [/guardar copia/i, 'exportBackup'], [/recuperar copia/i, 'restoreBackup'], [/fuentes/i, 'studySources'],
    [/círculo/i, 'circleStatus']
  ];
  async function ocultarSinCapacidad(lista) {
    const puente = window.libraryDesktop;
    if (!puente || typeof puente.getCapabilities !== 'function') return; // escritorio: todo disponible
    let caps; try { caps = await puente.getCapabilities(); } catch { return; }
    for (const b of $$('button', lista)) {
      const par = OPERACION_DE.find(([re]) => re.test(b.textContent));
      if (par && caps.operations[par[1]] && !caps.operations[par[1]].available) b.hidden = true;
    }
    for (const b of $$('.reading-actions button')) {
      if (/\bIA\b/.test(b.textContent) && caps.operations.aiStatus && !caps.operations.aiStatus.available) b.hidden = true;
    }
  }
  let hojaApoyo;
  function abrirApoyo() {
    if (!hojaApoyo) {
      const montos = crear('div', { class: 'movil-apoyo-montos' }, ['US$1', 'US$3', 'US$5', 'US$10'].map(m => crear('button', { type: 'button', class: 'outline', texto: m, disabled: true })));
      hojaApoyo = crear('dialog', { id: 'movil-apoyo', 'aria-labelledby': 'movil-apoyo-titulo' }, [
        crear('div', { class: 'movil-mas-cabecera' }, [crear('h2', { id: 'movil-apoyo-titulo', texto: 'Apoyar el proyecto' }), crear('button', { type: 'button', class: 'quiet', 'aria-label': 'Cerrar', texto: '✕', onclick: () => hojaApoyo.close() })]),
        crear('p', { texto: 'Biblioteca Bíblica es gratis y sin anuncios. Si te sirve, puedes apoyar su desarrollo con un aporte voluntario.' }),
        montos,
        crear('p', { class: 'muted', texto: 'Aporte voluntario para mantener Biblioteca Bíblica. No desbloquea funciones ni es deducible de impuestos. El pago lo procesa Google Play.' }),
        crear('p', { class: 'movil-apoyo-aviso', role: 'status', texto: 'Vista previa: los aportes se activan cuando la app esté publicada en Google Play.' })
      ]);
      hojaApoyo.addEventListener('click', e => { if (e.target === hojaApoyo) hojaApoyo.close(); });
      document.body.append(hojaApoyo);
    }
    hojaApoyo.showModal();
  }
  function abrirMas() { const c = $('#movil-strong'), o = $('#show-strong'); if (c && o) c.checked = o.checked; if (!hojaMas.open) hojaMas.showModal(); }
  function cerrarMas() { if (hojaMas?.open) hojaMas.close(); }


  let pintarPlegar = () => {};
  // ---------- Fila de herramientas de lectura (Edward, 11-oct) ----------
  // Visible por defecto en la Biblia: Strong · ▷ Escuchar · ⏸ · ■ · ⤢ pantalla completa · ⌃ minimizar.
  // Minimizada queda una franja delgada con ⌄ para volver al mismo tamaño; se recuerda la elección.
  function construirHerramientas() {
    const fila = $('#library-controls');
    if (!fila || $('#movil-herr-plegar')) return;
    html.dataset.controlesLectura = 'abiertos';
    let guardado = 'abiertas'; try { guardado = localStorage.getItem('biblia-herramientas') || 'abiertas'; } catch { /* sin almacenamiento */ }
    html.dataset.herramientas = guardado === 'mini' ? 'mini' : 'abiertas';
    // Textos cortos en el teléfono (los botones son los de la app: conservan sus eventos).
    const etiqueta = fila.querySelector('label.checkbox-label');
    if (etiqueta) { for (const n of [...etiqueta.childNodes]) if (n.nodeType === 3) n.textContent = ' Strong'; etiqueta.title = 'Ver números Strong'; }
    const corto = (sel, ico, texto, nombre) => { const b = $(sel); if (b) { b.replaceChildren(I(ico), ...(texto ? [crear('span', { texto })] : [])); b.setAttribute('aria-label', nombre); b.title = nombre; } };
    corto('#voice-play', 'play', 'Escuchar', 'Escuchar el capítulo');
    corto('#voice-pause', 'pause', '', 'Pausa o continuar');
    corto('#voice-stop', 'square', '', 'Detener la lectura');
    const completa = crear('button', { type: 'button', id: 'movil-herr-completa', class: 'quiet', 'aria-label': 'Pantalla completa: solo el texto', title: 'Pantalla completa', onclick: () => $('#pane-biblia .enfoque-abrir')?.click() }, [I('maximize-2')]);
    const plegar = crear('button', { type: 'button', id: 'movil-herr-plegar', class: 'quiet', onclick: () => {
      const mini = html.dataset.herramientas !== 'mini';
      html.dataset.herramientas = mini ? 'mini' : 'abiertas';
      try { localStorage.setItem('biblia-herramientas', html.dataset.herramientas); } catch { /* sin almacenamiento */ }
      pintarPlegar(); setTimeout(ajustarAltoLectura, 0);
    } });
    pintarPlegar = () => {
      const mini = html.dataset.herramientas === 'mini';
      plegar.replaceChildren(I(mini ? 'chevron-down' : 'chevron-up'), ...(mini ? [crear('span', { texto: 'Strong y escuchar' })] : []));
      plegar.setAttribute('aria-expanded', String(!mini));
      plegar.setAttribute('aria-label', mini ? 'Mostrar Strong y escuchar' : 'Minimizar la fila');
    };
    fila.append(completa, plegar);
    pintarPlegar();
    setTimeout(ajustarAltoLectura, 0);
  }

  // ---------- Barra superior de una fila (CONSENSO-MOVIL.md, paso 1): ☰ · referencia · buscar ----------
  function textoReferencia() {
    try { const p = state.position; return books[p.book].name + ' ' + p.chapter; } catch { return 'Elegir pasaje'; }
  }
  function iconoBuscar() {
    const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('class', 'movil-barra-svg');
    const c = document.createElementNS(ns, 'circle'); c.setAttribute('cx', '10.5'); c.setAttribute('cy', '10.5'); c.setAttribute('r', '6.5');
    const l = document.createElementNS(ns, 'path'); l.setAttribute('d', 'M15.5 15.5 21 21');
    svg.append(c, l); return svg;
  }
  function construirBarraSuperior() {
    const vista = $('#read-view');
    if (!vista || $('#movil-barra')) return;
    const texto = crear('span', { class: 'movil-barra-texto', texto: textoReferencia() });
    const ref = crear('button', { type: 'button', class: 'movil-barra-ref', 'aria-label': 'Elegir libro y capítulo', onclick: () => window.BibliaBuscador?.abrir({ indice: true }) },
      [texto, crear('span', { class: 'movil-barra-flecha', 'aria-hidden': 'true', texto: '▾' })]);
    const buscar = crear('button', { type: 'button', class: 'movil-barra-icono', id: 'movil-buscar', 'aria-label': 'Buscar libro, cita o palabra', onclick: () => window.BibliaBuscador?.abrir({ indice: false }) }, [window.BibliaIconos ? I('search') : iconoBuscar()]);
    const menu = crear('button', { type: 'button', class: 'movil-barra-icono', id: 'movil-menu', 'aria-label': 'Menú', onclick: abrirMas }, [I('menu')]);
    vista.prepend(crear('header', { id: 'movil-barra' }, [menu, ref, buscar]));
    // Versión y «Comparar» comparten una sola fila al comienzo de la Biblia (se mueve el nodo: conserva sus eventos).
    const cabeza = $('#pane-biblia > .pane-head'), comparar = $('#comparison-controls');
    if (cabeza && comparar && comparar.parentElement !== cabeza) cabeza.append(comparar);
    conI($('#compare-toggle'), 'arrow-left-right');
    { const c = $('#compare-toggle span'); if (c) { c.textContent = 'Comparar'; $('#compare-toggle').setAttribute('aria-label', 'Comparar versiones'); } }
    const actualizar = () => { texto.textContent = textoReferencia(); };
    const origen = $('#bible-ref');
    if (origen) new MutationObserver(actualizar).observe(origen, { childList: true, characterData: true, subtree: true });
    $('#book')?.addEventListener('change', actualizar); $('#chapter')?.addEventListener('change', actualizar);
    actualizar();
  }


  // ---------- Paso 2 del diseño (CONSENSO-MOVIL.md): pestañas abajo, una cosa a la vez ----------
  // Biblia · Comentario · Diccionario · Original · Referencias · Devocional. Cada una ocupa toda la pantalla
  // entre la barra de arriba y las pestañas, y sigue al versículo elegido. Plan, Oración y lo demás van en ☰.
  // Edward eligió las 6 fijas con icono y nombre corto (12-oct, opción A). Si la letra del sistema es tan grande
  // que un nombre no cabe, la franja pasa a dos filas de tres: el nombre nunca desaparece.
  const VISTAS = [
    { id: 'biblia', texto: 'Biblia', corto: 'Biblia', icono: 'book-open' },
    { id: 'comentario', texto: 'Comentario', corto: 'Coment.', icono: 'message-square-text' },
    { id: 'diccionario', texto: 'Diccionario', corto: 'Dicc.', icono: 'book-a' },
    { id: 'original', texto: 'Original', corto: 'Original', icono: 'languages' },
    { id: 'referencias', texto: 'Referencias', corto: 'Refs.', icono: 'link' },
    // «Hoy» reemplaza a Devocional (CONSENSO-HABITO.md); los devocionales y series siguen dentro de «Hoy».
    { id: 'hoy', texto: 'Hoy', corto: 'Hoy', icono: 'sun' }
  ];
  let franja;
  function construirPestanas() {
    franja = crear('nav', { id: 'movil-pestanas', role: 'tablist', 'aria-label': 'Qué ver' });
    for (const v of VISTAS) franja.append(crear('button', { type: 'button', role: 'tab', 'data-vista': v.id, 'aria-selected': 'false', 'aria-label': v.texto, title: v.texto, onclick: () => elegirVista(v.id) }, [I(v.icono), crear('span', { texto: v.corto })]));
    document.body.append(franja);
  }
  function elegirVista(id) {
    cerrarMas();
    if (id === 'hoy') {
      estado.pestana = 'hoy'; html.dataset.pestana = 'hoy';
      if (typeof showView === 'function') showView('hoy');
      $('#main-content')?.scrollTo?.(0, 0);
    } else {
      if (vistaActiva() !== 'read-view') botonPorTexto('.compact-nav button', 'mi biblia')?.click();
      estado.pestana = id; html.dataset.pestana = id;
      if (id !== 'biblia') { asegurarPanelesVisibles(); ocultarBarra(); }
      if (id === 'referencias') { const caja = $('#connections-box'); if (caja) caja.open = true; }
      // Diccionario: busca la palabra elegida si quedó pendiente (con la RV1960 la palabra abre primero su original).
      if (id === 'diccionario' && typeof consultarPendiente === 'function') consultarPendiente();
      if (id === 'original') {
        const p = typeof palabraElegida !== 'undefined' ? palabraElegida : null;
        if (p?.codigo && typeof openOriginal === 'function' && ($('#original-inline')?.hidden || !$('#original-inline').childElementCount)) openOriginal(p.codigo, p.text);
        else if ($('#original-inline')?.hidden && !$('#original-inline').childElementCount) mostrarAviso('Toca una palabra del texto (con números Strong) para ver su original.');
      }
    }
    setTimeout(() => { marcarDestino(); ajustarAltoLectura(); }, 60);
  }
  function marcarPestana() {
    if (!franja) return;
    const vista = vistaActiva();
    const actual = vista === 'hoy-view' || vista === 'dev-view' ? 'hoy' : vista === 'read-view' ? (estado.pestana === 'hoy' ? 'biblia' : estado.pestana || 'biblia') : '';
    if (vista === 'read-view' && estado.pestana === 'hoy') { estado.pestana = 'biblia'; html.dataset.pestana = 'biblia'; }
    for (const b of $$('button', franja)) b.setAttribute('aria-selected', String(b.dataset.vista === actual));
  }
  function ajustarPestanas() {
    if (!franja) return;
    // Escalones: una fila → dos filas con el icono al lado → dos filas con el icono arriba (más ancho para el nombre).
    const noCabe = () => $$('button > span', franja).some(s => s.scrollWidth > s.clientWidth + 1);
    for (const modo of ['una', 'dos', 'dos-alta']) { franja.dataset.filas = modo; if (!noCabe()) return; }
  }
  // Capítulos: un pie fino sobre las pestañas que dice adónde vas («‹ Salmos 22 · Salmos 24 ›»), nunca encima
  // del texto (CONSENSO-BIBLIAS.md), y deslizar sobre el texto (no desde los bordes: ahí está el «atrás» de Android).
  function vecinos() {
    try {
      const p = state.position, b = books;
      const ant = p.chapter > 1 ? [p.book, p.chapter - 1] : p.book > 0 ? [p.book - 1, b[p.book - 1].chapters.length] : null;
      const sig = p.chapter < b[p.book].chapters.length ? [p.book, p.chapter + 1] : p.book < b.length - 1 ? [p.book + 1, 1] : null;
      const nombre = x => x && b[x[0]].name + ' ' + x[1];
      return { ant: nombre(ant), sig: nombre(sig) };
    } catch { return { ant: 'Anterior', sig: 'Siguiente' }; }
  }
  function construirFlechas() {
    const libro = $('#pane-biblia');
    if (!libro || $('#movil-flecha-ant')) return;
    const flecha = (id, ico, etiqueta, destino, alFinal) => crear('button', { type: 'button', id, class: 'movil-flecha', 'aria-label': etiqueta, onclick: () => $(destino)?.click() },
      alFinal ? [crear('span', { class: 'movil-flecha-texto' }), I(ico)] : [I(ico), crear('span', { class: 'movil-flecha-texto' })]);
    const ant = flecha('movil-flecha-ant', 'chevron-left', 'Capítulo anterior', '#previous'), sig = flecha('movil-flecha-sig', 'chevron-right', 'Capítulo siguiente', '#next', true);
    const pie = crear('nav', { id: 'movil-pie', 'aria-label': 'Capítulo anterior y siguiente' }, [ant, sig]);
    document.body.append(pie);
    const pintar = () => {
      const v = vecinos();
      $('.movil-flecha-texto', ant).textContent = v.ant || ''; ant.hidden = !v.ant; ant.setAttribute('aria-label', v.ant ? 'Ir a ' + v.ant : 'Capítulo anterior');
      $('.movil-flecha-texto', sig).textContent = v.sig || ''; sig.hidden = !v.sig; sig.setAttribute('aria-label', v.sig ? 'Ir a ' + v.sig : 'Capítulo siguiente');
    };
    const origen = $('#bible-ref');
    if (origen) new MutationObserver(pintar).observe(origen, { childList: true, characterData: true, subtree: true });
    pintar();
    const versos = $('#verses');
    let toque = null;
    versos?.addEventListener('touchstart', e => { const t = e.touches[0]; toque = t && t.clientX > 24 && t.clientX < window.innerWidth - 24 ? { x: t.clientX, y: t.clientY, t: Date.now() } : null; }, { passive: true });
    versos?.addEventListener('touchend', e => {
      if (!toque) return; const t = e.changedTouches[0], dx = t.clientX - toque.x, dy = t.clientY - toque.y, rapido = Date.now() - toque.t < 600; toque = null;
      if (!rapido || Math.abs(dx) < 80 || Math.abs(dy) > 40 || window.getSelection()?.toString()) return;
      $(dx < 0 ? '#next' : '#previous')?.click();
    }, { passive: true });
  }

  // ---------- Comentario (CONSENSO-BIBLIAS.md): qué ver en fichas, un solo selector de fuente y nunca vacío ----------
  // Las fichas reemplazan el segundo selector («Comentario / Mapa / Línea de tiempo…»). La fuente solo aparece en
  // «Comentario». Si no hay comentarios instalados (edición de Play), se ofrece lo que sí hay para el capítulo.
  const MODOS_COMENTARIO = { comment: 'Comentario', map: 'Mapa', events: 'Línea de tiempo', kings: 'Reyes y profetas', people: 'Personas', harmony: 'Evangelios', outline: 'Bosquejo' };
  function construirComentario() {
    const modo = $('#graphics-mode'), fuente = $('#comment-select'), contenido = $('#comment-content');
    if (!modo || !fuente || !contenido || $('#movil-coment-modos')) return;
    const fichas = crear('div', { id: 'movil-coment-modos', role: 'group', 'aria-label': 'Qué ver para este capítulo' },
      [...modo.options].map(o => crear('button', { type: 'button', 'data-modo': o.value, 'aria-pressed': 'false', texto: MODOS_COMENTARIO[o.value] || o.textContent, onclick: () => elegirModo(o.value) })));
    const elegirModo = v => { if (modo.value !== v) { modo.value = v; modo.dispatchEvent(new Event('change', { bubbles: true })); } pintarModo(); };
    const vacio = crear('div', { id: 'movil-coment-vacio', class: 'movil-vacio', hidden: '' }, [
      I('message-square-text'),
      crear('p', { class: 'movil-vacio-titulo', texto: 'Esta versión todavía no trae comentarios' }),
      crear('p', { texto: 'Mientras tanto, mira lo que sí hay para este capítulo:' }),
      crear('div', { class: 'movil-vacio-acciones' }, [
        conI(crear('button', { type: 'button', class: 'outline', texto: 'Mapa del capítulo', onclick: () => elegirModo('map') }), 'map'),
        conI(crear('button', { type: 'button', class: 'outline', texto: 'Línea de tiempo', onclick: () => elegirModo('events') }), 'history'),
        conI(crear('button', { type: 'button', class: 'outline', texto: 'Referencias cruzadas', onclick: () => elegirVista('referencias') }), 'link')
      ])
    ]);
    const pintarModo = () => {
      html.dataset.comentModo = modo.value;
      for (const b of $$('button', fichas)) b.setAttribute('aria-pressed', String(b.dataset.modo === modo.value));
      const sinFuentes = [...fuente.options].filter(o => o.value).length === 0;
      // Hay comentarios pero ninguno elegido: se abre el primero en vez de una pantalla vacía.
      if (modo.value === 'comment' && !sinFuentes && !fuente.value) { fuente.value = [...fuente.options].find(o => o.value).value; fuente.dispatchEvent(new Event('change', { bubbles: true })); }
      vacio.hidden = !(modo.value === 'comment' && sinFuentes);
      html.dataset.sinComentarios = String(sinFuentes);
    };
    $('#pane-comentario .graphics-toolbar')?.before(fichas);
    contenido.before(vacio);
    modo.addEventListener('change', pintarModo);
    new MutationObserver(pintarModo).observe(fuente, { childList: true });
    pintarModo();
  }
  // ---------- Paneles de estudio ----------
  function asegurarPanelesVisibles() {
    for (const sel of ['#pane-bible-toggle', '#pane-comment-toggle', '#pane-dictionary-toggle']) {
      const b = $(sel);
      if (b && b.getAttribute('aria-pressed') === 'false') b.click();
    }
  }

  function ponerAltura(altura) {
    estado.hoja = altura;
    html.dataset.hoja = altura;
  }
  function elegirPestana(id, abrir) {
    if (abrir) { elegirVista(id); return; }
    asegurarPanelesVisibles();
  }

  // La hoja sigue el versículo activo, salvo que esté fijada.
  function alTocarVersiculo(e) {
    const palabra = e.target.closest('.reading-word');
    const versiculo = e.target.closest('#verses .verse');
    if (!versiculo) return;
    if (estado.ignorarClic) { estado.ignorarClic = false; e.preventDefault(); e.stopPropagation(); return; }
    if (html.dataset.seleccion === 'varios') {
      e.preventDefault(); e.stopPropagation();
      const n = numeroDe(versiculo); if (elegidos.has(n)) elegidos.delete(n); else elegidos.add(n);
      if (!elegidos.size) salirSeleccion(); else pintarSeleccion();
      return;
    }
    ultimaY = e.clientY;
    if (palabra && $('#original-dialog')) return; // la palabra abre el popover del original
    setTimeout(mostrarBarra, 0);
  }
  let ultimaY = 0;

  // ---------- Barra del versículo ----------
  // Reutiliza los subrayados, las notas y «Preguntar» de la app: solo cambia dónde se muestran.
  let barra;
  function construirBarraVersiculo() {
    barra = crear('div', { id: 'movil-versiculo', role: 'toolbar', 'aria-label': 'Acciones del versículo', hidden: '' });
    const tintas = crear('div', { class: 'movil-tintas' });
    for (const b of $$('.ink-colors [data-ink]')) {
      const copia = crear('button', { type: 'button', class: b.className, 'aria-label': b.getAttribute('aria-label') || b.textContent.trim(), onclick: () => { b.click(); ocultarBarra(); } });
      if (b.dataset.ink === 'none') copia.append(I('x'));
      tintas.append(copia);
    }
    const accion = (ico, texto, fn, etiqueta) => crear('button', { type: 'button', class: 'quiet con-ico', 'aria-label': etiqueta || texto, onclick: fn }, [I(ico), crear('span', { texto })]);
    barra.append(
      tintas,
      accion('pencil', 'Nota', () => { const n = $('.pane-notes'); if (n) { n.open = true; html.dataset.notas = 'abiertas'; $('#note')?.focus(); } ocultarBarra(); }),
      accion('copy', 'Copiar', copiarVersiculo, 'Copiar versículo'),
      accion('share-2', 'Compartir', compartirVersiculo, 'Compartir versículo'),
      crear('button', { type: 'button', class: 'quiet movil-mas-acciones', id: 'movil-mas-acciones', 'aria-label': 'Más acciones del versículo', onclick: abrirAcciones }, [I('ellipsis')])
    );
    document.body.append(barra);
    setTimeout(pintarColores, 0);
    construirHojaAcciones();
    construirSeleccion();
    const puente = window.libraryDesktop;
    if (puente && typeof puente.getCapabilities === 'function') {
      puente.getCapabilities().then(caps => { if (caps.operations.aiPrepare && !caps.operations.aiPrepare.available) { const p = $('#movil-preguntar'); if (p) p.hidden = true; } }).catch(() => {});
    }
    const notas = $('.pane-notes');
    if (notas) {
      notas.addEventListener('toggle', () => { html.dataset.notas = notas.open ? 'abiertas' : 'cerradas'; });
      notas.querySelector('summary')?.addEventListener('click', () => setTimeout(() => { html.dataset.notas = notas.open ? 'abiertas' : 'cerradas'; }, 0));
    }
  }

  // ---------- Paso 4 (CONSENSO-MOVIL.md): Mi estudio ----------
  // Historial · Marcadores · Resaltados (con nombre por color) · Etiquetas · Notas · Para memorizar.
  // Los datos viven en state.estudio (EstudioCore) y en state.highlights / state.notes de siempre.
  const VISTAS_ESTUDIO = [
    { id: 'historial', texto: 'Historial', icono: 'history' }, { id: 'marcador', texto: 'Marcadores', icono: 'bookmark' }, { id: 'resaltados', texto: 'Resaltados', icono: 'highlighter' },
    { id: 'etiqueta', texto: 'Etiquetas', icono: 'tag' }, { id: 'notas', texto: 'Notas', icono: 'pencil' }, { id: 'memoria', texto: 'Para memorizar', icono: 'repeat' }
  ];
  const NOMBRE_COLOR = { gold: 'Dorado', sage: 'Verde', rose: 'Rosa' };
  let hojaEstudio, filtroEstudio = 'historial', etiquetaElegida = '';
  const est = () => { if (!state.estudio) state.estudio = window.EstudioCore.vacio(); return state.estudio; };
  const refActual = () => { const sel = window.BibliaSeleccion?.elegidos || []; const p = state.position; return sel.length > 1 ? { book: p.book, chapter: p.chapter, verse: Math.min(...sel), endVerse: Math.max(...sel) } : { book: p.book, chapter: p.chapter, verse: p.verse || 1 }; };
  const textoDe = r => { try { const c = books[r.book].chapters[r.chapter - 1]; if (!r.verse) return ''; return c.slice(r.verse - 1, r.endVerse || r.verse).join(' '); } catch { return ''; } };
  const nombreColor = c => (state.estudio?.colores?.[c] || '').trim() || NOMBRE_COLOR[c];
  function guardarEstudio(nuevo, aviso) { state.estudio = nuevo; save(); if (aviso) mostrarAviso(aviso); if (hojaEstudio?.open) pintarEstudio(); pintarColores(); }
  function marcar(tipo) {
    const r = refActual(), E = window.EstudioCore, ya = E.tiene(est(), tipo, r);
    guardarEstudio(E.alternar(est(), tipo, r), (ya ? 'Quitado de ' : 'Agregado a ') + (tipo === 'marcador' ? 'Marcadores' : 'Para memorizar') + ': ' + E.nombreRef(r, books));
  }
  function etiquetar() {
    const r = refActual(), E = window.EstudioCore;
    const dlg = crear('dialog', { id: 'movil-etiquetar', 'aria-label': 'Etiquetar' });
    const campo = crear('input', { type: 'text', maxlength: '40', placeholder: 'Nombre de la etiqueta (ej.: Promesas)', 'aria-label': 'Nombre de la etiqueta' });
    const poner = nombre => { try { guardarEstudio(E.alternar(est(), 'etiqueta', r, nombre), (E.tiene(state.estudio, 'etiqueta', r, nombre.trim()) ? 'Etiqueta «' : 'Quitada la etiqueta «') + nombre.trim() + '»'); dlg.close(); } catch (e) { mostrarAviso(e.message); } };
    const existentes = E.etiquetas(est()).map(n => crear('button', { type: 'button', class: 'outline' + (E.tiene(est(), 'etiqueta', r, n) ? ' activa' : ''), texto: n, onclick: () => poner(n) }));
    dlg.append(
      crear('div', { class: 'movil-mas-cabecera' }, [crear('h2', { texto: 'Etiquetar ' + E.nombreRef(r, books) }), crear('button', { type: 'button', class: 'quiet', 'aria-label': 'Cerrar', texto: '✕', onclick: () => dlg.close() })]),
      crear('form', { class: 'movil-etiquetar-form', onsubmit: e => { e.preventDefault(); if (campo.value.trim()) poner(campo.value); } }, [campo, crear('button', { type: 'submit', class: 'outline', texto: 'Agregar' })]),
      ...(existentes.length ? [crear('p', { class: 'muted', texto: 'Tus etiquetas (toca para poner o quitar):' }), crear('div', { class: 'movil-etiquetas' }, existentes)] : [])
    );
    dlg.addEventListener('close', () => dlg.remove());
    document.body.append(dlg); dlg.showModal(); setTimeout(() => campo.focus(), 50);
  }
  function construirMiEstudio() {
    hojaEstudio = crear('dialog', { id: 'mi-estudio', 'aria-label': 'Mi estudio' }, [
      crear('div', { class: 'movil-mas-cabecera' }, [crear('h2', { texto: 'Mi estudio' }), crear('button', { type: 'button', class: 'quiet', 'aria-label': 'Cerrar', texto: '✕', onclick: () => hojaEstudio.close() })]),
      crear('div', { class: 'mi-estudio-filtros', role: 'tablist', 'aria-label': 'Qué ver' }, VISTAS_ESTUDIO.map(v => crear('button', { type: 'button', role: 'tab', 'data-filtro': v.id, texto: v.texto, onclick: () => { filtroEstudio = v.id; etiquetaElegida = ''; pintarEstudio(); } }))),
      crear('div', { class: 'mi-estudio-lista', role: 'region', 'aria-live': 'polite' })
    ]);
    document.body.append(hojaEstudio);
  }
  function abrirMiEstudio(filtro) { if (!hojaEstudio) construirMiEstudio(); filtroEstudio = filtro || filtroEstudio; etiquetaElegida = ''; pintarEstudio(); hojaEstudio.showModal(); }
  function filaEstudio(r, detalle, extra) {
    const E = window.EstudioCore;
    return crear('button', { type: 'button', class: 'mi-estudio-fila', onclick: () => { hojaEstudio.close(); go(r.book, r.chapter, r.verse || 1, r.endVerse); elegirVista('biblia'); } }, [
      crear('b', { texto: E.nombreRef(r, books) + (extra ? ' · ' + extra : '') }),
      crear('span', { texto: (detalle || textoDe(r)).slice(0, 160) })
    ]);
  }
  function pintarEstudio() {
    const lista = $('.mi-estudio-lista', hojaEstudio), E = window.EstudioCore, e = est();
    for (const b of $$('.mi-estudio-filtros button', hojaEstudio)) b.setAttribute('aria-selected', String(b.dataset.filtro === filtroEstudio));
    lista.replaceChildren();
    const vacio = t => lista.append(crear('p', { class: 'mi-estudio-vacio', texto: t }));
    if (filtroEstudio === 'historial') {
      if (!e.historial.length) return vacio('Aquí aparecerán los capítulos que vayas leyendo.');
      for (const h of e.historial) lista.append(filaEstudio({ book: h.book, chapter: h.chapter }, new Date(h.t).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' })));
    } else if (filtroEstudio === 'resaltados') {
      // Nombres de los colores (e-Sword: «Highlight Labels»): se escriben aquí y se ven al resaltar.
      const nombres = crear('div', { class: 'mi-estudio-colores' }, window.EstudioCore.COLORES.map(c => crear('label', { class: 'mi-estudio-color' }, [
        crear('span', { class: 'ink ' + c, 'aria-hidden': 'true' }),
        (() => { const i = crear('input', { type: 'text', maxlength: '30', value: e.colores[c] || '', placeholder: 'Nombre del ' + NOMBRE_COLOR[c].toLowerCase() + ' (ej.: ' + { gold: 'Promesa', sage: 'Mandato', rose: 'Pecado' }[c] + ')', 'aria-label': 'Nombre del color ' + NOMBRE_COLOR[c] }); i.addEventListener('change', () => { guardarEstudio({ ...est(), colores: { ...est().colores, [c]: i.value.trim().slice(0, 30) } }); }); return i; })()
      ])));
      lista.append(nombres);
      const items = E.desdeClaves(state.highlights);
      if (!items.length) return vacio('Todavía no resaltaste versículos. Toca un versículo y elige un color.');
      for (const c of E.COLORES) {
        const delColor = items.filter(x => x.valor === c);
        if (!delColor.length) continue;
        lista.append(crear('h3', { class: 'mi-estudio-grupo', texto: nombreColor(c) + ' · ' + delColor.length }));
        for (const x of delColor) lista.append(filaEstudio(x));
      }
    } else if (filtroEstudio === 'notas') {
      if (state.privateLocked) return vacio('Tu cuaderno está cerrado con PIN. Ábrelo para ver tus notas.');
      const items = E.desdeClaves(state.notes);
      if (!items.length) return vacio('Todavía no escribiste notas. Toca un versículo y elige «Nota».');
      for (const x of items) lista.append(filaEstudio(x, x.valor));
    } else if (filtroEstudio === 'etiqueta') {
      const nombres = E.etiquetas(e);
      if (!nombres.length) return vacio('Todavía no tienes etiquetas. Toca un versículo › ⋯ › Etiquetar.');
      lista.append(crear('div', { class: 'movil-etiquetas' }, nombres.map(n => crear('button', { type: 'button', class: 'outline' + (n === etiquetaElegida ? ' activa' : ''), texto: n, onclick: () => { etiquetaElegida = etiquetaElegida === n ? '' : n; pintarEstudio(); } }))));
      for (const m of e.marcas.filter(m => m.tipo === 'etiqueta' && (!etiquetaElegida || m.etiqueta === etiquetaElegida))) lista.append(filaEstudio(m, '', m.etiqueta));
    } else {
      const items = e.marcas.filter(m => m.tipo === filtroEstudio);
      if (!items.length) return vacio(filtroEstudio === 'marcador' ? 'Todavía no hay marcadores. Toca un versículo › ⋯ › Marcar.' : 'Todavía no hay versículos para memorizar. Toca un versículo › ⋯ › Memorizar.');
      for (const m of items) lista.append(filaEstudio(m));
    }
  }
  // Los botones de color muestran su nombre (si se lo pusiste).
  function pintarColores() {
    if (typeof state === 'undefined') return void setTimeout(pintarColores, 200); // app.js aún no cargó
    for (const b of $$('#movil-versiculo .movil-tintas button, .ink-colors [data-ink]')) {
      const c = ['gold', 'sage', 'rose'].find(x => b.classList.contains(x)) || b.dataset?.ink;
      if (!['gold', 'sage', 'rose'].includes(c)) continue;
      const n = (state.estudio?.colores?.[c] || '').trim();
      b.title = n ? 'Resaltar: ' + n : 'Resaltar en ' + NOMBRE_COLOR[c].toLowerCase();
      b.setAttribute('aria-label', b.title);
    }
  }
  window.BibliaEstudio = { abrir: abrirMiEstudio, marcar, etiquetar };

  // ---------- Paso 3 (CONSENSO-MOVIL.md): «⋯» con todas las acciones y varios versículos a la vez ----------
  let hojaAcciones;
  function construirHojaAcciones() {
    const fila = (ico, texto, fn, extra = {}) => crear('button', { type: 'button', class: 'quiet con-ico', ...extra, onclick: () => { hojaAcciones.close(); fn(); } }, [I(ico), crear('span', { texto })]);
    hojaAcciones = crear('dialog', { id: 'movil-acciones', 'aria-label': 'Acciones del versículo' }, [
      crear('div', { class: 'movil-mas-cabecera' }, [crear('h2', { id: 'movil-acciones-titulo', texto: 'Versículo' }), crear('button', { type: 'button', class: 'quiet', 'aria-label': 'Cerrar', texto: '✕', onclick: () => hojaAcciones.close() })]),
      crear('div', { class: 'movil-mas-lista' }, [
        fila('bookmark', 'Marcar / quitar marcador', () => marcar('marcador')),
        fila('tag', 'Etiquetar…', etiquetar),
        fila('repeat', 'Para memorizar / quitar', () => marcar('memoria')),
        fila('square-check', 'Elegir varios versículos', () => entrarSeleccion($('#verses .verse.selected'))),
        fila('image', 'Imagen con este versículo', () => window.BibliaImagen?.abrir()),
        fila('sparkles', 'Preguntar a la IA', () => $('#ai-verse-ask')?.click(), { id: 'movil-preguntar' }),
        fila('arrow-left-right', 'Comparar versiones', () => { if ($('#compare-toggle')?.getAttribute('aria-pressed') !== 'true') $('#compare-toggle')?.click(); }),
        fila('pencil', 'Nota del versículo', () => { const n = $('.pane-notes'); if (n) { n.open = true; html.dataset.notas = 'abiertas'; $('#note')?.focus(); } })
      ])
    ]);
    hojaAcciones.addEventListener('click', e => { if (e.target === hojaAcciones) hojaAcciones.close(); });
    document.body.append(hojaAcciones);
  }
  function abrirAcciones() {
    ocultarBarra();
    const t = textoVersiculo();
    $('#movil-acciones-titulo').textContent = t?.ref || 'Versículo';
    hojaAcciones.showModal();
  }
  // Varios versículos: se entra manteniendo pulsado un versículo o desde «⋯». Tocar suma o quita.
  const elegidos = new Set();
  let barraSeleccion;
  function construirSeleccion() {
    const boton = (ico, texto, fn, etiqueta) => crear('button', { type: 'button', class: 'quiet con-ico', 'aria-label': etiqueta || texto, onclick: fn }, [I(ico), ...(texto ? [crear('span', { texto })] : [])]);
    barraSeleccion = crear('div', { id: 'movil-seleccion', role: 'toolbar', 'aria-label': 'Versículos elegidos', hidden: '' }, [
      crear('span', { class: 'movil-seleccion-cuenta', role: 'status' }),
      boton('copy', 'Copiar', () => copiarSeleccion(false), 'Copiar los versículos elegidos'),
      boton('share-2', 'Compartir', () => copiarSeleccion(true), 'Compartir los versículos elegidos'),
      boton('image', 'Imagen', imagenSeleccion, 'Imagen con los versículos elegidos'),
      boton('repeat', '', () => { marcar('memoria'); salirSeleccion(); }, 'Memorizar los versículos elegidos'),
      boton('tag', '', () => { etiquetar(); }, 'Etiquetar los versículos elegidos'),
      boton('x', '', salirSeleccion, 'Terminar la selección')
    ]);
    document.body.append(barraSeleccion);
    const versos = $('#verses');
    let reloj = null, inicio = null;
    versos?.addEventListener('touchstart', e => {
      const v = e.target.closest('.verse'); if (!v || html.dataset.seleccion === 'varios') return;
      const t = e.touches[0]; inicio = { x: t.clientX, y: t.clientY };
      reloj = setTimeout(() => { reloj = null; entrarSeleccion(v); estado.ignorarClic = true; }, 550);
    }, { passive: true });
    const cancelar = e => { if (!reloj) return; const t = e.touches?.[0]; if (!t || Math.hypot(t.clientX - inicio.x, t.clientY - inicio.y) > 10) { clearTimeout(reloj); reloj = null; } };
    versos?.addEventListener('touchmove', cancelar, { passive: true });
    versos?.addEventListener('touchend', () => { if (reloj) { clearTimeout(reloj); reloj = null; } }, { passive: true });
  }
  function numeroDe(v) { return Number(v?.dataset.verse); }
  function pintarSeleccion() {
    for (const v of $$('#verses .verse')) v.classList.toggle('movil-elegido', elegidos.has(numeroDe(v)));
    const n = elegidos.size;
    $('.movil-seleccion-cuenta', barraSeleccion).textContent = n === 1 ? '1 versículo' : n + ' versículos';
  }
  function entrarSeleccion(v) {
    elegidos.clear(); if (v && numeroDe(v)) elegidos.add(numeroDe(v));
    html.dataset.seleccion = 'varios'; ocultarBarra(); barraSeleccion.hidden = false; pintarSeleccion();
    mostrarAviso('Toca otros versículos para sumarlos.');
  }
  function salirSeleccion() {
    elegidos.clear(); html.dataset.seleccion = ''; barraSeleccion.hidden = true; pintarSeleccion();
  }
  function textoSeleccion() {
    const nums = [...elegidos].sort((a, b) => a - b);
    if (!nums.length) return null;
    const p = state.position, libro = books[p.book].name + ' ' + p.chapter;
    const tramos = []; for (const n of nums) { const u = tramos[tramos.length - 1]; if (u && n === u[1] + 1) u[1] = n; else tramos.push([n, n]); }
    const ref = libro + ':' + tramos.map(([a, b]) => a === b ? a : a + '-' + b).join(', ');
    const textos = nums.map(n => { const v = $(`#verses .verse[data-verse="${n}"]`); const t = v ? [...v.childNodes].filter(x => !(x.nodeType === 1 && x.tagName === 'SUP')).map(x => x.textContent).join('').replace(/\s+/g, ' ').trim() : ''; return nums.length > 1 ? n + ' ' + t : t; });
    return { ref, nums, contiguo: tramos.length === 1, completo: `«${textos.join(' ')}» ${ref}` };
  }
  async function copiarSeleccion(compartir) {
    const t = textoSeleccion(); if (!t) return;
    try {
      if (compartir) await (window.BibliaPlataforma?.compartir || (async x => navigator.clipboard.writeText(x.texto)))({ titulo: t.ref, texto: t.completo });
      else { await navigator.clipboard.writeText(t.completo); mostrarAviso(t.nums.length === 1 ? 'Versículo copiado.' : t.nums.length + ' versículos copiados.'); }
      salirSeleccion();
    } catch { mostrarAviso(compartir ? 'No se pudo compartir.' : 'No se pudo copiar.'); }
  }
  async function imagenSeleccion() {
    const t = textoSeleccion(); if (!t) return;
    salirSeleccion();
    await window.BibliaImagen?.abrir();
    const desde = $('#imagen-desde'), hasta = $('#imagen-hasta');
    if (desde && hasta) {
      desde.value = String(t.nums[0]); desde.dispatchEvent(new Event('change', { bubbles: true }));
      hasta.value = String(t.contiguo ? t.nums[t.nums.length - 1] : t.nums[0]); hasta.dispatchEvent(new Event('change', { bubbles: true }));
      if (!t.contiguo) mostrarAviso('La imagen usa versículos seguidos: tomé desde el ' + t.nums[0] + '.');
    }
  }
  window.BibliaSeleccion = { entrar: v => entrarSeleccion(v), salir: salirSeleccion, texto: textoSeleccion, get elegidos() { return [...elegidos]; } };

  function textoVersiculo() {
    const v = $('#verses .verse.selected');
    if (!v) return null;
    const ref = ($('#note-reference')?.textContent || '').trim();
    const texto = [...v.childNodes].filter(n => !(n.nodeType === 1 && n.tagName === 'SUP')).map(n => n.textContent).join('').replace(/\s+/g, ' ').trim();
    return { ref, texto, completo: `«${texto}» ${ref}` };
  }
  async function compartirVersiculo() {
    const t = textoVersiculo(); ocultarBarra();
    if (!t) return;
    try { await (window.BibliaPlataforma?.compartir || (async x => navigator.clipboard.writeText(x.texto)))({ titulo: t.ref, texto: t.completo }); }
    catch { mostrarAviso('No se pudo compartir.'); }
  }
  async function copiarVersiculo() {
    const t = textoVersiculo(); ocultarBarra();
    if (!t) return;
    try { await navigator.clipboard.writeText(t.completo); mostrarAviso('Versículo copiado.'); } catch { mostrarAviso('No se pudo copiar.'); }
  }
  function mostrarBarra() { if (barra) { barra.hidden = false; html.dataset.barraVersiculo = 'visible'; } }
  function ocultarBarra() { if (barra) { barra.hidden = true; html.dataset.barraVersiculo = 'oculta'; } }

  // ---------- Popover del original ----------
  function vigilarOriginal() {
    const dialogo = $('#original-dialog');
    if (!dialogo) return;
    new MutationObserver(() => {
      if (!dialogo.open || !consulta.matches) return;
      const mitadInferior = ultimaY > window.innerHeight / 2;
      dialogo.dataset.lado = mitadInferior ? 'arriba' : 'abajo';
    }).observe(dialogo, { attributes: true, attributeFilter: ['open'] });
  }

  // ---------- Avisos ----------
  function mostrarAviso(texto) {
    const t = $('#toast');
    if (!t) return;
    t.textContent = texto; t.hidden = false; t.classList.add('show');
    clearTimeout(mostrarAviso.t); mostrarAviso.t = setTimeout(() => { t.classList.remove('show'); t.hidden = true; }, 2600);
  }

  // ---------- Atrás (lo usa plataforma.js con el botón de Android) ----------
  function atras() {
    if (window.BibliaEnfoque && window.BibliaEnfoque.salir()) return true; // primero sale de la pantalla completa
    if (html.dataset.seleccion === 'varios') { salirSeleccion(); return true; }
    const dialogoAbierto = $$('dialog[open]').pop();
    if (dialogoAbierto) { dialogoAbierto.close(); return true; }
    if (barra && !barra.hidden) { ocultarBarra(); return true; }
    const notas = $('.pane-notes');
    if (notas && notas.open) { notas.open = false; html.dataset.notas = 'cerradas'; return true; }
    const ia = $('#ai-pane');
    if (ia && !ia.hidden && getComputedStyle(ia).display !== 'none') { $('#ai-pane .pane-close, #ai-pane [data-close-ai], #ai-close')?.click(); return true; }
    if (vistaActiva() === 'read-view' && estado.pestana && estado.pestana !== 'biblia') { elegirVista('biblia'); return true; }
    if (vistaActiva() !== 'read-view') { elegirVista('biblia'); return true; }
    return false; // la plataforma decide salir
  }

  // Alto exacto del libro: desde su borde superior hasta la hoja plegada.
  function ajustarAltoLectura() {
    const libro = $('#pane-biblia');
    if (!libro || !consulta.matches) return;
    const arriba = libro.getBoundingClientRect().top + window.scrollY;
    ajustarPestanas();
    // Fila Strong · Escuchar…: si no cabe en un renglón, «Escuchar» queda solo con su icono (sin perder el nombre accesible).
    const fila = $('#library-controls');
    if (fila && html.dataset.herramientas !== 'mini') { fila.dataset.compacta = 'no'; if (fila.getBoundingClientRect().height > 64) fila.dataset.compacta = 'si'; }
    // --nav-alto es la franja SIN la zona de los botones del sistema: --pie ya le suma --seguro-abajo
    // (antes se contaba dos veces y quedaba una franja vacía sobre las pestañas en teléfonos con gestos o botones).
    if (franja) html.style.setProperty('--nav-alto', Math.round((franja.getBoundingClientRect().height || 56) - (parseFloat(getComputedStyle(franja).paddingBottom) || 0)) + 'px');
    const pieCap = $('#movil-pie');
    if (pieCap) html.style.setProperty('--pie-capitulo', Math.round(pieCap.getBoundingClientRect().height || 0) + 'px');
    const pie = (franja ? franja.getBoundingClientRect().height : 0) || parseFloat(getComputedStyle(html).getPropertyValue('--nav-alto')) || 56;
    const cab = estado.pestana === 'biblia' ? (parseFloat(getComputedStyle(html).getPropertyValue('--pie-capitulo')) || 0) : 0;
    html.style.setProperty('--cabeceras-lectura', Math.max(0, Math.round(arriba)) + 'px');
    html.style.setProperty('--alto-libro', Math.max(160, window.innerHeight - arriba - pie - cab) + 'px');
  }

  // En el teléfono no hay programas de terminal (Codex, Claude, Gemini CLI): solo OpenRouter y Gemini con clave.
  function soloProveedoresDelTelefono() {
    const sel = $('#ai-provider');
    if (!sel) return;
    for (const o of [...sel.options]) if (!['openrouter', 'gemini-api'].includes(o.value)) o.remove();
    const g = [...sel.options].find(o => o.value === 'gemini-api'); if (g) g.textContent = 'Gemini · mi clave de Google AI Studio';
    const r = [...sel.options].find(o => o.value === 'openrouter'); if (r) r.textContent = 'OpenRouter · ChatGPT, Claude, Gemini y más';
  }

  // ---------- Traer desde la PC ----------
  // Elegir los archivos de traspaso-android → copiar → revisar (transferScan) → confirmar → instalar.
  let dialogoTraspaso, botonTraspaso;
  const MB = b => (b / 1048576).toFixed(1).replace('.', ',') + ' MB';
  function pasoTraspaso(titulo, parrafos = [], botones = [], { progreso = false } = {}) {
    const cuerpo = $('.movil-traspaso-cuerpo', dialogoTraspaso);
    cuerpo.replaceChildren(crear('h3', { texto: titulo }), ...parrafos.map(p => crear('p', { texto: p })));
    if (progreso) cuerpo.append(crear('progress', progreso === true ? {} : { max: '100', value: '0' }));
    const fila = crear('div', { class: 'movil-traspaso-acciones' });
    for (const [texto, fn, principal] of botones) fila.append(crear('button', { type: 'button', class: principal ? 'primary' : 'quiet', texto, onclick: fn }));
    cuerpo.append(fila);
    return cuerpo;
  }
  function errorTraspaso(e) {
    pasoTraspaso('No se pudo traer', [(e && e.message) || 'Error desconocido.', 'No se cambió nada de lo que ya tenías.'], [['Cerrar', () => dialogoTraspaso.close(), true]]);
  }
  function iniciarTraspaso() {
    pasoTraspaso('Traer desde la PC', [
      'En el selector, abre tu OneDrive › FABRICA › biblia-estudio y toca el archivo «Biblioteca-Biblica-traspaso.bbt». Es uno solo y trae todo.',
      'Se copian a la memoria privada de la app. Nada cambia hasta que confirmes.'
    ], [['Elegir el archivo', elegirTraspaso, true], ['Cancelar', () => dialogoTraspaso.close()]]);
  }
  async function elegirTraspaso() {
    const cuerpo = pasoTraspaso('Copiando…', ['Preparando.'], [], { progreso: 'porcentaje' });
    try {
      const seleccion = await window.BibliaPlataforma.elegirArchivosTraspaso({ alProgreso: ({ archivo, copiados, total }) => {
        $('p', cuerpo).textContent = archivo ? `Copiando ${archivo}…` : 'Copia terminada.';
        $('progress', cuerpo).value = total ? Math.round(copiados / total * 100) : 0;
      } });
      if (!seleccion.archivos.length) { dialogoTraspaso.close(); return; }
      pasoTraspaso('Revisando tus archivos…', ['Se comprueba la huella de cada archivo y tu base de datos. Con 200 MB puede tardar unos minutos: deja la app abierta.'], [], { progreso: true });
      mostrarResumen(await window.libraryDesktop.transferScan(seleccion));
    } catch (e) { errorTraspaso(e); }
  }
  async function mostrarResumen(rev) {
    const r = rev.resumen, c = r.conteos;
    const cuerpo = pasoTraspaso('Esto se traerá a este teléfono', []);
    const dl = crear('dl', { class: 'movil-traspaso-resumen' });
    const fila = (t, v) => dl.append(crear('dt', { texto: t }), crear('dd', { texto: v }));
    fila('Plan', `${c.diasCompletados} de ${c.diasPlan} días leídos`);
    fila('Devocionales', String(c.devocionales));
    if (c.estadoCifrado) fila('Cuaderno', 'Protegido con tu PIN: se abre con el mismo PIN.');
    else if (typeof c.oraciones === 'number') fila('Oraciones', String(c.oraciones));
    fila('Módulos', `${r.modulos.length}: ` + r.modulos.map(m => m.titulo).join(' · '));
    fila('Tamaño', MB(r.bytes));
    const acciones = $('.movil-traspaso-acciones', cuerpo);
    acciones.before(dl, crear('p', { texto: 'Lo que hoy tiene este teléfono se guarda primero en una copia de seguridad.' }));
    let instalable = false;
    try { const caps = await window.libraryDesktop.getCapabilities(); instalable = !!(caps.operations.transferInstall && caps.operations.transferInstall.available); } catch { /* sin datos */ }
    if (instalable) acciones.append(crear('button', { type: 'button', class: 'primary', texto: 'Instalar en este teléfono', onclick: () => instalarTraspaso(rev) }));
    else acciones.before(crear('p', { class: 'movil-traspaso-aviso', texto: 'Tus archivos están bien. La instalación se activa cuando esta versión tenga su base de datos propia; vuelve a intentarlo después de actualizar.' }));
    acciones.append(crear('button', { type: 'button', class: 'quiet', texto: 'Cancelar', onclick: () => dialogoTraspaso.close() }));
  }
  // Tras instalar, la página DEBE recargarse: la vista vieja sigue mostrando lo de antes (y no puede
  // guardar). Se recarga sola y, al abrir, se confirma qué llegó (o se explica por qué no se ve).
  const MARCA_TRASPASO = 'biblioteca-traspaso-recien';
  let recargarAlCerrar = false;
  async function instalarTraspaso(rev) {
    pasoTraspaso('Instalando…', ['Guardando la copia de seguridad y colocando tus datos y tus módulos.'], [], { progreso: true });
    try {
      const res = await window.libraryDesktop.transferInstall({ token: rev.token, confirmado: true });
      try { localStorage.setItem(MARCA_TRASPASO, JSON.stringify({ en: Date.now(), conteos: rev.resumen.conteos, modulos: rev.resumen.modulos.length })); } catch { /* sin almacenamiento: igual se recarga */ }
      recargarAlCerrar = true;
      pasoTraspaso('Listo', ['Tus datos y tus módulos ya están en este teléfono.', 'La copia de lo que había antes quedó en ' + res.respaldo + '.', 'Abriendo tu biblioteca…'], [['Abrir mi biblioteca', () => location.reload(), true]]);
      setTimeout(() => location.reload(), 2500);
    } catch (e) { errorTraspaso(e); }
  }
  async function confirmarTraspasoAlAbrir() {
    let marca = null;
    try { marca = JSON.parse(localStorage.getItem(MARCA_TRASPASO) || 'null'); localStorage.removeItem(MARCA_TRASPASO); } catch { return; }
    if (!marca || !marca.conteos || Date.now() - marca.en > 6 * 3600 * 1000) return;
    // Espera a que la app termine de abrir la base (o a que avise que no pudo).
    let aviso = '';
    for (let i = 0; i < 240; i++) {
      if (typeof storageReady !== 'undefined' && storageReady) break;
      aviso = ($('#toast') && !$('#toast').hidden && $('#toast').textContent) || '';
      if (/No se reemplazará|necesita recuperación|no se pudo/i.test(aviso)) break;
      await new Promise(r => setTimeout(r, 500));
    }
    try { await Promise.race([window.BibliaPreparacion && window.BibliaPreparacion.modulos, new Promise(r => setTimeout(r, 180000))]); } catch { /* se informa abajo */ }
    await new Promise(r => setTimeout(r, 600)); // deja que la lista de módulos se recargue
    const planes = (typeof state !== 'undefined' && Array.isArray(state.plans)) ? state.plans : [];
    const dias = planes.reduce((n, p) => n + (p.days || 0), 0), hechos = planes.reduce((n, p) => n + ((p.completed || []).length), 0);
    const devocionales = (typeof state !== 'undefined' && Array.isArray(state.devotionals)) ? state.devotionals.length : 0;
    const modulos = (typeof catalogData !== 'undefined' && catalogData && Array.isArray(catalogData.modules)) ? catalogData.modules.length : 0;
    const c = marca.conteos;
    const llego = typeof storageReady !== 'undefined' && storageReady && dias === c.diasPlan && hechos === c.diasCompletados && devocionales === c.devocionales;
    if (!dialogoTraspaso) { dialogoTraspaso = crear('dialog', { id: 'movil-traspaso', 'aria-label': 'Traer desde la PC' }, [crear('div', { class: 'movil-traspaso-cuerpo' })]); document.body.append(dialogoTraspaso); }
    html.dataset.traspasoConfirmado = llego ? 'si' : 'no';
    const avisosCatalogo = (typeof catalogData !== 'undefined' && catalogData && Array.isArray(catalogData.warnings)) ? catalogData.warnings.filter(w => /no coincide|no se pudo|no admitid|cifrado|no válid|no compatible|cambió/i.test(w)) : []; // solo problemas reales, no avisos informativos
    const fallosModulos = [html.dataset.serviciosFallos || '', ...avisosCatalogo].filter(Boolean).join(' · ');
    if (llego) {
      pasoTraspaso('Tu biblioteca llegó', [`Plan: ${hechos} de ${dias} días leídos.`, `Devocionales: ${devocionales}.`, `Módulos en tu biblioteca: ${modulos}.`, ...(fallosModulos ? ['Aviso de los módulos: ' + fallosModulos] : [])], [['Empezar a leer', () => dialogoTraspaso.close(), true]]);
    } else {
      pasoTraspaso('No se ve lo que trajiste', [
        `Se esperaba: plan ${c.diasCompletados} de ${c.diasPlan} días y ${c.devocionales} devocionales. Se ve: plan ${hechos} de ${dias} y ${devocionales} devocionales.`,
        aviso ? 'Aviso de la app: ' + aviso : 'La base todavía no terminó de abrir.',
        'Tus datos quedaron guardados en el teléfono. Prueba «Volver a abrir»; si sigue igual, mándale una captura de esta pantalla a Claude.'
      ], [['Volver a abrir', () => location.reload(), true], ['Cerrar', () => dialogoTraspaso.close()]]);
    }
    if (!dialogoTraspaso.open) dialogoTraspaso.showModal();
  }
  // El botón aparece solo si la plataforma ofrece la revisión del traspaso (en el teléfono).
  async function prepararTraspaso() {
    const puente = window.libraryDesktop;
    if (!puente || typeof puente.getCapabilities !== 'function' || !hojaMas) return;
    let caps; try { caps = await puente.getCapabilities(); } catch { return; }
    const disponible = !!(caps.operations.transferScan && caps.operations.transferScan.available);
    if (!disponible) { if (botonTraspaso) botonTraspaso.hidden = true; return; }
    if (!dialogoTraspaso) {
      dialogoTraspaso = crear('dialog', { id: 'movil-traspaso', 'aria-label': 'Traer desde la PC' }, [crear('div', { class: 'movil-traspaso-cuerpo' })]);
      document.body.append(dialogoTraspaso);
    }
    if (!dialogoTraspaso.dataset.recarga) {
      // Cerrar el «Listo» (atrás, Esc) también recarga: nunca quedarse en la vista vieja.
      dialogoTraspaso.dataset.recarga = '1';
      dialogoTraspaso.addEventListener('close', () => { if (recargarAlCerrar) location.reload(); });
    }
    if (!botonTraspaso) {
      botonTraspaso = conI(crear('button', { type: 'button', class: 'quiet', id: 'movil-traer-pc', texto: 'Traer desde la PC', onclick: () => { cerrarMas(); dialogoTraspaso.showModal(); iniciarTraspaso(); } }), 'laptop');
      const seccionBiblioteca = [...$$('.movil-mas-seccion', hojaMas)].find(h => /biblioteca/i.test(h.textContent));
      if (seccionBiblioteca) seccionBiblioteca.after(botonTraspaso); else $('.movil-mas-lista', hojaMas).prepend(botonTraspaso);
    }
    botonTraspaso.hidden = false;
  }
  window.addEventListener('biblioteca:capacidades', prepararTraspaso);
  // Si los módulos personales terminan de prepararse DESPUÉS de que la app cargó su lista (primera
  // apertura tras un traspaso), se vuelve a cargar la lista: antes quedaban solo los módulos libres.
  window.addEventListener('biblioteca:capacidades', async e => {
    if (!e.detail || !('modulos' in e.detail) || !e.detail.modulos) return;
    for (let i = 0; i < 120 && !(typeof storageReady !== 'undefined' && storageReady); i++) await new Promise(r => setTimeout(r, 500));
    if (typeof loadCatalog !== 'function' || typeof catalogData === 'undefined') return;
    const antes = catalogData && Array.isArray(catalogData.modules) ? catalogData.modules.length : 0;
    try { await loadCatalog(); if (catalogData.modules.length !== antes && typeof renderReader === 'function') renderReader(); } catch { /* la lista anterior sigue */ }
    window.dispatchEvent(new CustomEvent('biblioteca:modulos-actualizados'));
  });

  // ---------- IA en el teléfono (OpenRouter con código pegado, compartir y reportar) ----------
  // Solo con el puente del contrato (teléfono o vista web); en escritorio sigue el flujo de Windows.
  async function prepararIA() {
    const puente = window.libraryDesktop;
    if (!puente || typeof puente.getCapabilities !== 'function') return;
    let caps; try { caps = await puente.getCapabilities(); } catch { return; }
    const disponible = n => !!(caps.operations[n] && caps.operations[n].available);
    const abrir = url => (window.BibliaAbrirFuera ? window.BibliaAbrirFuera(url) : window.open(url, '_blank', 'noopener'));

    // 1. Conectar: abrir OpenRouter en el navegador del sistema y pegar el código que muestra.
    const conectar = $('#ai-connect'), estadoAjustes = $('#ai-settings-status');
    if (conectar && disponible('aiConnect') && !$('#movil-ia-codigo')) {
      const bloque = crear('section', { id: 'movil-ia-codigo', hidden: '' }, [
        crear('p', { texto: 'Se abrió OpenRouter en el navegador. Autoriza la Biblioteca y copia el código que te muestra; pégalo aquí.' }),
        crear('div', { class: 'movil-ia-codigo-fila' }, [
          crear('input', { id: 'movil-ia-codigo-campo', type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', maxlength: '500', 'aria-label': 'Código de OpenRouter', placeholder: 'Pega el código aquí' }),
          crear('button', { type: 'button', class: 'primary', id: 'movil-ia-codigo-enviar', texto: 'Conectar' })
        ]),
        crear('button', { type: 'button', class: 'quiet', id: 'movil-ia-reabrir', texto: 'Abrir OpenRouter otra vez ↗' }),
        crear('p', { class: 'movil-ia-aviso', texto: 'La conexión queda guardada en el llavero seguro del teléfono: no tendrás que volver a conectar al cerrar la app.' })
      ]);
      conectar.after(bloque);
      // El texto de escritorio habla de la protección de Windows: en el teléfono la clave vive solo en memoria.
      for (const pa of $$('#ai-settings p.muted')) {
        if (/protegida por Windows/.test(pa.textContent)) pa.textContent = 'La autorización se completa en el navegador del teléfono. La clave queda guardada en el llavero seguro del teléfono y no se incluye en las copias ni en el traspaso.';
      }
      let url = null;
      conectar.addEventListener('click', async e => {
        e.preventDefault(); e.stopImmediatePropagation();
        try {
          const r = await puente.aiConnect();
          url = r && r.authorizationUrl;
          if (!url) { if (estadoAjustes) estadoAjustes.textContent = 'No se pudo preparar la conexión.'; return; }
          bloque.hidden = false; $('#movil-ia-codigo-campo').value = '';
          await abrir(url);
          setTimeout(() => { const c = $('#movil-ia-codigo-campo'); if (c) c.focus(); }, 300);
        } catch (err) { if (estadoAjustes) estadoAjustes.textContent = err.message; }
      }, true);
      $('#movil-ia-reabrir').addEventListener('click', () => { if (url) abrir(url); });
      $('#movil-ia-codigo-enviar').addEventListener('click', async () => {
        const campo = $('#movil-ia-codigo-campo'), code = campo.value.trim();
        if (!code) { campo.focus(); return; }
        try {
          const r = await puente.aiConnect({ code });
          bloque.hidden = true; campo.value = '';
          if (estadoAjustes) estadoAjustes.textContent = (r && r.connectionNotice) || 'Conectado.';
          const refrescar = $('#ai-model-refresh'); if (refrescar) refrescar.click();
        } catch (err) { if (estadoAjustes) estadoAjustes.textContent = err.message; }
      });
    }

    // 1b. Cuota visible de OpenRouter: lo que informa /key, con su hora; nunca un cupo inventado.
    if (disponible('aiQuota') && !$('#movil-ia-cuota')) {
      const linea = () => crear('p', { class: 'movil-ia-cuota', role: 'status' }, [crear('span', { class: 'movil-ia-cuota-texto', texto: 'Cuota: conecta tu cuenta para verla.' }), crear('button', { type: 'button', class: 'quiet movil-ia-cuota-refrescar', 'aria-label': 'Actualizar cuota', texto: '↻' })]);
      const enAjustes = linea(); enAjustes.id = 'movil-ia-cuota';
      const enPanel = linea();
      (estadoAjustes || conectar || $('#ai-settings'))?.after(enAjustes);
      $('#ai-pane .ai-pane-head')?.append(enPanel);
      const hora = iso => { try { return new Date(iso).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
      const pintar = texto => { for (const el of [enAjustes, enPanel]) $('.movil-ia-cuota-texto', el).textContent = texto; };
      // La cuota es de OpenRouter: con Gemini (u otro proveedor) no se muestra ni se consulta.
      const usaOpenRouter = () => (typeof personalProvider === 'function' ? personalProvider() : 'openrouter') === 'openrouter';
      const sincronizar = () => { const si = usaOpenRouter(); enAjustes.hidden = !si; enPanel.hidden = !si; return si; };
      for (const id of ['ai-provider', 'ai-personal-enabled']) $('#' + id)?.addEventListener('change', () => setTimeout(sincronizar, 50));
      document.addEventListener('click', e => { if (e.target.closest('[data-action="ai-open"], [data-action="ai-settings"], #ai-settings-open, .reading-actions button')) setTimeout(sincronizar, 300); });
      setTimeout(sincronizar, 800);
      const refrescarCuota = async () => {
        if (!sincronizar()) return;
        try {
          const q = await puente.aiQuota();
          const partes = [];
          if (q && q.daily && Number.isFinite(q.daily.remaining)) partes.push(`Consultas gratis hoy: quedan ${q.daily.remaining} de ${q.daily.limit}`);
          else partes.push('Consultas gratis hoy: no informado');
          if (q && Number.isFinite(q.creditsRemaining)) partes.push(`créditos: ${q.creditsRemaining}`);
          if (q && q.checkedAt) partes.push('revisado ' + hora(q.checkedAt));
          pintar(partes.join(' · ') + (q && q.notice ? ' — ' + q.notice : ''));
        } catch (err) { pintar(err && err.code === 'QUOTA' ? 'Llegaste al límite por ahora. Puedes copiar o compartir la pregunta.' : 'Cuota: ' + ((err && err.message) || 'no disponible')); }
      };
      for (const el of [enAjustes, enPanel]) $('.movil-ia-cuota-refrescar', el).addEventListener('click', refrescarCuota);
      $('#movil-ia-codigo-enviar')?.addEventListener('click', () => setTimeout(refrescarCuota, 1500));
      $('#ai-ask')?.addEventListener('click', () => setTimeout(refrescarCuota, 6000));
    }

    // 2. Compartir pregunta: la misma consulta preparada, a la app de ChatGPT, Gemini o Claude del lector.
    const accionesVista = $('#ai-preview .ai-actions');
    if (accionesVista && disponible('aiShare') && !$('#movil-ia-compartir')) {
      accionesVista.prepend(crear('button', { type: 'button', id: 'movil-ia-compartir', texto: 'Compartir pregunta ↗', onclick: async () => {
        const id = window.BibliaIA && window.BibliaIA.ultimaPreparacion;
        if (!id) { mostrarAviso('Primero pulsa «Ver qué se envía».'); return; }
        try { const r = await puente.aiShare({ id }); if (r && (r.shared || r.completed)) mostrarAviso('Pregunta compartida.'); }
        catch (err) { mostrarAviso(err.message); }
      } }));
    }

    // 3. Reportar respuesta (política de Play): revisar, motivo, detalle y confirmar. Nunca dice «enviado» si no lo fue.
    const hilo = $('#ai-thread');
    if (hilo && disponible('aiReport') && !$('#movil-ia-reporte')) {
      const dialogo = crear('dialog', { id: 'movil-ia-reporte', 'aria-label': 'Reportar respuesta' }, [crear('div', { class: 'movil-traspaso-cuerpo' })]);
      document.body.append(dialogo);
      const MOTIVOS = [['incorrecta', 'Es incorrecta o inventa citas'], ['ofensiva', 'Es ofensiva'], ['peligrosa', 'Es peligrosa'], ['privacidad', 'Expone algo privado'], ['otra', 'Otra razón']];
      hilo.addEventListener('click', e => {
        const b = e.target.closest('[data-ai-reply="report"]');
        if (!b) return;
        e.preventDefault(); e.stopImmediatePropagation();
        // Solo la respuesta (sus secciones), sin citas ni fuentes: el mensaje real del hilo, no el texto de la tarjeta.
        const idMensaje = (b.closest('[data-ai-message]') || {}).dataset?.aiMessage;
        let mensaje = null;
        try { const hiloActual = typeof aiCurrentThread === 'function' ? aiCurrentThread() : null; mensaje = hiloActual && hiloActual.messages.find(m => m.id === idMensaje); } catch { mensaje = null; }
        if (!mensaje || mensaje.role !== 'assistant') { mostrarAviso('No encontré esa respuesta para reportarla.'); return; }
        const texto = (typeof aiText === 'function' ? aiText(mensaje) : String(mensaje.text || '')).trim().slice(0, 30000);
        const modelo = mensaje.model || '';
        const cuerpo = $('.movil-traspaso-cuerpo', dialogo);
        const lista = crear('div', { class: 'movil-ia-motivos', role: 'radiogroup', 'aria-label': 'Motivo' });
        MOTIVOS.forEach(([v, t], i) => lista.append(crear('label', { class: 'opcion' }, [crear('input', Object.assign({ type: 'radio', name: 'motivo-ia', value: v }, i === 0 ? { checked: '' } : {})), crear('span', { texto: ' ' + t })])));
        const detalle = crear('textarea', { maxlength: '2000', rows: '3', placeholder: 'Detalle (opcional)', 'aria-label': 'Detalle del reporte' });
        const nota = crear('p', { class: 'movil-traspaso-aviso', texto: 'Se reporta solo el texto de esta respuesta y el modelo. No se envían tu pregunta completa, tus notas ni tus oraciones.' });
        const acciones = crear('div', { class: 'movil-traspaso-acciones' });
        const vistaTexto = crear('pre', { class: 'movil-ia-reporte-texto', texto });
        cuerpo.replaceChildren(crear('h3', { texto: 'Reportar esta respuesta' }), crear('p', { texto: 'Esto es exactamente lo que se reporta:' }), vistaTexto, lista, detalle, nota, acciones);
        acciones.append(
          crear('button', { type: 'button', class: 'primary', texto: 'Confirmar reporte', onclick: async () => {
            const marcado = lista.querySelector('input:checked');
            try {
              const r = await puente.aiReport({ text: texto, model: modelo, reason: marcado ? marcado.value : 'otra', detail: detalle.value.slice(0, 2000), confirmed: true });
              const enviado = !!(r && r.sent);
              cuerpo.replaceChildren(
                crear('h3', { texto: enviado ? 'Enviado' : 'No enviado todavía' }),
                crear('p', { texto: enviado ? 'Reporte enviado. Gracias.' : 'Tu reporte quedó como borrador: esta versión de prueba aún no tiene un canal para recibirlo. No se envió.' }),
                crear('div', { class: 'movil-traspaso-acciones' }, [crear('button', { type: 'button', class: 'primary', texto: 'Cerrar', onclick: () => dialogo.close() })]));
            } catch (err) { nota.textContent = err.message; }
          } }),
          crear('button', { type: 'button', class: 'quiet', texto: 'Cancelar', onclick: () => dialogo.close() })
        );
        dialogo.showModal();
      }, true);
    }
  }
  window.addEventListener('biblioteca:capacidades', () => { if (!prepararIA.hecho) { prepararIA.hecho = true; prepararIA(); } });

  // Strong y voz (#library-controls) se pliegan tras un botón «Lectura» para no quitar alto al texto.
  function construirControlesLectura() {
    const acciones = $('.reading-actions');
    if (!acciones || $('#movil-lectura')) return;
    const boton = crear('button', { type: 'button', id: 'movil-lectura', class: 'quiet', 'aria-expanded': 'false', 'aria-controls': 'library-controls', texto: 'Lectura ▾', onclick: () => {
      const abiertos = html.dataset.controlesLectura !== 'abiertos';
      html.dataset.controlesLectura = abiertos ? 'abiertos' : 'cerrados';
      boton.setAttribute('aria-expanded', String(abiertos));
      setTimeout(ajustarAltoLectura, 0);
    } });
    acciones.insertBefore(boton, $('#smaller', acciones) || null);
  }

  // «Hoy» al abrir: la bienvenida la primera vez (se puede saltar) y luego «Hoy» la primera vez de cada día.
  // Espera a que la biblioteca esté cargada y a que no haya otro diálogo abierto (p. ej. confirmar un traspaso).
  async function iniciarHoy() {
    if (!window.HoyApp) return;
    for (let i = 0; i < 240 && !(typeof uiReady !== 'undefined' && uiReady); i++) await new Promise(r => setTimeout(r, 250));
    for (let i = 0; i < 240 && document.querySelector('dialog[open]'); i++) await new Promise(r => setTimeout(r, 250));
    try {
      if (window.HoyApp.necesitaBienvenida()) await window.HoyApp.bienvenida();
      else window.HoyApp.abrirSiToca();
    } catch (e) { console.warn('Hoy', e); }
    marcarDestino();
  }
  // Al volver a la app otro día (sin cerrarla), también se abre «Hoy».
  document.addEventListener('visibilitychange', () => { if (!document.hidden && estado.construida && window.HoyApp && typeof uiReady !== 'undefined' && uiReady && !document.querySelector('dialog[open]')) { if (window.HoyApp.abrirSiToca()) marcarDestino(); } });

  function activar() {
    html.dataset.telefono = String(consulta.matches);
    if (estado.construida) { moverAjustes(consulta.matches); if (consulta.matches) { marcarDestino(); ajustarAltoLectura(); } else cerrarMas(); return; }
    if (!consulta.matches) return;
    estado.construida = true;
    construirBarraSuperior();
    construirHerramientas();
    construirMas();
    construirPestanas();
    construirFlechas();
    construirBarraVersiculo();
    construirComentario();
    $('#restore-file')?.removeAttribute('accept');
    construirControlesLectura();
    prepararTraspaso();
    soloProveedoresDelTelefono();
    confirmarTraspasoAlAbrir();
    prepararIA().then(() => { prepararIA.hecho = true; });
    vigilarOriginal();
    // Se oculta cuando el lector desplaza el texto (no cuando la app centra el versículo elegido).
    for (const ev of ['touchmove', 'wheel']) $('#verses')?.addEventListener(ev, ocultarBarra, { passive: true });
    asegurarPanelesVisibles();
    ponerAltura('plegada');
    estado.pestana = 'biblia'; html.dataset.pestana = 'biblia';
    asegurarPanelesVisibles();
    $('#verses')?.addEventListener('click', alTocarVersiculo, true);
    // Las vistas cambian por los controladores de la app: se observa y se marca el destino.
    for (const v of $$('main > section.view')) new MutationObserver(marcarDestino).observe(v, { attributes: true, attributeFilter: ['hidden', 'class', 'style'] });
    marcarDestino();
    ajustarAltoLectura();
    window.addEventListener('resize', ajustarAltoLectura);
    new ResizeObserver(ajustarAltoLectura).observe($('.reading-toolbar') || document.body);
    if (franja) new ResizeObserver(() => ajustarAltoLectura()).observe(franja);
    document.fonts?.ready?.then(() => ajustarAltoLectura());
    setTimeout(ajustarAltoLectura, 400);
    iniciarHoy();
  }

  window.BibliaMovil = { atras, ajustarAltoLectura, ponerAltura, elegirPestana, elegirVista, abrirMas, cerrarMas, estado };
  consulta.addEventListener('change', activar);
  window.addEventListener('resize', () => { if (String(consulta.matches) !== html.dataset.telefono) activar(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(activar, 0));
  else setTimeout(activar, 0);
})();
