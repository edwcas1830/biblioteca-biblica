'use strict';
// Prueba del APK REAL en un emulador Android (GitHub Actions). Entra al WebView por el protocolo de
// depuración de Chrome (solo existe en el APK de depuración) y comprueba, con los plugins de verdad:
//   1. el arranque llega a «lista» (sin «fallo»);  2. storage sqlite;  3. Juan 3 = 36 versículos;
//   4. una nota se guarda y sigue tras recargar;   5. traspaso SINTÉTICO completo (revisar e instalar);
//   6. tras recargar: plan 1189/329, 2 devocionales y el módulo sintético legible.
// Toma capturas en cada paso y guarda la consola. Sale con error si algo falla.
// Uso: node probar-en-emulador.cjs <apk> <carpeta-traspaso-sintética> <carpeta-de-resultados> <paquete.bbt>
const { execFileSync } = require('node:child_process');
const fs = require('node:fs'), path = require('node:path');
const [apk, traspaso, salida, paquete] = process.argv.slice(2);
const PKG = 'com.edward.bibliotecabiblica';
fs.mkdirSync(salida, { recursive: true });
console.log('prueba en emulador · apk:', apk, '· traspaso:', traspaso, '· resultados:', salida);
const adb = (...a) => execFileSync('adb', a, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const espera = ms => new Promise(r => setTimeout(r, ms));
const informe = [];
// Mantiene vivo el proceso mientras dura la prueba y deja constancia si Node termina sin pasar por el final.
const vigilia = setInterval(() => {}, 30000);
let terminada = false;
process.on('exit', codigo => { if (!terminada) { try { fs.writeFileSync(path.join(salida, 'informe.txt'), informe.concat('ERROR: la prueba terminó sin llegar al final (código ' + codigo + ')').join('\n') + '\n'); } catch { /* sin disco */ } } });
const anotar = (ok, paso, detalle = '') => { const l = `${ok ? 'OK ' : 'FALLÓ'} ${paso}${detalle ? ' · ' + detalle : ''}`; informe.push(l); console.log(l); if (!ok) throw new Error(paso + ': ' + detalle); };
const captura = nombre => { try { fs.writeFileSync(path.join(salida, nombre + '.png'), execFileSync('adb', ['exec-out', 'screencap', '-p'], { maxBuffer: 64 * 1024 * 1024 })); } catch { /* sin captura */ } };

// adb exec-in vuelve antes de que el teléfono termine de escribir: se espera a que el archivo tenga su tamaño.
async function subirACache(nombre, datos) {
  execFileSync('adb', ['exec-in', `run-as ${PKG} sh -c 'cat > cache/${nombre}'`], { input: datos, maxBuffer: 64 * 1024 * 1024 });
  for (let i = 0; i < 60; i++) {
    let tam = -1;
    try { tam = Number(adb('shell', 'run-as', PKG, 'stat', '-c', '%s', 'cache/' + nombre).trim()); } catch { /* aún no existe */ }
    if (tam === datos.length) return;
    await espera(500);
  }
  throw new Error(`No se pudo dejar ${nombre} en la caché de la app`);
}

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
    try {
      // El WebView puede tener más de una página (Android a veces carga la app dos veces): se usa la
      // visible y, si ninguna lo dice, la más reciente.
      const paginas = (await (await fetch('http://127.0.0.1:9222/json/list')).json()).filter(p => p.type === 'page' && /localhost/.test(p.url));
      const visible = p => { try { const d = JSON.parse(p.description || '{}'); return d.visible === true && d.attached !== false; } catch { return false; } };
      pagina = paginas.find(visible) || paginas[paginas.length - 1];
      if (pagina) console.log('  (páginas en el WebView: ' + paginas.length + ', uso ' + (visible(pagina) ? 'la visible' : 'la última') + ')');
    } catch { /* aún no */ }
    if (!pagina) await espera(1000);
  }
  if (!pagina) throw new Error('No encontré la página de la app en el WebView');
  const ws = new WebSocket(pagina.webSocketDebuggerUrl);
  // Sin límite, un WebSocket que nunca abre ni falla dejaba a Node sin tareas y salía «bien» sin informe.
  await new Promise((ok, mal) => { const tope = setTimeout(() => mal(new Error('El WebView no abrió la depuración a tiempo')), 15000); ws.onopen = () => { clearTimeout(tope); ok(); }; ws.onerror = e => { clearTimeout(tope); mal(e); }; ws.onclose = () => { clearTimeout(tope); mal(new Error('El WebView cerró la depuración')); }; });
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
  const limite = Date.now() + 150000; let reconexiones = 0, sinCambio = 0, r = null;
  while (Date.now() < limite) {
    try {
      r = await app.evaluar("const e=document.documentElement.dataset.preparacion;return {estado:e||'',texto:document.querySelector('#preparacion-biblioteca .preparacion-texto')?.textContent||'',url:location.href};", 5000);
      if (r && (r.estado === 'lista' || r.estado === 'fallo')) break;
      // Si el estado no avanza, puede que esta sesión mire una copia vieja de la página: reconectar.
      if (++sinCambio % 5 === 0) throw new Error('reconectar');
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
  // 5. Traspaso sintético en UN archivo, por el mismo camino que OneDrive: una URI content:// que la app
  //    lee con su ContentResolver. El paquete se deja en la caché de la app y se entrega por su FileProvider.
  if (!paquete) throw new Error('Falta el paquete .bbt sintético');
  const bytesPaquete = fs.statSync(paquete).size;
  await subirACache('prueba.bbt', fs.readFileSync(paquete));
  const uriPaquete = `content://${PKG}.fileprovider/my_cache_images/prueba.bbt`;
  // 5a. Lo que falló en el teléfono de Edward: FilePicker.copyFile hacia la carpeta de llegada.
  const copia = await app.evaluar(`const fp=window.Capacitor.registerPlugin('FilePicker');const fsys=window.Capacitor.registerPlugin('Filesystem');try{await fsys.rmdir({directory:'DATA',path:'traspaso-entrante',recursive:true});}catch{}await fsys.mkdir({directory:'DATA',path:'traspaso-entrante',recursive:true});const {uri}=await fsys.getUri({directory:'DATA',path:'traspaso-entrante'});try{await fp.copyFile({from:${JSON.stringify(uriPaquete)},to:uri.replace('file://','')+'/copia.bin',overwrite:true});const s=await fsys.stat({directory:'DATA',path:'traspaso-entrante/copia.bin'});return 'ok '+s.size;}catch(e){return 'ERROR '+e.message;}`);
  anotar(copia === 'ok ' + bytesPaquete, 'copiar archivo elegido a la app (selector de archivos)', copia);
  // 5b. Paquete único → desempacado nativo (TraspasoPaquetePlugin) con avisos de progreso.
  const seleccion = await app.evaluar(`let avisos=0;const r=await window.BibliaPlataforma.desempacarPaquete({desde:${JSON.stringify(uriPaquete)},bytes:${bytesPaquete},alProgreso:()=>{avisos++;}});return {...r,avisos};`, 300000);
  const esperados = fs.readdirSync(traspaso).sort();
  anotar(JSON.stringify(seleccion.archivos.map(a => a.nombre).sort()) === JSON.stringify(esperados) && seleccion.avisos > 0, 'desempacar el paquete único (.bbt)', seleccion.archivos.length + ' archivos · avisos de progreso: ' + seleccion.avisos);
  // 5c. Un paquete cortado (descarga incompleta) se rechaza con un mensaje claro y sin dejar restos.
  const cortado = fs.readFileSync(paquete).subarray(0, Math.floor(bytesPaquete / 2));
  await subirACache('cortado.bbt', cortado);
  const enCache = adb('shell', 'run-as', PKG, 'ls', '-l', 'cache');
  console.log('  (caché de la app: ' + enCache.split(/\r?\n/).filter(l => /\.bbt/.test(l)).map(l => l.trim()).join(' | ') + ')');
  const rechazo = await app.evaluar(`try{await window.BibliaPlataforma.desempacarPaquete({desde:'content://${PKG}.fileprovider/my_cache_images/cortado.bbt'});return 'aceptado';}catch(e){return e.message;}`, 120000);
  anotar(/incompleto/.test(rechazo), 'paquete incompleto rechazado', rechazo);
  // 6. Traspaso por la PANTALLA, como lo hace Edward, con toda la app funcionando:
  //    Más › Traer desde la PC › Elegir el archivo › Instalar en este teléfono › (recarga sola) › «Tu biblioteca llegó».
  //    Solo el selector de Android (ventana del sistema) se reemplaza por el paquete de prueba.
  await app.evaluar(`window.BibliaPlataforma.elegirArchivosTraspaso=o=>window.BibliaPlataforma.desempacarPaquete({desde:${JSON.stringify(uriPaquete)},bytes:${bytesPaquete},alProgreso:o&&o.alProgreso});document.querySelector('#movil-nav [data-destino="mas"]').click();await new Promise(r=>setTimeout(r,500));document.querySelector('#movil-traer-pc').click();return true;`);
  const tocar = async (texto, limite = 300000) => {
    const fin = Date.now() + limite;
    while (Date.now() < fin) {
      const r = await app.evaluar(`const d=document.querySelector('#movil-traspaso');const b=[...d.querySelectorAll('button')].find(x=>x.textContent.trim()===${JSON.stringify(texto)});if(b){b.click();return {ok:true};}return {titulo:d.querySelector('h3')?.textContent||'',texto:[...d.querySelectorAll('p')].map(p=>p.textContent).join(' · ')};`);
      if (r.ok) return;
      if (r.titulo === 'No se pudo traer') throw new Error('La pantalla dice «No se pudo traer»: ' + r.texto);
      await espera(1000);
    }
    throw new Error('No apareció el botón «' + texto + '»');
  };
  await tocar('Elegir el archivo');
  await tocar('Instalar en este teléfono');
  const resumenPantalla = await app.evaluar(`return document.querySelector('#movil-traspaso h3')?.textContent||'';`).catch(() => 'recargando');
  anotar(true, 'revisión e instalación desde la pantalla', resumenPantalla);
  await espera(5000); // la app se recarga sola a los 2,5 s
  app = await esperarLista(app, '3-tras-traspaso');
  let confirmacion = null;
  for (let i = 0; i < 90; i++) {
    try {
      confirmacion = await app.evaluar(`return {conf:document.documentElement.dataset.traspasoConfirmado||'',lista:typeof storageReady!=='undefined'&&storageReady,hechos:(state.plans[0]?.completed||[]).length,dias:state.plans[0]?.days||0,devocionales:state.devotionals.length,titulo:document.querySelector('#movil-traspaso[open] h3')?.textContent||'',texto:[...document.querySelectorAll('#movil-traspaso[open] p')].map(p=>p.textContent).join(' · ')};`, 5000);
      if (confirmacion.conf) break;
    } catch { /* recargando */ }
    await espera(1000);
  }
  captura('3b-confirmacion');
  anotar(confirmacion && confirmacion.conf === 'si' && confirmacion.lista && confirmacion.hechos === 329 && confirmacion.dias === 1189 && confirmacion.devocionales === 2 && /Módulos en tu biblioteca: 5\./.test(confirmacion.texto) && !/Aviso de los módulos/.test(confirmacion.texto), 'la app muestra lo traído («Tu biblioteca llegó»)', JSON.stringify(confirmacion));
  await app.evaluar(`[...document.querySelectorAll('#movil-traspaso button')].find(x=>x.textContent.trim()==='Empezar a leer')?.click();return true;`);
  const fin = await app.evaluar(`await (window.BibliaPreparacion?.modulos||Promise.resolve());const b=await window.libraryDesktop.bootstrap({initial:{version:1,position:{book:18,chapter:23,verse:1},notes:{},highlights:{},plans:[],devotionals:[],prayers:[],prayerDrafts:{},guideResponses:{},aiStudies:[],devResponses:{},planNotes:{},appearance:{design:'a'},font:20},legacy:null,legacyValid:true});const p=b.state.plans[0]||{};const cat=await window.libraryDesktop.catalog();let verso='';try{const c=await window.libraryDesktop.chapter({book:18,chapter:23,module:'texto-sintetico'});verso=(c.verses[0]||{}).text||'';}catch(e){verso='ERROR '+e.message;}return {dias:(p.entries||[]).length||p.days,hechos:(p.completed||[]).length,devocionales:b.state.devotionals.length,nota:b.state.notes['18:23:1']||'',modulo:cat.modules.some(m=>m.id==='texto-sintetico'),verso};`, 300000);
  anotar(fin.dias === 1189 && fin.hechos === 329 && fin.devocionales === 2, 'datos traídos de la PC', JSON.stringify({ dias: fin.dias, hechos: fin.hechos, devocionales: fin.devocionales }));
  anotar(fin.modulo && /Texto inventado/.test(fin.verso), 'módulo e-Sword traído y legible', fin.verso.slice(0, 60));
  // Interfaz: navegación y hoja visibles en el teléfono
  const ui = await app.evaluar(`return {telefono:document.documentElement.dataset.telefono,nav:!!document.querySelector('#movil-nav'),hoja:!!document.querySelector('#movil-hoja-cabecera'),versiculos:document.querySelectorAll('#verses .verse').length};`);
  captura('4-interfaz');
  anotar(ui.nav && ui.hoja && ui.versiculos > 0, 'interfaz de teléfono', JSON.stringify(ui));
  // Imagen con versículos en el teléfono: se abre, arma Salmos 23:1-2 y dibuja en tamaño historia.
  const imagen = await app.evaluar(`go(18,23,1);await new Promise(r=>setTimeout(r,800));window.BibliaImagen.abrir();await new Promise(r=>setTimeout(r,600));const h=document.querySelector('#imagen-hasta');h.value='2';h.dispatchEvent(new Event('change'));document.querySelector('#imagen-formato').value='historia';await window.BibliaImagen.dibujar();await new Promise(r=>setTimeout(r,800));const c=window.BibliaImagen._lienzo();return {ref:document.querySelector('#imagen-referencia').value,texto:document.querySelector('#imagen-texto').value.slice(0,40),w:c.width,h:c.height,compartir:typeof window.BibliaPlataforma.compartirImagen==='function'};`, 60000);
  captura('4b-imagen-versiculo');
  await app.evaluar(`document.querySelector('#imagen-cerrar').click();return true;`);
  anotar(imagen.ref === 'Salmos 23:1-2' && /JEHOVÁ/.test(imagen.texto) && imagen.w === 1080 && imagen.h === 1920 && imagen.compartir, 'imagen con versículos en el teléfono', JSON.stringify(imagen));
  // Llavero seguro: la clave de IA se guarda cifrada con el Android Keystore y debe sobrevivir a actualizar.
  const llavero = await app.evaluar(`const d=await window.BibliaLlavero.disponible();await window.BibliaLlavero.guardar('gemini','clave-de-prueba-123');return {d,v:await window.BibliaLlavero.leer('gemini')};`);
  anotar(llavero.d === true && llavero.v === 'clave-de-prueba-123', 'llavero seguro guarda y lee', JSON.stringify({ disponible: llavero.d, coincide: llavero.v === 'clave-de-prueba-123' }));
  // Gemini personal: la clave queda en el llavero y OpenRouter declara almacenamiento seguro del dispositivo.
  const ia = await app.evaluar(`const s=await window.libraryDesktop.aiStatus();await window.libraryDesktop.aiPersonalEnable(true);await window.libraryDesktop.aiGeminiKey('AIzaSy'+'A'.repeat(33));const caps=await window.libraryDesktop.getCapabilities();return {almacen:s.credentialStorage,imagen:!!caps.operations.aiImage?.available};`, 60000);
  anotar(ia.almacen === 'device-secure' && ia.imagen, 'IA con llavero (OpenRouter y Gemini) y fondo con IA disponible', JSON.stringify(ia));
  // 7. Actualizar encima (como hará Edward con cada versión nueva): misma firma → los datos se quedan.
  try { app.cerrar(); } catch { /* ya cerrada */ }
  adb('install', '-r', apk);
  adb('shell', 'am', 'start', '-n', PKG + '/.MainActivity');
  app = await conectar();
  app = await esperarLista(app, '5-tras-actualizar');
  let actualizado = null;
  for (let i = 0; i < 60; i++) {
    try {
      actualizado = await app.evaluar(`return {lista:typeof storageReady!=='undefined'&&storageReady,hechos:(state.plans[0]?.completed||[]).length,devocionales:state.devotionals.length,modulos:catalogData?.modules?.length||0};`, 5000);
      if (actualizado.lista && actualizado.modulos >= 5) break;
    } catch { /* abriendo */ }
    await espera(1000);
  }
  anotar(actualizado && actualizado.lista && actualizado.hechos === 329 && actualizado.devocionales === 2 && actualizado.modulos >= 5, 'actualizar encima conserva los datos', JSON.stringify(actualizado));
  const geminiDespues = await app.evaluar(`const p=await window.libraryDesktop.aiPersonalStatus();const g=(p.providers||[]).find(x=>x.id==='gemini-api');await window.libraryDesktop.aiGeminiKey(null);return {personal:p.enabled,gemini:!!(g&&g.connected)};`, 60000);
  anotar(geminiDespues.personal && geminiDespues.gemini, 'Gemini sigue conectado tras actualizar', JSON.stringify(geminiDespues));
  const llaveroDespues = await app.evaluar(`const v=await window.BibliaLlavero.leer('gemini');await window.BibliaLlavero.borrar('gemini');return {v,borrada:(await window.BibliaLlavero.leer('gemini'))===null};`);
  anotar(llaveroDespues.v === 'clave-de-prueba-123' && llaveroDespues.borrada, 'la clave sigue tras actualizar y se puede borrar', JSON.stringify({ sigue: llaveroDespues.v === 'clave-de-prueba-123', borrada: llaveroDespues.borrada }));
  fs.writeFileSync(path.join(salida, 'consola.txt'), app.consola.join('\n'));
  app.cerrar();
})().catch(e => {
  informe.push('ERROR: ' + e.message);
  console.error('ERROR:', e.message);
  captura('error');
  process.exitCode = 1;
}).finally(() => {
  fs.writeFileSync(path.join(salida, 'informe.txt'), informe.join('\n') + '\n');
  try { fs.writeFileSync(path.join(salida, 'logcat.txt'), adb('logcat', '-d', '-v', 'brief', 'Capacitor:V', 'Capacitor/Console:V', 'chromium:V', 'AndroidRuntime:E', 'TraspasoPaquete:V', 'DEBUG:V', 'libc:V', 'ActivityManager:I', '*:E')); } catch { /* sin logcat */ }
  terminada = true; clearInterval(vigilia);
  // Salir siempre: un WebSocket o temporizador abierto no debe dejar colgado al emulador.
  process.exit(process.exitCode || 0);
});
