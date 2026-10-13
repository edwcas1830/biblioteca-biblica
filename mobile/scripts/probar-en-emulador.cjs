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
const adb = (...a) => execFileSync('adb', a, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 180000 });
const espera = ms => new Promise(r => setTimeout(r, ms));
const informe = [];
// Mantiene vivo el proceso mientras dura la prueba y deja constancia si Node termina sin pasar por el final.
const vigilia = setInterval(() => {}, 30000);
let terminada = false;
process.on('exit', codigo => { if (!terminada) { try { fs.writeFileSync(path.join(salida, 'informe.txt'), informe.concat('ERROR: la prueba terminó sin llegar al final (código ' + codigo + ')').join('\n') + '\n'); } catch { /* sin disco */ } } });
const anotar = (ok, paso, detalle = '') => { const l = `${ok ? 'OK ' : 'FALLÓ'} ${paso}${detalle ? ' · ' + detalle : ''}`; informe.push(l); console.log(l); if (!ok) throw new Error(paso + ': ' + detalle); };
const captura = nombre => { try { fs.writeFileSync(path.join(salida, nombre + '.png'), execFileSync('adb', ['exec-out', 'screencap', '-p'], { maxBuffer: 64 * 1024 * 1024, timeout: 60000 })); } catch { /* sin captura */ } };

