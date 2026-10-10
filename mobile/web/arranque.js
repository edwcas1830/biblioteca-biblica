'use strict';
// Arranque del puente en el teléfono. Crea el adaptador del contrato (Codex: platform/)
// y registra las integraciones de plataforma (Claude: voz, compartir, ciclo de vida).
// Se carga después del contrato y los adaptadores, y antes de los controladores de app/.
(function () {
  const cap = window.Capacitor;
  const nativo = !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());
  const EVENTOS = ['onMusicPause'];
  let adaptador = null;

  if (nativo && window.LibraryAndroidBridge) {
    // Los servicios nativos (SQLite, archivos, cifrado) los aporta platform/android.
    // Sin ellos, cada operación rechaza con UNAVAILABLE: nunca hay respaldo web silencioso.
    const servicios = window.LibraryAndroidServices && window.LibraryAndroidServices.handlers ? window.LibraryAndroidServices.handlers() : {};
    adaptador = window.LibraryAndroidBridge.create({ handlers: servicios, events: EVENTOS });
  } else if (!nativo && window.LibraryWebBridge) {
    adaptador = window.LibraryWebBridge.create({ bible: window.BIBLE, dbName: 'biblioteca-preview-v1', events: EVENTOS });
  }
  if (!adaptador) { document.documentElement.dataset.puente = 'ausente'; return; }

  const Share = nativo && cap.registerPlugin ? cap.registerPlugin('Share') : null;
  const TTS = nativo && cap.registerPlugin ? cap.registerPlugin('TextToSpeech') : null;
  const integraciones = {};

  if (TTS) {
    integraciones.voiceOptions = async () => {
      const { voices } = await TTS.getSupportedVoices();
      return (voices || [])
        .map((v, i) => ({ id: String(i), name: v.name || `Voz ${i + 1}`, lang: v.lang || '' }))
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
  if (Object.keys(integraciones).length) adaptador.register(integraciones);

  // Ciclo de vida → evento del contrato (la música se pausa al salir de la app).
  window.addEventListener('biblioteca:pausar-musica', () => { try { adaptador.emit('onMusicPause'); } catch { /* sin suscriptores */ } });

  window.libraryDesktop = adaptador.bridge;
  document.documentElement.dataset.puente = nativo ? 'android' : 'web';
})();
