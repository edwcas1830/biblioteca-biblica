'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const T = require('../app/temas-core.js'), C = require('../app/ia-biblia-core.js'), H = require('../app/hoy-core.js');
global.window = {}; require('../app/bible-data.js'); const B = window.BIBLE.books, NOMBRES = B.map(b => b.name);

test('Cada pasaje de los temas existe en la Biblia y no se repite dentro del tema', () => {
  assert.ok(T.TEMAS.length >= 40);
  const ids = new Set();
  for (const t of T.TEMAS) {
    assert.ok(!ids.has(t.id), 'tema repetido ' + t.id); ids.add(t.id);
    assert.ok(t.citas.length >= 8 && t.claves.length >= 3, t.id);
    assert.equal(new Set(t.citas).size, t.citas.length, 'cita repetida en ' + t.id);
    for (const cita of t.citas) {
      const r = H.parsear(cita); assert.ok(r, t.id + ': no se entiende ' + cita);
      assert.ok(C.existe(r, B), t.id + ': no existe ' + cita);
    }
  }
});

test('Detecta el tema de preguntas reales', () => {
  const tema = q => T.detectar(q).map(t => t.id)[0];
  assert.equal(tema('¿Qué dice la Biblia sobre la ansiedad?'), 'ansiedad');
  assert.equal(tema('Hazme un devocional sobre el perdón'), 'perdon');
  assert.equal(tema('Ayúdame a orar por mi matrimonio'), 'matrimonio');
  assert.equal(tema('Mi mamá falleció y no sé cómo seguir'), 'duelo');
  assert.equal(tema('tengo muchas deudas y estoy preocupado por el dinero')?.length > 0, true);
  assert.deepEqual(T.detectar('xyz'), []);
  assert.deepEqual(T.palabras('¿Qué dice la Biblia sobre la misericordia de Dios?'), ['misericordia']);
});

test('Extrae citas en el formato de la IA, con abreviaturas y rangos', () => {
  const t = 'Dios nos ama (Juan 3:16). Ver también 1 Juan 4:7-8, Sal 23:1, Filipenses 4:6,7 y Romanos 8:28. En Juan 99:1 no hay nada. Lo dijo Pablo en 2 Corintios 12:9.';
  const c = C.extraerCitas(t, NOMBRES).map(x => NOMBRES[x.book] + ' ' + x.chapter + ':' + x.verse + (x.endVerse ? '-' + x.endVerse : ''));
  assert.deepEqual(c, ['Juan 3:16', '1 Juan 4:7-8', 'Salmos 23:1', 'Filipenses 4:6-7', 'Romanos 8:28', 'Juan 99:1', '2 Corintios 12:9']);
  const v = C.verificar(t, NOMBRES, B, [{ book: 42, chapter: 3, verse: 16 }]);
  assert.equal(v.find(x => x.chapter === 99).existe, false);
  assert.equal(v[0].existe && v[0].enPasajes, true);
  assert.equal(v[1].enPasajes, false);
});

test('Cuota en palabras y historial local acotado', () => {
  assert.equal(C.textoCuota(2, 3), 'Te quedan 2 de 3 hoy.');
  assert.equal(C.textoCuota(1, 3), 'Te queda 1 de 3 hoy.');
  assert.equal(C.textoCuota(0, 3), 'Ya usaste tus 3 preguntas de hoy.');
  const h = C.validarHistorial([{ modo: 'tema', pregunta: 'p', respuesta: 'r', fecha: '2026-10-12' }, { modo: 'raro', pregunta: 'p', respuesta: 'r' }, null]);
  assert.equal(h.length, 1);
  assert.match(C.idem(), /^[0-9a-f]{24}$/);
});

test('La dirección de la IA y la CSP van juntas (scripts/configurar-ia.cjs)', () => {
  const fs = require('node:fs'), path = require('node:path');
  const url = (fs.readFileSync(path.join(__dirname, '../app/ia-config.js'), 'utf8').match(/window\.BIBLIA_IA_URL = '([^']*)'/) || [])[1];
  const csp = fs.readFileSync(path.join(__dirname, '../app/index.html'), 'utf8').match(/Content-Security-Policy" content="([^"]*)"/)[1];
  assert.ok(url !== undefined, 'ia-config.js tiene BIBLIA_IA_URL');
  if (url) assert.ok(csp.includes('connect-src') && csp.includes(url), 'la CSP permite ' + url);
  else assert.ok(!/connect-src/.test(csp), 'sin IA, la CSP de la PC no abre conexiones');
  assert.ok(!/127\.0\.0\.1|localhost/.test(url), 'no se publica con la dirección de prueba local');
});
