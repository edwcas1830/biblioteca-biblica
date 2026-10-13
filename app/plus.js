'use strict';
// Biblioteca Plus · VISTA PREVIA (Edward, 13-oct): la versión que recibirá la gente, con lo gratis abierto y los
// candados de CONSENSO-HABITO #11 (IA ampliada, sincronización, pareja o círculo, planes especiales, fondos con IA).
// Nunca llevan candado: leer, estudiar, el audio, «Hoy», los logros, las copias y la accesibilidad.
// Todavía NO cobra: el pago llega con Google Play Billing (entrega 4D). Para ver la app «con Plus» hay un interruptor
// «Simular Plus» que solo existe en esta vista previa. Solo actúa en la edición tienda (Google Play).
(function (root) {
  const PRECIOS = { mensual: { precio: 'US$4,99', periodo: 'al mes', prueba: 4 }, anual: { precio: 'US$29,99', periodo: 'al año', prueba: 4, equivale: 'US$2,50 al mes' } };
  const FUNCIONES = {
    ia: { titulo: 'IA ampliada', texto: '10 preguntas al día a «Preguntar a la Biblia» (gratis: 3).' },
    sync: { titulo: 'Sincronizar tus aparatos', texto: 'Tus notas, resaltados y avance en el teléfono, la PC y la web.' },
    pareja: { titulo: 'Leer en pareja o en círculo', texto: 'Un plan compartido con tu pareja o tu grupo pequeño.' },
    planes: { titulo: 'Planes especiales', texto: 'Colecciones de planes por temas y temporadas.' },
    fondos: { titulo: 'Fondos con IA', texto: 'Fondos únicos para tus imágenes con versículos.' }
  };
  const GRATIS = ['Leer, estudiar y escuchar la Biblia', '«Hoy», versículo del día y logros', 'Diccionario griego y hebreo, mapas y referencias', '3 preguntas al día a la IA', 'Copias de seguridad y accesibilidad'];
  const DIA = 86400000;
  const clave = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  // Fecha del primer cobro: hoy + días de prueba (se muestra en la pantalla de pago, CONSENSO-HABITO #11).
  const primerCobro = (plan = 'mensual', hoy = new Date()) => new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + PRECIOS[plan].prueba);
  // Tarjeta en «Hoy»: como máximo una semana sí y otra no se ofrece, y solo ese día; nunca si pidió «No mostrar ofertas».
  function tocaTarjeta({ sinOfertas, ultima, cerrada }, hoy = new Date()) {
    if (sinOfertas) return false;
    const h = clave(hoy);
    if (cerrada === h) return false;
    if (!ultima) return true;
    if (ultima === h) return true;
    const [a, m, d] = ultima.split('-').map(Number);
    return hoy - new Date(a, m - 1, d) >= 7 * DIA;
  }
  const core = { PRECIOS, FUNCIONES, GRATIS, primerCobro, tocaTarjeta, clave };
  if (typeof module === 'object' && module.exports) { module.exports = core; return; }

  const doc = root.document;
  const enTienda = () => root.BIBLIA_EDICION === 'tienda';
  const LS = { sim: 'biblioteca-plus-simulado', no: 'biblioteca-plus-sin-ofertas', ultima: 'biblioteca-plus-tarjeta', cerrada: 'biblioteca-plus-tarjeta-cerrada' };
  const leer = k => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };
  const escribir = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };
  const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const activo = () => enTienda() && leer(LS.sim) === 'si';
  const avisar = t => { if (typeof root.toast === 'function') root.toast(t); };
  const fechaLarga = d => d.toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' });
  let dlg = null, plan = 'mensual';

  function pintarPlan() {
    if (!dlg) return;
    for (const b of dlg.querySelectorAll('[data-plus-plan]')) b.setAttribute('aria-checked', String(b.dataset.plusPlan === plan));
    const p = PRECIOS[plan];
    dlg.querySelector('#plus-condiciones').textContent = `Prueba gratis de ${p.prueba} días. Primer cobro: ${fechaLarga(primerCobro(plan))}, ${p.precio} ${p.periodo}. Se renueva solo; cancela antes de esa fecha en Google Play › Pagos y suscripciones › Suscripciones y no se te cobra nada.`;
  }
  function pintarEstado() {
    if (!dlg) return;
    const si = activo();
    dlg.querySelector('#plus-simular').checked = si;
    dlg.querySelector('#plus-estado').textContent = si ? 'Tienes Plus (simulado en esta vista previa).' : 'Estás usando la versión gratis.';
    refrescar();
  }
  function refrescar() {
    if (!enTienda()) return;
    const si = activo();
    doc.documentElement.dataset.plus = si ? 'si' : 'no';
    for (const b of doc.querySelectorAll('[data-plus-funcion]')) b.classList.toggle('plus-con-candado', !si);
  }
  function construir() {
    dlg = doc.createElement('dialog');
    dlg.id = 'plus-oferta'; dlg.setAttribute('aria-labelledby', 'plus-titulo');
    dlg.innerHTML = `<div class="plus-cabeza"><h2 id="plus-titulo">Biblioteca Plus</h2><button type="button" class="quiet" data-plus="cerrar" aria-label="Cerrar">✕</button></div>
<p class="plus-motivo" id="plus-motivo" hidden></p>
<p class="plus-lema">Apoya el proyecto y abre las funciones que necesitan servidor.</p>
<h3>Con Plus</h3><ul class="plus-lista plus-incluye">${Object.values(FUNCIONES).map(f => `<li><b>${esc(f.titulo)}</b><span>${esc(f.texto)}</span></li>`).join('')}</ul>
<h3>Siempre gratis</h3><ul class="plus-lista plus-gratis">${GRATIS.map(g => `<li>${esc(g)}</li>`).join('')}</ul>
<div class="plus-planes" role="radiogroup" aria-label="Plan">
<button type="button" role="radio" data-plus-plan="mensual"><b>Mensual</b><span>${PRECIOS.mensual.precio} ${PRECIOS.mensual.periodo}</span><small>${PRECIOS.mensual.prueba} días gratis</small></button>
<button type="button" role="radio" data-plus-plan="anual"><b>Anual</b><span>${PRECIOS.anual.precio} ${PRECIOS.anual.periodo}</span><small>${PRECIOS.anual.equivale} · ${PRECIOS.anual.prueba} días gratis</small></button></div>
<p class="plus-condiciones" id="plus-condiciones"></p>
<div class="plus-acciones"><button type="button" class="primary" data-plus="comprar">Empezar prueba gratis</button><button type="button" class="outline" data-plus="gratis">Continuar gratis</button></div>
<p class="plus-aviso" id="plus-aviso" role="status"></p>
<div class="plus-pie"><button type="button" class="quiet" data-plus="restaurar">Restaurar compra</button><label class="checkbox-label"><input type="checkbox" id="plus-sin-ofertas"> No mostrar ofertas</label></div>
<div class="plus-vista-previa"><p><b>Vista previa para probar</b> · el pago todavía no existe. Activa esto para ver la app como la vería alguien con Plus.</p><label class="checkbox-label"><input type="checkbox" id="plus-simular" role="switch"> Simular Plus en este aparato</label><p class="muted" id="plus-estado"></p></div>`;
    doc.body.append(dlg);
    dlg.addEventListener('click', ev => {
      if (ev.target === dlg) return dlg.close();
      const b = ev.target.closest('button'); if (!b) return;
      if (b.dataset.plusPlan) { plan = b.dataset.plusPlan; pintarPlan(); return; }
      const a = b.dataset.plus, aviso = dlg.querySelector('#plus-aviso');
      if (a === 'cerrar' || a === 'gratis') dlg.close();
      else if (a === 'comprar') aviso.textContent = 'Vista previa: aquí se abrirá el pago seguro de Google Play. Todavía no se cobra nada.';
      else if (a === 'restaurar') aviso.textContent = 'Vista previa: aquí se recuperará una compra hecha con tu cuenta de Google.';
    });
    dlg.addEventListener('change', ev => {
      if (ev.target.id === 'plus-sin-ofertas') escribir(LS.no, ev.target.checked ? 'si' : '');
      if (ev.target.id === 'plus-simular') { escribir(LS.sim, ev.target.checked ? 'si' : ''); pintarEstado(); avisar(ev.target.checked ? 'Plus simulado: los candados se abren en esta vista previa.' : 'De vuelta a la versión gratis.'); root.HoyApp?.render?.(); }
    });
  }
  function oferta(origen) {
    if (!enTienda()) return;
    if (!dlg) construir();
    const m = dlg.querySelector('#plus-motivo'), f = FUNCIONES[origen];
    m.hidden = !f; m.textContent = f ? `«${f.titulo}» es parte de Plus.` : '';
    dlg.querySelector('#plus-aviso').textContent = '';
    dlg.querySelector('#plus-sin-ofertas').checked = leer(LS.no) === 'si';
    pintarPlan(); pintarEstado();
    if (!dlg.open) dlg.showModal();
  }
  // Puerta de una función con candado: con Plus corre la acción (o avisa que llega pronto); sin Plus, la oferta.
  function pedir(id, accion) {
    if (!enTienda()) return accion?.();
    if (!activo()) return oferta(id);
    if (accion) return accion();
    avisar(`${FUNCIONES[id]?.titulo || 'Esta función'} llega pronto. En la vista previa ya la tienes desbloqueada.`);
  }
  // Botón con candado (lo usan el menú del teléfono, la IA y la imagen).
  function boton(id, clase = 'quiet') {
    const b = doc.createElement('button');
    b.type = 'button'; b.className = clase + ' plus-funcion' + (activo() ? '' : ' plus-con-candado'); b.dataset.plusFuncion = id;
    b.textContent = FUNCIONES[id].titulo;
    b.addEventListener('click', () => pedir(id));
    return b;
  }
  function decorarIA(dialogo) {
    if (!enTienda() || dialogo.querySelector('[data-plus-funcion="ia"]')) return;
    const b = boton('ia', 'quiet plus-ia'); b.textContent = 'Plus: 10 preguntas al día';
    dialogo.querySelector('.ia-acciones')?.after(b);
  }
  function decorarImagen(dialogo) {
    if (!enTienda() || dialogo.querySelector('[data-plus-funcion="fondos"]')) return;
    const b = boton('fondos', 'outline plus-fondos'); b.textContent = '✦ Fondo creado con IA';
    (dialogo.querySelector('#imagen-ia') || dialogo.querySelector('.imagen-acciones'))?.before(b);
  }
  function tarjetaHoy() {
    if (!enTienda() || activo()) return '';
    const hoy = new Date();
    if (!tocaTarjeta({ sinOfertas: leer(LS.no) === 'si', ultima: leer(LS.ultima), cerrada: leer(LS.cerrada) }, hoy)) return '';
    // tocaTarjeta solo deja pasar el mismo día ya anotado o uno nuevo tras 7 días: ese día queda como el de la semana.
    if (leer(LS.ultima) !== clave(hoy)) escribir(LS.ultima, clave(hoy));
    return `<section class="plus-tarjeta" aria-label="Biblioteca Plus"><p class="eyebrow">BIBLIOTECA PLUS</p><p>Sincroniza tus aparatos, lee en pareja y pregunta más a la IA. ${PRECIOS.mensual.prueba} días gratis.</p><div><button type="button" class="outline" data-plus-tarjeta="ver">Conocer Plus</button><button type="button" class="quiet" data-plus-tarjeta="no">Ahora no</button></div></section>`;
  }
  doc.addEventListener('click', ev => {
    const b = ev.target.closest('[data-plus-tarjeta]'); if (!b) return;
    if (b.dataset.plusTarjeta === 'ver') oferta();
    else { escribir(LS.cerrada, clave(new Date())); b.closest('.plus-tarjeta')?.remove(); }
  });
  refrescar();
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', refrescar); else setTimeout(refrescar, 0);
  root.BibliaPlus = { ...core, enTienda, activo, oferta, pedir, boton, decorarIA, decorarImagen, tarjetaHoy, refrescar };
})(typeof globalThis !== 'undefined' ? globalThis : this);
