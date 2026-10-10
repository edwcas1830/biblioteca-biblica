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

  function botones() {
    for (const [panel, selector, nombre] of PANELES) {
      const cabecera = document.querySelector(selector + ' .pane-head');
      if (!cabecera || cabecera.querySelector('.enfoque-abrir')) continue;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'quiet enfoque-abrir';
      b.textContent = '⤢';
      b.title = 'Leer ' + nombre + ' a pantalla completa';
      b.setAttribute('aria-label', b.title);
      b.addEventListener('click', () => entrar(panel));
      cabecera.append(b);
    }
  }

  document.addEventListener('keydown', e => { if (e.key === 'Escape' && html.dataset.enfoque) { e.preventDefault(); salir(); } });
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && html.dataset.enfoque) salir(); });
  window.BibliaEnfoque = { entrar, salir, activo: () => !!html.dataset.enfoque };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', botones); else botones();
})();
