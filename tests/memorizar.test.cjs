'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const M = require('../app/memorizar-core.js');

test('Repaso espaciado: acertar aleja, fallar vuelve a mañana', () => {
  const r = { book: 18, chapter: 119, verse: 11 }, hoy = new Date(2026, 9, 12);
  let e = M.repasar({}, r, true, hoy);
  assert.deepEqual(e['18:119:11'], { caja: 0, proximo: '2026-10-13', repasos: 1 }, 'el primer acierto confirma la caja 0');
  e = M.repasar(e, r, true, new Date(2026, 9, 13));
  assert.deepEqual(e['18:119:11'], { caja: 1, proximo: '2026-10-16', repasos: 2 });
  e = M.repasar(e, r, true, new Date(2026, 9, 16));
  assert.equal(e['18:119:11'].proximo, '2026-10-23');
  e = M.repasar(e, r, false, new Date(2026, 9, 23));
  assert.deepEqual(e['18:119:11'], { caja: 0, proximo: '2026-10-24', repasos: 4 });
  assert.equal(M.nivelDe(0), 0); assert.equal(M.nivelDe(1), 1); assert.equal(M.nivelDe(3), 2); assert.equal(M.nivelDe(5), 3);
});

test('Lista con los de hoy primero y validación', () => {
  const marcas = [{ tipo: 'memoria', book: 42, chapter: 3, verse: 16 }, { tipo: 'marcador', book: 1, chapter: 1, verse: 1 }, { tipo: 'memoria', book: 18, chapter: 23, verse: 1, endVerse: 2 }];
  const est = { '42:3:16': { caja: 2, proximo: '2026-11-01', repasos: 3 } };
  const l = M.lista(marcas, est, new Date(2026, 9, 12));
  assert.deepEqual(l.map(x => [x.id, x.toca]), [['18:23:1-2', true], ['42:3:16', false]]);
  assert.deepEqual(M.validar({ '42:3:16': { caja: 9, proximo: 'mañana', repasos: -1 }, 'x': {} }), { '42:3:16': { caja: 5, proximo: '', repasos: 0 } });
});

test('Pistas: siempre las mismas para el mismo versículo, más ocultas a mayor nivel', () => {
  const t = 'En mi corazón he guardado tus dichos, Para no pecar contra ti.';
  assert.equal(M.pistas(t, 0, 'a').filter(p => p.oculta).length, 0);
  const n3 = M.pistas(t, 3, 'a'); assert.ok(n3.filter(p => /\S/.test(p.t)).every(p => p.oculta));
  assert.equal(n3.find(p => p.t === 'dichos,').pista, 'd_____,');
  assert.deepEqual(M.pistas(t, 2, '42:3:16'), M.pistas(t, 2, '42:3:16'));
  assert.ok(M.pistas(t, 2, '42:3:16').filter(p => p.oculta).length >= M.pistas(t, 1, '42:3:16').filter(p => p.oculta).length);
});
