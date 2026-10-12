'use strict';
// Modo enfoque: la Biblia, el Comentario o el Diccionario solos, a pantalla completa, sin distracciones.
// Un botón «⤢» en la cabecera de cada panel; dentro, una barra discreta con A−, A+ y Salir.
// Funciona igual en escritorio y en el teléfono; Esc (o «atrás» en Android) sale.
(function () {
  const html = document.documentElement;
  const PANELES = [['biblia', '#pane-biblia', 'la Biblia'], ['comentario', '#pane-comentario', 'el comentario'], ['diccionario', '#pane-diccionario', 'el diccionario']];
  let barra = null;

  function crearBarra() {
    barra = document.createElement('div');
    barra.id = 'enfoque-barra';
    barra.setAttribute('role', 'toolbar');
    barra.setAttribute('aria-label', 'Lectura a pantalla completa');
    barra.innerHTML = '<button type="button" class="quiet" data-enfoque-accion="menos" aria-label="Letra más pequeña">A−</button>' +
      '<button type="button" class="quiet" data-enfoque-accion="mas" aria-label="Letra más grande">A+</button>' +
      '<button type="button" class="quiet" data-enfoque-accion="salir">Salir ✕</button>';
    barra.addEventListener('click', e => {
      const b = e.target.closest('[data-enfoque-accion]');
      if (!b) return;
      if (b.dataset.enfoqueAccion === 'menos') document.getElementById('smaller')?.click();
      if (b.dataset.enfoqueAccion === 'mas') document.getElementById('larger')?.click();
      if (b.dataset.enfoqueAccion === 'salir') salir();
    });
    document.body.append(barra);
  }

  function entrar(panel) {
    if (!barra) crearBarra();
    html.dataset.enfoque = panel;
    barra.hidden = false;
    try { if (!document.fullscreenElement && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {}); } catch { /* la vista ya ocupa toda la ventana */ }
    const cuerpo = document.querySelector(PANELES.find(p => p[0] === panel)[1] + ' .pane-body');
    if (cuerpo) cuerpo.focus({ preventScroll: true });
  }

  function salir() {
    if (!html.dataset.enfoque) return false;
    delete html.dataset.enfoque;
    if (barra) barra.hidden = true;
    try { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {}); } catch { /* sin pantalla completa */ }
    return true;
  }

  // La fila del título de cada panel lleva sus acciones (pedido de Edward, 12-oct: en la PC el texto quedaba bajo
  // dos filas de botones). En el teléfono esos botones se ocultan o los acomoda movil.js.
  function accionesDe(selector) {
    const fila = document.querySelector(selector + ' .pane-heading');
    if (!fila) return null;
    let a = document.querySelector(selector + ' .pane-acciones');
    if (!a) { a = document.createElement('div'); a.className = 'pane-acciones'; fila.append(a); }
    return a;
  }

  function botones() {
    for (const [panel, selector, nombre] of PANELES) {
      const cabecera = accionesDe(selector) || document.querySelector(selector + ' .pane-head');
      if (!cabecera || cabecera.querySelector('.enfoque-abrir')) continue;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'quiet enfoque-abrir';
      b.innerHTML = '<span aria-hidden="true">⤢</span><span class="etq"> Pantalla completa</span>';
      b.title = 'Leer ' + nombre + ' a pantalla completa';
      b.setAttribute('aria-label', b.title);
      b.addEventListener('click', () => entrar(panel));
      cabecera.append(b);
    }
  }

  // Algunos diseños (A · Libro abierto) no muestran la fila «Mi Biblia»: ahí las acciones van en la línea de la cita.
  function colocarBiblia() {
    const a = accionesDe('#pane-biblia'), fila = document.querySelector('#pane-biblia .pane-heading'), ref = document.getElementById('bible-ref');
    if (!a || !fila) return;
    if (getComputedStyle(fila).display !== 'none') { if (a.parentElement !== fila) fila.append(a); return; }
    if (!ref) return;
    let linea = ref.parentElement.classList.contains('pane-ref-fila') ? ref.parentElement : null;
    if (!linea) { linea = document.createElement('div'); linea.className = 'pane-ref-fila'; ref.before(linea); linea.append(ref); }
    if (a.parentElement !== linea) linea.append(a);
  }

  // PC: «Comparar versiones» sube a la fila de «Mi Biblia» y «Referencias cruzadas» a la de «Comentario».
  // En el teléfono «Comparar» vuelve a su sección (movil.js la pone junto a la versión) y las referencias son una pestaña.
  function acomodar() {
    const telefono = html.dataset.telefono === 'true';
    colocarBiblia();
    const comparar = document.querySelector('.comparison-actions'), seccion = document.getElementById('comparison-controls'), enBiblia = accionesDe('#pane-biblia');
    if (comparar && seccion && enBiblia) {
      if (telefono) { if (comparar.parentElement !== seccion) seccion.prepend(comparar); }
      else if (comparar.parentElement !== enBiblia) enBiblia.prepend(comparar);
    }
    const caja = document.getElementById('connections-box'), enComentario = accionesDe('#pane-comentario');
    if (caja && enComentario && !enComentario.querySelector('.refs-abrir')) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'quiet refs-abrir'; b.title = 'Referencias cruzadas'; b.setAttribute('aria-label', b.title);
      b.innerHTML = '<span aria-hidden="true">↗</span><span class="etq"> Referencias cruzadas</span>';
      b.setAttribute('aria-controls', 'connections-box'); b.setAttribute('aria-expanded', String(caja.open));
      b.addEventListener('click', () => { caja.open = !caja.open; });
      caja.addEventListener('toggle', () => b.setAttribute('aria-expanded', String(caja.open)));
      enComentario.prepend(b);
    }
    compactar();
  }

  // Si las acciones no caben en la misma fila que el título (o la cita), quedan solo los íconos ⤢ y ↗
  // (con su nombre al pasar el mouse): así nunca bajan a tapar el selector del panel.
  function compactar() {
    if (html.dataset.telefono === 'true') return;
    for (const a of document.querySelectorAll('.pane-acciones')) {
      a.classList.remove('compactas');
      const fila = a.parentElement, primero = fila && fila.firstElementChild;
      if (!primero || primero === a || a.getBoundingClientRect().width === 0) continue;
      const tops = [...a.children].filter(b => b.getBoundingClientRect().width > 0).map(b => Math.round(b.getBoundingClientRect().top));
      const otraLinea = a.getBoundingClientRect().top > primero.getBoundingClientRect().bottom - 4 || new Set(tops).size > 1;
      if (otraLinea) a.classList.add('compactas');
    }
  }
  let medida = 0;
  const alCambiarTamano = () => { cancelAnimationFrame(medida); medida = requestAnimationFrame(compactar); };

  document.addEventListener('keydown', e => { if (e.key === 'Escape' && html.dataset.enfoque) { e.preventDefault(); salir(); } });
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && html.dataset.enfoque) salir(); });
  window.BibliaEnfoque = { entrar, salir, activo: () => !!html.dataset.enfoque };
  const iniciar = () => { botones(); acomodar(); try { const ro = new ResizeObserver(alCambiarTamano); document.querySelectorAll('#panes > .pane').forEach(p => ro.observe(p)); } catch { window.addEventListener('resize', alCambiarTamano); } new MutationObserver(() => { acomodar(); setTimeout(acomodar, 400); }).observe(html, { attributes: true, attributeFilter: ['data-telefono', 'data-design'] }); setTimeout(acomodar, 400); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
