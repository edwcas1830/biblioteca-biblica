'use strict';
// Integraciones de Android (Capacitor) que no dependen del puente de datos:
// botón atrás, ciclo de vida (pausar música), voz nativa, compartir y barras del sistema.
// En el navegador (vista previa) todo esto queda inactivo y lo dice en window.BibliaPlataforma.
(function () {
  const cap = window.Capacitor;
  const nativo = !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());
  const html = document.documentElement;
  html.dataset.nativo = String(nativo);
  const plugin = nombre => (nativo && typeof cap.registerPlugin === 'function') ? cap.registerPlugin(nombre) : null;
  const App = plugin('App');
  const Share = plugin('Share');
  const TTS = plugin('TextToSpeech');
  const capacidades = { nativo, atras: !!App, cicloDeVida: !!App, compartir: !!Share || !!navigator.share, vozNativa: !!TTS };

  // ---------- Música: pausar cuando la app deja de verse (regla de YouTube) ----------
  function pausarMusica(motivo) {
    window.dispatchEvent(new CustomEvent('biblioteca:pausar-musica', { detail: { motivo } }));
    for (const marco of document.querySelectorAll('iframe')) {
      try { marco.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }), '*'); } catch { /* marco ajeno */ }
    }
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) pausarMusica('oculta'); });
  if (App) {
    // Al salir de la app: pausar la música y cerrar el cuaderno con PIN (closePrivate de app/privacy.js
    // espera la cola de guardado antes de cerrar, así no se pierde lo último escrito).
    // Si no se pudo cerrar (p. ej. falló el último guardado), se TAPA la pantalla para que el contenido
    // privado no se vea en «recientes»; al volver, el lector decide reintentar o seguir. Nunca se descartan datos.
    const cuadernoAbierto = () => { try { return typeof state !== 'undefined' && !!state.privacyEnabled && !state.privateLocked; } catch { return false; } };
    const cubrir = () => {
      let tapa = document.getElementById('cuaderno-cubierto');
      if (!tapa) {
        tapa = document.createElement('div'); tapa.id = 'cuaderno-cubierto'; tapa.setAttribute('role', 'alertdialog');
        tapa.innerHTML = '<div class="preparacion-caja"><p class="preparacion-texto">Tu cuaderno sigue abierto porque no se pudo guardar el último cambio. Lo tapé mientras estabas fuera.</p><button type="button" class="primary" data-accion="cerrar">Guardar y cerrar el cuaderno</button><button type="button" class="quiet" data-accion="seguir">Seguir leyendo</button></div>';
        tapa.querySelector('[data-accion="cerrar"]').addEventListener('click', async () => { try { await window.closePrivate(); } catch { /* el aviso de la app explica el fallo */ } if (!cuadernoAbierto()) tapa.hidden = true; });
        tapa.querySelector('[data-accion="seguir"]').addEventListener('click', () => { tapa.hidden = true; });
        document.body.append(tapa);
      }
      tapa.hidden = false;
    };
    const cerrarCuaderno = () => {
      if (!cuadernoAbierto()) return;
      cubrir(); // primero tapar (la miniatura de «recientes» se toma enseguida), luego intentar cerrar
      try {
        Promise.resolve(typeof window.closePrivate === 'function' ? window.closePrivate() : null)
          .catch(() => {}).finally(() => { if (!cuadernoAbierto()) { const t = document.getElementById('cuaderno-cubierto'); if (t) t.hidden = true; } });
      } catch { /* queda tapado */ }
    };
    App.addListener('appStateChange', ({ isActive }) => { if (!isActive) { pausarMusica('segundo-plano'); cerrarCuaderno(); } });
    App.addListener('pause', () => { pausarMusica('pausa'); cerrarCuaderno(); });
    // ---------- Atrás: popover → hoja → vista → salir ----------
    App.addListener('backButton', () => {
      if (window.BibliaMovil && window.BibliaMovil.atras()) return;
      App.exitApp();
    });
  }

  // ---------- Voz: speechSynthesis sobre el TTS nativo ----------
  // Android WebView no trae Web Speech. app.js usa speechSynthesis/SpeechSynthesisUtterance;
  // aquí se ofrece la misma forma, leyendo por renglones para poder pausar y reanudar.
  if (TTS && !('speechSynthesis' in window && window.speechSynthesis && window.speechSynthesis.getVoices)) {
    let voces = [];
    let cola = [], indice = 0, actual = null, pausado = false, hablando = false;
    const oyentes = { voiceschanged: [] };
    async function cargarVoces() {
      try {
        const { voices } = await TTS.getSupportedVoices();
        voces = (voices || []).map((v, i) => ({
          name: v.name || `Voz ${i + 1}`, lang: v.lang || 'es-ES', localService: v.localService !== false,
          voiceURI: v.voiceURI || v.name || String(i), default: !!v.default, _indice: i
        }));
      } catch { voces = []; }
      oyentes.voiceschanged.forEach(fn => { try { fn(); } catch { /* sin efecto */ } });
    }
    async function siguiente() {
      if (pausado || !actual) return;
      if (indice >= cola.length) { hablando = false; const u = actual; actual = null; u.onend && u.onend({}); return; }
      const texto = cola[indice];
      hablando = true;
      try {
        await TTS.speak({ text: texto, lang: actual.lang || (actual.voice && actual.voice.lang) || 'es-ES', voice: actual.voice ? actual.voice._indice : undefined, rate: actual.rate || 1, pitch: actual.pitch || 1, volume: 1, category: 'playback' });
        if (!pausado) { indice++; siguiente(); }
      } catch (e) {
        if (!pausado) { hablando = false; const u = actual; actual = null; u && u.onerror && u.onerror({ error: String(e && e.message || e) }); }
      }
    }
    window.SpeechSynthesisUtterance = function (texto) {
      this.text = String(texto || ''); this.lang = 'es-ES'; this.voice = null; this.rate = 1; this.pitch = 1;
      this.onend = null; this.onerror = null;
    };
    window.speechSynthesis = {
      get speaking() { return hablando; }, get paused() { return pausado; }, get pending() { return false; },
      getVoices: () => voces.slice(),
      speak(u) { this.cancel(); actual = u; cola = u.text.split(/\n+/).map(t => t.trim()).filter(Boolean); indice = 0; pausado = false; siguiente(); },
      pause() { if (!actual) return; pausado = true; TTS.stop().catch(() => {}); },
      resume() { if (!actual || !pausado) return; pausado = false; siguiente(); },
      cancel() { pausado = false; actual = null; cola = []; indice = 0; hablando = false; TTS.stop().catch(() => {}); },
      addEventListener(tipo, fn) { (oyentes[tipo] = oyentes[tipo] || []).push(fn); },
      removeEventListener(tipo, fn) { oyentes[tipo] = (oyentes[tipo] || []).filter(f => f !== fn); }
    };
    cargarVoces();
  }

  // ---------- Compartir (IA: «Compartir pregunta») ----------
  async function compartir({ titulo, texto }) {
    if (Share) { await Share.share({ title: titulo, text: texto, dialogTitle: 'Enviar a…' }); return { ok: true, via: 'android' }; }
    if (navigator.share) { await navigator.share({ title: titulo, text: texto }); return { ok: true, via: 'web' }; }
    await navigator.clipboard.writeText(texto);
    return { ok: true, via: 'portapapeles' };
  }

  // ---------- Barras del sistema según el tema del diseño ----------
  function ajustarBarras() {
    const SystemBars = plugin('SystemBars');
    if (!SystemBars) return;
    const oscuro = /noche|night|oscuro|dark/i.test(html.dataset.theme || '');
    try { Promise.resolve(SystemBars.setStyle({ style: oscuro ? 'DARK' : 'LIGHT' })).catch(() => {}); } catch { /* sin barras nativas */ }
  }
  new MutationObserver(ajustarBarras).observe(html, { attributes: true, attributeFilter: ['data-theme'] });
  ajustarBarras();

  // ---------- Traspaso desde la PC: elegir y copiar archivos ----------
  // El lector elige TODOS los archivos de la carpeta traspaso-android (OneDrive o descargas).
  // Se copian por flujo (sin cargarlos en memoria) a files/traspaso-entrante/ del almacenamiento
  // privado de la app. La verificación de huellas e importación es del servicio de datos (Codex).
  const FilePicker = plugin('FilePicker');
  const Filesystem = plugin('Filesystem');
  capacidades.traspaso = !!(FilePicker && Filesystem);
  const CARPETA_ENTRANTE = 'traspaso-entrante';
  function nombreSeguro(nombre) {
    const n = String(nombre || '').trim();
    if (!n || n.length > 120 || /[\\/]/.test(n) || n.startsWith('.') || /[\u0000-\u001f]/.test(n)) return null;
    return n;
  }
  async function elegirArchivosTraspaso({ alProgreso } = {}) {
    if (!capacidades.traspaso) throw Object.assign(new Error('Elegir archivos solo funciona en el teléfono.'), { code: 'UNAVAILABLE' });
    const { files } = await FilePicker.pickFiles({ limit: 0, types: ['*/*'], readData: false });
    if (!files || !files.length) return { archivos: [], carpeta: CARPETA_ENTRANTE };
    // Un solo archivo .bbt = el paquete completo que arma la PC: se desempaca de forma nativa.
    const paquetes = files.filter(f => /\.bbt$/i.test(f.name || ''));
    if (paquetes.length) {
      if (files.length !== 1) throw Object.assign(new Error('Elige solo el archivo del paquete (.bbt), sin otros archivos.'), { code: 'VALIDATION' });
      return desempacarPaquete({ desde: files[0].path, bytes: files[0].size || 0, alProgreso });
    }
    // Antes de copiar: nombres válidos y sin duplicados (también ignorando mayúsculas).
    const vistos = new Set();
    for (const f of files) {
      const nombre = nombreSeguro(f.name);
      if (!nombre || !f.path) throw Object.assign(new Error(`No se puede copiar «${f.name}».`), { code: 'VALIDATION' });
      const clave = nombre.toLocaleLowerCase('es');
      if (vistos.has(clave)) throw Object.assign(new Error(`Elegiste dos archivos llamados «${nombre}». Elige cada archivo una sola vez.`), { code: 'VALIDATION' });
      vistos.add(clave);
    }
    try { await Filesystem.rmdir({ directory: 'DATA', path: CARPETA_ENTRANTE, recursive: true }); } catch { /* no existía */ }
    await Filesystem.mkdir({ directory: 'DATA', path: CARPETA_ENTRANTE, recursive: true });
    const { uri } = await Filesystem.getUri({ directory: 'DATA', path: CARPETA_ENTRANTE });
    const base = uri.replace(/^file:\/\//, '');
    const total = files.reduce((s, f) => s + (f.size || 0), 0);
    let copiados = 0;
    const archivos = [];
    for (const f of files) {
      const nombre = nombreSeguro(f.name);
      if (alProgreso) alProgreso({ archivo: nombre, copiados, total });
      await FilePicker.copyFile({ from: f.path, to: `${base}/${nombre}`, overwrite: true });
      // El tamaño que vale es el del archivo ya copiado (OneDrive no siempre lo informa).
      const { size } = await Filesystem.stat({ directory: 'DATA', path: `${CARPETA_ENTRANTE}/${nombre}` });
      copiados += f.size || size || 0;
      archivos.push({ nombre, ruta: `${CARPETA_ENTRANTE}/${nombre}`, bytes: size });
    }
    if (alProgreso) alProgreso({ archivo: null, copiados, total });
    return { archivos, carpeta: CARPETA_ENTRANTE };
  }

  // Paquete .bbt (tar) → files/traspaso-entrante, leído por bloques en Java (TraspasoPaquetePlugin).
  async function desempacarPaquete({ desde, bytes = 0, alProgreso } = {}) {
    if (!capacidades.traspaso) throw Object.assign(new Error('El paquete solo se abre en el teléfono.'), { code: 'UNAVAILABLE' });
    const Paquete = plugin('TraspasoPaquete');
    let oyente = null;
    try {
      if (alProgreso) {
        alProgreso({ archivo: 'el paquete', copiados: 0, total: bytes });
        oyente = await Paquete.addListener('progreso', p => alProgreso({ archivo: p.archivo, copiados: p.copiados || 0, total: p.total || bytes }));
      }
      const r = await Paquete.desempacar({ desde, bytes });
      return { carpeta: r.carpeta, archivos: r.archivos.map(a => ({ nombre: a.nombre, ruta: a.ruta, bytes: Number(a.bytes) })) };
    } finally { if (oyente) try { await oyente.remove(); } catch { /* ya quitado */ } }
  }

  // Llavero seguro (Android Keystore, LlaveroSeguroPlugin.java): claves de IA que sobreviven al cierre de la app.
  const Llavero = plugin('LlaveroSeguro');
  window.BibliaLlavero = Object.freeze({
    disponible: async () => { if (!Llavero) return false; try { return (await Llavero.disponible()).disponible === true; } catch { return false; } },
    leer: async nombre => { if (!Llavero) return null; return (await Llavero.leer({ nombre })).valor ?? null; },
    guardar: async (nombre, valor) => { if (!Llavero) throw Object.assign(new Error('El llavero seguro solo existe en el teléfono.'), { code: 'UNAVAILABLE' }); await Llavero.guardar({ nombre, valor }); },
    borrar: async nombre => { if (Llavero) await Llavero.borrar({ nombre }); }
  });

  // Imagen con versículos → caché de la app → menú «Compartir» de Android (WhatsApp, Galería, Drive…).
  async function compartirImagen({ dataUrl, nombre, titulo } = {}) {
    if (!Share || !Filesystem) throw Object.assign(new Error('Compartir imágenes solo funciona en el teléfono.'), { code: 'UNAVAILABLE' });
    const datos = String(dataUrl || '').replace(/^data:image\/png;base64,/, '');
    const archivo = 'imagenes/' + (String(nombre || 'versiculo.png').replace(/[^A-Za-z0-9._-]/g, '-') || 'versiculo.png');
    await Filesystem.writeFile({ directory: 'CACHE', path: archivo, data: datos, recursive: true });
    const { uri } = await Filesystem.getUri({ directory: 'CACHE', path: archivo });
    try { await Share.share({ title: titulo || 'Versículo', dialogTitle: 'Compartir imagen', files: [uri] }); }
    catch (e) { if (!/cancel/i.test((e && e.message) || '')) throw e; }
  }

  // Copia de seguridad (y cualquier archivo de texto): caché de la app → «Compartir» → Drive, Archivos, correo…
  async function guardarArchivo({ nombre, texto, titulo } = {}) {
    if (!Share || !Filesystem) throw Object.assign(new Error('Guardar archivos solo funciona en el teléfono.'), { code: 'UNAVAILABLE' });
    const archivo = 'copias/' + (String(nombre || 'copia.json').replace(/[^A-Za-z0-9._-]/g, '-') || 'copia.json');
    await Filesystem.writeFile({ directory: 'CACHE', path: archivo, data: String(texto || ''), encoding: 'utf8', recursive: true });
    const { uri } = await Filesystem.getUri({ directory: 'CACHE', path: archivo });
    try { await Share.share({ title: titulo || 'Copia de seguridad', dialogTitle: 'Guardar la copia en…', files: [uri] }); return { compartido: true, uri }; }
    catch (e) { if (/cancel/i.test((e && e.message) || '')) return { compartido: false, uri }; throw e; }
  }

  // Lectura en voz alta en segundo plano: servicio nativo (LecturaVozService) con controles en la notificación
  // y en la pantalla bloqueada. Pide el permiso de notificaciones la primera vez (Android 13+).
  const Lectura = plugin('LecturaVoz');
  const lectura = Lectura ? {
    async iniciar(opciones) { try { await Lectura.permiso(); } catch { /* sin permiso: suena igual, sin controles visibles */ } return Lectura.iniciar(opciones); },
    pausar: () => Lectura.pausar(), reanudar: () => Lectura.reanudar(), siguiente: () => Lectura.siguiente(), detener: () => Lectura.detener(),
    al: (tipo, fn) => Lectura.addListener(tipo, fn)
  } : null;

  // Versículo del día: un aviso por día a la hora elegida (CONSENSO-HABITO.md). Se programan los próximos 14 días
  // y se renuevan cada vez que se abre la app; nunca hay más de un aviso por día. Tocarlo abre «Hoy».
  const Avisos = plugin('LocalNotifications');
  const ID_AVISO = 7100, CANAL = 'versiculo-del-dia';
  let canalListo = null;
  const recordatorio = Avisos ? {
    async permiso() {
      let p = await Avisos.checkPermissions();
      if (p.display === 'prompt' || p.display === 'prompt-with-rationale') p = await Avisos.requestPermissions();
      return p.display === 'granted';
    },
    async programar(lista) {
      canalListo = canalListo || Avisos.createChannel({ id: CANAL, name: 'Versículo del día', description: 'Un aviso al día con el versículo de «Hoy».', importance: 3, visibility: 1 }).catch(() => {});
      await canalListo;
      await this.cancelar();
      if (!lista.length) return 0;
      await Avisos.schedule({ notifications: lista.slice(0, 14).map((a, i) => ({
        id: ID_AVISO + i, channelId: CANAL, title: 'Versículo del día · ' + a.cita, body: a.texto, largeBody: a.texto,
        // isExactNotification: false → alarma aproximada: sin pedir «Alarmas y recordatorios» (el permiso se quitó del manifiesto).
        smallIcon: 'ic_lectura', isExactNotification: false, schedule: { at: a.cuando, allowWhileIdle: true }, extra: { destino: 'hoy', fecha: a.fecha }
      })) });
      return Math.min(lista.length, 14);
    },
    async cancelar() {
      const { notifications } = await Avisos.getPending();
      const nuestras = notifications.filter(n => n.id >= ID_AVISO && n.id < ID_AVISO + 20);
      if (nuestras.length) await Avisos.cancel({ notifications: nuestras.map(n => ({ id: n.id })) });
    },
    pendientes: async () => (await Avisos.getPending()).notifications.filter(n => n.id >= ID_AVISO && n.id < ID_AVISO + 20)
  } : null;
  if (Avisos) Avisos.addListener('localNotificationActionPerformed', ({ notification }) => {
    if (notification && notification.extra && notification.extra.destino === 'hoy') window.dispatchEvent(new CustomEvent('biblioteca:abrir-hoy'));
  });
  capacidades.recordatorio = !!recordatorio;

  window.BibliaPlataforma = { capacidades, compartir, pausarMusica, elegirArchivosTraspaso, desempacarPaquete, ...(Share && Filesystem ? { compartirImagen, guardarArchivo } : {}), ...(lectura ? { lectura } : {}), ...(recordatorio ? { recordatorio } : {}) };
})();
