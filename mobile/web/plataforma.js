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
    App.addListener('appStateChange', ({ isActive }) => { if (!isActive) pausarMusica('segundo-plano'); });
    App.addListener('pause', () => pausarMusica('pausa'));
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
    SystemBars.setStyle({ style: oscuro ? 'DARK' : 'LIGHT' }).catch(() => {});
  }
  new MutationObserver(ajustarBarras).observe(html, { attributes: true, attributeFilter: ['data-theme'] });
  ajustarBarras();

  window.BibliaPlataforma = { capacidades, compartir, pausarMusica };
})();
