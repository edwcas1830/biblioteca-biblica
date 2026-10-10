'use strict';
// Arma mobile/www desde app/ (código común) + platform/ (adaptadores) + mobile/web (capa móvil).
// Nunca copia módulos personales: la auditoría falla si aparece cualquier archivo prohibido.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const repo = path.resolve(__dirname, '..', '..');
const mobile = path.join(repo, 'mobile');
const out = path.join(mobile, 'www');
const PROHIBIDAS = /\.(bblx|cmtx|dctx|bbli|cmti|dcti|topx|mybible|sqlite|sqlite3|db)$/i;
const CARPETAS_PROHIBIDAS = new Set(['modulos', 'personal', 'paquete-personal', 'respaldos']);

function copiar(origen, destino) {
  const st = fs.statSync(origen);
  if (st.isDirectory()) {
    if (CARPETAS_PROHIBIDAS.has(path.basename(origen).toLowerCase())) return;
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
const scriptsMovil = [...puentes, 'mobile/plataforma.js', 'mobile/arranque.js', 'mobile/movil.js']
  .filter(f => fs.existsSync(path.join(out, f)))
  .map(f => `<script defer src="${f}"></script>`).join('\n  ');
const ancla = '<script defer src="bible-data.js"></script>';
if (!html.includes(ancla)) throw new Error('index.html sin bible-data.js');
html = html.replace(ancla, ancla + '\n  ' + scriptsMovil);
html = html.replace('</head>', '  <link rel="stylesheet" href="mobile/movil.css">\n</head>');
html = html.replace(/<meta name="viewport"[^>]*>/, '');
html = html.replace('<head>', '<head>\n  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">');
html = html.replace(/<meta http-equiv="Content-Security-Policy" content="[^"]*">/,
  '<meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\'; style-src \'self\'; ' +
  'img-src \'self\' data: blob: https://i.ytimg.com; media-src \'self\' blob:; worker-src \'self\' blob:; ' +
  'connect-src \'self\' https://openrouter.ai https://generativelanguage.googleapis.com https://www.googleapis.com; ' +
  'frame-src https://www.youtube-nocookie.com https://www.youtube.com; object-src \'none\'; base-uri \'none\'; form-action \'none\'">');
html = html.replace('<html', '<html data-plataforma="movil"');
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
  modulosLibres: (libre.modules || libre.modulos || []).map(m => m.id),
  puentes,
  huellaIndex: crypto.createHash('sha256').update(html).digest('hex').slice(0, 16)
};
fs.writeFileSync(path.join(mobile, 'www-auditoria.json'), JSON.stringify(auditoria, null, 2));
if (encontrados.length) { console.error('PROHIBIDOS en www:', auditoria.prohibidos); process.exit(1); }
console.log(`www listo: ${total} archivos, ${auditoria.megabytes} MB, prohibidos 0, puentes: ${puentes.join(', ') || 'ninguno todavía'}`);
