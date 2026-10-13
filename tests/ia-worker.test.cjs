'use strict';
// IA integrada: el portero de Cloudflare con una D1 de mentira (node:sqlite) y un Workers AI de mentira.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

function d1() {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(path.join(__dirname, '../servidor/ia/esquema.sql'), 'utf8'));
  return {
    sql: db,
    prepare(sql) {
      let args = [];
      const st = { bind(...a) { args = a; return st; }, async first() { return db.prepare(sql).get(...args) ?? null; }, async run() { db.prepare(sql).run(...args); return { success: true }; }, async all() { return { results: db.prepare(sql).all(...args) }; } };
      return st;
    }
  };
}
function ia(respuesta = 'Dios cuida de ti (Mateo 6:26).', falla = false) {
  const llamadas = [];
  return { llamadas, async run(modelo, entrada) { llamadas.push({ modelo, entrada }); if (falla) throw new Error('caído'); return { response: respuesta, usage: { prompt_tokens: 900, completion_tokens: 300 } }; } };
}
const W = import('../servidor/ia/worker.js');
const DISP = 'disp-de-prueba-0001';
const pedir = (cuerpo = {}) => ({ modo: 'tema', pregunta: '¿Qué dice la Biblia sobre la ansiedad?', pasajes: [{ cita: 'Filipenses 4:6', texto: 'Por nada estéis afanosos…' }, { cita: 'Mateo 6:34', texto: 'Así que, no os congojéis por el día de mañana…' }], ...cuerpo });
const leer = async r => ({ estado: r.status, cuerpo: await r.json() });

test('Valida modo, largo y pasajes', async () => {
  const { validarSolicitud } = await W;
  assert.equal(validarSolicitud(pedir()), '');
  assert.match(validarSolicitud(pedir({ modo: 'chiste' })), /Modo/);
  assert.match(validarSolicitud(pedir({ pregunta: 'x'.repeat(601) })), /larga/);
  assert.match(validarSolicitud(pedir({ pregunta: '   ' })), /Escribe/);
  assert.match(validarSolicitud(pedir({ pasajes: Array(15).fill({ cita: 'Juan 1:1', texto: 'x' }) })), /Pasajes/);
  assert.match(validarSolicitud(pedir({ idem: 'a b' })), /Identificador/);
});

test('La instrucción del sistema va en el servidor y lleva los pasajes de la persona', async () => {
  const { armarMensajes, INSTRUCCION } = await W;
  const m = armarMensajes(pedir({ version: 'RVR1960' }));
  assert.equal(m[0].content, INSTRUCCION);
  assert.match(m[1].content, /\(Filipenses 4:6\) Por nada estéis afanosos/);
  assert.match(m[1].content, /RVR1960/);
  assert.match(INSTRUCCION, /No inventes citas/);
});

test('Gratis: 3 al día por dispositivo; un fallo no descuenta; reintento con la misma idem no cobra', async () => {
  const { preguntar } = await W;
  const env = { DB: d1(), AI: ia(), CUOTA_GRATIS: '3', TOPE_DIARIO_USD: '1' };
  const caido = { ...env, AI: ia('', true) };
  let r = await leer(await preguntar(caido, pedir(), DISP, '1.1.1.1'));
  assert.equal(r.estado, 502); assert.match(r.cuerpo.mensaje, /no se descontó/);
  for (let i = 0; i < 3; i++) { r = await leer(await preguntar(env, pedir({ idem: 'pedido-' + i + '-abcdef' }), DISP, '1.1.1.1')); assert.equal(r.estado, 200); assert.equal(r.cuerpo.quedan, 2 - i); }
  r = await leer(await preguntar(env, pedir({ idem: 'pedido-2-abcdef' }), DISP, '1.1.1.1'));
  assert.equal(r.estado, 200, 'el reintento de la misma pregunta pasa sin cobrar'); assert.equal(r.cuerpo.quedan, 0);
  r = await leer(await preguntar(env, pedir(), DISP, '1.1.1.1'));
  assert.equal(r.estado, 429); assert.equal(r.cuerpo.error, 'CUOTA');
  // Otro día vuelve a tener sus 3.
  r = await leer(await preguntar(env, pedir(), DISP, '1.1.1.1', new Date(Date.now() + 86400000)));
  assert.equal(r.estado, 200); assert.equal(r.cuerpo.quedan, 2);
});

