'use strict';
// Edición tienda (Google Play, CONSENSO-PLAY.md) en el emulador: instala el APK de depuración de la tienda
// (paquete propio, convive con la completa), comprueba que no trae IA, música, traspaso ni círculo, que «Más»
// ofrece «Apoyar el proyecto», y toma las capturas para que Edward vea cómo se vería.
// Uso: node vista-tienda.cjs <apk-tienda-depuracion> <carpeta-de-resultados>
const { execFileSync } = require('node:child_process');
const fs = require('node:fs'), path = require('node:path');
const [apk, salida] = process.argv.slice(2);
const PKG = 'com.castillodigital.bibliotecabiblica';
const adb = (...a) => execFileSync('adb', a, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 180000 });
const espera = ms => new Promise(r => setTimeout(r, ms));
const lineas = [];
const anotar = (ok, paso, detalle = '') => { const l = `${ok ? 'OK ' : 'FALLÓ'} tienda: ${paso}${detalle ? ' · ' + detalle : ''}`; lineas.push(l); console.log(l); return ok; };
const captura = nombre => { try { fs.writeFileSync(path.join(salida, 'tienda-' + nombre + '.png'), execFileSync('adb', ['exec-out', 'screencap', '-p'], { maxBuffer: 64 * 1024 * 1024, timeout: 60000 })); } catch { /* sin captura */ } };
const vigilia = setInterval(() => {}, 30000);

async function conectar() {
  let pid = '';
  for (let i = 0; i < 60 && !pid; i++) {
    try { pid = adb('shell', 'pidof', PKG).trim(); } catch { /* aún no */ }
    // El emulador a veces cierra la app (servicios de Google): se reabre una vez y queda anotado.
    if (!pid && i === 25) { lineas.push('AVISO tienda: el emulador cerró la app; se reabrió'); adb('shell', 'monkey', '-p', PKG, '-c', 'android.intent.category.LAUNCHER', '1'); }
    if (!pid) await espera(1000);
  }
  if (!pid) throw new Error('La app de la tienda no arrancó');
  let socket = '';
  for (let i = 0; i < 60 && !socket; i++) { const m = adb('shell', 'cat', '/proc/net/unix').match(new RegExp('@(webview_devtools_remote_' + pid + ')')); if (m) socket = m[1]; else await espera(1000); }
  if (!socket) throw new Error('El WebView de la tienda no expone depuración');
  adb('forward', '--remove-all'); adb('forward', 'tcp:9223', 'localabstract:' + socket);
  let pagina;
  for (let i = 0; i < 30 && !pagina; i++) { try { const ps = (await (await fetch('http://127.0.0.1:9223/json/list')).json()).filter(p => p.type === 'page' && /localhost/.test(p.url)); pagina = ps[ps.length - 1]; } catch { /* aún no */ } if (!pagina) await espera(1000); }
  if (!pagina) throw new Error('No encontré la página de la tienda');
  const ws = new WebSocket(pagina.webSocketDebuggerUrl);
  await new Promise((ok, mal) => { const t = setTimeout(() => mal(new Error('El WebView no abrió la depuración a tiempo')), 15000); ws.onopen = () => { clearTimeout(t); ok(); }; ws.onerror = e => { clearTimeout(t); mal(e); }; });
  let id = 0; const pend = new Map();
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
  const evaluar = async (expr, timeout = 60000) => {
    const r = await Promise.race([new Promise(res => { const n = ++id; pend.set(n, res); ws.send(JSON.stringify({ id: n, method: 'Runtime.evaluate', params: { expression: `(async()=>{${expr}})()`, awaitPromise: true, returnByValue: true } })); }), espera(timeout).then(() => ({ timeout: true }))]);
    if (r.timeout) throw new Error('Tiempo agotado');
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
    return r.result?.result?.value;
  };
  return { evaluar, cerrar: () => ws.close() };
}