// adb exec-in vuelve antes de que el teléfono termine de escribir: se espera a que el archivo tenga su tamaño.
async function subirACache(nombre, datos) {
  execFileSync('adb', ['exec-in', `run-as ${PKG} sh -c 'cat > cache/${nombre}'`], { input: datos, maxBuffer: 64 * 1024 * 1024, timeout: 300000 });
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
// Cada arranque abre «Hoy» tras la entrada animada (Edward, 13-oct). Se espera a que la entrada termine; si
// alLector, se vuelve a la Biblia para que los pasos siguientes prueben el lector como antes.
async function esperarLista(app, etiqueta, alLector = true) {
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
  if (r && r.estado === 'lista') {
    try { await app.evaluar(`for(let i=0;i<40&&!(window.HoyApp&&typeof uiReady!=='undefined'&&uiReady&&!document.querySelector('#hoy-entrada'));i++)await new Promise(r=>setTimeout(r,250));await new Promise(r=>setTimeout(r,600));${alLector ? "if(document.documentElement.dataset.vistaMovil==='hoy-view')window.BibliaMovil?.elegirVista('biblia');await new Promise(r=>setTimeout(r,400));" : ''}return 1;`, 20000); } catch { /* sigue: el informe dirá si algo falló */ }
  }
  captura(etiqueta);
  const estado = r ? r.estado : 'sin respuesta';
  anotar(estado === 'lista', 'arranque ' + etiqueta, (estado === 'lista' ? '' : estado + ' — ' + (r ? r.texto : '')) + (reconexiones ? ' (reconexiones: ' + reconexiones + ')' : ''));
  return app;
}

(async () => {
  // Letra grande del sistema, como el teléfono de Edward (así se ven los desbordes).
  adb('shell', 'settings', 'put', 'system', 'font_scale', '1.3');
  adb('install', '-r', apk);
  adb('shell', 'am', 'start', '-n', PKG + '/.MainActivity');
  let app = await conectar();
  app = await esperarLista(app, '1-primer-arranque', false);
  const caps = await app.evaluar(`const c=await window.libraryDesktop.getCapabilities();return {storage:c.storage,plataforma:c.platform,faltan:['bootstrap','savePersonal','catalog','chapter','transferScan','transferInstall','voiceOptions','shareText','aiStatus'].filter(n=>!c.operations[n]?.available)};`);
  anotar(caps.plataforma === 'android' && caps.storage === 'sqlite', 'base nativa', JSON.stringify(caps));
  anotar(caps.faltan.length === 0, 'operaciones disponibles', caps.faltan.join(', ') || 'todas');
  const cap = await app.evaluar(`const c=await window.libraryDesktop.chapter({book:42,chapter:3});return c.verses.length;`);
  anotar(cap === 36, 'Juan 3 RV1909', cap + ' versículos');
  const libres = await app.evaluar(`const r=await window.libraryDesktop.connections({book:42,chapter:3,verse:16});const c=await window.libraryDesktop.compare({book:42,chapter:3,verse:16,modules:['rv1909','onbv2008']});const f=(c.rows.find(x=>x.verse===16)||{cells:[]}).cells[1];return {refs:r.items.length,onbv:!!(f&&f.text)};`);
  anotar(libres.refs > 0 && libres.onbv, 'recursos libres (referencias y ONBV)', JSON.stringify(libres));
  const voces = await app.evaluar(`try{const v=await window.libraryDesktop.voiceOptions();return 'voces en español: '+v.length;}catch(e){return 'voz: '+e.message;}`);
  anotar(true, 'voz del teléfono (informativo)', voces);
  // Entrega 2B (CONSENSO-HABITO.md): la primera vez sale la bienvenida (pantallas cortas); al terminar abre «Hoy» con
  // el versículo del día, 4 pasos que se marcan a mano y el aviso diario programado (14 días, sin alarma exacta).
  try { adb('shell', 'pm', 'grant', PKG, 'android.permission.POST_NOTIFICATIONS'); } catch { /* Android < 13 */ }
  const hoy1 = await app.evaluar(`for(let i=0;i<160&&document.documentElement.dataset.vistaMovil!=='hoy-view';i++)await new Promise(r=>setTimeout(r,250));
    for(let i=0;i<20&&(document.querySelector('#hoy-vers-texto')?.textContent||'…')==='…';i++)await new Promise(r=>setTimeout(r,250));
    const bienvenida=!!document.querySelector('#hoy-bienvenida');
    const b=document.querySelector('[data-hoy=ajustes]');if(b&&b.getAttribute('aria-expanded')!=='true')b.click();
    const h=document.querySelector('#hoy-hora');if(h){h.value='07:00';h.dispatchEvent(new Event('change',{bubbles:true}));}
    for(let i=0;i<40&&!/07:00/.test(document.querySelector('#hoy-aviso-estado')?.textContent||'');i++)await new Promise(r=>setTimeout(r,250));
    await new Promise(r=>setTimeout(r,1500));
    const rec=window.BibliaPlataforma.recordatorio,pend=rec?await rec.pendientes():[];
    return {bienvenida,vista:document.documentElement.dataset.vistaMovil,texto:document.querySelector('#hoy-vers-texto')?.textContent||'',cita:document.querySelector('.hoy-cita span')?.textContent||'',pasos:document.querySelectorAll('.hoy-paso').length,perfil:state.hoy.perfil,pendientes:pend.length,primero:pend[0]?{titulo:pend[0].title,texto:(pend[0].body||'').slice(0,40)}:null};`, 90000);
  captura('1b-hoy');
  anotar(!hoy1.bienvenida, 'entrega 2B: la bienvenida está apagada (pedido de Edward, 12-oct)');
  anotar(hoy1.vista === 'hoy-view' && hoy1.texto.length > 20 && hoy1.pasos === 4, 'entrega 2B: la primera apertura del día abre «Hoy» con el versículo del día y 4 pasos', JSON.stringify({ cita: hoy1.cita, texto: hoy1.texto.slice(0, 50), pasos: hoy1.pasos }));
  anotar(hoy1.perfil && hoy1.perfil.hora === '07:00' && hoy1.pendientes === 14 && /Versículo del día/.test((hoy1.primero || {}).titulo || ''), 'entrega 2B: aviso diario del versículo elegido en Ajustes de «Hoy» (14 días)', JSON.stringify({ pendientes: hoy1.pendientes, primero: hoy1.primero }));
  // Entrega 2C: el widget del versículo del día recibe los próximos 14 días y muestra el de hoy.
  const widget = await app.evaluar(`const n=await window.HoyApp.actualizarWidget();return {n,hay:!!window.BibliaPlataforma.widget,hoy:window.HoyCore.delDia().cita};`, 30000);
  let proveedores = ''; try { proveedores = adb('shell', 'dumpsys', 'appwidget'); } catch { /* sin datos */ }
  anotar(widget.hay && widget.n === 14 && /VersiculoWidget/.test(proveedores), 'entrega 2C: widget «Versículo del día» registrado y con 14 días', JSON.stringify({ ...widget, proveedor: /VersiculoWidget/.test(proveedores) }));
  const hoy2 = await app.evaluar(`document.querySelector('[data-hoy-abrir=conexion]').click();await new Promise(r=>setTimeout(r,300));document.querySelector('[data-hoy-hecho=conexion]').click();await new Promise(r=>setTimeout(r,500));document.querySelector('[data-hoy-hecho=versiculo]').click();await new Promise(r=>setTimeout(r,800));return {progreso:document.querySelector('.hoy-progreso').textContent,semana:document.querySelectorAll('.hoy-semana li.hecho').length,total:document.querySelector('.hoy-total').textContent,abierto:document.querySelector('.hoy-paso-cuerpo:not([hidden])')?.id||'',camino:document.querySelector('.hoy-camino')?.textContent||'',logros:Object.keys(state.hoy.logros||{})};`);
  captura('1c-hoy-pasos');
  // Entrega 4 (IA integrada): «Preguntar a la Biblia» está en ☰ y en «Hoy»; pide consentimiento la primera vez y,
  // mientras el servidor no esté activo, lo dice sin fallar. Los pasajes salen de la Biblia del teléfono.
  const iaIntegrada = await app.evaluar(`document.querySelector('#movil-menu').click();await new Promise(r=>setTimeout(r,600));const enMenu=[...document.querySelectorAll('#movil-mas .movil-mas-lista button')].some(b=>/Preguntar a la Biblia/.test(b.textContent));window.BibliaMovil?.cerrarMas?.();document.querySelectorAll('dialog[open]').forEach(d=>d.close());
    const enHoy=!!document.querySelector('#hoy-view .hoy-ia');window.IaBiblia.abrir({modo:'tema'});await new Promise(r=>setTimeout(r,500));
    const consentimiento=!document.querySelector('#ia-consentimiento').hidden;document.querySelector('[data-ia=aceptar]').click();await new Promise(r=>setTimeout(r,400));
    const pas=await window.IaBiblia.pasajesPara('tema','¿Qué dice la Biblia sobre la ansiedad?');
    const aviso=String(window.BIBLIA_IA_URL||'');const fuera=[...document.querySelectorAll('#ia-biblia button')].filter(b=>{const r=b.getBoundingClientRect();return r.width>0&&(r.right>innerWidth+1||r.left<-1);}).length;
    document.querySelector('#ia-biblia').close();return {enMenu,enHoy,consentimiento,pasajes:pas.length,primero:pas[0]?.cita||'',conTexto:pas.every(p=>p.texto.length>10),aviso,fuera};`, 30000);
  anotar(iaIntegrada.enMenu && iaIntegrada.enHoy && iaIntegrada.consentimiento && iaIntegrada.pasajes >= 8 && /Filipenses 4:6/.test(iaIntegrada.primero) && iaIntegrada.conTexto && /^https:\/\/biblia-ia\./.test(iaIntegrada.aviso) && iaIntegrada.fuera === 0, 'entrega 4: «Preguntar a la Biblia» activa, en ☰ y en «Hoy», con consentimiento y pasajes de la Biblia del teléfono (sin gastar preguntas)', JSON.stringify(iaIntegrada));
  anotar(/2 de 4/.test(hoy2.progreso) && hoy2.semana === 1 && /1 día/.test(hoy2.total) && hoy2.abierto === 'hoy-cuerpo-devocion' && /Semana de fe/.test(hoy2.camino) && /de 12 logros/.test(hoy2.camino), 'entrega 2B/2C: marcar pasos cuenta el día, abre el siguiente y «Mi camino» muestra semana de fe y logros', JSON.stringify(hoy2));
  // 4. Nota que sobrevive a la recarga
  const guardado = await app.evaluar(`const b=await window.libraryDesktop.bootstrap({initial:{version:1,position:{book:42,chapter:3,verse:16},notes:{},highlights:{},plans:[],devotionals:[],prayers:[],prayerDrafts:{},guideResponses:{},aiStudies:[],devResponses:{},planNotes:{},appearance:{design:'a'},font:20},legacy:null,legacyValid:true});const s={...b.state,notes:{...b.state.notes,'42:3:16':'Nota de prueba en el emulador'}};await window.libraryDesktop.savePersonal(s);return 'ok';`);
  anotar(guardado === 'ok', 'guardar nota');
  await app.enviar('Page.reload', { ignoreCache: true });
  await espera(3000);
  app = await esperarLista(app, '2-tras-recargar', false);
  const nota = await app.evaluar(`const b=await window.libraryDesktop.bootstrap({initial:{version:1,position:{book:42,chapter:3,verse:16},notes:{},highlights:{},plans:[],devotionals:[],prayers:[],prayerDrafts:{},guideResponses:{},aiStudies:[],devResponses:{},planNotes:{},appearance:{design:'a'},font:20},legacy:null,legacyValid:true});return b.state.notes['42:3:16']||'';`);
  anotar(nota === 'Nota de prueba en el emulador', 'nota persistida tras recargar', nota);
  const hoy3 = await app.evaluar(`for(let i=0;i<60&&!(typeof uiReady!=='undefined'&&uiReady);i++)await new Promise(r=>setTimeout(r,250));await new Promise(r=>setTimeout(r,2000));return {dias:JSON.stringify(state.hoy.dias),vista:document.documentElement.dataset.vistaMovil,bienvenida:!!document.querySelector('#hoy-bienvenida')};`, 30000);
  anotar(/":3\}/.test(hoy3.dias) && hoy3.vista === 'hoy-view' && !hoy3.bienvenida, 'entrega 2B: lo marcado sigue tras recargar y cada arranque abre «Hoy»', JSON.stringify(hoy3));
  // Día nuevo con la app abierta (Edward, 13-oct): desde la Biblia, al cambiar el día sale la entrada y «Hoy».
  await app.evaluar(`window.BibliaMovil.elegirVista('biblia');await new Promise(r=>setTimeout(r,500));return 1;`);
  const cambioDia = await app.evaluar(`const antes=document.documentElement.dataset.vistaMovil;const r=window.HoyApp.revisarDia(new Date(Date.now()+86400000));await new Promise(r=>setTimeout(r,700));const capa=!!document.querySelector('#hoy-entrada');return {antes,r,capa};`, 20000);
  captura('1d-entrada-dia-nuevo');
  const trasCambio = await app.evaluar(`for(let i=0;i<30&&document.querySelector('#hoy-entrada');i++)await new Promise(r=>setTimeout(r,200));await new Promise(r=>setTimeout(r,500));return {vista:document.documentElement.dataset.vistaMovil,pestana:document.documentElement.dataset.pestana,capa:!!document.querySelector('#hoy-entrada'),tarjeta:!!document.querySelector('.hoy-versiculo.hoy-entra')};`, 20000);
  captura('1e-hoy-dia-nuevo');
  anotar(cambioDia.antes === 'read-view' && cambioDia.r === true && cambioDia.capa && trasCambio.vista === 'hoy-view' && !trasCambio.capa && trasCambio.tarjeta, 'día nuevo con la app abierta: entrada animada y «Hoy»', JSON.stringify({ ...cambioDia, ...trasCambio }));
  await app.evaluar(`window.BibliaMovil.elegirVista('biblia');await new Promise(r=>setTimeout(r,500));return 1;`);
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
  await app.evaluar(`window.BibliaPlataforma.elegirArchivosTraspaso=o=>window.BibliaPlataforma.desempacarPaquete({desde:${JSON.stringify(uriPaquete)},bytes:${bytesPaquete},alProgreso:o&&o.alProgreso});document.querySelector('#movil-menu').click();await new Promise(r=>setTimeout(r,500));document.querySelector('#movil-traer-pc').click();return true;`);
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
  anotar(confirmacion && confirmacion.conf === 'si' && confirmacion.lista && confirmacion.hechos === 329 && confirmacion.dias === 1189 && confirmacion.devocionales === 2 && /Módulos en tu biblioteca: 7./.test(confirmacion.texto) && !/Aviso de los módulos/.test(confirmacion.texto), 'la app muestra lo traído («Tu biblioteca llegó»)', JSON.stringify(confirmacion));
  await app.evaluar(`[...document.querySelectorAll('#movil-traspaso button')].find(x=>x.textContent.trim()==='Empezar a leer')?.click();return true;`);
  const fin = await app.evaluar(`await (window.BibliaPreparacion?.modulos||Promise.resolve());const b=await window.libraryDesktop.bootstrap({initial:{version:1,position:{book:18,chapter:23,verse:1},notes:{},highlights:{},plans:[],devotionals:[],prayers:[],prayerDrafts:{},guideResponses:{},aiStudies:[],devResponses:{},planNotes:{},appearance:{design:'a'},font:20},legacy:null,legacyValid:true});const p=b.state.plans[0]||{};const cat=await window.libraryDesktop.catalog();let verso='';try{const c=await window.libraryDesktop.chapter({book:18,chapter:23,module:'texto-sintetico'});verso=(c.verses[0]||{}).text||'';}catch(e){verso='ERROR '+e.message;}return {dias:(p.entries||[]).length||p.days,hechos:(p.completed||[]).length,devocionales:b.state.devotionals.length,nota:b.state.notes['18:23:1']||'',modulo:cat.modules.some(m=>m.id==='texto-sintetico'),verso};`, 300000);
  anotar(fin.dias === 1189 && fin.hechos === 329 && fin.devocionales === 2, 'datos traídos de la PC', JSON.stringify({ dias: fin.dias, hechos: fin.hechos, devocionales: fin.devocionales }));
  anotar(fin.modulo && /Texto inventado/.test(fin.verso), 'módulo e-Sword traído y legible', fin.verso.slice(0, 60));
  // Interfaz: navegación y hoja visibles en el teléfono
  const ui = await app.evaluar(`return {telefono:document.documentElement.dataset.telefono,nav:!!document.querySelector('#movil-pestanas'),hoja:!!document.querySelector('#movil-barra'),versiculos:document.querySelectorAll('#verses .verse').length};`);
  captura('4-interfaz');
  anotar(ui.nav && ui.hoja && ui.versiculos > 0, 'interfaz de teléfono', JSON.stringify(ui));
  // Paso 1 del diseño (CONSENSO-MOVIL.md): barra superior de una fila (☰ · referencia · buscar) y buscador
  // con autocompletado. Con letra grande: nada se sale de la pantalla, nada se corta y todo mide 48 px o más.
  const MEDIR = `const medir=raiz=>{const r=[];for(const b of raiz.querySelectorAll('button,input,select')){if(b.offsetParent===null)continue;const q=b.getBoundingClientRect();if(!q.width)continue;r.push({t:(b.textContent||b.getAttribute('aria-label')||b.id||'').trim().slice(0,18),h:Math.round(q.height),fuera:q.left<-1||q.right>innerWidth+1,corta:b.scrollWidth>b.clientWidth+1});}return r;};`;
  const paso1 = await app.evaluar(`go(42,3,16);await new Promise(r=>setTimeout(r,900));${MEDIR}const barra=document.querySelector('#movil-barra');const tb=document.querySelector('.reading-toolbar');return {alto:Math.round(barra.getBoundingClientRect().height),ref:barra.querySelector('.movil-barra-ref').textContent,toolbarOculta:!tb||getComputedStyle(tb).display==='none',controles:medir(barra),horizontal:document.documentElement.scrollWidth<=innerWidth+1};`);
  captura('6a-barra-superior');
  anotar(paso1.alto <= 100 && /Juan 3/.test(paso1.ref) && paso1.toolbarOculta && paso1.horizontal && paso1.controles.length === 3 && paso1.controles.every(c => c.h >= 47 && !c.fuera && !c.corta), 'paso 1: barra superior de una fila', JSON.stringify(paso1));
  // Edward (11-oct): Strong y escuchar a la vista por defecto, con ⌃ para minimizar y ⤢ pantalla completa.
  const herr = await app.evaluar(`try{localStorage.removeItem('biblia-herramientas')}catch{};${MEDIR}const f=document.querySelector('#library-controls');const visible=getComputedStyle(f).display!=='none'&&f.getBoundingClientRect().height>0;const malos=medir(f).filter(c=>c.h<47||c.fuera||c.corta);const alto=f.getBoundingClientRect().height;document.querySelector('#movil-herr-plegar').click();await new Promise(r=>setTimeout(r,300));const mini=f.getBoundingClientRect().height;document.querySelector('#movil-herr-plegar').click();await new Promise(r=>setTimeout(r,300));const vuelta=f.getBoundingClientRect().height;return {visible,malos,strong:!!f.querySelector('#show-strong'),escuchar:!!f.querySelector('#voice-play'),completa:!!document.querySelector('#movil-herr-completa'),alto:Math.round(alto),mini:Math.round(mini),vuelta:Math.round(vuelta)};`);
  captura('6d-herramientas');
  anotar(herr.visible && herr.strong && herr.escuchar && herr.completa && herr.malos.length === 0 && herr.mini < herr.alto && Math.abs(herr.vuelta - herr.alto) <= 1, 'Strong y escuchar a la vista, se minimiza y vuelve', JSON.stringify(herr));
  const rey = await app.evaluar(`document.querySelector('#movil-buscar').click();await new Promise(r=>setTimeout(r,600));const q=document.querySelector('#buscador-campo');q.value='rey';q.dispatchEvent(new Event('input'));await new Promise(r=>setTimeout(r,400));${MEDIR}const d=document.querySelector('#buscador');return {abierto:d.open,filas:[...d.querySelectorAll('.buscador-fila')].map(b=>b.textContent),malos:medir(d).filter(c=>c.h<47||c.fuera||c.corta)};`);
  captura('6b-buscador-rey');
  anotar(rey.abierto && rey.filas.includes('1 Reyes') && rey.filas.includes('2 Reyes') && rey.malos.length === 0, 'paso 1: «rey» sugiere 1 Reyes y 2 Reyes', JSON.stringify(rey));
  const cita = await app.evaluar(`const q=document.querySelector('#buscador-campo');q.value='jn 3 16';q.dispatchEvent(new Event('input'));await new Promise(r=>setTimeout(r,400));const fila=document.querySelector('#buscador .buscador-fila');const texto=fila.textContent;fila.click();await new Promise(r=>setTimeout(r,1200));return {texto,abierto:document.querySelector('#buscador').open,pos:state.position,ref:document.querySelector('#movil-barra .movil-barra-ref').textContent};`);
  anotar(!cita.abierto && cita.pos.book === 42 && cita.pos.chapter === 3 && cita.pos.verse === 16 && /Juan 3/.test(cita.ref), 'paso 1: «jn 3 16» lleva a Juan 3:16', JSON.stringify(cita));
  const indice = await app.evaluar(`document.querySelector('#movil-barra .movil-barra-ref').click();await new Promise(r=>setTimeout(r,600));const d=document.querySelector('#buscador');const libros=d.querySelectorAll('.buscador-libros button').length;[...d.querySelectorAll('.buscador-libros button')].find(b=>b.textContent==='Sal').click();await new Promise(r=>setTimeout(r,400));const caps=d.querySelectorAll('.buscador-caps button').length;${MEDIR}const malos=medir(d).filter(c=>c.h<47||c.fuera||c.corta);return {libros,caps,malos};`);
  captura('6c-indice-salmos');
  const salmo = await app.evaluar(`[...document.querySelectorAll('#buscador .buscador-caps button')].find(b=>b.textContent==='23').click();await new Promise(r=>setTimeout(r,1200));return {abierto:document.querySelector('#buscador').open,ref:document.querySelector('#movil-barra .movil-barra-ref').textContent};`);
  anotar(indice.libros === 66 && indice.caps === 150 && indice.malos.length === 0 && !salmo.abierto && /Salmos 23/.test(salmo.ref), 'paso 1: índice libro → capítulo (Salmos 23)', JSON.stringify({ ...indice, ...salmo }));
  const mas1 = await app.evaluar(`document.querySelector('#movil-menu').click();await new Promise(r=>setTimeout(r,600));const d=document.querySelector('#movil-mas');const items=[...d.querySelectorAll('.movil-mas-lista button')].filter(b=>!b.hidden).map(b=>b.textContent.trim());const letra=!!d.querySelector('.movil-mas-letra');const caja=d.querySelector('#movil-strong');const strong=!!caja&&caja.offsetParent!==null;if(caja){caja.click();await new Promise(r=>setTimeout(r,300));}const strongActivo=document.querySelector('#show-strong')?.checked;if(caja){caja.click();await new Promise(r=>setTimeout(r,300));}d.close();return {abierto:true,items,letra,strong,strongActivo};`);
  anotar(mas1.letra && mas1.strong && mas1.strongActivo === true && mas1.items.some(t => /Pantalla completa/.test(t)) && mas1.items.some(t => /Atlas/.test(t)), 'paso 1: ☰ abre Más con letra, atlas y pantalla completa', JSON.stringify(mas1));
  // Paso 2 del diseño: pestañas abajo y una cosa a la vez (Edward: «que se vea una cosa a la vez»).
  const paso2 = await app.evaluar(`go(42,3,16);await new Promise(r=>setTimeout(r,900));${MEDIR}const p=v=>document.querySelector('#movil-pestanas [data-vista='+v+']');const franja=document.querySelector('#movil-pestanas');const etiquetas=medir(franja);p('comentario').click();await new Promise(r=>setTimeout(r,700));const barra=document.querySelector('#movil-barra').getBoundingClientRect(),c=document.querySelector('#pane-comentario').getBoundingClientRect(),f=franja.getBoundingClientRect();const comentario={arriba:Math.round(c.top-barra.bottom),abajo:Math.round(f.top-c.bottom),visible:getComputedStyle(document.querySelector('#pane-comentario')).display!=='none',bibliaOculta:getComputedStyle(document.querySelector('#pane-biblia')).visibility==='hidden'};window.BibliaMovil.atras();await new Promise(r=>setTimeout(r,500));const trasAtras=document.documentElement.dataset.pestana;p('referencias').click();await new Promise(r=>setTimeout(r,900));const refs=document.querySelectorAll('#connections-list > *').length;p('biblia').click();await new Promise(r=>setTimeout(r,600));const antes=state.position.chapter;document.querySelector('#movil-flecha-sig').click();await new Promise(r=>setTimeout(r,900));const despues=state.position.chapter;return {etiquetas,comentario,trasAtras,refs,antes,despues,viejaBarra:!!document.querySelector('#movil-nav:not([hidden])')&&getComputedStyle(document.querySelector('#movil-nav')).display!=='none'};`);
  captura('8a-pestanas-biblia');
  anotar(paso2.etiquetas.length === 6 && paso2.etiquetas.every(e => e.h >= 47 && !e.corta) && paso2.comentario.visible && paso2.comentario.bibliaOculta && Math.abs(paso2.comentario.arriba) <= 2 && Math.abs(paso2.comentario.abajo) <= 2 && paso2.trasAtras === 'biblia' && paso2.refs > 0 && paso2.despues === paso2.antes + 1 && !paso2.viejaBarra, 'paso 2: pestañas abajo, una cosa a la vez a pantalla completa', JSON.stringify(paso2));
  await app.evaluar(`document.querySelector('#movil-flecha-ant').click();await new Promise(r=>setTimeout(r,600));document.querySelector('#movil-pestanas [data-vista=comentario]').click();await new Promise(r=>setTimeout(r,700));return true;`);
  captura('8b-pestana-comentario');
  await app.evaluar(`document.querySelector('#movil-pestanas [data-vista=biblia]').click();await new Promise(r=>setTimeout(r,500));return true;`);
  // Lo que Edward debe VER (con letra grande del sistema): la barra del versículo con 🖼 Imagen dentro de la
  // pantalla, «Imagen con versículos» en Más, y en IA solo OpenRouter y Gemini con el modo personal.
  const visible = await app.evaluar(`const v=document.querySelector('#verses .verse[data-verse="2"]');v.dispatchEvent(new MouseEvent('click',{bubbles:true,clientY:300}));await new Promise(r=>setTimeout(r,700));const bar=document.querySelector('#movil-versiculo');const dentro=b=>{const r=b.getBoundingClientRect();return r.width>0&&r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;};const botones=[...bar.querySelectorAll(':scope > button')].map(b=>({t:b.textContent.trim()||b.getAttribute('aria-label')||'',ok:dentro(b)}));return {barra:!bar.hidden,botones,ancho:innerWidth};`, 30000);
  captura('4c-barra-versiculo');
  const fuera = visible.botones.filter(b => !b.ok).map(b => b.t);
  anotar(visible.barra && visible.botones.some(b => /Copiar/.test(b.t)) && visible.botones.some(b => /Más acciones/.test(b.t)) && fuera.length === 0, 'botones del versículo a la vista (letra grande)', JSON.stringify({ ancho: visible.ancho, fuera }));
  // Paso 3 del diseño: «⋯» con todas las acciones y elegir varios versículos (copiar un tramo).
  const paso3 = await app.evaluar(`await new Promise(r=>setTimeout(r,300));document.querySelectorAll('dialog[open]').forEach(d=>d.close());go(42,3,16);await new Promise(r=>setTimeout(r,900));const v=n=>document.querySelector('#verses .verse[data-verse="'+n+'"]');v(16).dispatchEvent(new MouseEvent('click',{bubbles:true,clientY:300}));await new Promise(r=>setTimeout(r,600));${MEDIR}const fila=medir(document.querySelector('#movil-versiculo')).filter(c=>c.h<47||c.fuera);document.querySelector('#movil-mas-acciones').click();await new Promise(r=>setTimeout(r,500));const hoja=[...document.querySelectorAll('#movil-acciones .movil-mas-lista button')].filter(b=>!b.hidden).map(b=>b.textContent);[...document.querySelectorAll('#movil-acciones button')].find(b=>/varios/.test(b.textContent)).click();await new Promise(r=>setTimeout(r,500));v(17).dispatchEvent(new MouseEvent('click',{bubbles:true}));await new Promise(r=>setTimeout(r,200));v(18).dispatchEvent(new MouseEvent('click',{bubbles:true}));await new Promise(r=>setTimeout(r,400));const t=window.BibliaSeleccion.texto();const enBarra=medir(document.querySelector('#movil-seleccion')).filter(c=>c.h<47);return {fila,hoja,ref:t&&t.ref,cuenta:document.querySelector('.movil-seleccion-cuenta').textContent,enBarra};`);
  captura('9-varios-versiculos');
  await app.evaluar(`window.BibliaSeleccion.salir();return true;`);
  // Paso 4 del diseño: Mi estudio (marcador, memoria, etiqueta, nombre de color, historial) y que se guarde en SQLite.
  await app.evaluar(`document.querySelectorAll('dialog[open]').forEach(d=>d.close());go(42,3,16);await new Promise(r=>setTimeout(r,900));document.querySelector('#verses .verse[data-verse="16"]').dispatchEvent(new MouseEvent('click',{bubbles:true,clientY:300}));await new Promise(r=>setTimeout(r,500));window.BibliaEstudio.marcar('marcador');window.BibliaEstudio.marcar('memoria');window.BibliaEstudio.etiquetar();await new Promise(r=>setTimeout(r,400));const d=document.querySelector('#movil-etiquetar');d.querySelector('input').value='Promesas';d.querySelector('form').dispatchEvent(new Event('submit',{cancelable:true}));await new Promise(r=>setTimeout(r,300));state.estudio={...state.estudio,colores:{...state.estudio.colores,gold:'Promesa'}};save();await saveQueue;go(18,23,1);await new Promise(r=>setTimeout(r,900));await saveQueue;return true;`);
  await app.enviar('Page.reload', { ignoreCache: true });
  await espera(3000);
  app = await esperarLista(app, '10-tras-recargar-estudio');
  const paso4 = await app.evaluar(`for(let i=0;i<40&&!(typeof storageReady!=='undefined'&&storageReady);i++)await new Promise(r=>setTimeout(r,500));document.querySelector('#movil-menu').click();await new Promise(r=>setTimeout(r,600));const enMenu=[...document.querySelectorAll('#movil-mas [data-estudio]')].length;document.querySelector('#movil-mas [data-estudio="etiqueta"]').click();await new Promise(r=>setTimeout(r,600));const etiquetas=[...document.querySelectorAll('#mi-estudio .mi-estudio-fila b')].map(b=>b.textContent);document.querySelector('#mi-estudio [data-filtro="historial"]').click();await new Promise(r=>setTimeout(r,300));const historial=[...document.querySelectorAll('#mi-estudio .mi-estudio-fila b')].map(b=>b.textContent).slice(0,3);${MEDIR}const malos=medir(document.querySelector('#mi-estudio')).filter(c=>c.h<47||c.corta);const lista=document.querySelector('#mi-estudio .mi-estudio-lista');if(lista.scrollWidth>lista.clientWidth+1)malos.push({t:'lista más ancha que la pantalla'});document.querySelector('#mi-estudio').close();const e=state.estudio||{};return {enMenu,etiquetas,historial,malos,marcas:(e.marcas||[]).map(m=>m.tipo),color:e.colores&&e.colores.gold};`);
  captura('10-mi-estudio');
  anotar(paso4.enMenu === 6 && paso4.etiquetas.some(t => /Juan 3:16 · Promesas/.test(t)) && /Salmos 23/.test(paso4.historial[0] || '') && paso4.marcas.includes('marcador') && paso4.marcas.includes('memoria') && paso4.color === 'Promesa' && paso4.malos.length === 0, 'paso 4: Mi estudio guarda marcadores, etiquetas, memoria, colores e historial', JSON.stringify(paso4));
  // Entrega 1 (CONSENSO-BIBLIAS.md, decisiones de Edward del 12-oct): 6 pestañas fijas con icono, pie de capítulo
  // que no tapa el texto, ningún emoji en la barra, ☰ ni pestañas, voz con velocidad y Detener, Comentario que guía.
  const e1 = await app.evaluar(`document.querySelectorAll('dialog[open]').forEach(d=>d.close());go(18,23,1);await new Promise(r=>setTimeout(r,900));document.querySelector('#movil-pestanas [data-vista=biblia]').click();await new Promise(r=>setTimeout(r,600));const f=document.querySelector('#movil-pestanas');const bot=[...f.querySelectorAll('button')];const pestanas={n:bot.length,desliza:f.scrollWidth>f.clientWidth+1,fuera:bot.filter(b=>{const r=b.getBoundingClientRect();return r.left<-1||r.right>innerWidth+1;}).length,cortadas:bot.filter(b=>{const s=b.querySelector('span');return !s||s.scrollWidth>s.clientWidth+1;}).map(b=>b.dataset.vista),iconos:f.querySelectorAll('svg.ico').length,filas:f.dataset.filas};const pie=[...document.querySelectorAll('#movil-pie button')].filter(b=>!b.hidden).map(b=>b.textContent.trim());const tapa=Math.round(document.querySelector('#pane-biblia').getBoundingClientRect().bottom-document.querySelector('#movil-pie').getBoundingClientRect().top);const hueco=Math.round(f.getBoundingClientRect().top-document.querySelector('#movil-pie').getBoundingClientRect().bottom);document.querySelector('#movil-menu').click();await new Promise(r=>setTimeout(r,600));const RE=/[\\u{1F300}-\\u{1FAFF}\\u2600-\\u27BF]/u;const conEmoji=['#movil-barra','#movil-pestanas','#movil-pie','#movil-mas','#library-controls'].flatMap(z=>[...document.querySelectorAll(z+' button,'+z+' h3')].filter(e=>e.offsetParent!==null&&RE.test(e.textContent)).map(e=>e.textContent.trim().slice(0,30)));const voz={velocidad:!!document.querySelector('#movil-mas #voice-rate'),voz:!!document.querySelector('#movil-mas #voice-select')};document.querySelectorAll('dialog[open]').forEach(d=>d.close());voz.detener=getComputedStyle(document.querySelector('#voice-stop')).display!=='none';document.querySelector('#movil-pestanas [data-vista=comentario]').click();await new Promise(r=>setTimeout(r,1800));const cvac=document.querySelector('#movil-coment-vacio');const comentario={fichas:document.querySelectorAll('#movil-coment-modos button').length,vacioGuia:!!cvac&&!cvac.hidden,texto:(document.querySelector('#comment-content').innerText||'').trim().length,selectores:[...document.querySelectorAll('#pane-comentario select')].filter(x=>x.offsetParent!==null).length};document.querySelector('#movil-pestanas [data-vista=biblia]').click();await new Promise(r=>setTimeout(r,400));return {pestanas,pie,tapa,hueco,conEmoji,voz,comentario};`);
  captura('11-entrega1');
  anotar(e1.pestanas.n === 6 && !e1.pestanas.desliza && e1.pestanas.fuera === 0 && e1.pestanas.cortadas.length === 0 && e1.pestanas.iconos === 6, 'entrega 1: las 6 pestañas fijas con icono, sin deslizar ni cortarse', JSON.stringify(e1.pestanas));
  anotar(e1.pie.length === 2 && /Salmos 22/.test(e1.pie[0]) && /Salmos 24/.test(e1.pie[1]) && e1.tapa <= 1 && Math.abs(e1.hueco) <= 1, 'entrega 1: el pie dice adónde vas y no tapa el texto', JSON.stringify({ pie: e1.pie, tapa: e1.tapa, hueco: e1.hueco }));
  anotar(e1.conEmoji.length === 0, 'entrega 1: ningún emoji en la barra, el menú ni las pestañas', JSON.stringify(e1.conEmoji));
  anotar(e1.voz.velocidad && e1.voz.voz && e1.voz.detener, 'entrega 1: voz y velocidad en el menú y Detener a la vista', JSON.stringify(e1.voz));
  anotar(e1.comentario.fichas === 7 && e1.comentario.selectores <= 1 && (e1.comentario.vacioGuia || e1.comentario.texto > 40), 'entrega 1: Comentario con fichas, un solo selector y nunca vacío', JSON.stringify(e1.comentario));
  // Copia de seguridad en el teléfono: se guarda en la caché y se entrega con «Compartir»; luego se recupera y
  // vuelve lo que se había borrado (Edward la usará al cambiar de teléfono).
  const copiaIda = await app.evaluar(`for(let i=0;i<40&&!(typeof storageReady!=='undefined'&&storageReady);i++)await new Promise(r=>setTimeout(r,500));state.notes['19:23:1']='Nota para la copia de seguridad';save();await new Promise(r=>setTimeout(r,800));const fsys=window.Capacitor.registerPlugin('Filesystem');try{await fsys.rmdir({directory:'CACHE',path:'copias',recursive:true});}catch{}document.querySelector('#backup').click();let lista=[];for(let i=0;i<30;i++){await new Promise(r=>setTimeout(r,500));try{lista=(await fsys.readdir({directory:'CACHE',path:'copias'})).files.map(f=>f.name||f);}catch{}if(lista.length)break;}return {lista};`);
  await espera(1500); captura('12-copia-compartir'); adb('shell', 'input', 'keyevent', '4'); await espera(1200);
  const copiaVuelta = await app.evaluar(`const fsys=window.Capacitor.registerPlugin('Filesystem');const n=${JSON.stringify((copiaIda.lista || [])[0] || '')};if(!n)return {error:'sin archivo'};const {data}=await fsys.readFile({directory:'CACHE',path:'copias/'+n,encoding:'utf8'});const tenia=JSON.parse(data);delete state.notes['19:23:1'];save();await new Promise(r=>setTimeout(r,800));const borrada=!state.notes['19:23:1'];const c0=window.confirm;window.confirm=()=>true;const input=document.querySelector('#restore-file');const dt=new DataTransfer();dt.items.add(new File([data],n,{type:'application/json'}));input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));for(let i=0;i<40&&state.notes['19:23:1']!=='Nota para la copia de seguridad';i++){await new Promise(r=>setTimeout(r,500));document.querySelectorAll('dialog[open] button').forEach(b=>{if(/recuperar|reemplazar|confirmar|continuar/i.test(b.textContent))b.click();});}window.confirm=c0;return {bytes:data.length,teniaNota:JSON.stringify(tenia).includes('Nota para la copia de seguridad'),borrada,volvio:state.notes['19:23:1']==='Nota para la copia de seguridad',aceptaTodo:!input.hasAttribute('accept')};`, 60000);
  anotar((copiaIda.lista || []).length === 1 && copiaVuelta.teniaNota && copiaVuelta.borrada && copiaVuelta.volvio && copiaVuelta.aceptaTodo, 'entrega 1: guardar copia en el teléfono y recuperarla (vuelve la nota borrada)', JSON.stringify({ ida: copiaIda, vuelta: copiaVuelta }));
  // Entrega 2: lectura en voz alta en segundo plano (servicio nativo). Se lee Salmos 117 (dos versículos), se va a la
  // pantalla de inicio y el servicio debe seguir en primer plano con la notificación; al volver, la lectura terminó.
  try { adb('shell', 'pm', 'grant', PKG, 'android.permission.POST_NOTIFICATIONS'); } catch { /* Android < 13 */ }
  const lecturaIda = await app.evaluar(`window.__lectura=[];const n=window.BibliaPlataforma&&window.BibliaPlataforma.lectura;if(!n)return {hay:false};for(const t of ['capitulo','parte','estado','terminado','error'])n.al(t,e=>window.__lectura.push(t+':'+JSON.stringify(e)));document.querySelectorAll('dialog[open]').forEach(d=>d.close());go(18,117,1);for(let i=0;i<40&&!chapterData;i++)await new Promise(r=>setTimeout(r,250));const h=document.querySelector('#voice-until');h.value='capitulo';h.dispatchEvent(new Event('change'));await playVoice();await new Promise(r=>setTimeout(r,1500));return {hay:true,eventos:window.__lectura.slice(0,4)};`, 60000);
  adb('shell', 'input', 'keyevent', '3'); await espera(2500);
  let servicio = '', aviso = '';
  try { servicio = adb('shell', 'dumpsys', 'activity', 'services', PKG); } catch { /* sin datos */ }
  try { aviso = adb('shell', 'dumpsys', 'notification', '--noredact'); } catch { /* sin datos */ }
  const enSegundoPlano = { servicio: /LecturaVozService/.test(servicio), primerPlano: /isForeground=true/.test(servicio), notificacion: /Salmos 117/.test(aviso) };
  await espera(20000);
  adb('shell', 'am', 'start', '-n', PKG + '/.MainActivity'); await espera(2500);
  const lecturaVuelta = await app.evaluar(`return {eventos:window.__lectura||[],terminado:(window.__lectura||[]).some(e=>e.startsWith('terminado')),partes:(window.__lectura||[]).filter(e=>e.startsWith('parte')).length};`, 30000).catch(e => ({ error: e.message }));
  anotar(lecturaIda.hay && enSegundoPlano.servicio && enSegundoPlano.primerPlano && enSegundoPlano.notificacion && lecturaVuelta.terminado && lecturaVuelta.partes >= 2, 'entrega 2: la lectura sigue en segundo plano con controles y termina el capítulo', JSON.stringify({ ida: lecturaIda, enSegundoPlano, vuelta: { terminado: lecturaVuelta.terminado, partes: lecturaVuelta.partes, error: lecturaVuelta.error } }));
  // Edward (11-oct): la palabra tocada sigue elegida al pasar por Diccionario y al cambiar de diccionario.
  const palabra = await app.evaluar(`go(42,3,16);await new Promise(r=>setTimeout(r,900));const w=[...document.querySelectorAll('#verses [data-verse="16"] .reading-word')].find(e=>e.dataset.word==='mundo');w.dispatchEvent(new MouseEvent('click',{bubbles:true,clientY:300}));await new Promise(r=>setTimeout(r,900));document.querySelectorAll('dialog[open]').forEach(d=>d.close());document.querySelector('#movil-pestanas [data-vista=diccionario]').click();await new Promise(r=>setTimeout(r,900));const sel=document.querySelector('#dictionary-select');const otra=[...sel.options].find(o=>o.value&&o.value!==sel.value);if(otra){sel.value=otra.value;sel.dispatchEvent(new Event('change',{bubbles:true}));await new Promise(r=>setTimeout(r,1500));}for(let i=0;i<80&&document.querySelector('#dictionary-content').getAttribute('aria-busy')==='true';i++)await new Promise(r=>setTimeout(r,500));const q=document.querySelector('#dictionary-query').value;const texto=document.querySelector('#dictionary-content').textContent;document.querySelector('#movil-pestanas [data-vista=biblia]').click();await new Promise(r=>setTimeout(r,600));return {q,marcada:document.querySelector('.palabra-elegida')?.textContent||'',buscoDeNuevo:!/Consulta una palabra en esta fuente/.test(texto),cambio:!!otra,texto:texto.slice(0,80)};`);
  anotar(palabra.q === 'mundo' && palabra.marcada === 'mundo' && palabra.buscoDeNuevo, 'la palabra elegida sigue al cambiar de diccionario', JSON.stringify(palabra));
  // Lo mismo con una palabra que abre su original (RV1960 con Strong): el diccionario también la recibe.
  const conOriginal = await app.evaluar(`go(42,3,16);await new Promise(r=>setTimeout(r,900));const w=[...document.querySelectorAll('#verses [data-verse="16"] .reading-word')].find(e=>e.dataset.word==='mundo');const s=document.createElement('span');s.className='original-word';s.dataset.original='G2889';s.dataset.originalText='mundo';s.textContent='mundo';w.replaceWith(s);s.dispatchEvent(new MouseEvent('click',{bubbles:true,clientY:300}));await new Promise(r=>setTimeout(r,800));document.querySelectorAll('dialog[open]').forEach(d=>d.close());document.querySelector('#movil-pestanas [data-vista=diccionario]').click();await new Promise(r=>setTimeout(r,600));for(let i=0;i<80&&document.querySelector('#dictionary-content').getAttribute('aria-busy')==='true';i++)await new Promise(r=>setTimeout(r,500));const sel=document.querySelector('#dictionary-select');const otra=[...sel.options].find(o=>o.value&&o.value!==sel.value);if(otra){sel.value=otra.value;sel.dispatchEvent(new Event('change',{bubbles:true}));await new Promise(r=>setTimeout(r,800));for(let i=0;i<80&&document.querySelector('#dictionary-content').getAttribute('aria-busy')==='true';i++)await new Promise(r=>setTimeout(r,500));}const q=document.querySelector('#dictionary-query').value,texto=document.querySelector('#dictionary-content').textContent;document.querySelector('#movil-pestanas [data-vista=biblia]').click();await new Promise(r=>setTimeout(r,500));return {q,vacio:/Consulta una palabra en esta fuente/.test(texto),marcada:document.querySelector('.palabra-elegida')?.textContent||''};`);
  anotar(conOriginal.q === 'mundo' && !conOriginal.vacio && conOriginal.marcada === 'mundo', 'palabra con original (RV1960): el diccionario la recibe y no la pierde', JSON.stringify(conOriginal));
  anotar(paso3.fila.length === 0 && paso3.hoja.length >= 4 && paso3.ref === 'Juan 3:16-18' && /3 versículos/.test(paso3.cuenta) && paso3.enBarra.length === 0, 'paso 3: acciones del versículo y elegir varios (Juan 3:16-18)', JSON.stringify(paso3));
  const masIa = await app.evaluar(`document.querySelector('#movil-menu').click();await new Promise(r=>setTimeout(r,500));const items=[...document.querySelectorAll('#movil-mas .movil-mas-lista button')].filter(b=>!b.hidden).map(b=>b.textContent.trim());const ia=[...document.querySelectorAll('#movil-mas .movil-mas-lista button')].find(b=>/inteligencia artificial/i.test(b.textContent));ia&&ia.click();for(let i=0;i<30&&!document.querySelector('#ai-settings')?.open;i++)await new Promise(r=>setTimeout(r,500));const modo=document.querySelector('#ai-personal-mode');const chk=document.querySelector('#ai-personal-enabled');if(chk&&!chk.checked){chk.click();await new Promise(r=>setTimeout(r,800));}const sel=document.querySelector('#ai-provider');return {items,abierto:!!document.querySelector('#ai-settings')?.open,aviso:document.querySelector('#toast')?.textContent||'',modoPersonal:!!modo&&!modo.hidden,proveedores:sel?[...sel.options].map(o=>o.value):[]};`, 30000);
  captura('4d-ajustes-ia');
  await app.evaluar(`document.querySelector('#ai-settings-dialog')?.close?.();document.querySelectorAll('dialog[open]').forEach(d=>d.close());return true;`);
  anotar(masIa.items.some(t => /Imagen con versículos/.test(t)) && masIa.modoPersonal && JSON.stringify(masIa.proveedores) === JSON.stringify(['openrouter', 'gemini-api']), 'Más ofrece imágenes y la IA deja elegir OpenRouter o Gemini', JSON.stringify(masIa));
  // Estudiar con IA en el teléfono (letra grande): las seis acciones a la vista y una respuesta REAL de Gemini
  // (Pasajes paralelos de Juan 3:16, guardada en fixtures; solo RV1909 y OpenBible) dibujada en la hoja.
  const respuestaReal = fs.readFileSync(path.join(__dirname, 'fixtures', 'respuesta-paralelos-juan3-16.json'), 'utf8');
  const estudioIa = await app.evaluar(`go(42,3,16);await new Promise(r=>setTimeout(r,700));openAi();await new Promise(r=>setTimeout(r,900));const dentro=b=>{const r=b.getBoundingClientRect();return r.width>0&&r.left>=0&&r.right<=innerWidth;};const chips=[...document.querySelectorAll('#ai-acciones .ai-accion')];const r=${respuestaReal};const t=aiThread();t.messages.push(aiMessage('user','Pasajes paralelos de Juan 3:16'));t.messages.push(aiMessage('assistant',r.text,{...r,...StudyChatCore.result(r,false)}));renderAiThread();await new Promise(x=>setTimeout(x,500));document.querySelector('.ai-accion-respuesta')?.scrollIntoView({block:'start'});const fila=document.querySelector('#ai-acciones');const hilo=document.querySelector('#ai-thread').getBoundingClientRect();return {chips:chips.map(b=>b.textContent),fuera:dentro(fila)?[]:['fila de acciones'],deslizable:fila.scrollWidth>=fila.clientWidth,altoRespuesta:Math.round(hilo.height/innerHeight*100),partes:[...document.querySelectorAll('.ai-accion-respuesta h4')].map(h=>h.textContent),cuotaVisible:[...document.querySelectorAll('.movil-ia-cuota')].some(e=>!e.hidden&&e.offsetParent!==null)};`, 60000);
  captura('4e-ia-respuesta');
  anotar(estudioIa.chips.length === 6 && estudioIa.fuera.length === 0 && estudioIa.altoRespuesta >= 33 && estudioIa.partes.includes('Lo que dice el texto') && estudioIa.partes.includes('Interpretación'), 'Estudiar con IA: seis acciones a la vista y respuesta nueva', JSON.stringify({ fuera: estudioIa.fuera, altoRespuesta: estudioIa.altoRespuesta + '%', partes: estudioIa.partes, cuota: estudioIa.cuotaVisible }));
  await app.evaluar(`closeAi();return true;`);
  // Imagen con versículos en el teléfono: se abre, arma Salmos 23:1-2 y dibuja en tamaño historia.
  const imagen = await app.evaluar(`go(18,23,1);await new Promise(r=>setTimeout(r,800));window.BibliaImagen.abrir();await new Promise(r=>setTimeout(r,600));const h=document.querySelector('#imagen-hasta');h.value='2';h.dispatchEvent(new Event('change'));document.querySelector('#imagen-formato').value='historia';await window.BibliaImagen.dibujar();await new Promise(r=>setTimeout(r,800));const c=window.BibliaImagen._lienzo();return {ref:document.querySelector('#imagen-referencia').value,texto:document.querySelector('#imagen-texto').value.slice(0,40),w:c.width,h:c.height,compartir:typeof window.BibliaPlataforma.compartirImagen==='function'};`, 60000);
  captura('4b-imagen-versiculo');
  await app.evaluar(`document.querySelector('#imagen-cerrar').click();return true;`);
  anotar(imagen.ref === 'Salmos 23:1-2' && /JEHOVÁ/.test(imagen.texto) && imagen.w === 1080 && imagen.h === 1920 && imagen.compartir, 'imagen con versículos en el teléfono', JSON.stringify(imagen));
  // Música (auditoría 11-oct): el reproductor de YouTube va en SU origen, nunca en el de la app, así su script
  // no alcanza el llavero. Obligatorio: marco de otro origen. Que YouTube responda depende de la red del emulador.
  const musica = await app.evaluar(`await loadMusic('https://www.youtube.com/watch?v=M7lc1UVf-VE',{mini:false});const f=document.querySelector('#music-frame');for(let i=0;i<50&&!musicReady&&!document.querySelector('#music-panel').dataset.error;i++)await new Promise(r=>setTimeout(r,500));await new Promise(r=>setTimeout(r,1000));let cruzado;try{cruzado=f.contentDocument===null;}catch{cruzado=true;}const r={origen:new URL(f.src).origin,cruzado,listo:musicReady,estado:document.querySelector('#music-state').textContent,error:document.querySelector('#music-panel').dataset.error||''};closeMusic();return r;`, 60000);
  captura('4f-musica');
  anotar(musica.origen === 'https://www.youtube-nocookie.com' && musica.cruzado, 'música de YouTube en su propio origen (no alcanza el llavero)', JSON.stringify(musica));
  if (musica.listo) { informe.push('OK  YouTube respondió en el teléfono · ' + musica.estado); console.log(informe.at(-1)); }
  else { informe.push('AVISO YouTube no respondió en el emulador · ' + JSON.stringify(musica)); console.log(informe.at(-1)); }
  // Llavero seguro: la clave de IA se guarda cifrada con el Android Keystore y debe sobrevivir a actualizar.
  const llavero = await app.evaluar(`const d=await window.BibliaLlavero.disponible();await window.BibliaLlavero.guardar('gemini','clave-de-prueba-123');const v=await window.BibliaLlavero.leer('gemini');await window.BibliaLlavero.borrar('gemini');return {d,v,borrada:(await window.BibliaLlavero.leer('gemini'))===null};`);
  anotar(llavero.d === true && llavero.v === 'clave-de-prueba-123' && llavero.borrada, 'llavero seguro guarda, lee y borra', JSON.stringify({ disponible: llavero.d, coincide: llavero.v === 'clave-de-prueba-123', borrada: llavero.borrada }));
  // Gemini personal: la clave queda en el llavero y OpenRouter declara almacenamiento seguro del dispositivo.
  const ia = await app.evaluar(`const s=await window.libraryDesktop.aiStatus();await window.libraryDesktop.aiPersonalEnable(true);await window.libraryDesktop.aiGeminiKey('AQ.Ab8RN6'+'A'.repeat(44));const caps=await window.libraryDesktop.getCapabilities();return {almacen:s.credentialStorage,imagen:!!caps.operations.aiImage?.available};`, 60000);
  anotar(ia.almacen === 'device-secure' && ia.imagen, 'IA con llavero (OpenRouter y Gemini) y fondo con IA disponible', JSON.stringify(ia));
  // 7. Actualizar encima (como hará Edward con cada versión nueva): misma firma → los datos se quedan.
  try { app.cerrar(); } catch { /* ya cerrada */ }
  adb('install', '-r', apk);
  adb('shell', 'am', 'start', '-n', PKG + '/.MainActivity');
  // En el emulador, a veces se caen los servicios de Google y Android cierra la app con ellos («depends on provider
  // com.google.android.gms … in dying proc»), o la app reinstalada tarda en abrir su WebView. Eso no es un fallo
  // de la app: se reabre UNA vez y queda anotado.
  try { app = await conectar(); app = await esperarLista(app, '5-tras-actualizar'); }
  catch (e) {
    let gms = ''; try { gms = adb('logcat', '-d', '-s', 'ActivityManager:I'); } catch { /* sin registro */ }
    const tropiezo = /bibliotecabiblica.*depends on provider com\.google\.android\.gms/.test(gms) || /no arrancó|no expone depuración|no abrió la depuración/.test(e.message);
    if (!tropiezo) throw e;
    if (/^FALLÓ arranque 5-tras-actualizar/.test(informe[informe.length - 1] || '')) informe.pop();
    informe.push('AVISO el emulador cerró o demoró la app al actualizar (' + e.message.slice(0, 60) + '); se reabrió una vez');
    console.log(informe[informe.length - 1]);
    try { app.cerrar(); } catch { /* ya cerrada */ }
    adb('shell', 'am', 'start', '-n', PKG + '/.MainActivity');
    app = await conectar();
    app = await esperarLista(app, '5-tras-actualizar-reabierta');
  }
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
  // Letra al 200 % (Android 14 permite hasta 2,0): la barra y el buscador siguen dentro de la pantalla.
  adb('shell', 'settings', 'put', 'system', 'font_scale', '2.0');
  adb('shell', 'am', 'force-stop', PKG);
  adb('shell', 'am', 'start', '-n', PKG + '/.MainActivity');
  try { app.cerrar(); } catch { /* ya cerrada */ }
  try { app = await conectar(); app = await esperarLista(app, '7-letra-200'); }
  catch (e) {
    if (!/no arrancó|no expone depuración|no abrió la depuración/.test(e.message)) throw e;
    if (/^FALLÓ arranque 7-letra-200/.test(informe[informe.length - 1] || '')) informe.pop();
    informe.push('AVISO el emulador demoró la app con letra al 200 %; se reabrió una vez'); console.log(informe[informe.length - 1]);
    adb('shell', 'am', 'start', '-n', PKG + '/.MainActivity');
    app = await conectar(); app = await esperarLista(app, '7-letra-200-reabierta');
  }
  const grande = await app.evaluar(`go(42,3,16);await new Promise(r=>setTimeout(r,900));${MEDIR}const barra=document.querySelector('#movil-barra');const enBarra=medir(barra);document.querySelector('#movil-buscar').click();await new Promise(r=>setTimeout(r,600));const q=document.querySelector('#buscador-campo');q.value='rey';q.dispatchEvent(new Event('input'));await new Promise(r=>setTimeout(r,400));const d=document.querySelector('#buscador');const enBuscador=medir(d).filter(c=>c.h<47||c.fuera||c.corta);const enPestanas=medir(document.querySelector('#movil-pestanas')).filter(c=>c.h<47||c.corta);const enHerr=medir(document.querySelector('#library-controls')).filter(c=>c.h<47||c.fuera||c.corta);const fp=document.querySelector('#movil-pestanas');const pestanas200={filas:fp.dataset.filas,cortadas:[...fp.querySelectorAll('button')].filter(b=>{const s=b.querySelector('span');return !s||s.scrollWidth>s.clientWidth+1||b.getBoundingClientRect().right>innerWidth+1;}).map(b=>b.dataset.vista)};return {pestanas200,enHerr,enPestanas,escala:devicePixelRatio,alto:Math.round(barra.getBoundingClientRect().height),malosBarra:enBarra.filter(c=>c.h<47||c.fuera||c.corta),enBuscador,horizontal:document.documentElement.scrollWidth<=innerWidth+1};`);
  captura('7b-buscador-letra-200');
  await app.evaluar(`document.querySelector('#buscador').close();return true;`);
  const hoy200 = await app.evaluar(`document.querySelector('#movil-pestanas [data-vista=hoy]').click();await new Promise(r=>setTimeout(r,1200));const fuera=[...document.querySelectorAll('#hoy-view *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.right>innerWidth+1||r.left<-1);}).map(e=>(e.className||e.tagName)+'').slice(0,5);return {vista:document.documentElement.dataset.vistaMovil,fuera,ancho:document.documentElement.scrollWidth,innerWidth};`);
  captura('7c-hoy-letra-200');
  // Edward (12-oct): con letra grande, la barra «1 versículo» encimaba Copiar, Compartir e Imagen.
  const seleccion200 = await app.evaluar(`document.querySelector('#movil-pestanas [data-vista=biblia]').click();go(18,107,1);await new Promise(r=>setTimeout(r,800));const b=document.querySelector('#movil-seleccion');document.documentElement.dataset.seleccion='varios';b.hidden=false;await new Promise(r=>setTimeout(r,400));const cajas=[...b.querySelectorAll('button')].map(x=>x.getBoundingClientRect());let choques=0;for(let i=0;i<cajas.length;i++)for(let j=i+1;j<cajas.length;j++){const a=cajas[i],c=cajas[j];if(a.left<c.right-1&&a.right>c.left+1&&a.top<c.bottom-1&&a.bottom>c.top+1)choques++;}const cortados=[...b.querySelectorAll('button span')].filter(x=>x.scrollWidth>x.clientWidth+1).length;const fuera=cajas.filter(c=>c.right>innerWidth+1||c.left<-1).length;const sel=getComputedStyle(document.querySelector('#verses .verse')).userSelect;b.hidden=true;delete document.documentElement.dataset.seleccion;return {choques,cortados,fuera,sel};`);
  captura('7d-seleccion-letra-200');
  adb('shell', 'settings', 'put', 'system', 'font_scale', '1.3');
  anotar(grande.malosBarra.length === 0 && grande.enBuscador.length === 0 && grande.enPestanas.length === 0 && grande.enHerr.length === 0 && grande.horizontal, 'paso 1 con letra al 200 %: nada se sale ni se corta', JSON.stringify(grande));
  anotar(grande.pestanas200.cortadas.length === 0, 'entrega 1 con letra al 200 %: los nombres de las pestañas se siguen viendo', JSON.stringify(grande.pestanas200));
  anotar(seleccion200.choques === 0 && seleccion200.cortados === 0 && seleccion200.fuera === 0 && seleccion200.sel === 'none', 'letra al 200 %: la barra de versículos elegidos no se encima y no sale el menú de texto de Android', JSON.stringify(seleccion200));
  anotar(hoy200.vista === 'hoy-view' && hoy200.fuera.length === 0 && hoy200.ancho <= hoy200.innerWidth + 1, 'entrega 2B: «Hoy» con letra al 200 % sin salirse', JSON.stringify(hoy200));
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
