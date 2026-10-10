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
    { id: 'leer', icono: '📖', texto: 'Leer', vista: 'read-view', accion: () => { if (vistaActiva() === 'read-view' && estado.hoja !== 'plegada') { ponerAltura('plegada'); return; } botonPorTexto('.compact-nav button', 'mi biblia')?.click(); } },
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
    // Con la hoja abierta, un botón con texto devuelve a la Biblia (el asa sola no se entiende).
    const volver = crear('button', { type: 'button', class: 'movil-hoja-volver', 'aria-label': 'Volver a la Biblia', onclick: () => ponerAltura('plegada') }, [crear('span', { 'aria-hidden': 'true', texto: '⌄' }), crear('span', { texto: 'Biblia' })]);
    const pestanas = crear('div', { class: 'movil-hoja-pestanas' });
    for (const p of PESTANAS) {
      pestanas.append(crear('button', { type: 'button', role: 'tab', 'data-pestana': p.id, texto: p.texto, onclick: () => elegirPestana(p.id, true) }));
    }
    const fijar = crear('button', { type: 'button', class: 'movil-hoja-fijar quiet', 'aria-pressed': 'false', title: 'Fijar: el estudio deja de seguir el versículo', texto: '📌', onclick: () => {
      estado.fijada = !estado.fijada; fijar.setAttribute('aria-pressed', String(estado.fijada)); html.dataset.hojaFijada = String(estado.fijada);
    } });
    cabeceraHoja.append(crear('div', { class: 'movil-hoja-izquierda' }, [asa, volver]), pestanas, fijar);
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
      crear('button', { type: 'button', class: 'quiet', id: 'movil-preguntar', texto: 'Preguntar', 'aria-label': 'Preguntar a la IA sobre este versículo', onclick: () => { $('#ai-verse-ask')?.click(); ocultarBarra(); } }),
      accion('↗', compartirVersiculo, 'Compartir versículo'),
      accion('⧉', copiarVersiculo, 'Copiar versículo')
    );
    document.body.append(barra);
    const puente = window.libraryDesktop;
    if (puente && typeof puente.getCapabilities === 'function') {
      puente.getCapabilities().then(caps => { if (caps.operations.aiPrepare && !caps.operations.aiPrepare.available) $('#movil-preguntar').hidden = true; }).catch(() => {});
    }
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
    if (window.BibliaEnfoque && window.BibliaEnfoque.salir()) return true; // primero sale de la pantalla completa
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
      botonTraspaso = crear('button', { type: 'button', class: 'quiet', id: 'movil-traer-pc', texto: '⇣ Traer desde la PC', onclick: () => { cerrarMas(); dialogoTraspaso.showModal(); iniciarTraspaso(); } });
      $('.movil-mas-lista', hojaMas).prepend(botonTraspaso);
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
        crear('p', { class: 'movil-ia-aviso', texto: 'La conexión dura mientras la app está abierta: al cerrarla tendrás que volver a conectar.' })
      ]);
      conectar.after(bloque);
      // El texto de escritorio habla de la protección de Windows: en el teléfono la clave vive solo en memoria.
      for (const pa of $$('#ai-settings p.muted')) {
        if (/protegida por Windows/.test(pa.textContent)) pa.textContent = 'La autorización se completa en el navegador del teléfono. La clave queda solo en la memoria de la app mientras está abierta y no se incluye en las copias ni en el traspaso.';
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
      const refrescarCuota = async () => {
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

  function activar() {
    html.dataset.telefono = String(consulta.matches);
    if (estado.construida) { moverAjustes(consulta.matches); if (consulta.matches) { marcarDestino(); ajustarAltoLectura(); } else cerrarMas(); return; }
    if (!consulta.matches) return;
    estado.construida = true;
    construirNavegacion();
    construirMas();
    construirHoja();
    construirBarraVersiculo();
    construirControlesLectura();
    prepararTraspaso();
    confirmarTraspasoAlAbrir();
    prepararIA().then(() => { prepararIA.hecho = true; });
    vigilarOriginal();
    // Se oculta cuando el lector desplaza el texto (no cuando la app centra el versículo elegido).
    for (const ev of ['touchmove', 'wheel']) $('#verses')?.addEventListener(ev, ocultarBarra, { passive: true });
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
