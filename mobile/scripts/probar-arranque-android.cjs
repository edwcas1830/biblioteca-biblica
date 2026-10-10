'use strict';
// Uso: node mobile/scripts/build-www.cjs && node mobile/scripts/probar-arranque-android.cjs
// Simula el arranque Android con los MISMOS scripts y el mismo orden que mobile/www/index.html,
// y con los dobles de plugins de Codex (SQLite real en carpeta temporal). Datos inventados.
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
(async () => {
  const root = await helpers.root(t);
  // Diseño de Android: DATA/files y databases/ separados (igual que las pruebas de Codex).
  const datos = path.join(root, 'files'), bases = path.join(root, 'databases');
  fs.mkdirSync(datos, { recursive: true }); fs.mkdirSync(bases, { recursive: true });
  const portapapeles = [];
  const Clipboard = { write: async o => { if (!o || typeof o.string !== 'string') throw new Error('Clipboard.write exige {string}'); portapapeles.push(o.string); } };
  // Como Android/SQLCipher de verdad: al abrir una base escribible se crea sola la tabla android_metadata.
  const sqliteBase = helpers.sqlite(bases);
  const sqliteAndroid = { ...sqliteBase, open: async o => { await sqliteBase.open(o); if (!o.readonly) await sqliteBase.execute({ database: o.database, statements: "CREATE TABLE IF NOT EXISTS android_metadata (locale TEXT); INSERT INTO android_metadata SELECT 'es_US' WHERE NOT EXISTS (SELECT 1 FROM android_metadata);" }); } };
  const plugins = { CapacitorSQLite: sqliteAndroid, Filesystem: helpers.filesystem(datos, { absoluteRoot: root }), Clipboard,
    App: { addListener: async () => ({ remove() {} }), exitApp: async () => {} },
    TextToSpeech: { getSupportedVoices: async () => ({ voices: [] }), speak: async () => {}, stop: async () => {} },
    Share: { share: async () => ({}) }, Browser: { open: async () => {} }, FilePicker: { pickFiles: async () => ({ files: [] }), copyFile: async () => {} },
    SystemBars: { setStyle: async () => {} } };
  const eventos = [];
  const ventana = {
    // Puente nativo de Android simulado: lo que el teléfono inyecta ANTES de los scripts de la página.
    androidBridge: { postMessage() {} },
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
  const hasta = scripts.indexOf('mobile/movil.js');
  for (const f of scripts.slice(0, hasta)) vm.runInContext(fs.readFileSync(path.join(www, f), 'utf8'), ctx, { filename: f });
  const puente = ventana.libraryDesktop;
  const t0 = Date.now();
  const inicial = { version: 1, position: { book: 42, chapter: 3, verse: 1 }, notes: {}, highlights: {}, plans: [], devotionals: [], prayers: [], prayerDrafts: {}, guideResponses: {}, aiStudies: [], devResponses: {}, planNotes: {}, appearance: { design: 'a' }, font: 20 };
  console.log('paso: bootstrap');
  const arranque = await puente.bootstrap({ initial: inicial, legacy: null, legacyValid: true });
  console.log('bootstrap OK en', Date.now() - t0, 'ms · preparación:', ventana.document.documentElement.dataset.preparacion);
  const estado = { ...arranque.state, notes: { '42:3:16': 'Nota de prueba del arranque' } };
  console.log('paso: savePersonal'); await puente.savePersonal(estado);
  const caps = await puente.getCapabilities();
  console.log('storage:', caps.storage, '| catalog:', caps.operations.catalog.available, '| readPdf:', caps.operations.readPdf.available, '| transferScan:', caps.operations.transferScan.available, '| transferInstall:', caps.operations.transferInstall.available);
  console.log('paso: chapter'); const cap = await puente.chapter({ book: 42, chapter: 3 });
  console.log('Juan 3 versículos:', (cap.verses || cap.rows || []).length);
  const otra = await puente.bootstrap({ initial: inicial, legacy: null, legacyValid: true });
  console.log('nota persistida en SQLite:', otra.state.notes['42:3:16']);
  await ventana.BibliaPreparacion.modulos;
  console.log('servicios nativos:', ventana.document.documentElement.dataset.serviciosNativos, ventana.document.documentElement.dataset.serviciosFallos || '');
  // Portapapeles: el contrato entrega una cadena y debe llegar exacta al plugin nativo.
  const textoCopia = 'Juan 3:16 · «Porque de tal manera amó Dios al mundo» ñ';
  await puente.aiTextCopy(textoCopia);
  console.log('portapapeles nativo exacto:', portapapeles[portapapeles.length - 1] === textoCopia);
  await ventana.LibraryAndroidServices.close();
})().catch(e => { console.error('FALLÓ', e && (e.code || ''), e && e.message); process.exitCode = 1; })
  .finally(async () => { for (const fn of despues.reverse()) await fn(); });
