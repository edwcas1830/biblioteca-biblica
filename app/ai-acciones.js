'use strict';
// Estudiar con IA mientras lees (CONSENSO-IA-ESTUDIO.md, aprobado por Edward el 10-oct):
// seis acciones de un toque sobre el pasaje abierto, «Tu pregunta…» siempre a la vista, y lo técnico
// (fuentes a mano, ver qué se envía, llevar a otra IA) dentro de «Avanzado». Reutiliza el flujo actual
// (aiPrepare/aiAsk de study-chat.js); cuando el contrato ofrezca `action`, cada botón la enviará.
(function () {
  const $ = s => document.querySelector(s);
  const ACCIONES = [
    { id: 'contexto', texto: 'Contexto histórico', comentario: true,
      pregunta: r => `Contexto histórico de ${r}: autor, fecha, destinatarios, situación y costumbres que ayudan a entenderlo. Di claramente cuándo algo es incierto.` },
    { id: 'exegesis', texto: 'Exégesis', comentario: true,
      pregunta: r => `Exégesis de ${r}: qué dice el texto en su contexto inmediato, su estructura y su sentido. Separa «Lo que dice el texto» de «Interpretación».` },
    { id: 'paralelos', texto: 'Pasajes paralelos', comentario: true,
      pregunta: r => `Pasajes paralelos de ${r}: entre 3 y 6 pasajes relacionados y por qué se conectan (narrativo, temático o profético). Cita solo referencias reales y verificables.` },
    { id: 'originales', texto: 'Palabras originales', comentario: false,
      pregunta: r => `Palabras originales clave de ${r} (hebreo o griego): qué significan y cómo se usan en este pasaje, sin falacias de raíz ni equivalencias forzadas.` },
    { id: 'dios', texto: 'Qué enseña de Dios', comentario: true,
      pregunta: r => `Qué enseña de Dios ${r}: la verdad central sobre Dios en este pasaje, anclada en lo que dice el texto.` },
    { id: 'vida', texto: 'Para mi vida', comentario: false, vivir: true,
      pregunta: r => `Para mi vida: aplicación concreta de ${r} para hoy, distinguiendo su sentido original de la aplicación.` }
  ];
  const referencia = () => ($('#ai-reference')?.textContent || '').trim() || 'este pasaje';

  function usar(accion) {
    const pregunta = $('#ai-question');
    if (!pregunta || (typeof aiWorking !== 'undefined' && aiWorking)) return;
    window.BibliaAccionActual = accion.id;
    pregunta.value = accion.pregunta(referencia());
    const comentario = $('#ai-include-comment');
    if (comentario && !comentario.disabled) comentario.checked = !!accion.comentario;
    const vivir = $('#ai-living'); if (vivir) vivir.checked = !!accion.vivir;
    const biblia = $('#ai-include-bible'); if (biblia) biblia.checked = true;
    const tarea = $('#ai-task'); if (tarea && tarea.value !== 'explain' && !(typeof aiSeries !== 'undefined' && aiSeries)) tarea.value = 'explain';
    for (const el of [pregunta, comentario, vivir, biblia, tarea]) el?.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelectorAll('#ai-acciones button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.accion === accion.id)));
    $('#ai-ask')?.click();
  }

  function construir() {
    const compose = $('#ai-compose');
    if (!compose || $('#ai-acciones')) return;
    const fila = document.createElement('div');
    fila.id = 'ai-acciones'; fila.setAttribute('role', 'group'); fila.setAttribute('aria-label', 'Estudiar este pasaje');
    for (const a of ACCIONES) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'ai-accion'; b.dataset.accion = a.id; b.textContent = a.texto; b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', () => usar(a));
      fila.append(b);
    }
    compose.prepend(fila);
    const pregunta = $('#ai-question'); if (pregunta) pregunta.placeholder = 'Tu pregunta sobre este pasaje…';
    pregunta?.addEventListener('input', e => { if (e.isTrusted) { window.BibliaAccionActual = 'pregunta'; document.querySelectorAll('#ai-acciones button').forEach(b => b.setAttribute('aria-pressed', 'false')); } });
    const preguntar = $('#ai-ask'); if (preguntar) preguntar.textContent = 'Consultar →';

    // «Avanzado»: el selector de objetivo, las casillas y «Ver qué se envía» dejan de estar a la vista.
    const opciones = $('#ai-context-options');
    if (opciones) {
      const resumen = opciones.querySelector('summary'); if (resumen) resumen.textContent = 'Avanzado';
      const tarea = $('#ai-task');
      if (tarea && !(typeof aiSeries !== 'undefined' && aiSeries)) tarea.hidden = true; // las acciones lo reemplazan; el borrador va a Devocionales
      const ver = $('#ai-prepare'); if (ver) { ver.textContent = 'Ver qué se envía'; opciones.append(ver); }
    }
    // Los tres botones «Copiar y abrir…» pasan a ser una sola salida: «Llevar a otra IA».
    const salida = document.querySelector('#ai-preview .ai-actions');
    if (salida && !$('#ai-llevar')) {
      const det = document.createElement('details'); det.id = 'ai-llevar';
      const s = document.createElement('summary'); s.textContent = 'Llevar a otra IA ↗';
      const nota = document.createElement('small'); nota.textContent = 'Copia la pregunta y abre la otra app; la respuesta no vuelve aquí.';
      salida.before(det); det.append(s, nota, salida);
      const nombres = { chatgpt: 'ChatGPT ↗', gemini: 'Gemini ↗', claude: 'Claude ↗', '': 'Solo copiar' };
      salida.querySelectorAll('[data-ai-copy]').forEach(b => { b.textContent = nombres[b.dataset.aiCopy] ?? b.textContent; });
    }
  }
  window.BibliaAcciones = { ACCIONES, usar: id => { const a = ACCIONES.find(x => x.id === id); if (a) usar(a); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', construir); else construir();
})();
