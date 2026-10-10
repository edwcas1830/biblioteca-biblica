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

  window.BibliaPlataforma = { capacidades, compartir, pausarMusica, elegirArchivosTraspaso, desempacarPaquete };
})();
