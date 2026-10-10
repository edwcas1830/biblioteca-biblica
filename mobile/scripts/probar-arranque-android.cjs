'use strict';
// Uso: node mobile/scripts/build-www.cjs && node mobile/scripts/probar-arranque-android.cjs
// Simula el arranque Android con los MISMOS scripts y el mismo orden que mobile/www/index.html,
// con los dobles de plugins de Codex (SQLite real en carpeta temporal) y un puente nativo como el del
// teléfono. Imita lo que el emulador descubrió de Android de verdad:
//   · SQLCipher crea sola la tabla android_metadata al abrir una base escribible;
//   · execute() solo separa sentencias por «;» + salto de línea y ejecuta una por trozo;
//   · el lado nativo CONSERVA las conexiones al recargar la página (createConnection: «already exists»).
// Datos inventados.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const repo = process.argv[2] || path.resolve(__dirname, '..', '..');
const www = path.join(repo, 'mobile', 'www');
const helpers = require(path.join(repo, 'tests', 'mobile-fixtures.cjs'));
const despues = [];
const t = { after: fn => despues.push(fn) };

function puenteNativo(impl) {
  const callbacks = new Set(['readFileInChunks', 'addListener']);
  return {
    PluginHeaders: Object.entries(impl).map(([name, obj]) => ({ name, methods: Object.keys(obj).filter(k => typeof obj[k] === 'function').map(m => ({ name: m, rtype: callbacks.has(m) ? 'callback' : 'promise' })) })),
    nativePromise: (plugin, metodo, opciones) => impl[plugin][metodo](opciones),
    nativeCallback: (plugin, metodo, opciones, cb) => { Promise.resolve(impl[plugin][metodo](opciones, cb)).catch(e => cb(null, e)); return 'cb-' + metodo; }
  };
}

// SQLite «como Android» sobre el doble de Codex.
function sqliteComoAndroid(bases) {
  const base = helpers.sqlite(bases);
  const abiertas = new Map(); // conexiones vivas en el lado nativo (sobreviven a recargar la página)
  return {
    ...base,
    createConnection: async o => { await base.createConnection(o); abiertas.set(o.database, { tipo: 'normal', readonly: !!o.readonly, abierta: false }); },
    createNCConnection: async o => { await base.createNCConnection(o); abiertas.set(o.databasePath, { tipo: 'nc', readonly: true, abierta: false }); },
    open: async o => {
      await base.open(o);
      if (abiertas.has(o.database)) abiertas.get(o.database).abierta = true;
      if (!o.readonly) await base.execute({ database: o.database, statements: "CREATE TABLE IF NOT EXISTS android_metadata (locale TEXT); INSERT INTO android_metadata SELECT 'es_US' WHERE NOT EXISTS (SELECT 1 FROM android_metadata);" });
    },
    close: async o => { await base.close(o); if (abiertas.has(o.database)) abiertas.get(o.database).abierta = false; },
    closeConnection: async o => { await base.closeConnection(o); abiertas.delete(o.database); },
    closeNCConnection: async o => { await base.closeNCConnection(o); abiertas.delete(o.databasePath); },
    execute: async o => {
      for (const trozo of String(o.statements).split(';\n')) {
        const primera = trozo.split(';')[0].trim();
        if (primera) await base.execute({ ...o, statements: primera + ';' });
      }
      return { changes: { changes: 0 } };
    },
    // Con listas vacías el plugin cierra TODAS las conexiones nativas (CapacitorSQLite.java).
    checkConnectionsConsistency: async ({ dbNames = [] } = {}) => {
      if (dbNames.length) return { result: true };
      for (const [nombre, c] of [...abiertas]) {
        try {
          if (c.abierta) await base.close(c.tipo === 'nc' ? { database: nombre, readonly: true } : { database: nombre, readonly: c.readonly });
          if (c.tipo === 'nc') await base.closeNCConnection({ databasePath: nombre }); else await base.closeConnection({ database: nombre, readonly: c.readonly });
        } catch { /* ya cerrada */ }
        abiertas.delete(nombre);
      }
      return { result: false };
    },
    conexionesVivas: () => abiertas.size
  };
}

function cargarPagina(plugins) {
  const eventos = {};
  const ventana = {
    androidBridge: { postMessage() {} },          // lo que el teléfono inyecta ANTES de los scripts
    Capacitor: puenteNativo(plugins),
    addEventListener(tipo, fn) { (eventos[tipo] = eventos[tipo] || []).push(fn); },
    dispatchEvent(e) { for (const fn of eventos[e.type] || []) fn(e); },
    CustomEvent: class { constructor(type, o = {}) { this.type = type; this.detail = o.detail; } },
    navigator: {}, location: { href: 'https://localhost/', origin: 'https://localhost', reload() {} }, URL, crypto: globalThis.crypto,
    TextEncoder, TextDecoder, setTimeout, clearTimeout, queueMicrotask, structuredClone, DecompressionStream: globalThis.DecompressionStream,
    fetch: async u => { const p = new URL(u, 'https://localhost/').pathname; return new Response(fs.readFileSync(path.join(www, decodeURIComponent(p)))); }, Response, Request, Headers, Blob,
    atob, btoa, MutationObserver: class { observe() {} disconnect() {} }, matchMedia: () => ({ matches: true, addEventListener() {} })
  };
  const nodo = () => ({ id: '', dataset: {}, hidden: false, innerHTML: '', textContent: '', append() {}, setAttribute() {}, addEventListener() {}, querySelector: () => nodo(), classList: { toggle() {}, contains: () => false, remove() {} } });
  ventana.window = ventana; ventana.globalThis = ventana; ventana.self = ventana;
  ventana.document = { documentElement: nodo(), body: nodo(), createElement: nodo, addEventListener() {}, fullscreenElement: null };
  const ctx = vm.createContext(ventana);
  const html = fs.readFileSync(path.join(www, 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script defer src="([^"]+)"/g)].map(m => m[1]);
  for (const f of scripts.slice(0, scripts.indexOf('mobile/movil.js'))) vm.runInContext(fs.readFileSync(path.join(www, f), 'utf8'), ctx, { filename: f });
  return ventana;
}

