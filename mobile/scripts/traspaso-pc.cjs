'use strict';
// Traspaso PC → teléfono. Arma una CARPETA PLANA (no .zip) con:
//   biblioteca-personal.sqlite  copia coherente (API de respaldo de SQLite) del perfil de esta PC
//   manifest.json               manifiesto del paquete personal (módulos de e-Sword), sin cambios
//   <módulos>                   cada archivo del paquete personal, copiado y verificado
//   traspaso.json               huellas sha256, tamaños y conteos para que el teléfono verifique
// Uso: node mobile/scripts/traspaso-pc.cjs <carpeta-destino> [--perfil <carpeta-del-perfil>] [--modo-personal]
//   --modo-personal marca el manifiesto con modoPersonal:true (igual que el instalador completo).
// Es privado por naturaleza: el destino debe ser una carpeta personal (OneDrive de Edward), nunca el repo.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sqlite = require('node:sqlite');

const args = process.argv.slice(2);
const destino = args[0];
const iPerfil = args.indexOf('--perfil');
const perfil = iPerfil >= 0 ? args[iPerfil + 1] : path.join(process.env.APPDATA || '', 'Biblioteca Bíblica');
if (!destino) { console.error('Falta la carpeta de destino.'); process.exit(2); }
const repo = path.resolve(__dirname, '..', '..');
if (path.resolve(destino).startsWith(repo)) { console.error('El traspaso no puede quedar dentro del repositorio.'); process.exit(2); }

const huella = archivo => new Promise((ok, mal) => {
  const h = crypto.createHash('sha256');
  fs.createReadStream(archivo).on('data', d => h.update(d)).on('end', () => ok(h.digest('hex'))).on('error', mal);
});

(async () => {
  fs.mkdirSync(destino, { recursive: true });
  const archivos = [];

  // 1. Datos personales: copia coherente aunque la app esté abierta (WAL incluido).
  const origenDb = path.join(perfil, 'biblioteca-personal.sqlite');
  if (!fs.existsSync(origenDb)) throw new Error('No encontré biblioteca-personal.sqlite en ' + perfil);
  const destinoDb = path.join(destino, 'biblioteca-personal.sqlite');
  fs.rmSync(destinoDb, { force: true });
  const fuente = new sqlite.DatabaseSync(origenDb, { readOnly: true });
  await sqlite.backup(fuente, destinoDb);
  fuente.close();
  // La COPIA (nunca el perfil real) queda en modo de diario DELETE: un archivo plano, sin -wal/-shm.
  const copia = new sqlite.DatabaseSync(destinoDb);
  copia.exec('PRAGMA journal_mode=DELETE');
  const integridad = copia.prepare('pragma integrity_check').get();
  const dias = copia.prepare('select count(*) total, coalesce(sum(completed),0) hechos from plan_days').get();
  const boveda = copia.prepare("select 1 from meta where key='private-vault'").get();
  const estado = copia.prepare("select value from meta where key='state'").get();
  copia.close();
  for (const extra of ['-wal', '-shm', '-journal']) if (fs.existsSync(destinoDb + extra)) throw new Error('La copia quedó con ' + extra + '; vuelve a intentarlo.');
  if (Object.values(integridad)[0] !== 'ok') throw new Error('La copia de datos no pasó la revisión de integridad.');
  let conteos = { diasPlan: dias.total, diasCompletados: dias.hechos, estadoCifrado: !!boveda };
  // Con PIN (bóveda), el estado privado va cifrado y se abre con el mismo PIN en el teléfono.
  if (!boveda && estado) {
    const st = JSON.parse(estado.value);
    conteos = { ...conteos, devocionales: (st.devotionals || []).length, oraciones: (st.prayers || []).length };
  }
  archivos.push({ archivo: 'biblioteca-personal.sqlite', tipo: 'datos', bytes: fs.statSync(destinoDb).size, sha256: await huella(destinoDb) });

  // 2. Paquete personal: módulos verificados contra su propio manifiesto.
  const carpetaMods = path.join(perfil, 'modulos', 'personal');
  const manifiesto = JSON.parse(fs.readFileSync(path.join(carpetaMods, 'manifest.json'), 'utf8'));
  for (const m of manifiesto.modulos) {
    const o = path.join(carpetaMods, m.archivo), d = path.join(destino, m.archivo);
    fs.copyFileSync(o, d);
    const h = await huella(d);
    if (h !== m.sha256) throw new Error(`El módulo ${m.archivo} no coincide con su huella.`);
    archivos.push({ archivo: m.archivo, tipo: 'modulo', id: m.id, bytes: fs.statSync(d).size, sha256: h });
  }
  if (args.includes('--modo-personal')) { manifiesto.modoPersonal = true; manifiesto.version = String(Math.max(5, Number(manifiesto.version) || 0)); }
  fs.writeFileSync(path.join(destino, 'manifest.json'), JSON.stringify(manifiesto, null, 2));
  archivos.push({ archivo: 'manifest.json', tipo: 'manifiesto', bytes: fs.statSync(path.join(destino, 'manifest.json')).size, sha256: await huella(path.join(destino, 'manifest.json')) });

  const resumen = {
    formato: 'biblioteca-biblica-traspaso', version: 1, creado: new Date().toISOString(),
    origen: 'Windows', paquete: { version: manifiesto.version, modoPersonal: !!manifiesto.modoPersonal, modulos: manifiesto.modulos.length },
    conteos, archivos,
    nota: 'Uso personal. Contiene datos privados y módulos con derechos de sus editoriales. No compartir.'
  };
  fs.writeFileSync(path.join(destino, 'traspaso.json'), JSON.stringify(resumen, null, 2));
  const total = archivos.reduce((s, a) => s + a.bytes, 0);
  console.log(`Traspaso listo en ${destino}: ${archivos.length} archivos, ${(total / 1048576).toFixed(1)} MB, plan ${conteos.diasCompletados}/${conteos.diasPlan}.`);
})().catch(e => { console.error(e.message); process.exit(1); });
