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
      if (k === 'texto') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v);
    }
    for (const h of hijos) el.append(h);
    return el;
  }

  // ---------- Navegación inferior ----------
  const ICONOS = {
    leer: 'M3 5.5C5.5 4 8.5 4 12 6c3.5-2 6.5-2 9-.5V19c-2.5-1.5-5.5-1.5-9 .5-3.5-2-6.5-2-9-.5zM12 6v13.5',
    plan: 'M7 3v3M17 3v3M4 8h16M5 5h14v15H5zM9 14l2 2 4-4',
    devocional: 'M12 21c-4-3-7-6-7-10a7 7 0 0 1 14 0c0 4-3 7-7 10zM12 7v7M9 10h6',
    oracion: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
    mas: 'M5 7h14M5 12h14M5 17h14'
  };
  function icono(id) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('class', 'movil-nav-icono');
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', ICONOS[id]); svg.append(path);
    return svg;
  }
  const DESTINOS = [
    { id: 'leer', icono: '📖', texto: 'Leer', vista: 'read-view', accion: () => botonPorTexto('.compact-nav button', 'mi biblia')?.click() },
    { id: 'plan', icono: '✓', texto: 'Plan', vista: 'plan-view', accion: () => botonPorTexto('.compact-nav button', 'mi plan')?.click() },
    { id: 'devocional', icono: '❦', texto: 'Devocional', vista: 'dev-view', accion: () => botonPorTexto('.compact-nav button', 'devocional')?.click() },
    { id: 'oracion', icono: '🙏', texto: 'Oración', vista: 'prayer-view', accion: () => botonPorTexto('.library-menu-items button', 'oración')?.click() },
    { id: 'mas', icono: '☰', texto: 'Más', accion: () => abrirMas() }
  ];

  function construirNavegacion() {
    const nav = crear('nav', { id: 'movil-nav', 'aria-label': 'Secciones' });
    for (const d of DESTINOS) {
      nav.append(crear('button', { type: 'button', 'data-destino': d.id, onclick: () => { cerrarMas(); d.accion(); setTimeout(marcarDestino, 60); } }, [
        icono(d.id),
        crear('span', { class: 'movil-nav-texto', texto: d.texto })
      ]));
    }
    document.body.append(nav);
  }

  function vistaActiva() {
    return $$('main > section.view').find(v => !v.hidden && getComputedStyle(v).display !== 'none')?.id || 'read-view';
  }
  function marcarDestino() {
    const vista = vistaActiva();
    html.dataset.vistaMovil = vista;
    for (const b of $$('#movil-nav button')) {
      const d = DESTINOS.find(x => x.id === b.dataset.destino);
      b.setAttribute('aria-current', d.vista === vista ? 'page' : 'false');
    }
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
    ajustesMas = ajustes;
    moverAjustes(true);
    const lista = crear('div', { class: 'movil-mas-lista' });
    const extras = [
      ['Estudio con IA', () => botonPorTexto('.reading-actions button', 'ia')?.click()]
    ];
    for (const [texto, fn] of extras) lista.append(crear('button', { type: 'button', class: 'quiet', texto, onclick: () => { cerrarMas(); fn(); } }));
    for (const b of $$('.library-menu-items button')) {
      const t = b.textContent.trim();
      if (/oración y testimonios/i.test(t)) continue; // ya está en la barra inferior
      if (lista.querySelector(`[data-original="${CSS.escape(t)}"]`)) continue;
      lista.append(crear('button', { type: 'button', class: 'quiet', 'data-original': t, texto: t, onclick: () => { cerrarMas(); b.click(); } }));
    }
    hojaMas.append(
      crear('div', { class: 'movil-mas-cabecera' }, [
        crear('h2', { texto: 'Más' }),
        crear('button', { type: 'button', class: 'quiet', 'aria-label': 'Cerrar', texto: '✕', onclick: cerrarMas })
      ]),
      ajustes, lista
    );
    hojaMas.addEventListener('click', e => { if (e.target === hojaMas) cerrarMas(); });
    ocultarSinCapacidad(lista);
    document.body.append(hojaMas);
  }
  // Lo que la plataforma aún no ofrece no se muestra (en vez de un botón que falla).
  const OPERACION_DE = [
    [/actualizaciones/i, 'checkForUpdates'], [/proteger/i, 'setPin'], [/inteligencia artificial|estudio con ia/i, 'aiStatus'],
    [/música/i, 'musicPlayer'], [/guardar copia/i, 'exportBackup'], [/recuperar copia/i, 'restoreBackup'], [/fuentes/i, 'studySources']
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
  function abrirMas() { if (!hojaMas.open) hojaMas.showModal(); }
  function cerrarMas() { if (hojaMas?.open) hojaMas.close(); }

  // ---------- Hoja de estudio ----------
  let cabeceraHoja;
  const PESTANAS = [
    { id: 'comentario', texto: 'Comentario', toggle: '#pane-comment-toggle' },
    { id: 'diccionario', texto: 'Diccionario', toggle: '#pane-dictionary-toggle' },
    { id: 'original', texto: 'Original', toggle: '#pane-dictionary-toggle' }
  ];

  function asegurarPanelesVisibles() {
    for (const sel of ['#pane-bible-toggle', '#pane-comment-toggle', '#pane-dictionary-toggle']) {
      const b = $(sel);
      if (b && b.getAttribute('aria-pressed') === 'false') b.click();
    }
  }

  function construirHoja() {
    cabeceraHoja = crear('div', { id: 'movil-hoja-cabecera', role: 'tablist', 'aria-label': 'Estudio' });
    const asa = crear('button', { type: 'button', class: 'movil-hoja-asa', 'aria-label': 'Ampliar o reducir el estudio', onclick: alternarAltura }, [crear('span')]);
    const pestanas = crear('div', { class: 'movil-hoja-pestanas' });
    for (const p of PESTANAS) {
      pestanas.append(crear('button', { type: 'button', role: 'tab', 'data-pestana': p.id, texto: p.texto, onclick: () => elegirPestana(p.id, true) }));
    }
    const fijar = crear('button', { type: 'button', class: 'movil-hoja-fijar quiet', 'aria-pressed': 'false', title: 'Fijar: el estudio deja de seguir el versículo', texto: '📌', onclick: () => {
      estado.fijada = !estado.fijada; fijar.setAttribute('aria-pressed', String(estado.fijada)); html.dataset.hojaFijada = String(estado.fijada);
    } });
    cabeceraHoja.append(asa, pestanas, fijar);
    document.body.append(cabeceraHoja);

    // Arrastrar el asa: hacia arriba amplía, hacia abajo reduce.
    let inicioY = null;
    asa.addEventListener('pointerdown', e => { inicioY = e.clientY; });
    window.addEventListener('pointerup', e => {
      if (inicioY === null) return;
      const dy = e.clientY - inicioY; inicioY = null;
      if (Math.abs(dy) < 24) return;
      const orden = ['plegada', 'media', 'completa'];
      const i = orden.indexOf(estado.hoja) + (dy < 0 ? 1 : -1);
      ponerAltura(orden[Math.max(0, Math.min(2, i))]);
    });
  }

  function ponerAltura(altura) {
    estado.hoja = altura;
    html.dataset.hoja = altura;
  }
  function alternarAltura() {
    ponerAltura(estado.hoja === 'plegada' ? 'media' : estado.hoja === 'media' ? 'completa' : 'plegada');
  }
  function elegirPestana(id, abrir) {
    estado.pestana = id;
    html.dataset.pestana = id;
    for (const b of $$('[data-pestana]', cabeceraHoja)) b.setAttribute('aria-selected', String(b.dataset.pestana === id));
    asegurarPanelesVisibles();
    if (id === 'original' && $('#original-inline')?.hidden && $('#original-inline').childElementCount === 0) {
      mostrarAviso('Toca una palabra del texto para ver su original.');
    }
    if (abrir && estado.hoja === 'plegada') ponerAltura('media');
  }

  // La hoja sigue el versículo activo, salvo que esté fijada.
  function alTocarVersiculo(e) {
    const palabra = e.target.closest('.reading-word');
    const versiculo = e.target.closest('#verses .verse');
    if (!versiculo) return;
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
      if (b.dataset.ink === 'none') copia.textContent = '✕';
      tintas.append(copia);
    }
    const accion = (texto, fn, etiqueta) => crear('button', { type: 'button', class: 'quiet', texto, 'aria-label': etiqueta || texto, onclick: fn });
    barra.append(
      tintas,
      accion('Nota', () => { const n = $('.pane-notes'); if (n) { n.open = true; html.dataset.notas = 'abiertas'; $('#note')?.focus(); } ocultarBarra(); }),
      accion('Preguntar', () => { $('#ai-verse-ask')?.click(); ocultarBarra(); }, 'Preguntar a la IA sobre este versículo'),
      accion('↗', compartirVersiculo, 'Compartir versículo'),
      accion('⧉', copiarVersiculo, 'Copiar versículo')
    );
    document.body.append(barra);
    const notas = $('.pane-notes');
    if (notas) {
      notas.addEventListener('toggle', () => { html.dataset.notas = notas.open ? 'abiertas' : 'cerradas'; });
      notas.querySelector('summary')?.addEventListener('click', () => setTimeout(() => { html.dataset.notas = notas.open ? 'abiertas' : 'cerradas'; }, 0));
    }
  }
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
    const dialogoAbierto = $$('dialog[open]').pop();
    if (dialogoAbierto) { dialogoAbierto.close(); return true; }
    if (barra && !barra.hidden) { ocultarBarra(); return true; }
    const notas = $('.pane-notes');
    if (notas && notas.open) { notas.open = false; html.dataset.notas = 'cerradas'; return true; }
    const ia = $('#ai-pane');
    if (ia && !ia.hidden && getComputedStyle(ia).display !== 'none') { $('#ai-pane .pane-close, #ai-pane [data-close-ai], #ai-close')?.click(); return true; }
    if (estado.hoja !== 'plegada' && vistaActiva() === 'read-view') { ponerAltura(estado.hoja === 'completa' ? 'media' : 'plegada'); return true; }
    if (vistaActiva() !== 'read-view') { DESTINOS[0].accion(); setTimeout(marcarDestino, 60); return true; }
    return false; // la plataforma decide salir
  }

  // Alto exacto del libro: desde su borde superior hasta la hoja plegada.
  function ajustarAltoLectura() {
    const libro = $('#pane-biblia');
    if (!libro || !consulta.matches) return;
    const arriba = libro.getBoundingClientRect().top + window.scrollY;
    const pie = parseFloat(getComputedStyle(html).getPropertyValue('--nav-alto')) || 64;
    const cab = parseFloat(getComputedStyle(html).getPropertyValue('--hoja-cab')) || 52;
    html.style.setProperty('--cabeceras-lectura', Math.max(0, Math.round(arriba)) + 'px');
    html.style.setProperty('--alto-libro', Math.max(320, window.innerHeight - arriba - pie - cab) + 'px');
  }

  function activar() {
    html.dataset.telefono = String(consulta.matches);
    if (estado.construida) { moverAjustes(consulta.matches); if (consulta.matches) { marcarDestino(); ajustarAltoLectura(); } else cerrarMas(); return; }
    if (!consulta.matches) return;
    estado.construida = true;
    construirNavegacion();
    construirMas();
    construirHoja();
    construirBarraVersiculo();
    vigilarOriginal();
    $('#verses')?.addEventListener('scroll', ocultarBarra, { passive: true });
    asegurarPanelesVisibles();
    ponerAltura('plegada');
    elegirPestana('comentario', false);
    $('#verses')?.addEventListener('click', alTocarVersiculo, true);
    // Las vistas cambian por los controladores de la app: se observa y se marca el destino.
    for (const v of $$('main > section.view')) new MutationObserver(marcarDestino).observe(v, { attributes: true, attributeFilter: ['hidden', 'class', 'style'] });
    marcarDestino();
    ajustarAltoLectura();
    window.addEventListener('resize', ajustarAltoLectura);
    new ResizeObserver(ajustarAltoLectura).observe($('.reading-toolbar') || document.body);
    setTimeout(ajustarAltoLectura, 400);
  }

  window.BibliaMovil = { atras, ajustarAltoLectura, ponerAltura, elegirPestana, abrirMas, cerrarMas, estado };
  consulta.addEventListener('change', activar);
  window.addEventListener('resize', () => { if (String(consulta.matches) !== html.dataset.telefono) activar(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(activar, 0));
  else setTimeout(activar, 0);
})();
