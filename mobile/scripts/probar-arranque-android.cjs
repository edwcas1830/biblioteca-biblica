'use strict';
// Uso: node mobile/scripts/build-www.cjs && node mobile/scripts/probar-arranque-android.cjs [repo] [paquete.bbt]
// Con el paquete (fixture-traspaso.cjs + empaquetar-traspaso.cjs) también lo desempaca, revisa e instala
// el traspaso y comprueba lo traído. El desempacado imita a TraspasoPaquetePlugin.java.
// Simula el arranque Android con los MISMOS scripts y el mismo orden que mobile/www/index.html,
// con los dobles de plugins de Codex (SQLite real en carpeta temporal) y un puente nativo como el del
// teléfono. Imita lo que el emulador descubrió de Android de verdad:
//   · SQLCipher crea sola la tabla android_metadata al abrir una base escribible;
//   · execute() solo separa sentencias por «;» + salto de línea y ejecuta una por trozo;
//   · el lado nativo CONSERVA las conexiones al recargar la página (createConnection: «already exists»).
// Datos inventados.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const repo = process.argv[2] || path.resolve(__dirname, '..', '..');
const paqueteTraspaso = process.argv[3] || '';
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

// Doble de TraspasoPaquetePlugin.java: mismas reglas (tar ustar, nombres planos, sin duplicados, completo).
function paqueteComoAndroid(datos) {
  const oyentes = [];
  const NOMBRE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
  return {
    addListener: (o, cb) => { if (o && o.eventName === 'progreso') oyentes.push(cb); return 'oyente'; },
    removeListener: async () => { oyentes.length = 0; },
    desempacar: async ({ desde, bytes = 0 }) => {
      const b = fs.readFileSync(desde.replace(/^file:\/\//, ''));
      const destino = path.join(datos, 'traspaso-entrante');
      fs.rmSync(destino, { recursive: true, force: true }); fs.mkdirSync(destino, { recursive: true });
      const falla = m => { fs.rmSync(destino, { recursive: true, force: true }); throw Object.assign(new Error(m), { code: 'CORRUPT' }); };
      const archivos = [], vistos = new Set(); let i = 0, fin = false;
      while (i + 512 <= b.length) {
        const h = b.subarray(i, i + 512); i += 512;
        if (h.every(x => x === 0)) { fin = true; break; }
        const texto = (d, l) => h.subarray(d, d + l).toString('ascii').replace(/\0.*$/s, '').trim();
        if (texto(257, 5) !== 'ustar') falla('El archivo elegido no es un paquete de traspaso.');
        let suma = 0; for (let k = 0; k < 512; k++) suma += k >= 148 && k < 156 ? 32 : h[k];
        if (parseInt(texto(148, 8), 8) !== suma) falla('El paquete del traspaso está dañado (cabecera).');
        const nombre = texto(0, 100), tam = parseInt(texto(124, 12), 8);
        if (!NOMBRE.test(nombre) || nombre.includes('..') || vistos.has(nombre.toLowerCase())) falla('Nombre no permitido en el paquete: «' + nombre + '».');
        vistos.add(nombre.toLowerCase());
        if (i + tam > b.length) falla('El paquete del traspaso está incompleto (¿terminó de descargarse?).');
        fs.writeFileSync(path.join(destino, nombre), b.subarray(i, i + tam));
        i += tam + (512 - (tam % 512)) % 512;
        for (const cb of oyentes) cb({ archivo: nombre, copiados: i, total: bytes || b.length });
        archivos.push({ nombre, ruta: 'traspaso-entrante/' + nombre, bytes: tam });
      }
      if (!fin || !archivos.length) falla('El paquete del traspaso está incompleto (¿terminó de descargarse?).');
      return { carpeta: 'traspaso-entrante', archivos };
    }
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
    SystemBars: { setStyle: async () => {} }, TraspasoPaquete: paqueteComoAndroid(datos) };
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
  if (process.env.LISTAR_OPS) console.log('NO DISPONIBLES:', Object.entries(caps.operations).filter(([, o]) => !o.available).map(([n, o]) => n + (o.reason ? '(' + o.reason + ')' : '')).join(' | '));
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

  if (paqueteTraspaso) {
    // Como en el teléfono: un solo archivo .bbt elegido → desempacado nativo → selección para el puente.
    const bytes = fs.statSync(paqueteTraspaso).size;
    let avisos = 0;
    const seleccion = await ventana.BibliaPlataforma.desempacarPaquete({ desde: paqueteTraspaso, bytes, alProgreso: () => { avisos++; } });
    const archivos = seleccion.archivos.map(a => a.nombre);
    console.log('paquete desempacado:', archivos.length, 'archivos · avisos de progreso:', avisos);
    if (!archivos.includes('traspaso.json') || avisos < 2) throw new Error('El paquete no se desempacó bien');
    // Un paquete cortado se rechaza con mensaje claro.
    const cortado = paqueteTraspaso + '.cortado.bbt';
    fs.writeFileSync(cortado, fs.readFileSync(paqueteTraspaso).subarray(0, Math.floor(bytes / 2)));
    let rechazo = 'aceptado';
    try { await ventana.BibliaPlataforma.desempacarPaquete({ desde: cortado }); } catch (e) { rechazo = e.message; }
    fs.rmSync(cortado, { force: true });
    console.log('paquete cortado:', rechazo);
    if (!/incompleto/.test(rechazo)) throw new Error('Un paquete cortado no se rechazó');
    await ventana.BibliaPlataforma.desempacarPaquete({ desde: paqueteTraspaso, bytes });
    console.log('paso: transferScan (' + seleccion.archivos.length + ' archivos)');
    const rev = await puente.transferScan(seleccion);
    console.log('revisión:', JSON.stringify(rev.resumen && rev.resumen.conteos), '· módulos:', rev.resumen && rev.resumen.modulos.length);
    if (!process.env.PAQUETE_REAL && (!rev.resumen || rev.resumen.conteos.diasCompletados !== 329 || rev.resumen.modulos.length !== 1)) throw new Error('La revisión del traspaso no cuadra');
    console.log('paso: transferInstall');
    const inst = await puente.transferInstall({ token: rev.token, confirmado: true });
    if (!(inst.instalado === true && inst.requiereRecarga === true)) throw new Error('El traspaso no se instaló: ' + JSON.stringify(inst));
    ventana = cargarPagina(plugins);
    puente = ventana.libraryDesktop;
    const tModulos = Date.now();
    await ventana.BibliaPreparacion.modulos;
    console.log('módulos listos tras recargar en', Date.now() - tModulos, 'ms · estado:', ventana.document.documentElement.dataset.serviciosNativos, ventana.document.documentElement.dataset.serviciosFallos || '');
    const tras = await puente.bootstrap({ initial: { ...inicial, position: { book: 18, chapter: 23, verse: 1 } }, legacy: null, legacyValid: true });
    if (process.env.PAQUETE_REAL) {
      // Paquete real (solo en la PC de Edward): imprime conteos, nunca contenido.
      const p0 = tras.state.plans[0] || {}, cat = await puente.catalog();
      console.log('REAL tras recargar · plan:', (p0.entries || []).length + '/' + (p0.completed || []).length, '· devocionales:', tras.state.devotionals.length, '· notas:', Object.keys(tras.state.notes || {}).length, '· módulos en catálogo:', cat.modules.length, '· preparación:', ventana.document.documentElement.dataset.preparacion, '· fallos:', ventana.document.documentElement.dataset.serviciosFallos || 'ninguno');
      // Lo mismo que hace la pantalla (app.js validateState) con cada plan: si falla, la app queda vacía.
      const planCore = require(path.join(repo, 'app', 'plan-core.js'));
      for (const pl of tras.state.plans) {
        try { if (pl.scope === 'custom') planCore.validateCustomPlan(pl, ventana.BIBLE.books); console.log('REAL plan', pl.scope, 'acepta la pantalla: sí'); }
        catch (e) { const d0 = pl.entries && pl.entries[0]; console.log('REAL plan', pl.scope, 'RECHAZADO por la pantalla:', e.message, '· campos del día 1:', d0 ? Object.keys(d0).join(',') : '-', '· tipos:', d0 ? Object.entries(d0).map(([k, v]) => k + ':' + (Array.isArray(v) ? 'lista' : typeof v)).join(',') : '-'); }
      }
      const pantalla = require(path.join(__dirname, 'validar-como-pantalla.cjs'))(ventana, www, tras.state);
      console.log('REAL la pantalla acepta lo traído:', pantalla.acepta ? 'sí' : 'NO · ' + pantalla.motivo);
      // Segunda apertura normal (sin traspaso): ¿se vuelve a esperar lo mismo?
      await ventana.LibraryAndroidServices.close();
      ventana = cargarPagina(plugins); const t2 = Date.now(); await ventana.BibliaPreparacion.modulos;
      console.log('REAL segunda apertura: módulos listos en', Date.now() - t2, 'ms');
      await ventana.LibraryAndroidServices.close(); return;
    }
    const plan = tras.state.plans[0] || {};
    const cat = await puente.catalog();
    const c = await puente.chapter({ book: 18, chapter: 23, module: 'texto-sintetico' });
    const verso = (c.verses[0] || {}).text || '';
    console.log('tras el traspaso · plan:', (plan.entries || []).length + '/' + (plan.completed || []).length, '· devocionales:', tras.state.devotionals.length, '· nota:', !!tras.state.notes['18:23:1'], '· módulo:', cat.modules.some(m => m.id === 'texto-sintetico'), '· verso:', verso.slice(0, 40));
    const pantallaSint = require(path.join(__dirname, 'validar-como-pantalla.cjs'))(ventana, www, tras.state);
    console.log('la pantalla acepta lo traído:', pantallaSint.acepta ? 'sí' : 'NO · ' + pantallaSint.motivo);
    if (!pantallaSint.acepta) throw new Error('La pantalla rechaza lo traído: ' + pantallaSint.motivo);
    if ((plan.entries || []).length !== 1189 || (plan.completed || []).length !== 329 || tras.state.devotionals.length !== 2 || !/Texto inventado/.test(verso)) throw new Error('Los datos traídos no cuadran');
  }
  await ventana.LibraryAndroidServices.close();
})().catch(e => { console.error('FALLÓ', e && (e.code || ''), e && e.message); process.exitCode = 1; })
  .finally(async () => { for (const fn of despues.reverse()) { try { await fn(); } catch { /* limpieza */ } } });
