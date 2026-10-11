'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const B = require('../app/buscador-core.js');
const box = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../app/bible-data.js'), 'utf8'), box);
const books = box.window.BIBLE.books;
const nombres = idx => idx.map(i => books[i].name);
const ir = q => { const r = B.sugerencias(q, books).ir; return r ? B.nombre(r, books) : null; };

test('Biblia cargada: 66 libros y los alias en el mismo orden', () => {
  assert.equal(books.length, 66);
  assert.equal(B.ALIAS.length, 66);
  B.ALIAS.forEach((lista, i) => assert.equal(B.limpiar(books[i].name).replace(/\s/g, ''), lista[0].replace(/\s/g, ''), books[i].name));
});

test('Autocompletar libros mientras se escribe (pedido de Edward: «rey» → 1 y 2 Reyes)', () => {
  const casos = {
    'rey': ['1 Reyes', '2 Reyes'], 'Rey': ['1 Reyes', '2 Reyes'], 'reyes': ['1 Reyes', '2 Reyes'],
    're': ['1 Reyes', '2 Reyes'], 'cor': ['1 Corintios', '2 Corintios'], 'corin': ['1 Corintios', '2 Corintios'],
    'sam': ['1 Samuel', '2 Samuel'], 'cro': ['1 Crónicas', '2 Crónicas'], 'tim': ['1 Timoteo', '2 Timoteo'],
    'tes': ['1 Tesalonicenses', '2 Tesalonicenses'], 'ped': ['1 Pedro', '2 Pedro'],
    'gen': ['Génesis'], 'géne': ['Génesis'], 'éxo': ['Éxodo'], 'lev': ['Levítico'], 'deu': ['Deuteronomio'],
    'sal': ['Salmos'], 'prov': ['Proverbios'], 'ecle': ['Eclesiastés'], 'isa': ['Isaías'], 'jer': ['Jeremías'],
    'lam': ['Lamentaciones'], 'eze': ['Ezequiel'], 'dan': ['Daniel'], 'ose': ['Oseas'], 'abd': ['Abdías'],
    'miq': ['Miqueas'], 'nah': ['Nahúm'], 'hab': ['Habacuc'], 'sof': ['Sofonías'], 'hag': ['Hageo'],
    'zac': ['Zacarías'], 'mal': ['Malaquías'], 'mat': ['Mateo'], 'mar': ['Marcos'], 'luc': ['Lucas'],
    'hech': ['Hechos'], 'rom': ['Romanos'], 'gál': ['Gálatas'], 'efe': ['Efesios'], 'fili': ['Filipenses'],
    'col': ['Colosenses'], 'tit': ['Tito'], 'filem': ['Filemón'], 'heb': ['Hebreos'], 'sant': ['Santiago'],
    'jud': ['Judas'], 'jue': ['Jueces'], 'apo': ['Apocalipsis'], 'nehe': ['Nehemías'], 'est': ['Ester'], 'esd': ['Esdras'],
    'can': ['Cantares'], 'rut': ['Rut'], 'num': ['Números'], 'jos': ['Josué'], 'job': ['Job']
  };
  for (const [q, esperado] of Object.entries(casos)) {
    const r = nombres(B.sugerencias(q, books).libros);
    for (const n of esperado) assert.ok(r.includes(n), `«${q}» debería sugerir ${n}; dio ${r.join(', ')}`);
  }
});

test('Ordinales y números delante del libro', () => {
  const casos = { '1 rey': ['1 Reyes'], '1rey': ['1 Reyes'], '2 rey': ['2 Reyes'], 'primera de reyes': ['1 Reyes'], 'segunda de reyes': ['2 Reyes'],
    '1ra reyes': ['1 Reyes'], 'primera corintios': ['1 Corintios'], 'segunda de timoteo': ['2 Timoteo'], 'tercera de juan': ['3 Juan'],
    'I juan': ['1 Juan'], 'ii pedro': ['2 Pedro'], '1 p': ['1 Pedro'], '1 ti': ['1 Timoteo'], '1 jn': ['1 Juan'], '3 jn': ['3 Juan'] };
  for (const [q, esperado] of Object.entries(casos)) {
    const r = nombres(B.sugerencias(q, books).libros);
    assert.deepEqual(r.slice(0, esperado.length), esperado, `«${q}» → ${r.join(', ')}`);
  }
  assert.deepEqual(nombres(B.sugerencias('1', books).libros).slice(0, 3), ['1 Samuel', '1 Reyes', '1 Crónicas']);
});