(async () => {
  fs.mkdirSync(salida, { recursive: true });
  try { adb('uninstall', PKG); } catch { /* no estaba */ }
  adb('install', apk);
  adb('shell', 'monkey', '-p', PKG, '-c', 'android.intent.category.LAUNCHER', '1');
  let app = await conectar();
  let estado = '';
  for (let i = 0; i < 75 && estado !== 'lista' && estado !== 'fallo'; i++) {
    try { estado = await app.evaluar("return document.documentElement.dataset.preparacion||'';", 5000); } catch { try { app.cerrar(); } catch {} app = await conectar(); }
    if (estado !== 'lista') await espera(2000);
  }
  anotar(estado === 'lista', 'arranca', estado);
  const caps = await app.evaluar("const c=await window.libraryDesktop.getCapabilities();const o=c.operations;const v=n=>!!o[n]?.available;return {edicion:window.BIBLIA_EDICION,capitulo:v('chapter'),ia:['aiStatus','aiAsk','aiPrepare','aiImage'].filter(v),musica:['musicPlayer','youtubeSearch'].filter(v),traspaso:['transferScan','transferInstall'].filter(v),circulo:['circleConnect','circleShare'].filter(v),modulos:['moduleInstall','moduleScan'].filter(v)};");
  anotar(caps.edicion === 'tienda' && caps.capitulo && !caps.ia.length && !caps.musica.length && !caps.traspaso.length && !caps.circulo.length && !caps.modulos.length, 'sin IA, música, traspaso, círculo ni importar módulos', JSON.stringify(caps));
  // Que la app termine de prepararse antes de tocar nada (si no, avisa «La copia anterior está protegida»).
  const listo = await app.evaluar("for(let i=0;i<90&&!(typeof storageReady!=='undefined'&&storageReady);i++)await new Promise(r=>setTimeout(r,500));return typeof storageReady!=='undefined'&&storageReady;", 70000);
  anotar(listo, 'almacenamiento listo para guardar');
  // Entrega 2B: la edición de Play también da la bienvenida; se salta y queda «Hoy» (captura para la ficha de Play).
  const hoy = await app.evaluar("for(let i=0;i<80&&document.documentElement.dataset.vistaMovil!=='hoy-view';i++)await new Promise(r=>setTimeout(r,250));for(let i=0;i<20&&(document.querySelector('#hoy-vers-texto')?.textContent||'…')==='…';i++)await new Promise(r=>setTimeout(r,250));await new Promise(r=>setTimeout(r,800));return {bienvenida:!!document.querySelector('#hoy-bienvenida'),vista:document.documentElement.dataset.vistaMovil,texto:(document.querySelector('#hoy-vers-texto')?.textContent||'').slice(0,40)};", 40000);
  captura('0-hoy');
  anotar(!hoy.bienvenida && hoy.vista === 'hoy-view' && hoy.texto.length > 20, 'tienda: abre en «Hoy» con el versículo del día (sin bienvenida)', JSON.stringify(hoy));
  // Una nota escrita en la pantalla se guarda y sigue después de recargar.
  const escrita = await app.evaluar("go(42,3,16);await new Promise(r=>setTimeout(r,900));const n=document.querySelector('#note');n.value='Nota de prueba de la tienda';n.dispatchEvent(new Event('input',{bubbles:true}));n.dispatchEvent(new Event('change',{bubbles:true}));await new Promise(r=>setTimeout(r,2500));await saveQueue;return document.querySelector('#save-status')?.textContent||'';");
  await app.evaluar("setTimeout(()=>location.reload(),50);return true;").catch(() => {});
  await espera(4000); try { app.cerrar(); } catch {}
  app = await conectar();
  let tras = null;
  for (let i = 0; i < 60 && !tras; i++) { try { tras = await app.evaluar("if(!(typeof storageReady!=='undefined'&&storageReady))return null;return JSON.stringify(state.notes||{});", 5000); } catch { try { app.cerrar(); } catch {} app = await conectar(); } if (!tras) await espera(1000); }
  anotar(!!tras && /Nota de prueba de la tienda/.test(tras), 'una nota escrita en pantalla sigue tras recargar', escrita);
  await app.evaluar("go(42,3,16);await new Promise(r=>setTimeout(r,1200));return true;");
  captura('1-lectura');
  const mas = await app.evaluar("document.querySelector('#movil-menu').click();await new Promise(r=>setTimeout(r,700));return [...document.querySelectorAll('#movil-mas .movil-mas-lista button')].filter(b=>!b.hidden).map(b=>b.textContent.trim());");
  captura('2-mas');
  anotar(mas.some(t => /Apoyar el proyecto/.test(t)) && !mas.some(t => /inteligencia artificial|estudio con ia|música|traer desde|círculo/i.test(t)), '«Más» ofrece Apoyar y no muestra lo que no va', JSON.stringify(mas));
  const apoyo = await app.evaluar("[...document.querySelectorAll('#movil-mas .movil-mas-lista button')].find(b=>/Apoyar/.test(b.textContent)).click();await new Promise(r=>setTimeout(r,700));const d=document.querySelector('#movil-apoyo');return {abierto:!!d?.open,montos:[...d.querySelectorAll('.movil-apoyo-montos button')].map(b=>b.textContent)};");
  captura('3-apoyar');
  anotar(apoyo.abierto && apoyo.montos.length === 4, 'pantalla «Apoyar el proyecto»', JSON.stringify(apoyo));
  await app.evaluar("document.querySelector('#movil-apoyo').close();go(18,23,1);await new Promise(r=>setTimeout(r,1000));window.BibliaImagen.abrir();for(let i=0;i<20&&!document.querySelector('dialog[open] #imagen-texto');i++)await new Promise(r=>setTimeout(r,300));await window.BibliaImagen.dibujar?.();await new Promise(r=>setTimeout(r,800));return true;");
  const img = await app.evaluar("return {abierto:!!document.querySelector('dialog[open] #imagen-texto'),bloqueIa:!document.querySelector('#imagen-ia')?.hidden};");
  captura('4-imagen');
  anotar(img.abierto && !img.bloqueIa, 'imagen con versículos abre sin el bloque de IA', JSON.stringify(img));
  await app.evaluar("document.querySelector('#imagen-cerrar')?.click();const b=[...document.querySelectorAll('.library-menu-items button')].find(x=>/fuentes/i.test(x.textContent));b&&b.click();await new Promise(r=>setTimeout(r,900));return true;");
  captura('5-fuentes');
  const ocultos = await app.evaluar("const oculto=s=>{const e=document.querySelector(s);return !e||getComputedStyle(e).display==='none'||e.hidden;};return {musica:oculto('#music-quick'),importar:oculto('#module-import-open'),paquetes:oculto('#sources-refresh')};");
  anotar(ocultos.musica && ocultos.importar && ocultos.paquetes, 'sin botón de música ni importar módulos personales', JSON.stringify(ocultos));
  // Diccionarios en español de las Sociedades Bíblicas (CC BY-SA): por número y por palabra, y con su licencia en Fuentes.
  const ubs = await app.evaluar("const g=await window.libraryDesktop.dictionary({group:'ubs-griego',query:'G25'});const a=await window.libraryDesktop.dictionary({group:'ubs-griego',query:'amor'});const h=await window.libraryDesktop.dictionary({group:'ubs-hebreo',query:'H430'});const cat=(await window.libraryDesktop.catalog()).modules.filter(m=>m.id.startsWith('ubs-'));return {g:(g.entries[0]?.text||'').slice(0,40),amor:a.entries.slice(0,3).map(e=>(e.text||'').slice(0,12)),h:/Gn 1:1/.test(h.entries.map(e=>e.text).join(' ')),licencias:cat.map(m=>m.licencia)};");
  anotar(/ἀγαπάω/.test(ubs.g) && /amar|amor/.test(ubs.g) && ubs.amor.some(t => /ἀγαπ|ἀγάπ/.test(t)) && ubs.h && ubs.licencias.length === 2 && ubs.licencias.every(l => /CC BY-SA 4\.0/.test(l)), 'diccionarios griego y hebreo en español (Sociedades Bíblicas)', JSON.stringify(ubs));
  app.cerrar();
})().catch(e => { lineas.push('ERROR tienda: ' + e.message); console.error(e); process.exitCode = 1; }).finally(() => {
  fs.appendFileSync(path.join(salida, 'informe.txt'), lineas.join('\n') + '\n');
  clearInterval(vigilia);
  process.exit(process.exitCode || 0);
});
