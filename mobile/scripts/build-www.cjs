'use strict';
// Arma mobile/www desde app/ (código común) + platform/ (adaptadores) + mobile/web (capa móvil).
// Nunca copia módulos personales: la auditoría falla si aparece cualquier archivo prohibido.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const repo = path.resolve(__dirname, '..', '..');
const mobile = path.join(repo, 'mobile');
const out = path.join(mobile, 'www');
// Edición: «completa» (Edward y Laura) o «tienda» (Google Play, CONSENSO-PLAY.md): sin IA, foro, música,
// traspaso ni importar módulos; solo textos libres.
// «web»: la misma app en el navegador para quien tenga iPhone (Edward, 11-oct): textos libres, instalable (PWA).
const EDICION = ['tienda', 'web'].includes(process.env.BIBLIA_EDICION) ? process.env.BIBLIA_EDICION : 'completa';
const LIBRES_TIENDA = new Set(['onbv2008', 'ubs-griego', 'ubs-hebreo', 'step-greek', 'step-hebrew']); // UBS en español: CC BY-SA 4.0
const PROHIBIDAS = /\.(bblx|cmtx|dctx|bbli|cmti|dcti|topx|mybible|sqlite|sqlite3|db)$/i;
const CARPETAS_PROHIBIDAS = new Set(['modulos', 'personal', 'paquete-personal', 'respaldos']);
// app/music/ es el reproductor intermedio del escritorio; en el teléfono YouTube va directo en su origen (auditoría 11-oct).
const SOLO_ESCRITORIO = new Set([path.join('app', 'music')]);

function copiar(origen, destino) {
  const st = fs.statSync(origen);
  if (st.isDirectory()) {
    if (CARPETAS_PROHIBIDAS.has(path.basename(origen).toLowerCase())) return;
    if (SOLO_ESCRITORIO.has(path.relative(repo, origen))) return;
    fs.mkdirSync(destino, { recursive: true });
    for (const nombre of fs.readdirSync(origen)) copiar(path.join(origen, nombre), path.join(destino, nombre));
  } else if (!PROHIBIDAS.test(origen)) {
    fs.copyFileSync(origen, destino);
  }
}

fs.rmSync(out, { recursive: true, force: true });
copiar(path.join(repo, 'app'), out);
for (const capa of ['shared', 'platform']) {
  const origen = path.join(repo, capa);
  if (fs.existsSync(origen)) copiar(origen, path.join(out, capa));
}
copiar(path.join(mobile, 'web'), path.join(out, 'mobile'));

// Android (AGP) DESCOMPRIME los assets .gz al empaquetar y les quita la extensión: «x.json.gz» llega
// como «x.json» y la app no lo encuentra (ni coincide su huella). Se guardan como «.gz.bin», que nadie
// toca, y arranque.js reescribe esas peticiones. Los bytes y las huellas son exactamente los mismos.
const renombrados = [];
(function renombrarGz(dir) {
  for (const n of fs.readdirSync(dir)) {
    const p = path.join(dir, n);
    if (fs.statSync(p).isDirectory()) renombrarGz(p);
    else if (n.endsWith('.gz')) { fs.renameSync(p, p + '.bin'); renombrados.push(path.relative(out, p).split(path.sep).join('/')); }
  }
})(out);

