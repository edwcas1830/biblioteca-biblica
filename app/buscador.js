'use strict';
// Buscador único (CONSENSO-MOVIL.md, paso 1): un campo que entiende libro, cita, palabra y Strong, y un índice
// libro → capítulo cuando todavía no se escribe nada. Usa BuscadorCore (núcleo probado) y el buscador de texto
// existente para las palabras. Se abre con window.BibliaBuscador.abrir().
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const el = (tag, attrs = {}, hijos = []) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) { if (k === 'texto') e.textContent = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v); }
    for (const h of hijos) if (h) e.append(h);
    return e;
  };
  const libros = () => (typeof books !== 'undefined' ? books : window.BIBLE?.books) || [];
  const CORTOS = ['Gn', 'Éx', 'Lv', 'Nm', 'Dt', 'Jos', 'Jue', 'Rt', '1 S', '2 S', '1 R', '2 R', '1 Cr', '2 Cr', 'Esd', 'Neh', 'Est', 'Job', 'Sal', 'Pr', 'Ec', 'Cnt', 'Is', 'Jer', 'Lm', 'Ez', 'Dn', 'Os', 'Jl', 'Am', 'Abd', 'Jon', 'Miq', 'Nah', 'Hab', 'Sof', 'Hag', 'Zac', 'Mal', 'Mt', 'Mr', 'Lc', 'Jn', 'Hch', 'Ro', '1 Co', '2 Co', 'Gá', 'Ef', 'Fil', 'Col', '1 Ts', '2 Ts', '1 Ti', '2 Ti', 'Tit', 'Flm', 'He', 'Stg', '1 P', '2 P', '1 Jn', '2 Jn', '3 Jn', 'Jud', 'Ap'];
  let dialogo, campo, lista;

  function ir(ref) {
    dialogo.close();
    if (typeof go === 'function') go(ref.book, ref.chapter, ref.verse || 1, ref.endVerse);
    if (typeof showView === 'function') { try { showView('read'); } catch { /* ya en lectura */ } }
  }
  function buscarTexto(texto, modo) {
    dialogo.close();
    const d = $('#search-dialog'), m = $('#search-mode'), i = $('#search-input');
    if (!d || !i) return;
    if (m && [...m.options].some(o => o.value === modo)) m.value = modo;
    m?.dispatchEvent(new Event('change', { bubbles: true }));
    i.value = texto;
    d.showModal();
    i.dispatchEvent(new Event('input', { bubbles: true }));
  }
  const seccion = titulo => el('h3', { class: 'buscador-seccion', texto: titulo });
  const fila = (texto, accion, extra = {}) => el('button', { type: 'button', class: 'buscador-fila', onclick: accion, texto, ...extra });
  function capitulos(b, resaltado) {
    const n = libros()[b]?.chapters?.length || 0;
    return el('div', { class: 'buscador-caps', role: 'group', 'aria-label': 'Capítulos de ' + libros()[b].name },
      Array.from({ length: n }, (_, i) => el('button', { type: 'button', class: i + 1 === resaltado ? 'activo' : '', texto: String(i + 1), 'aria-label': libros()[b].name + ' ' + (i + 1), onclick: () => ir({ book: b, chapter: i + 1 }) })));
  }
  function indice(libroAbierto) {
    lista.replaceChildren();
    if (libroAbierto !== undefined) {
      lista.append(el('div', { class: 'buscador-volver' }, [fila('← Todos los libros', () => indice())]), seccion(libros()[libroAbierto].name), capitulos(libroAbierto));
      return;
    }
    const rejilla = (desde, hasta) => el('div', { class: 'buscador-libros' }, libros().slice(desde, hasta).map((l, i) =>
      el('button', { type: 'button', title: l.name, 'aria-label': l.name, texto: CORTOS[desde + i] || l.name, onclick: () => indice(desde + i) })));
    lista.append(seccion('Antiguo Testamento'), rejilla(0, 39), seccion('Nuevo Testamento'), rejilla(39, 66));
  }
  function pintar() {
    const q = campo.value;
    if (!q.trim()) { indice(); return; }
    const r = window.BuscadorCore.sugerencias(q, libros());
    lista.replaceChildren();
    if (r.ir) lista.append(seccion('Ir a'), fila('→ ' + window.BuscadorCore.nombre(r.ir, libros()), () => ir(r.ir), { class: 'buscador-fila principal' }));
    if (r.libros?.length) {
      lista.append(seccion('Libros'));
      for (const b of r.libros) {
        if (r.capitulo && r.capitulo <= libros()[b].chapters.length) lista.append(fila('→ ' + libros()[b].name + ' ' + r.capitulo, () => ir({ book: b, chapter: r.capitulo })));
        else lista.append(fila(libros()[b].name, () => { campo.value = ''; indice(b); }), capitulos(b));
      }
    }
    if (r.strong) lista.append(seccion('Strong'), fila(r.strong + ' · buscar en el texto', () => buscarTexto(r.strong, 'strong')));
    if (r.palabra) lista.append(seccion('Buscar en el texto'), fila('⌕ «' + r.palabra + '» en toda la Biblia', () => buscarTexto(r.palabra, 'text')));
    if (!lista.childElementCount) lista.append(el('p', { class: 'buscador-vacio', texto: 'No encontré un libro con ese nombre. Prueba con «Juan», «Sal 23» o una palabra.' }));
  }
  function construir() {
    campo = el('input', { type: 'search', id: 'buscador-campo', autocomplete: 'off', enterkeyhint: 'go', 'aria-label': 'Libro, cita o palabra', placeholder: 'Libro, cita o palabra (rey, jn 3 16)' });
    campo.addEventListener('input', pintar);
    campo.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('.buscador-fila', lista)?.click(); } });
    lista = el('div', { class: 'buscador-lista', role: 'region', 'aria-live': 'polite', 'aria-label': 'Sugerencias' });
    dialogo = el('dialog', { id: 'buscador', 'aria-label': 'Buscar en la Biblia' }, [
      el('header', { class: 'buscador-cab' }, [el('button', { type: 'button', class: 'quiet', 'aria-label': 'Cerrar buscador', texto: '←', onclick: () => dialogo.close() }), campo]),
      lista
    ]);
    document.body.append(dialogo);
  }
  function abrir({ indice: conIndice = true, texto = '' } = {}) {
    if (!dialogo) construir();
    campo.value = texto;
    if (conIndice || !texto) pintar();
    dialogo.showModal();
    // En el teléfono, el teclado solo aparece si se pidió buscar (no al abrir el índice desde la referencia).
    if (!conIndice) setTimeout(() => campo.focus(), 50);
  }
  window.BibliaBuscador = { abrir, cerrar: () => dialogo?.close(), get abierto() { return !!dialogo?.open; } };
})();
