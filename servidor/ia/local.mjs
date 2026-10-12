// Servidor local de prueba del Worker (sin Cloudflare): D1 en memoria con node:sqlite y una IA de mentira que
// responde citando los pasajes que llegaron (y una cita inventada, para ver la marca «No encontré esta cita»).
// Uso: node servidor/ia/local.mjs [puerto]   (solo para probar la pantalla; no usa la red)
import http from 'node:http';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker from './worker.js';

const db = new DatabaseSync(':memory:');
db.exec(fs.readFileSync(new URL('./esquema.sql', import.meta.url), 'utf8'));
const DB = { prepare(sql) { let a = []; const st = { bind(...x) { a = x; return st; }, async first() { return db.prepare(sql).get(...a) ?? null; }, async run() { db.prepare(sql).run(...a); return {}; } }; return st; } };
const AI = { async run(modelo, entrada) {
  const texto = entrada.input || entrada.messages[1].content;
  const citas = [...texto.matchAll(/^\(([^)]+)\)/gm)].map(m => m[1]).slice(0, 3);
  return { response: `Respuesta de prueba (${modelo}).\n\nLa Biblia enseña que Dios cuida de nosotros (${citas[0] || 'Juan 3:16'}). También dice (${citas[1] || 'Salmos 23:1'}).\n\nEsta cita es inventada para la prueba (Juan 99:1).`, usage: { prompt_tokens: 800, completion_tokens: 200 } };
} };
const env = { DB, AI, CUOTA_GRATIS: '3', TOPE_DIARIO_USD: '1' };
const puerto = Number(process.argv[2] || 8789);
http.createServer(async (req, res) => {
  const partes = []; for await (const p of req) partes.push(p);
  const cuerpo = partes.length ? Buffer.concat(partes) : undefined;
  const r = await worker.fetch(new Request('http://127.0.0.1:' + puerto + req.url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? undefined : cuerpo }), env);
  res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer()));
}).listen(puerto, '127.0.0.1', () => console.log('IA local de prueba en http://127.0.0.1:' + puerto));
