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
  try { adb('shell', 'settings', 'put', 'system', 'font_scale', '1.0'); } catch { /* sin ajuste */ }
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
  // Capturas para la ficha de Google Play (p21): cada función en su pantalla, sin diálogos encima. Se arman con título
  // y marco después (scripts/capturas-play.py). Informativas: no hacen fallar la prueba.
  const play = async (nombre, js, espera = 1200) => { try { await app.evaluar("document.querySelectorAll('dialog[open]').forEach(d=>d.close());window.BibliaMovil?.cerrarMas?.();const bt=document.querySelector('#back-to-top');if(bt)bt.style.setProperty('display','none','important');" + js + ";await new Promise(r=>setTimeout(r," + espera + "));return true;", 30000); captura('play-' + nombre); } catch (e) { lineas.push('AVISO captura ' + nombre + ': ' + e.message); } };
  await play('1-biblia', "go(42,3,16);await new Promise(r=>setTimeout(r,800));document.querySelector('#movil-pestanas [data-vista=biblia]').click()");
  await play('2-hoy', "document.querySelector('#movil-pestanas [data-vista=hoy]').click();await new Promise(r=>setTimeout(r,800));document.querySelector('#main-content')?.scrollTo?.(0,0);window.scrollTo(0,0)");
  await play('3-diccionario', "go(42,3,16);await new Promise(r=>setTimeout(r,600));document.querySelector('#movil-pestanas [data-vista=diccionario]').click();await new Promise(r=>setTimeout(r,500));const sel=document.querySelector('#dictionary-select');if(sel&&[...sel.options].some(o=>o.value==='ubs-griego')){sel.value='ubs-griego';sel.dispatchEvent(new Event('change',{bubbles:true}));}const q=document.querySelector('#dictionary-query');q.value='amor';document.querySelector('#dictionary-submit')?.click();await new Promise(r=>setTimeout(r,1500));const r=document.querySelector('#dictionary-content button');r&&r.click()", 1500);
  await play('4-estudio', "go(42,3,16);await new Promise(r=>setTimeout(r,600));document.querySelector('#movil-pestanas [data-vista=comentario]').click();await new Promise(r=>setTimeout(r,500));const m=document.querySelector('#graphics-mode');if(m){m.value='map';m.dispatchEvent(new Event('change',{bubbles:true}));}", 2000);
  await play('5-temas', "window.TemasBiblia?.abrir('ansiedad')", 1500);
  await play('6-memorizar', "go(18,119,11);await new Promise(r=>setTimeout(r,500));state.memorizar={'18:119:11':{caja:3,proximo:'2026-01-01',repasos:3}};window.MemorizarBiblia?.abrir();await new Promise(r=>setTimeout(r,300));const add=document.querySelector('[data-mem=agregar]');if(!document.querySelector('.mem-item'))add?.click();await new Promise(r=>setTimeout(r,300));document.querySelector('.mem-item')?.click()", 1200);
  await play('7-referencias', "go(42,3,16);await new Promise(r=>setTimeout(r,600));document.querySelector('#movil-pestanas [data-vista=referencias]').click()", 1500);
  // «Preguntar a la Biblia» con una respuesta REAL del modelo elegido (fixtures/ia-ejemplo.json), sin gastar preguntas.
  const ejemploIA = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'ia-ejemplo.json'), 'utf8'));
  await play('8-ia', `const x=${JSON.stringify({ modo: ejemploIA.modo, pregunta: ejemploIA.pregunta, respuesta: ejemploIA.respuesta, fecha: ejemploIA.fecha, ref: '' })};state.iaBiblia={consentido:true,historial:[x]};window.IaBiblia.abrir({modo:'tema'});await new Promise(r=>setTimeout(r,500));document.querySelector('#ia-biblia [data-hist="0"]')?.click();await new Promise(r=>setTimeout(r,400));const d=document.querySelector('#ia-biblia'),res=document.querySelector('#ia-resultado');if(d&&res)d.scrollTop=Math.max(0,res.offsetTop-260)`, 1500);
  // Biblioteca Plus · vista previa (Edward, 13-oct): candados de CONSENSO-HABITO #11, oferta con precio, fecha del primer
  // cobro y «Continuar gratis», y el interruptor «Simular Plus» que abre los candados. No cobra nada.
  const plus = await app.evaluar(`document.querySelectorAll('dialog[open]').forEach(d=>d.close());try{localStorage.removeItem('biblioteca-plus-simulado')}catch{};window.BibliaPlus.refrescar();window.BibliaMovil.abrirMas();await new Promise(r=>setTimeout(r,500));const t=[...document.querySelectorAll('.movil-mas-seccion')].find(h=>/plus/i.test(h.textContent));t?.scrollIntoView({block:'start'});await new Promise(r=>setTimeout(r,400));const menu=[...document.querySelectorAll('#movil-mas [data-plus-funcion]')].map(b=>({id:b.dataset.plusFuncion,candado:b.classList.contains('plus-con-candado')}));return {menu};`, 30000);
  captura('plus-1-menu');
  const oferta = await app.evaluar(`document.querySelector('[data-plus-funcion=sync]').click();await new Promise(r=>setTimeout(r,600));const d=document.querySelector('#plus-oferta');return {abierta:!!d?.open,motivo:d?.querySelector('#plus-motivo').textContent||'',cond:d?.querySelector('#plus-condiciones').textContent||'',gratis:!!d?.querySelector('[data-plus=gratis]'),restaurar:!!d?.querySelector('[data-plus=restaurar]'),sinOfertas:!!d?.querySelector('#plus-sin-ofertas'),fuera:[...d.querySelectorAll('button')].filter(b=>{const r=b.getBoundingClientRect();return r.width>0&&(r.right>innerWidth+1||r.left<-1)}).length};`, 30000);
  captura('plus-2-oferta');
  const simulado = await app.evaluar(`document.querySelector('#plus-simular').click();await new Promise(r=>setTimeout(r,300));document.querySelector('#plus-oferta [data-plus=cerrar]').click();window.IaBiblia.abrir({modo:'tema'});await new Promise(r=>setTimeout(r,500));const r={plus:document.documentElement.dataset.plus,candados:document.querySelectorAll('.plus-con-candado').length,ia:document.querySelector('#ia-biblia [data-plus-funcion=ia]')?.textContent||''};document.querySelector('#ia-biblia').close();try{localStorage.removeItem('biblioteca-plus-simulado')}catch{};window.BibliaPlus.refrescar();return r;`, 30000);
  anotar(plus.menu.length === 3 && plus.menu.every(m => m.candado) && oferta.abierta && /Sincronizar/.test(oferta.motivo) && /US\$4,99/.test(oferta.cond) && /Primer cobro/.test(oferta.cond) && oferta.gratis && oferta.restaurar && oferta.sinOfertas && oferta.fuera === 0 && simulado.plus === 'si' && simulado.candados === 0 && /10 preguntas/.test(simulado.ia), 'Plus (vista previa): candados, oferta con precio y «Continuar gratis», y «Simular Plus» los abre', JSON.stringify({ plus, oferta: { ...oferta, cond: oferta.cond.slice(0, 60) }, simulado }));
  app.cerrar();
})().catch(e => { lineas.push('ERROR tienda: ' + e.message); console.error(e); process.exitCode = 1; }).finally(() => {
  fs.appendFileSync(path.join(salida, 'informe.txt'), lineas.join('\n') + '\n');
  clearInterval(vigilia);
  process.exit(process.exitCode || 0);
});