// index.html: capa móvil antes de los scripts de la app y CSP del teléfono.
const indexPath = path.join(out, 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');
// Orden: Biblia → contrato → shared → adaptadores → integraciones móviles → controladores de app/.
// Si Codex publica platform/scripts-movil.json, ese orden manda.
const ordenCodex = path.join(out, 'platform', 'scripts-movil.json');
const puentes = fs.existsSync(ordenCodex)
  ? JSON.parse(fs.readFileSync(ordenCodex, 'utf8')).filter(f => fs.existsSync(path.join(out, f)))
  : ['platform/bridge-contract.js', 'shared/references.js', 'shared/personal-model.js',
     'platform/web/personal-store.js', 'platform/web/library.js', 'platform/web/bridge.js', 'platform/android/bridge.js']
      .filter(f => fs.existsSync(path.join(out, f)));
// Núcleos puros de app/ que el modelo personal necesita al crearse: se adelantan (y se quita
// su etiqueta original para no cargarlos dos veces).
const nucleos = ['prayer-core.js', 'guide-core.js', 'study-chat-core.js'];
html=html.replace('<script defer src="../shared/study-model.js"></script>','');
for (const n of nucleos) html = html.replace(`<script defer src="${n}"></script>`, '');
// Manifiesto público de RV1909 (permiso de IA y atribución) embebido: el adaptador se crea sin esperar red.
const manifiestoRv = path.join(out, 'data', 'rv1909-manifest.json');
if (fs.existsSync(manifiestoRv)) {
  fs.writeFileSync(path.join(out, 'mobile', 'manifiestos.js'),
    "'use strict';\nwindow.BibliaManifiestos = Object.freeze({ rv1909: " + JSON.stringify(JSON.parse(fs.readFileSync(manifiestoRv, 'utf8'))) + ' });\n');
}
// Capacitor sin empaquetador: el puente nativo de Android define window.Capacitor, pero registerPlugin
// lo aporta @capacitor/core (dist/capacitor.js). Sin él, ningún plugin (SQLite, archivos, voz…) responde.
const capacitorCore = path.join(mobile, 'node_modules', '@capacitor', 'core', 'dist', 'capacitor.js');
if (!fs.existsSync(capacitorCore)) throw new Error('Falta @capacitor/core/dist/capacitor.js: ejecuta npm ci en mobile/.');
fs.copyFileSync(capacitorCore, path.join(out, 'mobile', 'capacitor.js'));
fs.writeFileSync(path.join(out, 'mobile', 'edicion.js'), `'use strict';\nwindow.BIBLIA_EDICION = ${JSON.stringify(EDICION)};\n`);
html = html.replace('<html', `<html data-edicion="${EDICION}"`);
const scriptsMovil = [...nucleos, ...puentes, 'mobile/manifiestos.js', 'mobile/edicion.js', 'mobile/plataforma.js', 'mobile/arranque.js', 'mobile/iconos.js', 'mobile/movil.js']
  .filter(f => fs.existsSync(path.join(out, f)))
  .map(f => `<script defer src="${f}"></script>`).join('\n  ');
const ancla = '<script defer src="bible-data.js"></script>';
if (!html.includes(ancla)) throw new Error('index.html sin bible-data.js');
html = html.replace(ancla, ancla + '\n  ' + scriptsMovil);
// capacitor.js va primero de todo (antes incluso de la Biblia).
const primerScript = html.indexOf('<script');
html = html.slice(0, primerScript) + '<script defer src="mobile/capacitor.js"></script>\n  ' + html.slice(primerScript);
html = html.replace('</head>', '  <link rel="stylesheet" href="mobile/movil.css">\n</head>');
html = html.replace(/<meta name="viewport"[^>]*>/, '');
html = html.replace('<head>', '<head>\n  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">');
// IA integrada: el origen del Worker (app/ia-config.js, lo escribe scripts/configurar-ia.cjs) entra en connect-src.
const urlIA = (fs.readFileSync(path.join(repo, 'app', 'ia-config.js'), 'utf8').match(/window\.BIBLIA_IA_URL = '([^']*)'/) || [])[1] || '';
// Tienda (Google Play): solo el servidor de la IA integrada. Sin IA personal (OpenRouter/Gemini) ni YouTube, que no
// van en esa edición: así lo declarado en «Seguridad de datos» queda garantizado por la propia app.
const TIENDA = EDICION === 'tienda';
html = html.replace(/<meta http-equiv="Content-Security-Policy" content="[^"]*">/,
  '<meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\'; style-src \'self\'; ' +
  'img-src \'self\' data: blob:' + (TIENDA ? '' : ' https://i.ytimg.com') + '; media-src \'self\' blob:; worker-src \'self\' blob:; ' +
  'connect-src \'self\'' + (TIENDA ? '' : ' https://openrouter.ai https://generativelanguage.googleapis.com https://www.googleapis.com') + (urlIA ? ' ' + urlIA : '') + '; ' +
  'frame-src ' + (TIENDA ? '\'none\'' : 'https://www.youtube-nocookie.com') + '; object-src \'none\'; base-uri \'none\'; form-action \'none\'">');
html = html.replace('<html', '<html data-plataforma="movil"');
// Comprobación de arranque: capacitor.js antes que plataforma.js y arranque.js (o el APK no ve los plugins).
{
  const orden = [...html.matchAll(/<script defer src="([^"]+)"/g)].map(m => m[1]);
  const iCap = orden.indexOf('mobile/capacitor.js'), iPlat = orden.indexOf('mobile/plataforma.js'), iArr = orden.indexOf('mobile/arranque.js');
  if (iCap !== 0 || iPlat < 0 || iArr < 0 || iCap > iPlat || iCap > iArr) throw new Error('Orden de scripts inválido: capacitor.js debe ir primero.');
}
fs.writeFileSync(indexPath, html);

