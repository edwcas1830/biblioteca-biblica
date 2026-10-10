'use strict';
// Prueba del APK REAL en un emulador Android (GitHub Actions). Entra al WebView por el protocolo de
// depuración de Chrome (solo existe en el APK de depuración) y comprueba, con los plugins de verdad:
//   1. el arranque llega a «lista» (sin «fallo»);  2. storage sqlite;  3. Juan 3 = 36 versículos;
//   4. una nota se guarda y sigue tras recargar;   5. traspaso SINTÉTICO completo (revisar e instalar);
//   6. tras recargar: plan 1189/329, 2 devocionales y el módulo sintético legible.
// Toma capturas en cada paso y guarda la consola. Sale con error si algo falla.
// Uso: node probar-en-emulador.cjs <apk> <carpeta-traspaso-sintética> <carpeta-de-resultados>
const { execFileSync } = require('node:child_process');
const fs = require('node:fs'), path = require('node:path');
const [apk, traspaso, salida] = process.argv.slice(2);
const PKG = 'com.edward.bibliotecabiblica';
fs.mkdirSync(salida, { recursive: true });
console.log('prueba en emulador · apk:', apk, '· traspaso:', traspaso, '· resultados:', salida);
const adb = (...a) => execFileSync('adb', a, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const espera = ms => new Promise(r => setTimeout(r, ms));
const informe = [];
const anotar = (ok, paso, detalle = '') => { const l = `${ok ? 'OK ' : 'FALLÓ'} ${paso}${detalle ? ' · ' + detalle : ''}`; informe.push(l); console.log(l); if (!ok) throw new Error(paso + ': ' + detalle); };
const captura = nombre => { try { fs.writeFileSync(path.join(salida, nombre + '.png'), execFileSync('adb', ['exec-out', 'screencap', '-p'], { maxBuffer: 64 * 1024 * 1024 })); } catch { /* sin captura */ } };

async function conectar() {
  let pid = '';
  for (let i = 0; i < 60 && !pid; i++) { try { pid = adb('shell', 'pidof', PKG).trim(); } catch { /* aún no */ } if (!pid) await espera(1000); }
  if (!pid) throw new Error('La app no arrancó');
  let socket = '';
  for (let i = 0; i < 60 && !socket; i++) {
    const unix = adb('shell', 'cat', '/proc/net/unix');
    const m = unix.match(new RegExp('@(webview_devtools_remote_' + pid + ')'));
    if (m) socket = m[1]; else await espera(1000);
  }
  if (!socket) throw new Error('El WebView no expone depuración (¿APK de depuración?)');
  adb('forward', '--remove-all');
  adb('forward', 'tcp:9222', 'localabstract:' + socket);
  let pagina;
  for (let i = 0; i < 30 && !pagina; i++) {
    try { pagina = (await (await fetch('http://127.0.0.1:9222/json/list')).json()).find(p => p.type === 'page' && /localhost/.test(p.url)); } catch { /* aún no */ }
    if (!pagina) await espera(1000);
  }
  if (!pagina) throw new Error('No encontré la página de la app en el WebView');
  const ws = new WebSocket(pagina.webSocketDebuggerUrl);
  await new Promise((ok, mal) => { ws.onopen = ok; ws.onerror = mal; });
  let id = 0; const pendientes = new Map(); const consola = [];
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pendientes.has(m.id)) { pendientes.get(m.id)(m); pendientes.delete(m.id); }
    if (m.method === 'Runtime.consoleAPICalled') consola.push(m.params.type + ': ' + m.params.args.map(a => a.value ?? a.description ?? '').join(' '));
    if (m.method === 'Runtime.exceptionThrown') consola.push('EXCEPCIÓN: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  };
  const enviar = (method, params = {}) => new Promise(r => { const n = ++id; pendientes.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
  await enviar('Runtime.enable');
  const evaluar = async (expr, timeout = 120000) => {
    const r = await Promise.race([enviar('Runtime.evaluate', { expression: `(async()=>{${expr}})()`, awaitPromise: true, returnByValue: true }), espera(timeout).then(() => ({ timeout: true }))]);
    if (r.timeout) throw new Error('Tiempo agotado evaluando en la app');
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
    return r.result?.result?.value;
  };
  return { evaluar, enviar, consola, cerrar: () => ws.close() };
}

// Espera «lista» consultando cada 2 s. Si la página se recarga o se reemplaza (al arrancar, Android puede
// cargarla dos veces), la sesión de depuración vieja deja de responder: se reconecta a la página actual.
async function esperarLista(app, etiqueta) {
  const limite = Date.now() + 150000; let reconexiones = 0, r = null;
  while (Date.now() < limite) {
    try {
      r = await app.evaluar("const e=document.documentElement.dataset.preparacion;return {estado:e||'',texto:document.querySelector('#preparacion-biblioteca .preparacion-texto')?.textContent||'',url:location.href};", 5000);
      if (r && (r.estado === 'lista' || r.estado === 'fallo')) break;
    } catch {
      try { app.cerrar(); } catch { /* ya cerrada */ }
      reconexiones++;
      try { app = await conectar(); } catch { /* reintenta */ }
    }
    await espera(2000);
  }
  captura(etiqueta);
  const estado = r ? r.estado : 'sin respuesta';
  anotar(estado === 'lista', 'arranque ' + etiqueta, (estado === 'lista' ? '' : estado + ' — ' + (r ? r.texto : '')) + (reconexiones ? ' (reconexiones: ' + reconexiones + ')' : ''));
  return app;
}

(async () => {
  adb('install', '-r', apk);
  adb('shell', 'am', 'start', '-n', PKG + '/.MainActivity');
  let app = await conectar();
  app = await esperarLista(app, '1-primer-arranque');
  const caps = await app.evaluar(`const c=await window.libraryDesktop.getCapabilities();return {storage:c.storage,plataforma:c.platform,faltan:['bootstrap','savePersonal','catalog','chapter','transferScan','transferInstall','voiceOptions','shareText','aiStatus'].filter(n=>!c.operations[n]?.available)};`);
  anotar(caps.plataforma === 'android' && caps.storage === 'sqlite', 'base nativa', JSON.stringify(caps));
  anotar(caps.faltan.length === 0, 'operaciones disponibles', caps.faltan.join(', ') || 'todas');
  const cap = await app.evaluar(`const c=await window.libraryDesktop.chapter({book:42,chapter:3});return c.verses.length;`);
  anotar(cap === 36, 'Juan 3 RV1909', cap + ' versículos');
  const libres = await app.evaluar(`const r=await window.libraryDesktop.connections({book:42,chapter:3,verse:16});const c=await window.libraryDesktop.compare({book:42,chapter:3,verse:16,modules:['rv1909','onbv2008']});const f=(c.rows.find(x=>x.verse===16)||{cells:[]}).cells[1];return {refs:r.items.length,onbv:!!(f&&f.text)};`);
  anotar(libres.refs > 0 && libres.onbv, 'recursos libres (referencias y ONBV)', JSON.stringify(libres));
  const voces = await app.evaluar(`try{const v=await window.libraryDesktop.voiceOptions();return 'voces en español: '+v.length;}catch(e){return 'voz: '+e.message;}`);
  anotar(true, 'voz del teléfono (informativo)', voces);
  // 4. Nota que sobrevive a la recarga
  const guardado = await app.evaluar(`const b=await window.libraryDesktop.bootstrap({initial:{version:1,position:{book:42,chapter:3,verse:16},notes:{},highlights:{},plans:[],devotionals:[],prayers:[],prayerDrafts:{},guideResponses:{},aiStudies:[],devResponses:{},planNotes:{},appearance:{design:'a'},font:20},legacy:null,legacyValid:true});const s={...b.state,notes:{...b.state.notes,'42:3:16':'Nota de prueba en el emulador'}};await window.libraryDesktop.savePersonal(s);return 'ok';`);
  anotar(guardado === 'ok', 'guardar nota');
  await app.enviar('Page.reload', { ignoreCache: true });
  await espera(3000);
  app = await esperarLista(app, '2-tras-recargar');
  const nota = await app.evaluar(`const b=await window.libraryDesktop.bootstrap({initial:{version:1,position:{book:42,chapter:3,verse:16},notes:{},highlights:{},plans:[],devotionals:[],prayers:[],prayerDrafts:{},guideResponses:{},aiStudies:[],devResponses:{},planNotes:{},appearance:{design:'a'},font:20},legacy:null,legacyValid:true});return b.state.notes['42:3:16']||'';`);
  anotar(nota === 'Nota de prueba en el emulador', 'nota persistida tras recargar', nota);
  // 5. Traspaso sintético: se colocan los archivos donde los deja el selector (files/traspaso-entrante)
  const archivos = fs.readdirSync(traspaso);
  adb('shell', 'run-as', PKG, 'mkdir', '-p', 'files/traspaso-entrante');
  for (const a of archivos) {
    // adb une los argumentos en UNA línea para el shell del teléfono: la redirección debe ir entre
    // comillas dentro de «sh -c» para que la ejecute run-as (con permiso sobre files/) y no el shell.
    execFileSync('adb', ['exec-in', `run-as ${PKG} sh -c 'cat > files/traspaso-entrante/${a}'`], { input: fs.readFileSync(path.join(traspaso, a)), maxBuffer: 64 * 1024 * 1024 });
  }
  const copiados = adb('shell', 'run-as', PKG, 'ls', '-l', 'files/traspaso-entrante');
  anotar(archivos.every(a => copiados.includes(a)), 'archivos de traspaso en la memoria de la app', archivos.length + ' archivos');
  const seleccion = { carpeta: 'traspaso-entrante', archivos: archivos.map(nombre => ({ nombre, ruta: 'traspaso-entrante/' + nombre, bytes: fs.statSync(path.join(traspaso, nombre)).size })) };
  const rev = await app.evaluar(`const r=await window.libraryDesktop.transferScan(${JSON.stringify(seleccion)});window.__rev=r;return r.resumen;`, 300000);
  anotar(rev && rev.conteos && rev.conteos.diasCompletados === 329 && rev.modulos.length === 1, 'revisión del traspaso', JSON.stringify(rev && rev.conteos));
  const inst = await app.evaluar(`const r=await window.libraryDesktop.transferInstall({token:window.__rev.token,confirmado:true});return r.instalado===true&&r.requiereRecarga===true;`, 300000);
  anotar(inst === true, 'instalación del traspaso');
  await app.enviar('Page.reload', { ignoreCache: true });
  await espera(3000);
  app = await esperarLista(app, '3-tras-traspaso');
  const fin = await app.evaluar(`await (window.BibliaPreparacion?.modulos||Promise.resolve());const b=await window.libraryDesktop.bootstrap({initial:{version:1,position:{book:18,chapter:23,verse:1},notes:{},highlights:{},plans:[],devotionals:[],prayers:[],prayerDrafts:{},guideResponses:{},aiStudies:[],devResponses:{},planNotes:{},appearance:{design:'a'},font:20},legacy:null,legacyValid:true});const p=b.state.plans[0]||{};const cat=await window.libraryDesktop.catalog();let verso='';try{const c=await window.libraryDesktop.chapter({book:18,chapter:23,module:'texto-sintetico'});verso=(c.verses[0]||{}).text||'';}catch(e){verso='ERROR '+e.message;}return {dias:(p.entries||[]).length||p.days,hechos:(p.completed||[]).length,devocionales:b.state.devotionals.length,nota:b.state.notes['18:23:1']||'',modulo:cat.modules.some(m=>m.id==='texto-sintetico'),verso};`, 300000);
  anotar(fin.dias === 1189 && fin.hechos === 329 && fin.devocionales === 2, 'datos traídos de la PC', JSON.stringify({ dias: fin.dias, hechos: fin.hechos, devocionales: fin.devocionales }));
  anotar(fin.modulo && /Texto inventado/.test(fin.verso), 'módulo e-Sword traído y legible', fin.verso.slice(0, 60));
  // Interfaz: navegación y hoja visibles en el teléfono
  const ui = await app.evaluar(`return {telefono:document.documentElement.dataset.telefono,nav:!!document.querySelector('#movil-nav'),hoja:!!document.querySelector('#movil-hoja-cabecera'),versiculos:document.querySelectorAll('#verses .verse').length};`);
  captura('4-interfaz');
  anotar(ui.nav && ui.hoja && ui.versiculos > 0, 'interfaz de teléfono', JSON.stringify(ui));
  fs.writeFileSync(path.join(salida, 'consola.txt'), app.consola.join('\n'));
  app.cerrar();
})().catch(e => {
  informe.push('ERROR: ' + e.message);
  console.error('ERROR:', e.message);
  captura('error');
  process.exitCode = 1;
}).finally(() => {
  fs.writeFileSync(path.join(salida, 'informe.txt'), informe.join('\n') + '\n');
  try { fs.writeFileSync(path.join(salida, 'logcat.txt'), adb('logcat', '-d', '-v', 'brief', 'Capacitor:V', 'Capacitor/Console:V', 'chromium:V', 'AndroidRuntime:E', '*:S')); } catch { /* sin logcat */ }
  // Salir siempre: un WebSocket o temporizador abierto no debe dejar colgado al emulador.
  process.exit(process.exitCode || 0);
});