test('Probador y Plus tienen más preguntas; el tope de gasto apaga solo lo gratis', async () => {
  const { preguntar, estado } = await W;
  const env = { DB: d1(), AI: ia(), CUOTA_GRATIS: '3', CUOTA_PROBADOR: '30', TOPE_DIARIO_USD: '0.000001' };
  await env.DB.prepare("INSERT INTO planes (dispositivo, plan) VALUES (?, 'probador')").bind('probador-edward-0001').run();
  assert.deepEqual(await estado(env, 'probador-edward-0001'), { plan: 'probador', limite: 30, quedan: 30 });
  let r = await leer(await preguntar(env, pedir(), 'probador-edward-0001', '2.2.2.2'));
  assert.equal(r.estado, 200, 'el probador sigue aunque se pase el tope');
  r = await leer(await preguntar(env, pedir(), DISP, '3.3.3.3'));
  assert.equal(r.estado, 503); assert.equal(r.cuerpo.error, 'TOPE');
  const gasto = env.DB.sql.prepare('SELECT usd, llamadas FROM gasto').get();
  assert.ok(gasto.usd > 0 && gasto.llamadas === 1);
});

test('Muchas preguntas desde la misma conexión se frenan (dispositivos nuevos inventados)', async () => {
  const { preguntar } = await W;
  const env = { DB: d1(), AI: ia(), CUOTA_GRATIS: '3', CUOTA_IP: '4', TOPE_DIARIO_USD: '5' };
  for (let i = 0; i < 4; i++) assert.equal((await preguntar(env, pedir(), 'falso-dispositivo-' + i + '000', '9.9.9.9')).status, 200);
  const r = await leer(await preguntar(env, pedir(), 'falso-dispositivo-9000', '9.9.9.9'));
  assert.equal(r.estado, 429); assert.match(r.cuerpo.mensaje, /conexión/);
});

test('Crisis: mensaje fijo, sin modelo y sin cobrar', async () => {
  const { preguntar, MENSAJE_CRISIS } = await W;
  const env = { DB: d1(), AI: ia() };
  const r = await leer(await preguntar(env, pedir({ pregunta: 'Ya no quiero vivir, pienso en quitarme la vida' }), DISP, '1.1.1.1'));
  assert.equal(r.cuerpo.respuesta, MENSAJE_CRISIS); assert.equal(env.AI.llamadas.length, 0);
});

test('gpt-oss usa el formato Responses y se lee su salida', async () => {
  const { preguntar, textoDeRespuesta } = await W;
  assert.equal(textoDeRespuesta({ output: [{ type: 'reasoning', content: [{ text: 'pensando' }] }, { type: 'message', content: [{ type: 'output_text', text: 'Hola (Juan 3:16)' }] }] }), 'Hola (Juan 3:16)');
  assert.equal(textoDeRespuesta({ choices: [{ message: { content: 'chat' } }] }), 'chat');
  const env = { DB: d1(), AI: ia(), MODELO: '@cf/openai/gpt-oss-120b' };
  await preguntar(env, pedir(), DISP, '1.1.1.1');
  const e = env.AI.llamadas[0].entrada;
  assert.ok(e.instructions && e.input && !e.messages);
  const env2 = { DB: d1(), AI: ia(), MODELO: '@cf/meta/llama-3.3-70b-instruct-fp8-fast' };
  await preguntar(env2, pedir(), DISP, '1.1.1.1');
  assert.ok(Array.isArray(env2.AI.llamadas[0].entrada.messages));
});

