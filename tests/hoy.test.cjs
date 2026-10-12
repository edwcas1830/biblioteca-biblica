'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const H = require('../app/hoy-core.js');
global.window = {}; require('../app/bible-data.js'); const BIBLIA = window.BIBLE;

test('366 versículos del día, todos distintos y existentes en la Biblia', () => {
  assert.equal(H.VERSICULOS.length, 366);
  assert.equal(new Set(H.VERSICULOS).size, 366, 'hay versículos repetidos');
  assert.deepEqual(H.LIBROS, BIBLIA.books.map(b => b.name));
  for (const cita of H.VERSICULOS) {
    const r = H.parsear(cita); assert.ok(r, 'no se entiende ' + cita);
    const cap = BIBLIA.books[r.book].chapters[r.chapter - 1];
    assert.ok(cap, 'capítulo inexistente ' + cita);
    assert.ok(r.verse >= 1 && r.verse <= cap.length, 'versículo inexistente ' + cita);
    if (r.endVerse) assert.ok(r.endVerse > r.verse && r.endVerse <= cap.length, 'rango inválido ' + cita);
  }
});

test('Calendario fijo: 1 de enero, 29 de febrero, 1 de marzo, Navidad y 31 de diciembre', () => {
  assert.equal(H.delDia(new Date(2027, 0, 1)).cita, 'Lamentaciones 3:22-23');
  assert.equal(H.indiceDelAno(new Date(2028, 1, 29)), 59);
  assert.equal(H.indiceDelAno(new Date(2027, 2, 1)), 60);
  assert.equal(H.indiceDelAno(new Date(2028, 2, 1)), 60);
  assert.equal(H.delDia(new Date(2026, 11, 25)).cita, 'Juan 1:14');
  assert.equal(H.delDia(new Date(2026, 11, 31)).cita, 'Apocalipsis 21:5');
  assert.equal(H.delDia(new Date(2026, 11, 31)).indice, 365);
});

test('Marcar pasos, deshacer y contar días sin castigo', () => {
  let e = H.vacio();
  e = H.marcar(e, '2026-10-12', 'conexion');
  e = H.marcar(e, '2026-10-12', 'oracion');
  assert.equal(H.pasosHechos(e, '2026-10-12'), 2);
  assert.ok(H.hecho(e, '2026-10-12', 'oracion'));
  assert.ok(!H.hecho(e, '2026-10-12', 'versiculo'));
  e = H.marcar(e, '2026-10-12', 'conexion', false);
  e = H.marcar(e, '2026-10-12', 'oracion', false);
  assert.equal(H.totalDias(e), 0, 'un día sin pasos no cuenta');
  e = H.marcar(e, '2026-10-10', 'versiculo'); e = H.marcar(e, '2026-10-12', 'devocion');
  assert.equal(H.totalDias(e), 2);
  assert.equal(H.marcar(e, '2026-10-12', 'raro'), e);
});

test('Semana de lunes a domingo con hoy y futuro', () => {
  let e = H.marcar(H.vacio(), '2026-10-06', 'versiculo');
  const s = H.semana(e, new Date(2026, 9, 8));
  assert.deepEqual(s.map(d => d.letra), ['L', 'M', 'M', 'J', 'V', 'S', 'D']);
  assert.equal(s[0].fecha, '2026-10-05');
  assert.ok(s[1].hecho); assert.ok(s[3].hoy); assert.ok(s[4].futuro); assert.ok(!s[2].futuro);
  assert.equal(H.semana(e, new Date(2026, 9, 11))[0].fecha, '2026-10-05', 'el domingo cierra la semana');
});

test('Validación: descarta lo inválido y conserva lo bueno', () => {
  assert.deepEqual(H.validar(null), H.vacio());
  const v = H.validar({ bienvenida: 'hecha', perfil: { proposito: 'paz', meta: 9, hora: '25:00', tradicion: 'catolica' },
    dias: { '2026-10-12': 3, '2026-10-13': 99, 'ayer': 1, '2026-10-01': 0 }, abrirEnHoy: false, ultimoDia: '2026-10-12' });
  assert.equal(v.bienvenida, 'hecha'); assert.equal(v.perfil.proposito, 'paz'); assert.equal(v.perfil.meta, 4);
  assert.equal(v.perfil.hora, ''); assert.equal(v.perfil.tradicion, 'catolica');
  assert.deepEqual(v.dias, { '2026-10-12': 3 }); assert.equal(v.abrirEnHoy, false);
  const muchos = {}; for (let i = 0; i < 1200; i++) muchos[H.clave(new Date(2020, 0, 1 + i))] = 1;
  assert.equal(Object.keys(H.validar({ dias: muchos }).dias).length, 1100);
});

test('Abrir en «Hoy» solo la primera vez del día y avisos de los próximos días', () => {
  const hoy = new Date(2026, 9, 12, 9, 0);
  assert.ok(H.abrirPrimero(H.vacio(), hoy));
  assert.ok(!H.abrirPrimero({ ...H.vacio(), ultimoDia: '2026-10-12' }, hoy));
  assert.ok(!H.abrirPrimero({ ...H.vacio(), abrirEnHoy: false }, hoy));
  const avisos = H.proximosAvisos('07:30', 14, hoy);
  assert.equal(avisos.length, 14);
  assert.equal(avisos[0].fecha, '2026-10-13', 'las 7:30 de hoy ya pasaron');
  assert.equal(avisos[0].cuando.getHours(), 7);
  assert.ok(avisos[0].cita);
  assert.equal(H.proximosAvisos('20:00', 3, hoy)[0].fecha, '2026-10-12');
  assert.deepEqual(H.proximosAvisos('', 3, hoy), []);
});
