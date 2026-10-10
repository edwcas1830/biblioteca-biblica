(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LibraryBridgeContract = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const VERSION = 1;
  const errors = Object.freeze(['VALIDATION', 'UNAVAILABLE', 'NOT_FOUND', 'CANCELLED', 'LOCKED', 'CONFLICT', 'QUOTA', 'STORAGE', 'CORRUPT', 'INTERNAL']);
  class BridgeError extends Error {
    constructor(code, message, operation = '') {
      super(message); this.name = 'BridgeError'; this.code = errors.includes(code) ? code : 'INTERNAL'; this.operation = operation;
    }
    toJSON() { return {name: this.name, code: this.code, message: this.message, operation: this.operation}; }
  }
  const fail = message => { throw new BridgeError('VALIDATION', message); };
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const payload = value => {
    if (!object(value)) fail('Se necesita una selección válida.');
    let encoded; try { encoded = JSON.stringify(value); } catch { fail('Los datos no se pueden guardar.'); }
    if (!encoded || encoded.length > 12000000) fail('Los datos superan el tamaño admitido.');
  };
  const text = (value, max = 50000) => { if (typeof value !== 'string' || value.length > max) fail('Texto no válido.'); };
  const bool = value => { if (typeof value !== 'boolean') fail('Se necesita sí o no.'); };
  const optional = validator => value => { if (value !== undefined) validator(value); };
  const pin = value => { if (typeof value !== 'string' || !/^\d{6,12}$/.test(value)) fail('Usa un PIN de 6 a 12 cifras.'); };
  const ref = value => {
    payload(value);
    if (!Number.isInteger(value.book) || value.book < 0 || value.book > 65 || !Number.isInteger(value.chapter) || value.chapter < 1 || value.verse !== undefined && (!Number.isInteger(value.verse) || value.verse < 1)) fail('Referencia no válida.');
  };
  const none = value => { if (value !== undefined) fail('Esta operación no recibe datos.'); };
  const validate = {
    bootstrap: value => { payload(value); payload(value.initial); if (value.legacy !== null && value.legacy !== undefined) text(value.legacy, 12000000); if (value.legacyValid !== undefined) bool(value.legacyValid); },
    savePersonal: payload, restoreBackup: value => { payload(value); payload(value.state); },
    unlock: pin, setPin: pin, readerFullscreen: optional(bool),
    chapter: ref, comments: ref, connections: ref, graphicsChapter: ref,
    compare: value => { ref(value); if (!Array.isArray(value.modules) || value.modules.length < 2 || value.modules.length > 3 || new Set(value.modules).size !== value.modules.length || value.modules.some(id => typeof id !== 'string')) fail('Elige dos o tres versiones diferentes.'); },
    search: value => { payload(value); text(value.query, 200); },
    dictionary: value => { payload(value); text(value.query, 200); },
    readPdf: value => { if (!(value instanceof Uint8Array) || !value.length || value.length > 10000000) fail('El PDF debe tener hasta 10 MB.'); },
    moduleInstall: value => { if (!Array.isArray(value) || !value.length || value.length > 500 || new Set(value).size !== value.length || value.some(t => typeof t !== 'string')) fail('Selección de módulos no válida.'); },
    aiTextCopy: value => text(value), youtubeExternal: value => text(value, 200), musicPlayer: value => text(value, 2000), musicExternal: value => text(value, 2000),
    youtubeKey: value => text(value, 200), aiGeminiKey: value => { if (value !== null) text(value, 200); }, aiPersonalEnable: bool, aiPersonalLogin: value => text(value, 40),
    aiConnect: optional(payload), moduleScan: optional(payload),
    aiPrepare: payload, aiAsk: payload, aiCopy: payload, youtubeSearch: payload,
    graphicsChronology: payload, graphicsPeople: payload, graphicsGenealogy: payload,
    circleConnect: payload, circlePreview: payload, circleShare: payload, circleResolve: payload, circleReading: payload,
    playVoice: value => { payload(value); text(value.text, 200000); }, shareText: value => { payload(value); text(value.text); }
  };
  const eventNames = ['onFullscreen', 'onAiProgress', 'onAiState', 'onMusicPause', 'onUpdateState'];
  // The 67 preload operations retain their result shapes. Mobile extensions are additive.
  const names = [
    'youtubeStatus','youtubeKey','youtubeRemoveKey','youtubeSearch','youtubeExternal','youtubeCloud',
    'aiStatus','aiConnect','aiDisconnect','aiModels','readerFullscreen','onFullscreen',
    'aiPersonalStatus','aiPersonalEnable','aiPersonalLogin','aiGeminiKey','aiGeminiModels',
    'aiTextCopy','aiCancel','onAiProgress','aiPrepare','aiAsk','aiCopy','onAiState',
    'privacyStatus','unlock','lockPrivate','setPin','disablePin','exportBackup','restoreBackup',
    'musicPlayer','musicExternal','onMusicPause','readPdf','bootstrap','savePersonal',
    'graphicsChapter','graphicsChronology','graphicsPeople','graphicsGenealogy',
    'circleStatus','circleSync','circleConnect','circlePreview','circleShare','circleRecovery','circleResolve','circleReading','circleLeave','circleCopyCode',
    'moduleScan','moduleInstall','connections','compare','studySources','catalog','metadata','chapter','search','comments','dictionary',
    'getUpdateState','checkForUpdates','downloadUpdate','installUpdate','onUpdateState'
  ];
  const mobileNames = ['playVoice', 'stopVoice', 'voiceOptions', 'shareText'];
  const operations = Object.freeze(Object.fromEntries([...names, ...mobileNames].map(name => [name, Object.freeze({event: eventNames.includes(name), validate: validate[name] || none})])));
  function createBridge({platform = 'web', storage = 'none', handlers = {}, events = [], reasons = {}, nativeVerified = false} = {}) {
    if (!['web', 'android'].includes(platform)) fail('Plataforma desconocida.');
    const active = new Map(), listeners = new Map(), availableEvents = new Set(events);
    const checkName = name => { if (!Object.hasOwn(operations, name)) fail('Operación desconocida: ' + name); };
    for (const name of availableEvents) { checkName(name); if (!operations[name].event) fail('No es un evento: ' + name); }
    function register(next) {
      // Validate the entire registration before changing any handler.
      for (const [name, fn] of Object.entries(next)) { checkName(name); if (operations[name].event || typeof fn !== 'function') fail('Adaptador no válido: ' + name); }
      for (const [name, fn] of Object.entries(next)) active.set(name, fn);
    }
    register(handlers);
    const bridge = {};
    const unavailable = name => new BridgeError('UNAVAILABLE', reasons[name] || 'Esta función todavía no está disponible en esta plataforma.', name);
    for (const [name, spec] of Object.entries(operations)) {
      if (spec.event) {
        bridge[name] = callback => {
          if (typeof callback !== 'function') throw new BridgeError('VALIDATION', 'Se necesita una función para escuchar el evento.', name);
          if (!availableEvents.has(name)) throw unavailable(name);
          if (!listeners.has(name)) listeners.set(name, new Set());
          const entry = {callback}; listeners.get(name).add(entry);
          return () => { listeners.get(name)?.delete(entry); };
        };
      } else {
        bridge[name] = async value => {
          try {
            spec.validate(value);
            if (!active.has(name)) throw unavailable(name);
            return await active.get(name)(value);
          } catch (error) {
            if (error instanceof BridgeError) throw new BridgeError(error.code, error.message, name);
            if (error?.name === 'AbortError') throw new BridgeError('CANCELLED', 'La operación se canceló.', name);
            // Never expose a native stack, filename, request payload, PIN or token.
            throw new BridgeError('INTERNAL', 'No se pudo completar la operación.', name);
          }
        };
      }
    }
    bridge.getCapabilities = async () => ({version: VERSION, platform, storage, nativeVerified, operations: Object.fromEntries(Object.keys(operations).map(name => [name, (operations[name].event ? availableEvents.has(name) : active.has(name)) ? {available: true} : {available: false, reason: reasons[name] || 'Pendiente de implementar y comprobar.'}]))});
    function emit(name, value) {
      checkName(name); if (!operations[name].event || !availableEvents.has(name)) throw unavailable(name);
      for (const {callback} of [...listeners.get(name) || []]) {
        // Listener failures must not make a committed save appear unsuccessful.
        try { callback(value); } catch { /* Isolate consumer listeners. */ }
      }
    }
    return Object.freeze({bridge: Object.freeze(bridge), register, emit});
  }
  return Object.freeze({VERSION, BridgeError, operations, preloadNames: Object.freeze(names), createBridge});
});