test('Ir directo a la referencia escrita', () => {
  const casos = {
    'jn 3 16': 'Juan 3:16', 'Jn 3:16': 'Juan 3:16', 'juan 3 16': 'Juan 3:16', 'Juan 3:16': 'Juan 3:16', 'juan 3': 'Juan 3',
    '1 r 8': '1 Reyes 8', '1 reyes 8': '1 Reyes 8', 'primera de reyes 8': '1 Reyes 8', '2 rey 2:11': '2 Reyes 2:11',
    'sal 23': 'Salmos 23', 'sal 23:1-4': 'Salmos 23:1-4', 'salmo 119 105': 'Salmos 119:105', 'pr 3:5': 'Proverbios 3:5',
    'gn 1 1': 'Génesis 1:1', 'génesis 1': 'Génesis 1', 'ex 20': 'Éxodo 20', 'is 53:5': 'Isaías 53:5', 'jer 29 11': 'Jeremías 29:11',
    'mt 5': 'Mateo 5', 'mr 16:15': 'Marcos 16:15', 'lc 15': 'Lucas 15', 'hch 2:38': 'Hechos 2:38', 'ro 8:28': 'Romanos 8:28',
    '1 co 13': '1 Corintios 13', 'primera de corintios 13 4': '1 Corintios 13:4', 'gá 5:22': 'Gálatas 5:22', 'ef 2:8-9': 'Efesios 2:8-9',
    'fil 4:13': 'Filipenses 4:13', 'col 3': 'Colosenses 3', '1 ts 4:16': '1 Tesalonicenses 4:16', '2 ti 3:16': '2 Timoteo 3:16',
    'he 11:1': 'Hebreos 11:1', 'stg 1:5': 'Santiago 1:5', '1 p 5:7': '1 Pedro 5:7', '1 jn 1:9': '1 Juan 1:9', 'ap 21': 'Apocalipsis 21',
    'apocalipsis 22:21': 'Apocalipsis 22:21', 'judas 24': 'Judas 1:24', 'abdías 3': 'Abdías 1:3', 'filemón 4': 'Filemón 1:4',
    'rt 1:16': 'Rut 1:16', 'cnt 2': 'Cantares 2', 'neh 8:10': 'Nehemías 8:10', 'mal 3:10': 'Malaquías 3:10', 'jl 2:28': 'Joel 2:28',
    'reyes 8': null, 'juan 99': null, 'juan 3:99': null, 'xyz 3': null, 'jn': null
  };
  for (const [q, esperado] of Object.entries(casos)) assert.equal(ir(q), esperado, `«${q}»`);
});

test('Sin referencia única: libros posibles con el capítulo escrito («rey 8»)', () => {
  const r = B.sugerencias('rey 8', books);
  assert.equal(r.ir, null);
  assert.deepEqual(nombres(r.libros), ['1 Reyes', '2 Reyes']);
  assert.equal(r.capitulo, 8);
});

test('Strong y palabras', () => {
  assert.equal(B.sugerencias('h7121', books).strong, 'H7121');
  assert.equal(B.sugerencias('G25', books).strong, 'G25');
  assert.equal(B.sugerencias('g 0025', books).strong, 'G25');
  assert.deepEqual(B.sugerencias('g25', books).libros, []);
  assert.equal(B.sugerencias('pastor', books).palabra, 'pastor');
  assert.equal(B.sugerencias('vida eterna', books).palabra, 'vida eterna');
  assert.equal(B.sugerencias('jn 3 16', books).palabra, null, 'una referencia no se busca como palabra');
  assert.deepEqual(B.sugerencias('', books), { ir: null, libros: [], palabra: null, strong: null });
  assert.deepEqual(B.sugerencias('   ', books).libros, []);
});