(async () => {
  const root = await helpers.root(t);
  const datos = path.join(root, 'files'), bases = path.join(root, 'databases');
  fs.mkdirSync(datos, { recursive: true }); fs.mkdirSync(bases, { recursive: true });
  const portapapeles = [];
  const Clipboard = { write: async o => { if (!o || typeof o.string !== 'string') throw new Error('Clipboard.write exige {string}'); portapapeles.push(o.string); } };
  const sqlite = sqliteComoAndroid(bases);
  const plugins = { CapacitorSQLite: sqlite, Filesystem: helpers.filesystem(datos, { absoluteRoot: root }), Clipboard,
    App: { addListener: async () => ({ remove() {} }), exitApp: async () => {} },
    TextToSpeech: { getSupportedVoices: async () => ({ voices: [] }), speak: async () => {}, stop: async () => {} },
    Share: { share: async () => ({}) }, Browser: { open: async () => {} }, FilePicker: { pickFiles: async () => ({ files: [] }), copyFile: async () => {} },
    SystemBars: { setStyle: async () => {} } };
  const inicial = { version: 1, position: { book: 42, chapter: 3, verse: 1 }, notes: {}, highlights: {}, plans: [], devotionals: [], prayers: [], prayerDrafts: {}, guideResponses: {}, aiStudies: [], devResponses: {}, planNotes: {}, appearance: { design: 'a' }, font: 20 };

  // Primera sesión
  let ventana = cargarPagina(plugins);
  let puente = ventana.libraryDesktop;
  const t0 = Date.now();
  console.log('paso: bootstrap');
  const arranque = await puente.bootstrap({ initial: inicial, legacy: null, legacyValid: true });
  console.log('bootstrap OK en', Date.now() - t0, 'ms · preparación:', ventana.document.documentElement.dataset.preparacion);
  console.log('paso: savePersonal'); await puente.savePersonal({ ...arranque.state, notes: { '42:3:16': 'Nota de prueba del arranque' } });
  const caps = await puente.getCapabilities();
  console.log('storage:', caps.storage, '| catalog:', caps.operations.catalog.available, '| readPdf:', caps.operations.readPdf.available, '| transferScan:', caps.operations.transferScan.available, '| transferInstall:', caps.operations.transferInstall.available);
  console.log('paso: chapter'); const cap = await puente.chapter({ book: 42, chapter: 3 });
  console.log('Juan 3 versículos:', (cap.verses || cap.rows || []).length);
  const refs = await puente.connections({ book: 42, chapter: 3, verse: 16 });
  const comp = await puente.compare({ book: 42, chapter: 3, verse: 16, modules: ['rv1909', 'onbv2008'] });
  const filaOnbv = (comp.rows.find(r => r.verse === 16) || { cells: [] }).cells[1];
  console.log('referencias Juan 3:16:', refs.items.length, '| ONBV Juan 3:16:', !!(filaOnbv && filaOnbv.text));
  if (!refs.items.length || !(filaOnbv && filaOnbv.text)) throw new Error('Los recursos libres no se abren');
  await ventana.BibliaPreparacion.modulos;
  console.log('servicios nativos:', ventana.document.documentElement.dataset.serviciosNativos, ventana.document.documentElement.dataset.serviciosFallos || '');
  const textoCopia = 'Juan 3:16 · «Porque de tal manera amó Dios al mundo» ñ';
  await puente.aiTextCopy(textoCopia);
  console.log('portapapeles nativo exacto:', portapapeles[portapapeles.length - 1] === textoCopia);

  // Recarga de la página: el JS empieza de cero pero el lado nativo sigue con sus conexiones abiertas.
  console.log('paso: recarga (conexiones nativas vivas: ' + sqlite.conexionesVivas() + ')');
  ventana = cargarPagina(plugins);
  puente = ventana.libraryDesktop;
  const otra = await puente.bootstrap({ initial: inicial, legacy: null, legacyValid: true });
  console.log('tras recargar · preparación:', ventana.document.documentElement.dataset.preparacion, '· nota persistida en SQLite:', otra.state.notes['42:3:16']);
  if (otra.state.notes['42:3:16'] !== 'Nota de prueba del arranque') throw new Error('La nota no sobrevivió a la recarga');
  await ventana.BibliaPreparacion.modulos;
  await ventana.LibraryAndroidServices.close();
})().catch(e => { console.error('FALLÓ', e && (e.code || ''), e && e.message); process.exitCode = 1; })
  .finally(async () => { for (const fn of despues.reverse()) { try { await fn(); } catch { /* limpieza */ } } });
