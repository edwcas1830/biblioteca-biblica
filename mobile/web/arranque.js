'use strict';
// Arranque del puente en el teléfono. Crea el adaptador del contrato (Codex: platform/)
// y registra las integraciones de plataforma (Claude: voz, compartir, ciclo de vida).
// Se carga después del contrato y los adaptadores, y antes de los controladores de app/.
(function () {
  const cap = window.Capacitor;
  const html = document.documentElement;
  const nativo = !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());
  const EVENTOS = ['onMusicPause', 'onFullscreen'];
  const manifiesto = window.BibliaManifiestos && window.BibliaManifiestos.rv1909;
  let adaptador = null;

  if (nativo && window.LibraryAndroidBridge) {
    // Los servicios nativos (SQLite, archivos, cifrado) los aporta platform/android.
    // Sin ellos, cada operación rechaza con UNAVAILABLE: nunca hay respaldo web silencioso.
    const servicios = window.LibraryAndroidServices;
    adaptador = window.LibraryAndroidBridge.create({
      handlers: servicios ? servicios.handlers() : {},
      storage: servicios ? servicios.storage() : 'none',
      events: EVENTOS
    });
  } else if (!nativo && window.LibraryWebBridge) {
    adaptador = window.LibraryWebBridge.create({ bible: window.BIBLE, manifest: manifiesto, dbName: 'biblioteca-preview-v1', events: EVENTOS });
  }
  if (!adaptador) { document.documentElement.dataset.puente = 'ausente'; return; }

  const Share = nativo && cap.registerPlugin ? cap.registerPlugin('Share') : null;
  const TTS = nativo && cap.registerPlugin ? cap.registerPlugin('TextToSpeech') : null;
  const integraciones = {};

  if (TTS) {
    integraciones.voiceOptions = async () => {
      const { voices } = await TTS.getSupportedVoices();
      return (voices || [])
        // El id es el índice original del plugin: se conserva aunque se filtre por idioma.
        .map((v, i) => ({ id: String(i), name: v.name || `Voz ${i + 1}`, lang: v.lang || '', ...(typeof v.localService === 'boolean' ? { localService: v.localService } : {}) }))
        .filter(v => /^es/i.test(v.lang));
    };
    integraciones.playVoice = async ({ text, lang = 'es-ES', voice, rate = 1 }) => {
      await TTS.speak({ text, lang, rate, pitch: 1, volume: 1, voice: voice === undefined ? undefined : Number(voice), category: 'playback' });
    };
    integraciones.stopVoice = async () => { await TTS.stop(); };
  }
  if (Share || navigator.share) {
    integraciones.shareText = async ({ text, title }) => {
      try {
        if (Share) await Share.share({ text, title, dialogTitle: 'Enviar a…' });
        else await navigator.share({ text, title });
        return { completed: true };
      } catch { return { completed: false }; } // el lector cerró el selector
    };
  }
  // Música: el reproductor (app/music/player.html) se sirve desde el mismo origen de la app;
  // no hace falta el servidor local de escritorio. «Abrir fuera» usa el navegador del sistema.
  const Browser = nativo && cap.registerPlugin ? cap.registerPlugin('Browser') : null;
  const abrirFuera = async url => {
    const u = new URL(url);
    if (u.protocol !== 'https:') throw new Error('Solo se abren enlaces seguros.');
    if (Browser) await Browser.open({ url: u.href }); else window.open(u.href, '_blank', 'noopener');
  };
  {
    integraciones.musicPlayer = async input => {
      const media = window.MusicCore.parse(input);
      const src = new URL('music/player.html', location.href);
      if (media.video) src.searchParams.set('video', media.video);
      if (media.list) src.searchParams.set('list', media.list);
      src.searchParams.set('padre', location.origin);
      return { src: src.href, origin: location.origin, media };
    };
    integraciones.musicExternal = async input => { const m = window.MusicCore.parse(input); await abrirFuera(m.url); };
    // Igual que escritorio: abre la búsqueda en YouTube (nunca una URL arbitraria).
    integraciones.youtubeExternal = async (consulta = '') => {
      if (typeof consulta !== 'string' || consulta.length > 150) throw new Error('Búsqueda no válida.');
      await abrirFuera('https://www.youtube.com/results?search_query=' + encodeURIComponent(consulta.trim() || 'música cristiana adoración'));
    };
    integraciones.youtubeCloud = async () => { await abrirFuera('https://console.cloud.google.com/apis/library/youtube.googleapis.com'); };
  }
  // Lectura a pantalla completa (devocional en vista de libro): API de pantalla completa del WebView.
  integraciones.readerFullscreen = async valor => {
    const activo = !!document.fullscreenElement;
    const quiero = typeof valor === 'boolean' ? valor : !activo;
    try {
      if (quiero && !activo) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      if (!quiero && activo) await document.exitFullscreen();
    } catch { /* sin permiso: se usa el modo inmersivo de la página */ }
    html.classList.toggle('lectura-inmersiva', quiero);
    adaptador.emit('onFullscreen', quiero);
    return quiero;
  };
  document.addEventListener('fullscreenchange', () => {
    const activo = !!document.fullscreenElement;
    if (!activo && html.classList.contains('lectura-inmersiva')) { html.classList.remove('lectura-inmersiva'); adaptador.emit('onFullscreen', false); }
  });
  if (Object.keys(integraciones).length) adaptador.register(integraciones);

  // Ciclo de vida → evento del contrato (la música se pausa al salir de la app).
  window.addEventListener('biblioteca:pausar-musica', () => { try { adaptador.emit('onMusicPause'); } catch { /* sin suscriptores */ } });

  document.documentElement.dataset.puente = nativo ? 'android' : 'web';

  if (!nativo) { window.libraryDesktop = adaptador.bridge; return; }

  // ---------- Android: servicios nativos de Codex, en este orden ----------
  // 1. recuperar un traspaso interrumpido (antes de abrir SQLite);
  // 2. attach: lector público, documentos y repositorio personal SQLite (bootstrap/savePersonal esperan
  //    por dentro a que abra la base) — mientras tanto se ve «Preparando tu biblioteca…»;
  // 3. lector de módulos e-Sword (paquete personal) con FTS5: no frena el arranque más de unos segundos.
  const registrar = manejadores => {
    if (window.LibraryAndroidServices) window.LibraryAndroidServices.register(manejadores);
    else adaptador.register(manejadores);
  };
  const plugins = cap.registerPlugin ? { filesystem: cap.registerPlugin('Filesystem'), sqlite: cap.registerPlugin('CapacitorSQLite') } : null;
  const fallos = [];
  const avisar = (estado, mensaje) => {
    html.dataset.preparacion = estado;
    window.dispatchEvent(new CustomEvent('biblioteca:preparacion', { detail: { estado, mensaje } }));
  };
  // Aviso visible mientras abre la base; si falla, explica y ofrece reintentar (nunca una biblioteca vacía).
  const aviso = document.createElement('div');
  aviso.id = 'preparacion-biblioteca';
  aviso.setAttribute('role', 'status');
  aviso.innerHTML = '<div class="preparacion-caja"><div class="preparacion-icono" aria-hidden="true"></div><p class="preparacion-texto"></p><button type="button" class="primary preparacion-reintentar" hidden>Reintentar</button></div>';
  aviso.querySelector('.preparacion-reintentar').addEventListener('click', () => location.reload());
  (document.body || document.documentElement).append(aviso);
  window.addEventListener('biblioteca:preparacion', e => {
    const { estado, mensaje } = e.detail;
    aviso.dataset.estado = estado;
    aviso.querySelector('.preparacion-texto').textContent = estado === 'fallo' ? mensaje + ' Tus datos no se tocaron.' : mensaje;
    aviso.querySelector('.preparacion-reintentar').hidden = estado !== 'fallo';
  });
  avisar('preparando', 'Preparando tu biblioteca…');

  const recuperado = (async () => {
    if (!plugins || !window.LibraryAndroidTransfer) return;
    try {
      const traspaso = window.LibraryAndroidTransfer.create({ ...plugins, books: window.BIBLE && window.BIBLE.books, repository: window.LibraryAndroidRepository || undefined });
      await traspaso.recover();
      registrar(traspaso.handlers());
    } catch (e) { fallos.push(['traspaso', e]); }
  })();

  const biblioteca = recuperado.then(() => {
    if (!plugins || !window.LibraryAndroidServices || !window.LibraryAndroidServices.attach) throw new Error('Faltan los servicios de Android.');
    return window.LibraryAndroidServices.attach(adaptador, { sqlite: plugins.sqlite, bible: window.BIBLE, manifest: manifiesto });
  });
  biblioteca.then(() => avisar('lista', ''))
    .catch(e => avisar('fallo', (e && e.message) || 'No se pudo abrir tu biblioteca. Tus datos se conservan.'));

  // Módulos e-Sword: se registran cuando terminan de verificarse (sus operaciones reemplazan a las del lector público).
  const modulos = biblioteca.catch(() => {}).then(async () => {
    if (!plugins || !window.LibraryAndroidReader) return false;
    try {
      const lector = await window.LibraryAndroidReader.create({ ...plugins, bible: window.BIBLE, manifest: manifiesto });
      registrar(lector.handlers());
      window.BibliaLector = lector; // se cierra y se recrea tras un traspaso
      return true;
    } catch (e) { fallos.push(['módulos', e]); return false; }
  });
  modulos.then(ok => {
    html.dataset.serviciosNativos = fallos.length ? 'con-fallos' : 'listos';
    if (fallos.length) html.dataset.serviciosFallos = fallos.map(([n, e]) => n + ': ' + ((e && e.message) || e)).join(' · ');
    window.dispatchEvent(new CustomEvent('biblioteca:capacidades', { detail: { modulos: ok } }));
  });

  // Las operaciones esperan a la recuperación del traspaso y a attach (registros rápidos); a los módulos,
  // como mucho 8 s: si tardan más (primer índice FTS5), la app arranca con el lector público y luego avisa.
  const espera = Promise.all([recuperado, biblioteca.catch(() => {}), Promise.race([modulos, new Promise(r => setTimeout(r, 8000))])]);
  const real = adaptador.bridge;
  const EVENTOS_CONTRATO = new Set(['onFullscreen', 'onAiProgress', 'onAiState', 'onMusicPause', 'onUpdateState']);
  const puente = {};
  for (const nombre of Object.keys(real)) {
    const op = real[nombre];
    if (typeof op !== 'function') { puente[nombre] = op; continue; }
    puente[nombre] = EVENTOS_CONTRATO.has(nombre) ? op : async (...args) => { await espera; return real[nombre](...args); };
  }
  window.libraryDesktop = Object.freeze(puente);
  window.BibliaPreparacion = { biblioteca, modulos };
})();
