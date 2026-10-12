// Prueba de calidad a ciegas: corre las 40 preguntas con cada modelo candidato contra el Worker ya creado
// (ruta /v1/prueba, exige TOKEN_ADMIN) y guarda las respuestas mezcladas para que Edward las juzgue sin saber
// qué modelo escribió cada una. Los pasajes se arman igual que en la app (temas + RV1909).
// Uso: TOKEN_ADMIN=... node servidor/ia/calidad/correr.mjs https://biblia-ia.<cuenta>.workers.dev
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const H = require('../../../app/hoy-core.js'), T = require('../../../app/temas-core.js');
globalThis.window = {}; require('../../../app/bible-data.js'); const B = globalThis.window.BIBLE.books;

const url = (process.argv[2] || '').replace(/\/$/, ''), token = process.env.TOKEN_ADMIN || '';
if (!url || !token) { console.error('Falta la dirección del Worker o TOKEN_ADMIN.'); process.exit(1); }
const MODELOS = ['@cf/openai/gpt-oss-120b', '@cf/meta/llama-3.3-70b-instruct-fp8-fast', '@cf/qwen/qwen3-30b-a3b-fp8', '@cf/meta/llama-3.1-8b-instruct-fp8-fast'];
const casos = JSON.parse(fs.readFileSync(new URL('./preguntas.json', import.meta.url))).casos;
const nombre = r => B[r.book].name + ' ' + r.chapter + ':' + r.verse + (r.endVerse ? '-' + r.endVerse : '');
const texto = r => B[r.book].chapters[r.chapter - 1].slice(r.verse - 1, r.endVerse || r.verse).join(' ').slice(0, 700);
function pasajes(c) {
  const lista = [];
  if (c.modo === 'explicar') { const r = H.parsear(c.ref); const n = B[r.book].chapters[r.chapter - 1].length; lista.push({ ...r, verse: Math.max(1, r.verse - 2), endVerse: Math.min(n, r.verse + 2) }); }
  else T.detectar(c.pregunta, 2).forEach((t, i) => t.citas.slice(0, i ? 4 : 10).forEach(x => { const r = H.parsear(x); if (r.endVerse && r.endVerse - r.verse > 5) r.endVerse = r.verse + 5; lista.push(r); }));
  return lista.slice(0, 14).map(r => ({ cita: nombre(r), texto: texto(r) }));
}
const salida = [];
for (const [i, c] of casos.entries()) {
  const pas = pasajes(c), respuestas = [];
  for (const modelo of MODELOS) {
    const r = await fetch(url + '/v1/prueba', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token }, body: JSON.stringify({ modo: c.modo, pregunta: c.pregunta, pasajes: pas, version: 'RV1909', modelo }) }).then(x => x.json()).catch(e => ({ respuesta: 'ERROR: ' + e.message }));
    respuestas.push({ modelo, respuesta: r.respuesta || r.mensaje || '', ms: r.ms, usd: r.usd });
  }
  // Orden mezclado por caso: la página muestra A, B, C, D sin decir cuál es cuál.
  respuestas.sort(() => Math.random() - 0.5);
  salida.push({ n: i + 1, ...c, respuestas });
  console.log(`${i + 1}/${casos.length} ${c.pregunta.slice(0, 50)}`);
}
fs.writeFileSync(new URL('./resultados.json', import.meta.url), JSON.stringify(salida, null, 1));
console.log('Listo: servidor/ia/calidad/resultados.json (no se sube al repositorio).');
