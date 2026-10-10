'use strict';
// Junta la carpeta de traspaso (la que arma traspaso-pc.cjs) en UN archivo .bbt para el teléfono.
// Formato: tar «ustar» simple (solo archivos, nombres planos), traspaso.json primero. En el teléfono lo
// desempaca TraspasoPaquetePlugin.java leyendo por bloques; luego la revisión comprueba cada SHA-256.
// Uso: node mobile/scripts/empaquetar-traspaso.cjs <carpeta-traspaso> <archivo.bbt>
const fs = require('node:fs'), path = require('node:path');
const [carpeta, salida] = process.argv.slice(2).map(p => p && path.resolve(p));
if (!carpeta || !salida || !/\.bbt$/i.test(salida)) { console.error('Uso: empaquetar-traspaso.cjs <carpeta-traspaso> <archivo.bbt>'); process.exit(2); }
const repo = path.resolve(__dirname, '..', '..');
if (salida.startsWith(repo + path.sep)) { console.error('El paquete lleva datos privados: guárdalo fuera del repositorio.'); process.exit(2); }
const NOMBRE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const indice = JSON.parse(fs.readFileSync(path.join(carpeta, 'traspaso.json'), 'utf8'));
if (indice.formato !== 'biblioteca-biblica-traspaso') throw new Error('La carpeta no es un traspaso de Biblioteca Bíblica.');
const nombres = ['traspaso.json', ...indice.archivos.map(a => a.archivo)];
const sobran = fs.readdirSync(carpeta).filter(n => !nombres.includes(n));
if (sobran.length) throw new Error('La carpeta trae archivos que no están en traspaso.json: ' + sobran.join(', '));
for (const n of nombres) if (!NOMBRE.test(n)) throw new Error('Nombre no permitido: ' + n);

function cabecera(nombre, tam, mtime) {
  const h = Buffer.alloc(512);
  const campo = (texto, desde, largo) => h.write(texto, desde, Math.min(largo, Buffer.byteLength(texto)), 'ascii');
  const octal = (n, largo) => n.toString(8).padStart(largo - 1, '0') + '\0';
  campo(nombre, 0, 100);
  campo('0000644\0', 100, 8); campo('0000000\0', 108, 8); campo('0000000\0', 116, 8);
  campo(octal(tam, 12), 124, 12); campo(octal(mtime, 12), 136, 12);
  h.fill(0x20, 148, 156); h[156] = 0x30; // '0' = archivo normal
  campo('ustar\0', 257, 6); campo('00', 263, 2);
  let suma = 0; for (const b of h) suma += b;
  campo(suma.toString(8).padStart(6, '0') + '\0 ', 148, 8);
  return h;
}

const temporal = salida + '.parcial';
const fd = fs.openSync(temporal, 'w');
try {
  const bufer = Buffer.alloc(1 << 20);
  let total = 0;
  for (const nombre of nombres) {
    const ruta = path.join(carpeta, nombre), st = fs.statSync(ruta);
    if (!st.isFile()) throw new Error('No es un archivo: ' + nombre);
    fs.writeSync(fd, cabecera(nombre, st.size, Math.floor(st.mtimeMs / 1000)));
    const entrada = fs.openSync(ruta, 'r');
    let copiados = 0, n;
    while ((n = fs.readSync(entrada, bufer, 0, bufer.length, null)) > 0) { fs.writeSync(fd, bufer, 0, n); copiados += n; }
    fs.closeSync(entrada);
    if (copiados !== st.size) throw new Error('El archivo cambió mientras se empaquetaba: ' + nombre);
    const relleno = (512 - (st.size % 512)) % 512;
    if (relleno) fs.writeSync(fd, Buffer.alloc(relleno));
    total += st.size;
  }
  fs.writeSync(fd, Buffer.alloc(1024)); // fin del tar
  fs.fsyncSync(fd);
  fs.closeSync(fd);
  fs.renameSync(temporal, salida);
  console.log(`Paquete listo: ${salida} · ${nombres.length} archivos · ${(total / 1048576).toFixed(1)} MB`);
} catch (e) {
  try { fs.closeSync(fd); } catch { /* ya cerrado */ }
  fs.rmSync(temporal, { force: true });
  throw e;
}