test('Rutas: falta el dispositivo, reportar guarda el texto, prueba exige el token', async () => {
  const W2 = (await W).default;
  const env = { DB: d1(), AI: ia(), TOKEN_ADMIN: 'secreto-de-prueba' };
  const post = (ruta, cuerpo, h = {}) => W2.fetch(new Request('https://ia.ejemplo/' + ruta, { method: 'POST', headers: { 'content-type': 'application/json', ...h }, body: JSON.stringify(cuerpo) }), env);
  assert.equal((await post('v1/preguntar', pedir())).status, 400);
  assert.equal((await post('v1/reportar', { modo: 'tema', pregunta: 'p', respuesta: 'r', motivo: 'cita falsa' }, { 'x-dispositivo': DISP })).status, 200);
  assert.equal(env.DB.sql.prepare('SELECT count(*) n FROM reportes').get().n, 1);
  assert.equal((await post('v1/prueba', { ...pedir(), modelo: '@cf/meta/llama-3.1-8b-instruct-fp8-fast' })).status, 401);
  const ok = await post('v1/prueba', { ...pedir(), modelo: '@cf/meta/llama-3.1-8b-instruct-fp8-fast' }, { authorization: 'Bearer secreto-de-prueba' });
  assert.equal(ok.status, 200);
  const est = await W2.fetch(new Request('https://ia.ejemplo/v1/estado', { headers: { 'x-dispositivo': DISP } }), env);
  assert.deepEqual(await est.json(), { plan: 'gratis', limite: 3, quedan: 3 });
});

test('Limpieza diaria: borra contadores de más de 7 días, equipos sin visitas en 90 días y reportes de más de 12 meses', async () => {
  const { limpiar } = await W;
  const env = { DB: d1() }, s = env.DB.sql, ahora = new Date('2026-10-13T12:00:00Z');
  s.prepare('INSERT INTO uso (clave, dia, n) VALUES (?, ?, 1)').run('d:viejo', '2026-10-01');
  s.prepare('INSERT INTO uso (clave, dia, n) VALUES (?, ?, 1)').run('d:nuevo', '2026-10-12');
  s.prepare('INSERT INTO idem (dispositivo, idem, dia) VALUES (?, ?, ?)').run('x', 'viejo', '2026-09-01');
  s.prepare('INSERT INTO vistos (dispositivo, primero, ultimo) VALUES (?, ?, ?)').run('viejo', '2026-01-01T00:00:00Z', '2026-06-01T00:00:00Z');
  s.prepare('INSERT INTO vistos (dispositivo, primero, ultimo) VALUES (?, ?, ?)').run('nuevo', '2026-01-01T00:00:00Z', '2026-10-10T00:00:00Z');
  s.prepare('INSERT INTO reportes (dispositivo, creado, modo, pregunta, respuesta, motivo) VALUES (?, ?, ?, ?, ?, ?)').run('x', '2025-09-01T00:00:00Z', 'tema', 'p', 'r', 'm');
  s.prepare('INSERT INTO reportes (dispositivo, creado, modo, pregunta, respuesta, motivo) VALUES (?, ?, ?, ?, ?, ?)').run('x', '2026-10-01T00:00:00Z', 'tema', 'p', 'r', 'm');
  s.prepare('INSERT INTO gasto (dia, usd, llamadas) VALUES (?, ?, ?)').run('2025-01-01', 0.1, 1);
  await limpiar(env, ahora);
  const n = t => s.prepare('SELECT COUNT(*) AS n FROM ' + t).get().n;
  assert.deepEqual([n('uso'), n('idem'), n('vistos'), n('reportes'), n('gasto')], [1, 0, 1, 1, 1]);
  assert.equal(s.prepare('SELECT clave FROM uso').get().clave, 'd:nuevo');
});
