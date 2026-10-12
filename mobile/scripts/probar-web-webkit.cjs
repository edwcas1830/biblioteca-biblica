'use strict';
// Edición web en WebKit (el motor de Safari) con tamaño de iPhone: arranque, CSP sin violaciones,
// manifiesto y cifrado del chat cruzado WebKit ↔ Node (sobres y envolturas que abre el otro lado).
// Requiere `BIBLIA_EDICION=web node scripts/build-www.cjs` antes y playwright con webkit instalado.
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const { webkit, devices } = require('playwright');
const C = require('../../shared/chat-cripto.js');

const www = path.join(__dirname, '..', 'www');
const cripto = fs.readFileSync(path.join(__dirname, '..', '..', 'shared', 'chat-cripto.js'), 'utf8');
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ttf': 'font/ttf' };
const fallas = [];
const exigir = (ok, msg) => { console.log((ok ? 'OK    ' : 'FALLA ') + msg); if (!ok) fallas.push(msg); };

const servidor = http.createServer((req, res) => {
  const ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let f = path.normalize(path.join(www, ruta === '/' ? 'index.html' : ruta));
  if (!f.startsWith(www) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TIPOS[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

(async () => {
  exigir(fs.existsSync(path.join(www, 'sw.js')) && fs.existsSync(path.join(www, 'manifest.webmanifest')), 'www es la edición web (sw.js y manifiesto)');
  await new Promise(r => servidor.listen(0, '127.0.0.1', r));
  const base = `http://localhost:${servidor.address().port}/`;
  const navegador = await webkit.launch();
  try {
    // 1) La app tal cual: tamaño iPhone, CSP de verdad.
    const ctx = await navegador.newContext({ ...devices['iPhone 13'] });
    const page = await ctx.newPage();
    const errores = [];
    page.on('pageerror', e => errores.push(String(e.message || e)));
    page.on('console', m => { if (m.type() === 'error') errores.push(m.text()); });
    await page.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI + ' @ ' + (e.sourceFile || '').split('/').pop() + ':' + e.lineNumber + ' «' + (e.sample || '').slice(0, 60) + '»')); });
    await page.goto(base);
    // waitForFunction evalúa texto en la página y la CSP (sin 'unsafe-eval') lo bloquea en WebKit: se consulta en bucle.
    for (let i = 0; ; i++) {
      if (await page.evaluate(() => (document.querySelector('#verses')?.innerText || '').length > 200)) break;
      if (i > 120) {
        fs.mkdirSync('prueba-webkit', { recursive: true });
        await page.screenshot({ path: 'prueba-webkit/sin-biblia.png' }).catch(() => {});
        const d = await page.evaluate(() => ({ csp: window.__csp, texto: document.body.innerText.slice(0, 600), verses: !!document.querySelector('#verses') })).catch(e => ({ fallo: String(e) }));
        console.error('Errores:', errores.slice(0, 15));
        console.error('Página:', JSON.stringify(d, null, 1));
        throw new Error('La Biblia no apareció en 60 s');
      }
      await page.waitForTimeout(500);
    }
    const info = await page.evaluate(() => ({
      edicion: window.BIBLIA_EDICION,
      manifiesto: !!document.querySelector('link[rel=manifest]'),
      apple: !!document.querySelector('link[rel=apple-touch-icon]'),
      pestanas: document.querySelectorAll('#movil-pestanas button').length,
      ancho: document.documentElement.scrollWidth, vista: innerWidth,
      csp: window.__csp, subtle: !!(crypto && crypto.subtle)
    }));
    exigir(info.edicion === 'web', 'edición web cargada en WebKit');
    exigir(info.manifiesto && info.apple, 'manifiesto e ícono de iPhone enlazados');
    exigir(info.pestanas === 6, 'seis pestañas abajo (' + info.pestanas + ')');
    exigir(info.ancho <= info.vista, `sin scroll horizontal (${info.ancho} ≤ ${info.vista})`);
    exigir(info.subtle, 'WebCrypto disponible');
    exigir(info.csp.length === 0, 'CSP sin violaciones' + (info.csp.length ? ': ' + info.csp.slice(0, 3).join(' | ') : ''));
    exigir(errores.length === 0, 'sin errores en consola' + (errores.length ? ': ' + errores.slice(0, 3).join(' | ') : ''));
    // Entrega 2B: la bienvenida aparece en el iPhone y «Saltar» lleva a «Hoy» con el versículo del día y sus 4 pasos.
    let hoy = null;
    for (let i = 0; i < 60 && !(hoy && hoy.vista === 'hoy-view' && hoy.texto.length > 20); i++) {
      hoy = await page.evaluate(() => { const d = document.querySelector('#hoy-bienvenida[open]'); const b = d && [...d.querySelectorAll('button')].find(x => x.textContent.trim() === 'Saltar'); if (b) b.click(); return { vista: document.documentElement.dataset.vistaMovil, texto: document.querySelector('#hoy-vers-texto')?.textContent || '', pasos: document.querySelectorAll('.hoy-paso').length, ancho: document.documentElement.scrollWidth, vistaAncho: innerWidth, vioBienvenida: !!d }; });
      await page.waitForTimeout(500);
    }
    fs.mkdirSync('prueba-webkit', { recursive: true });
    await page.screenshot({ path: 'prueba-webkit/hoy.png' }).catch(() => {});
    exigir(hoy && hoy.vista === 'hoy-view' && hoy.texto.length > 20 && hoy.pasos === 4 && hoy.ancho <= hoy.vistaAncho, '«Hoy» en el iPhone con el versículo del día y 4 pasos (' + JSON.stringify(hoy).slice(0, 160) + ')');
    exigir(errores.length === 0, 'sin errores en consola tras «Hoy»' + (errores.length ? ': ' + errores.slice(0, 3).join(' | ') : ''));
    const manifiesto = await (await page.request.get(base + 'manifest.webmanifest')).json();
    exigir(manifiesto.display === 'standalone' && manifiesto.icons.length === 2, 'manifiesto instalable');
    await ctx.close();

    // 2) Cifrado cruzado: mismo origen (contexto seguro), CSP desactivada solo para inyectar el núcleo.
    const ctx2 = await navegador.newContext({ bypassCSP: true });
    const p2 = await ctx2.newPage();
    await p2.goto(base + 'manifest.webmanifest');
    await p2.addScriptTag({ content: cripto });
    const disp = async id => { const k = await C.nuevasClaves(); return { id, firma: k.publicas.firma, acuerdo: k.publicas.acuerdo, privadaFirma: k.privadas.firma, privadaAcuerdo: k.privadas.acuerdo }; };
    const edward = await disp('d-edward-node');
    const clave = C.nuevaClaveGrupo();
    const desdeNode = {};
    // Laura (WebKit) crea sus claves; Node envuelve para ella y sella un mensaje; WebKit abre todo y responde.
    const laura = await p2.evaluate(async () => { const C = window.BibliaChatCripto, k = await C.nuevasClaves(); window.__yo = { id: 'd-laura-webkit', firma: k.publicas.firma, acuerdo: k.publicas.acuerdo, privadaFirma: k.privadas.firma, privadaAcuerdo: k.privadas.acuerdo }; return { id: window.__yo.id, firma: k.publicas.firma, acuerdo: k.publicas.acuerdo }; });
    desdeNode.env = await C.envolver({ claveGrupo: clave, grupo: 'g1', epoca: 1, para: laura, de: edward });
    desdeNode.sobre = await C.sellar({ contenido: { t: 'Hola Laura · Salmo 23' }, claveGrupo: clave, g: 'g1', e: 1, h: 'h1', id: 'm1', d: edward.id, privadaFirma: edward.privadaFirma });
    const huellaNode = await C.huellaPar(edward, laura);
    const r = await p2.evaluate(async ({ env, sobre, edward }) => {
      const C = window.BibliaChatCripto, yo = window.__yo;
      const clave = await C.desenvolver({ envoltura: env, grupo: 'g1', epoca: 1, yo, de: edward });
      const msg = await C.abrir({ sobre, fila: { grupo_id: 'g1', epoca: 1, hilo_id: 'h1', id: 'm1', dispositivo_id: edward.id }, claveGrupo: clave, firmaAutor: edward.firma });
      const respuesta = await C.sellar({ contenido: { t: 'Recibido · Juan 3:16' }, claveGrupo: clave, g: 'g1', e: 1, h: 'h1', id: 'm2', d: yo.id, privadaFirma: yo.privadaFirma });
      const vuelta = await C.envolver({ claveGrupo: clave, grupo: 'g1', epoca: 1, para: edward, de: yo });
      return { clave, msg, respuesta, vuelta, huella: await C.huellaPar(edward, yo) };
    }, { env: desdeNode.env, sobre: desdeNode.sobre, edward: { id: edward.id, firma: edward.firma, acuerdo: edward.acuerdo } });
    exigir(r.clave === clave, 'WebKit desenvuelve la clave que envolvió Node');
    exigir(r.msg.t === 'Hola Laura · Salmo 23', 'WebKit abre el sobre sellado en Node (firma ECDSA de Node verificada en WebKit)');
    exigir(r.huella === huellaNode, 'misma huella de 20 dígitos en los dos lados');
    const vuelta = await C.abrir({ sobre: r.respuesta, fila: { grupo_id: 'g1', epoca: 1, hilo_id: 'h1', id: 'm2', dispositivo_id: laura.id }, claveGrupo: clave, firmaAutor: laura.firma });
    exigir(vuelta.t === 'Recibido · Juan 3:16', 'Node abre el sobre sellado en WebKit (firma ECDSA de WebKit verificada en Node)');
    exigir(await C.desenvolver({ envoltura: r.vuelta, grupo: 'g1', epoca: 1, yo: edward, de: laura }) === clave, 'Node desenvuelve lo que envolvió WebKit');
    await ctx2.close();
  } finally {
    await navegador.close();
    servidor.close();
  }
  if (fallas.length) { console.error(`\n${fallas.length} falla(s) en WebKit`); process.exit(1); }
  console.log('\nWebKit: todo bien');
})().catch(e => { console.error(e); process.exit(1); });
