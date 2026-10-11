'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const C = require('../shared/chat-cripto.js');

async function dispositivo(id) { const k = await C.nuevasClaves(); return { id, firma: k.publicas.firma, acuerdo: k.publicas.acuerdo, privadaFirma: k.privadas.firma, privadaAcuerdo: k.privadas.acuerdo }; }

test('Huella del par: 20 dígitos en 5 grupos, igual para los dos y distinta si cambia una clave', async () => {
  const edward = await dispositivo('d-edward'), laura = await dispositivo('d-laura');
  const h1 = await C.huellaPar(edward, laura), h2 = await C.huellaPar(laura, edward);
  assert.match(h1, /^\d{4} \d{4} \d{4} \d{4} \d{4}$/);
  assert.equal(h1, h2, 'Edward y Laura ven la misma');
  const intruso = await dispositivo('d-laura');
  assert.notEqual(await C.huellaPar(edward, intruso), h1, 'si el servidor cambia la clave de Laura, la huella cambia');
});

test('Envoltura: solo el destinatario la abre; firmada por el emisor; atada a grupo, época y huella', async () => {
  const edward = await dispositivo('d-edward'), laura = await dispositivo('d-laura'), otro = await dispositivo('d-otro');
  const clave = C.nuevaClaveGrupo();
  const env = await C.envolver({ claveGrupo: clave, grupo: 'g1', epoca: 1, para: laura, de: edward });
  assert.equal(await C.desenvolver({ envoltura: env, grupo: 'g1', epoca: 1, yo: laura, de: edward }), clave);
  await assert.rejects(C.desenvolver({ envoltura: env, grupo: 'g1', epoca: 1, yo: { ...otro, id: 'd-laura' }, de: edward }), /alterada|firm/i, 'otra clave privada no abre');
  await assert.rejects(C.desenvolver({ envoltura: env, grupo: 'g1', epoca: 2, yo: laura, de: edward }), /firm|alterada/i, 'época distinta');
  await assert.rejects(C.desenvolver({ envoltura: env, grupo: 'g2', epoca: 1, yo: laura, de: edward }), /firm|alterada/i, 'grupo distinto');
  await assert.rejects(C.desenvolver({ envoltura: env, grupo: 'g1', epoca: 1, yo: laura, de: otro }), /firm/i, 'firmada por otro');
  const e = JSON.parse(env); const c = C.deb64(e.c); c[0] ^= 1;
  await assert.rejects(C.desenvolver({ envoltura: JSON.stringify({ ...e, c: C.b64(c) }), grupo: 'g1', epoca: 1, yo: laura, de: edward }), /firm/i, 'contenido alterado');
  // Si el servidor cambiara la clave pública de Laura, la envoltura queda atada a la huella vieja.
  const lauraFalsa = { ...laura, acuerdo: otro.acuerdo };
  await assert.rejects(C.desenvolver({ envoltura: env, grupo: 'g1', epoca: 1, yo: lauraFalsa, de: edward }));
});

test('Sobre del mensaje: cifra, firma y se rechaza cualquier campo manipulado', async () => {
  const edward = await dispositivo('d-edward'), laura = await dispositivo('d-laura');
  const clave = C.nuevaClaveGrupo();
  const base = { g: 'g1', e: 1, h: 'h1', id: 'm1', d: edward.id };
  const sobre = await C.sellar({ contenido: { t: 'Juan 3:16 es mi versículo favorito', k: 'chat' }, claveGrupo: clave, ...base, privadaFirma: edward.privadaFirma });
  assert.ok(!sobre.includes('favorito'), 'el servidor no ve el texto');
  const fila = { grupo_id: 'g1', epoca: 1, hilo_id: 'h1', id: 'm1', dispositivo_id: edward.id };
  assert.deepEqual(await C.abrir({ sobre, fila, claveGrupo: clave, firmaAutor: edward.firma }), { t: 'Juan 3:16 es mi versículo favorito', k: 'chat' });
  for (const [k, col, v] of [['g', 'grupo_id', 'g2'], ['e', 'epoca', 2], ['h', 'hilo_id', 'h2'], ['id', 'id', 'm2'], ['d', 'dispositivo_id', 'd-otro']]) {
    await assert.rejects(C.abrir({ sobre, fila: { ...fila, [col]: v }, claveGrupo: clave, firmaAutor: edward.firma }), /no coincide/, 'columna ' + col);
    await assert.rejects(C.abrir({ sobre: JSON.stringify({ ...JSON.parse(sobre), [k]: v }), fila: { ...fila, [col]: v }, claveGrupo: clave, firmaAutor: edward.firma }), /firma/, 'campo ' + k + ' cambiado en sobre y columna');
  }
  await assert.rejects(C.abrir({ sobre, fila, claveGrupo: clave, firmaAutor: laura.firma }), /firma/, 'otro autor');
  await assert.rejects(C.abrir({ sobre, fila, claveGrupo: C.nuevaClaveGrupo(), firmaAutor: edward.firma }), /alterado|época/, 'clave de otra época');
  const x = JSON.parse(sobre); const c = C.deb64(x.c); c[3] ^= 8;
  await assert.rejects(C.abrir({ sobre: JSON.stringify({ ...x, c: C.b64(c) }), fila, claveGrupo: clave, firmaAutor: edward.firma }), /firma/);
  await assert.rejects(C.abrir({ sobre: JSON.stringify({ ...x, n: x.n + 'A' }), fila, claveGrupo: clave, firmaAutor: edward.firma }), /Base64|Nonce/);
  await assert.rejects(C.sellar({ contenido: { t: 'x'.repeat(13000) }, claveGrupo: clave, ...base, privadaFirma: edward.privadaFirma }), /largo/);
});

test('Invitación: token de 128 bits y hash SHA-256 (lo único que guarda el servidor)', async () => {
  const a = await C.nuevaInvitacion(), b = await C.nuevaInvitacion();
  assert.equal(C.deb64(a.token).length, 16);
  assert.equal(a.hash.length, 32);
  assert.notEqual(a.token, b.token);
  const esperado = require('node:crypto').createHash('sha256').update(a.token, 'utf8').digest();
  assert.deepEqual(Buffer.from(a.hash), esperado, 'mismo hash que calcula el servidor (digest de convert_to(token, UTF8))');
});