// Auditoría: nada privado dentro de www.
const encontrados = [];
let total = 0, bytes = 0;
(function recorrer(dir) {
  for (const nombre of fs.readdirSync(dir)) {
    const p = path.join(dir, nombre);
    const st = fs.statSync(p);
    if (st.isDirectory()) { if (CARPETAS_PROHIBIDAS.has(nombre.toLowerCase())) encontrados.push(p); recorrer(p); }
    else { total++; bytes += st.size; if (PROHIBIDAS.test(nombre)) encontrados.push(p); }
  }
})(out);
const libre = JSON.parse(fs.readFileSync(path.join(out, 'data', 'free-package', 'manifest.json'), 'utf8'));
const auditoria = {
  fecha: new Date().toISOString(),
  archivos: total,
  megabytes: +(bytes / 1048576).toFixed(1),
  prohibidos: encontrados.map(p => path.relative(out, p)),
  edicion: EDICION,
  modulosLibres: (libre.modules || libre.modulos || []).map(m => m.id),
  puentes,
  huellaIndex: crypto.createHash('sha256').update(html).digest('hex').slice(0, 16)
};
fs.writeFileSync(path.join(mobile, 'www-auditoria.json'), JSON.stringify(auditoria, null, 2));
if (encontrados.length) { console.error('PROHIBIDOS en www:', auditoria.prohibidos); process.exit(1); }
if (EDICION === 'tienda' || EDICION === 'web') {
  const ajenos = auditoria.modulosLibres.filter(id => !LIBRES_TIENDA.has(id));
  if (ajenos.length) { console.error('La edición tienda solo admite textos libres verificados; sobran:', ajenos); process.exit(1); }
}
if (EDICION === 'web') {
  const iconos = path.join(mobile, 'web', 'iconos');
  for (const f of ['icono-192.png', 'icono-512.png', 'icono-180.png']) if (fs.existsSync(path.join(iconos, f))) fs.copyFileSync(path.join(iconos, f), path.join(out, f));
  fs.writeFileSync(path.join(out, 'manifest.webmanifest'), JSON.stringify({
    name: 'Biblioteca Bíblica', short_name: 'Biblioteca', lang: 'es', start_url: './', scope: './', display: 'standalone',
    background_color: '#f6f1e7', theme_color: '#30392f', description: 'Biblia de estudio en español: lectura sin conexión, referencias, Strong y notas.',
    icons: [{ src: 'icono-192.png', sizes: '192x192', type: 'image/png' }, { src: 'icono-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }]
  }, null, 2));
  fs.writeFileSync(path.join(out, 'mobile', 'pwa.js'), `'use strict';
// Registro del service worker (solo edición web) y pedido de almacenamiento persistente (Safari puede borrar datos).
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
`);
  // Lista de lo que se guarda para leer sin conexión (todo menos el propio service worker).
  const lista = [];
  (function recorrer(dir) { for (const n of fs.readdirSync(dir)) { const p = path.join(dir, n); if (fs.statSync(p).isDirectory()) recorrer(p); else lista.push(path.relative(out, p).split(path.sep).join('/')); } })(out);
  const suma = crypto.createHash('sha256');
  for (const f of lista) suma.update(f + ' ').update(fs.readFileSync(path.join(out, f)));
  const version = suma.digest('hex').slice(0, 12); // cambia con cualquier archivo: el iPhone baja la nueva
  fs.writeFileSync(path.join(out, 'sw.js'), `'use strict';
// Biblioteca Bíblica · web: guarda la app para leer sin conexión. Versión ${version}: al cambiar, se descarga la nueva y se borra la vieja.
const CACHE = 'biblioteca-${version}';
const ARCHIVOS = ${JSON.stringify(['./', ...lista.filter(f => f !== 'sw.js')])};
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('biblioteca-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return; // Supabase, IA y YouTube van directo a la red.
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request)));
});
`);
  let w = fs.readFileSync(indexPath, 'utf8');
  w = w.replace('</head>', '  <link rel="manifest" href="manifest.webmanifest">\n  <link rel="apple-touch-icon" href="icono-180.png">\n  <meta name="theme-color" content="#30392f">\n  <meta name="apple-mobile-web-app-capable" content="yes">\n  <meta name="apple-mobile-web-app-title" content="Biblioteca">\n  <script defer src="mobile/pwa.js"></script>\n</head>');
  fs.writeFileSync(indexPath, w);
  console.log(`edición web: manifiesto, íconos y service worker con ${lista.length} archivos (versión ${version})`);
}
console.log(`www listo (${EDICION}): ${total} archivos, ${auditoria.megabytes} MB, prohibidos 0, puentes: ${puentes.join(', ') || 'ninguno todavía'}`);
