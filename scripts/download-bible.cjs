const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const names = ['Génesis','Éxodo','Levítico','Números','Deuteronomio','Josué','Jueces','Rut','1 Samuel','2 Samuel','1 Reyes','2 Reyes','1 Crónicas','2 Crónicas','Esdras','Nehemías','Ester','Job','Salmos','Proverbios','Eclesiastés','Cantares','Isaías','Jeremías','Lamentaciones','Ezequiel','Daniel','Oseas','Joel','Amós','Abdías','Jonás','Miqueas','Nahúm','Habacuc','Sofonías','Hageo','Zacarías','Malaquías','Mateo','Marcos','Lucas','Juan','Hechos','Romanos','1 Corintios','2 Corintios','Gálatas','Efesios','Filipenses','Colosenses','1 Tesalonicenses','2 Tesalonicenses','1 Timoteo','2 Timoteo','Tito','Filemón','Hebreos','Santiago','1 Pedro','2 Pedro','1 Juan','2 Juan','3 Juan','Judas','Apocalipsis'];
const source = 'https://raw.githubusercontent.com/scrollmapper/bible_databases/master/formats/json/SpaRV.json';
async function main() {
  const response = await fetch(source, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`Descarga fallida: ${response.status}`);
  const raw = await response.text();
  const data = JSON.parse(raw);
  if (!Array.isArray(data.books) || data.books.length !== 66 || !data.translation.includes('1909')) throw new Error('La fuente no corresponde a la edición esperada.');
  const books = data.books.map((book, i) => ({ name: names[i], chapters: book.chapters.map((ch, j) => {
    if (ch.chapter !== j + 1 || !ch.verses.length || ch.verses.some((v,k) => v.verse !== k+1 || typeof v.text !== 'string')) throw new Error('Capítulos o versículos inconsistentes.');
    return ch.verses.map(v => v.text);
  }) }));
  const chapters = books.reduce((sum,b) => sum+b.chapters.length,0);
  const verses = books.reduce((sum,b) => sum+b.chapters.reduce((n,ch) => n+ch.length,0),0);
  if (chapters !== 1189 || verses < 30000) throw new Error('La Biblia descargada parece incompleta.');
  const meta = { edition: 'Reina-Valera 1909', source, license: 'Texto bíblico de dominio público', downloaded: new Date().toISOString(), sha256: crypto.createHash('sha256').update(raw).digest('hex'), books: 66, chapters, verses };
  const target = path.join(__dirname,'..','app','bible-data.js');
  await fs.writeFile(target, 'window.BIBLE = ' + JSON.stringify({ meta, books }) + ';\n', 'utf8');
  await fs.writeFile(path.join(__dirname,'..','FUENTE-BIBLIA.json'), JSON.stringify(meta,null,2),'utf8');
  console.log(`Biblia preparada: 66 libros, ${chapters} capítulos, ${verses} versículos.`);
}
main().catch(error => { console.error(error.message); process.exitCode=1; });
