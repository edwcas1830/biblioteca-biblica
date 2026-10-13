'use strict';
// Biblioteca Plus · vista previa (Edward, 13-oct; CONSENSO-HABITO #11).
const test = require('node:test'), assert = require('node:assert/strict');
const P = require('../app/plus.js');

test('precios y prueba de 4 días como decidió Edward', () => {
  assert.equal(P.PRECIOS.mensual.precio, 'US$4,99');
  assert.equal(P.PRECIOS.anual.precio, 'US$29,99');
  assert.equal(P.PRECIOS.mensual.prueba, 4);
  assert.equal(P.clave(P.primerCobro('mensual', new Date(2026, 9, 13))), '2026-10-17');
  assert.equal(P.clave(P.primerCobro('anual', new Date(2026, 11, 30))), '2027-01-03');
});

test('solo las funciones de la mesa llevan candado; leer, «Hoy», audio y copias nunca', () => {
  assert.deepEqual(Object.keys(P.FUNCIONES).sort(), ['fondos', 'ia', 'pareja', 'planes', 'sync']);
  const gratis = P.GRATIS.join(' ').toLowerCase();
  for (const f of ['leer', 'escuchar', '«hoy»', 'copias', 'accesibilidad']) assert.ok(gratis.includes(f), 'falta gratis: ' + f);
});

test('tarjeta de Plus en «Hoy»: como máximo una vez por semana y nunca con «No mostrar ofertas»', () => {
  const d = (m, dia) => new Date(2026, m, dia, 10);
  assert.equal(P.tocaTarjeta({}, d(9, 13)), true, 'primera vez');
  assert.equal(P.tocaTarjeta({ ultima: '2026-10-13' }, d(9, 13)), true, 'el mismo día sigue');
  assert.equal(P.tocaTarjeta({ ultima: '2026-10-13' }, d(9, 16)), false, 'a los 3 días no');
  assert.equal(P.tocaTarjeta({ ultima: '2026-10-13' }, d(9, 20)), true, 'a los 7 días sí');
  assert.equal(P.tocaTarjeta({ ultima: '2026-10-13', cerrada: '2026-10-13' }, d(9, 13)), false, '«Ahora no» la quita ese día');
  assert.equal(P.tocaTarjeta({ sinOfertas: true }, d(9, 13)), false, 'No mostrar ofertas');
});
