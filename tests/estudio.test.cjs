'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const E = require('../app/estudio-core.js');
const valida = p => p.book >= 0 && p.book < 66 && p.chapter >= 1 && p.chapter <= 150 && p.verse >= 1 && p.verse <= 176;

test('Estado vacío y validación que descarta lo inválido sin romper la copia', () => {
  assert.deepEqual(E.validar(undefined), E.vacio());
  const v = E.validar({
    marcas: [
      { id: 'm-abc123', tipo: 'marcador', book: 42, chapter: 3, verse: 16, creado: '2026-10-11T00:00:00.000Z' },
      { id: 'm-abc123', tipo: 'memoria', book: 42, chapter: 3, verse: 16 },          // id repetido
      { id: 'm-x', tipo: 'marcador', book: 42, chapter: 3, verse: 16 },              // id corto
      { id: 'm-def456', tipo: 'raro', book: 1, chapter: 1, verse: 1 },               // tipo
      { id: 'm-ghi789', tipo: 'etiqueta', book: 18, chapter: 23, verse: 1 },         // etiqueta sin nombre
      { id: 'm-jkl012', tipo: 'etiqueta', book: 18, chapter: 23, verse: 1, etiqueta: '  Promesas  ' },
      { id: 'm-mno345', tipo: 'memoria', book: 99, chapter: 1, verse: 1 },           // fuera del canon
      { id: 'm-pqr678', tipo: 'memoria', book: 44, chapter: 8, verse: 28, endVerse: 30 }
    ],
    colores: { gold: 'Promesa', sage: 'Mandato', rose: 'x'.repeat(80), azul: 'no' },
    historial: [{ book: 42, chapter: 3, t: 1 }, { book: 42, chapter: 3, verse: 999, t: 2 }, { book: 1, chapter: 1, t: 'x' }]
  }, valida);
  assert.deepEqual(v.marcas.map(m => m.id), ['m-abc123', 'm-jkl012', 'm-pqr678']);
  assert.equal(v.marcas[1].etiqueta, 'Promesas');
  assert.equal(v.marcas[2].endVerse, 30);
  assert.deepEqual(Object.keys(v.colores), ['gold', 'sage', 'rose']);
  assert.equal(v.colores.gold, 'Promesa');
  assert.equal(v.colores.rose.length, 30);
  assert.equal(v.historial.length, 1);
});

test('Marcador y memoria se alternan; las etiquetas se suman por nombre', () => {
  let e = E.vacio();
  const ref = { book: 42, chapter: 3, verse: 16 };
  e = E.alternar(e, 'marcador', ref);
  assert.ok(E.tiene(e, 'marcador', ref));
  e = E.alternar(e, 'marcador', ref);
  assert.ok(!E.tiene(e, 'marcador', ref));
  e = E.alternar(e, 'memoria', { ...ref, endVerse: 18 });
  assert.ok(E.tiene(e, 'memoria', { ...ref, endVerse: 18 }));
  assert.ok(!E.tiene(e, 'memoria', ref), 'un tramo no es lo mismo que un versículo');
  e = E.alternar(e, 'etiqueta', ref, 'Salvación');
  e = E.alternar(e, 'etiqueta', ref, 'Amor de Dios');
  e = E.alternar(e, 'etiqueta', { book: 44, chapter: 5, verse: 8 }, 'Salvación');
  assert.deepEqual(E.etiquetas(e), ['Amor de Dios', 'Salvación']);
  e = E.alternar(e, 'etiqueta', ref, 'Salvación');
  assert.equal(e.marcas.filter(m => m.etiqueta === 'Salvación').length, 1);
  assert.throws(() => E.alternar(e, 'etiqueta', ref, '   '));
  assert.deepEqual(E.validar(JSON.parse(JSON.stringify(e)), valida).marcas.length, e.marcas.length, 'sobrevive a guardar y validar');
});

test('Historial: lo último arriba, sin repetir el capítulo y con tope de 200', () => {
  let e = E.vacio();
  e = E.alHistorial(e, { book: 42, chapter: 3, verse: 16 }, 1);
  e = E.alHistorial(e, { book: 18, chapter: 23, verse: 1 }, 2);
  e = E.alHistorial(e, { book: 42, chapter: 3, verse: 1 }, 3);
  assert.deepEqual(e.historial.map(h => [h.book, h.chapter]), [[42, 3], [18, 23]]);
  for (let i = 0; i < 260; i++) e = E.alHistorial(e, { book: 18, chapter: (i % 150) + 1 }, 10 + i);
  assert.equal(e.historial.length, 151, 'un registro por capítulo: los 150 salmos y Juan 3');
  assert.ok(e.historial.length <= 200);
});

test('Listas de resaltados y notas desde las claves del estado', () => {
  const l = E.desdeClaves({ '42:3:16': 'gold', 'rv1909@18:23:1': 'sage', '1:1:1': 'rose' });
  assert.deepEqual(l.map(x => [x.book, x.chapter, x.verse, x.valor]), [[1, 1, 1, 'rose'], [18, 23, 1, 'sage'], [42, 3, 16, 'gold']]);
});
