'use strict';
// Genera una carpeta de traspaso SINTÉTICA (datos inventados, nada de Edward) con el exportador real:
// perfil de Windows (lib/personal-store.cjs) con plan 1189/329, 2 devocionales y una nota, más un módulo
// e-Sword mínimo con su manifiesto; luego corre traspaso-pc.cjs como lo haría en la PC.
// Uso: node mobile/scripts/fixture-traspaso.cjs <carpeta-de-trabajo-fuera-del-repo>
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const repo = path.resolve(__dirname, '..', '..');
const trabajo = path.resolve(process.argv[2] || '');
if (!process.argv[2] || trabajo.startsWith(repo)) { console.error('Indica una carpeta fuera del repositorio.'); process.exit(2); }
const { PersonalStore } = require(path.join(repo, 'lib', 'personal-store.cjs'));

const perfil = path.join(trabajo, 'perfil-sintetico'), destino = path.join(trabajo, 'traspaso');
fs.rmSync(trabajo, { recursive: true, force: true });
const estado = {
  version: 1, position: { book: 18, chapter: 23, verse: 1 },
  notes: { '18:23:1': 'Nota sintética del traspaso' }, highlights: { '18:23:1': 'gold' },
  plans: [{ id: 'plan-1760000000000-sintetico', days: 1189, scope: 'custom', title: 'Plan sintético', entries: Array.from({ length: 1189 }, (_, i) => ({ title: 'Día ' + (i + 1), readings: [{ book: 18, chapter: 23 }] })), completed: Array.from({ length: 329 }, (_, i) => i) }],
  devotionals: ['a', 'b'].map(x => ({ id: 'dev-sintetico-' + x, title: 'Devocional sintético ' + x, entries: [{ title: 'Día 1', body: 'Contenido inventado', book: 18, chapter: 23 }], completed: [], lastDay: 0 })),
  prayers: [], devResponses: {}, planNotes: {}, prayerDrafts: {}, guideResponses: {}, aiStudies: [], appearance: { design: 'a' }, font: 20
};
const store = new PersonalStore(perfil); store.write(estado); store.close();

const carpetaMods = path.join(perfil, 'modulos', 'personal');
fs.mkdirSync(carpetaMods, { recursive: true });
const archivo = 'texto-sintetico.bblx';
const db = new DatabaseSync(path.join(carpetaMods, archivo));
db.exec('CREATE TABLE Bible(Book INTEGER,Chapter INTEGER,Verse INTEGER,Scripture TEXT);');
db.prepare('INSERT INTO Bible VALUES(19,23,1,?)').run('{\\rtf1 Texto inventado para la prueba del emulador}');
db.close();
const bytes = fs.readFileSync(path.join(carpetaMods, archivo));
fs.writeFileSync(path.join(carpetaMods, 'manifest.json'), JSON.stringify({
  paquete: 'personal', version: '5', modoPersonal: true,
  modulos: [{ id: 'texto-sintetico', tipo: 'biblia', rol: 'version', archivo, titulo: 'Texto inventado para pruebas', abreviatura: 'SINT', registros: 1, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), origen: 'sintético', formato: 'e-Sword SQLite (RTF)', iaPermitida: false }]
}, null, 2));

execFileSync(process.execPath, [path.join(__dirname, 'traspaso-pc.cjs'), destino, '--perfil', perfil, '--modo-personal'], { stdio: 'inherit' });
console.log('Carpeta sintética lista:', destino, fs.readdirSync(destino).join(', '));
