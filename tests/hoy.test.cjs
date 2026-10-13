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

test('Mi camino: semana de fe con gracia, semanas no seguidas y logros que se celebran una vez', () => {
  let e = H.vacio();
  // Semana del 5 al 11 de octubre: 4 días (cumple la meta de 4). Semana siguiente: 2 días. Otra semana más tarde: 4.
  for (const f of ['2026-10-05', '2026-10-06', '2026-10-08', '2026-10-10', '2026-10-13', '2026-10-14', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-30']) e = H.marcar(e, f, 'versiculo');
  assert.equal(H.semanasDeFe(e), 2, 'cuentan aunque no sean seguidas');
  assert.deepEqual(H.semanaActual(e, new Date(2026, 9, 14)), { dias: 2, meta: 4, cumplida: false, faltan: 2 });
  e = { ...e, perfil: { ...e.perfil, meta: 2 } };
  assert.equal(H.semanasDeFe(e), 3, 'con meta 2 también cuenta la segunda semana');
  const r1 = H.revisarLogros(e, {}, new Date(2026, 9, 30));
  assert.deepEqual(r1.nuevos.map(l => l.id).sort(), ['lampara', 'pacto'].sort());
  assert.equal(r1.estado.logros.lampara, '2026-10-30');
  assert.deepEqual(H.revisarLogros(r1.estado, {}).nuevos, [], 'no se celebra dos veces');
  // Logros que dependen del estudio.
  let s = H.vacio();
  for (let i = 0; i < 10; i++) s = H.contar(s, 'strong');
  for (const k of ['1:1:1', '1:1:1', '42:3:16', '18:23:1']) s = H.contar(s, 'comparar', k);
  for (let c = 1; c <= 4; c++) s = H.leerCapitulo(s, 56, c); // Filemón tiene 1; Judas 1; usamos Rut (4 caps)
  s = H.leerCapitulo(H.leerCapitulo(H.leerCapitulo(H.leerCapitulo(s, 7, 1), 7, 2), 7, 3), 7, 4);
  const caps = Array(66).fill(50); caps[7] = 4;
  const ids = H.revisarLogros(s, { capitulos: caps, memoria: 5, planesTerminados: 1 }).nuevos.map(l => l.id).sort();
  assert.deepEqual(ids, ['atesorado', 'emaus', 'escudrinar', 'principio', 'testigos'].sort());
  const p = H.progresoLogros(s, { capitulos: caps });
  assert.equal(p.length, 12); assert.equal(p.find(x => x.id === 'testigos').valor, 3);
  // La validación conserva lo bueno y descarta lo raro.
  const v = H.validar({ ...s, logros: { lampara: '2026-10-30', inventado: '2026-10-30', faro: 'ayer' }, leidos: { 7: [1, 2, 2, 999], 99: [1] }, cuenta: { strong: -3, mapas: 2, comparados: ['1:1:1', 'x'] } });
  assert.deepEqual(v.logros, { lampara: '2026-10-30' });
  assert.deepEqual(v.leidos, { 7: [1, 2] });
  assert.deepEqual(v.cuenta, { strong: 0, mapas: 2, comparados: ['1:1:1'] });
  assert.equal(H.LOGROS.length, 12);
});

test('Los 30 devocionales propios: completos, con citas que existen, uno por día en orden', () => {
  const D = require('../app/hoy-devocionales.js');
  assert.equal(D.length, 30);
  const vistos = new Set();
  for (const d of D) {
    assert.ok(d.titulo && d.historia && d.paraHoy && /Amén\.$/.test(d.oracion) && Array.isArray(d.desarrollo) && d.desarrollo.length === 2, 'incompleto ' + d.n);
    const r = H.parsear(d.cita); assert.ok(r, 'cita ' + d.cita);
    const cap = BIBLIA.books[r.book].chapters[r.chapter - 1]; assert.ok(cap && r.verse <= cap.length && (!r.endVerse || r.endVerse <= cap.length), 'no existe ' + d.cita);
    assert.ok(!vistos.has(d.titulo)); vistos.add(d.titulo);
  }
  let e = H.vacio();
  assert.equal(H.devocionalDelDia(e, D, new Date(2026, 9, 12)).n, 1, 'el primer día, el 1');
  e = H.marcar(H.marcar(e, '2026-10-10', 'versiculo'), '2026-10-11', 'oracion');
  assert.equal(H.devocionalDelDia(e, D, new Date(2026, 9, 12)).n, 3, 'tras 2 días usados, el 3');
  e = H.marcar(e, '2026-10-12', 'conexion');
  assert.equal(H.devocionalDelDia(e, D, new Date(2026, 9, 12)).n, 3, 'no cambia durante el mismo día');
  assert.equal(H.devocionalDelDia(e, [], new Date()), null);
});

// Edward (13-oct): al segundo día la app abría directo en la Biblia. En el teléfono movil.js puede correr
// antes de que exista HoyApp (archivos locales); debe esperarlo, no rendirse. La PC lo abre al terminar start().
test('«Hoy» se abre al arrancar en el teléfono y en la PC, aunque hoy.js cargue después', () => {
  const fs = require('node:fs'), path = require('node:path');
  const movil = fs.readFileSync(path.join(__dirname, '..', 'mobile', 'web', 'movil.js'), 'utf8');
  const inicio = movil.slice(movil.indexOf('async function iniciarHoy'), movil.indexOf('async function iniciarHoy') + 400);
  assert.match(inicio, /for \(let i = 0; i < 240 && !\(window\.HoyApp && typeof uiReady/, 'iniciarHoy espera a HoyApp');
  assert.ok(inicio.indexOf('if (!window.HoyApp) return') > inicio.indexOf('for (let i = 0; i < 240'), 'no sale antes de esperar');
  const app = fs.readFileSync(path.join(__dirname, '..', 'app', 'app.js'), 'utf8');
  assert.match(app, /uiReady=true;[^\n]*window\.HoyApp\?\.abrirSiToca\(\)/, 'la PC abre «Hoy» al terminar de arrancar');
});

test('las 30 pinturas del versículo del día existen para «Imagen con versículos»', () => {
  const fs = require('node:fs'), path = require('node:path');
  for (let n = 1; n <= 30; n++) assert.ok(fs.existsSync(path.join(__dirname, '..', 'app', 'imagenes', 'fondos', `fondo-${String(n).padStart(2, '0')}.webp`)), 'falta la pintura ' + n);
  const vi = fs.readFileSync(path.join(__dirname, '..', 'app', 'verse-image.js'), 'utf8');
  assert.match(vi, /const PINTURAS = 30;/);
  assert.match(vi, /imagenes\/fondos\/fondo-/);
});
