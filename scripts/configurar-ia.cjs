'use strict';
// Activa (o apaga) la IA integrada en todas las ediciones: escribe la dirección del Worker en app/ia-config.js
// y agrega su origen a connect-src de la CSP de app/index.html. Sin dirección, la deja apagada.
// Uso: node scripts/configurar-ia.cjs https://biblia-ia.<cuenta>.workers.dev   |   node scripts/configurar-ia.cjs ""
const fs = require('node:fs'), path = require('node:path');
const raiz = path.join(__dirname, '..');
const url = (process.argv[2] || '').trim().replace(/\/$/, '');
if (url && !/^https:\/\/[a-z0-9.-]+(?::\d+)?$|^http:\/\/(127\.0\.0\.1|localhost):\d+$/i.test(url)) { console.error('Dirección no válida: debe ser https://dominio (o http://127.0.0.1:puerto para pruebas).'); process.exit(1); }
const config = path.join(raiz, 'app', 'ia-config.js');
fs.writeFileSync(config, fs.readFileSync(config, 'utf8').replace(/window\.BIBLIA_IA_URL = '[^']*';/, `window.BIBLIA_IA_URL = '${url}';`));
const html = path.join(raiz, 'app', 'index.html');
let s = fs.readFileSync(html, 'utf8');
s = s.replace(/ connect-src [^;"]*;/, '');
if (url) s = s.replace("default-src 'self';", `default-src 'self'; connect-src 'self' ${url};`);
fs.writeFileSync(html, s);
console.log(url ? 'IA integrada activa: ' + url : 'IA integrada apagada.');
