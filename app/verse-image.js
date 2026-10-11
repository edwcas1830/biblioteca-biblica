'use strict';
// Imágenes con versículos (pedido de Edward, 9-oct «después», 10-oct «ahora»): uno o varios versículos del
// capítulo abierto → tarjeta diseñada en canvas, sin internet → guardar (PC) o compartir (teléfono).
// Usa las fuentes de la app (Cormorant Garamond y Inter Tight, OFL) y el texto tal como se lee en pantalla.
(function () {
  const $ = s => document.querySelector(s);
  const FORMATOS = {
    vertical: { ancho: 1080, alto: 1350, nombre: 'Instagram (4:5)' },
    cuadrado: { ancho: 1080, alto: 1080, nombre: 'Cuadrado (1:1)' },
    historia: { ancho: 1080, alto: 1920, nombre: 'Estado o historia (9:16)' }
  };
  const ESTILOS = {
    pergamino: { nombre: 'Pergamino', fondo: ['#F7F1E3', '#EFE4CC'], texto: '#2B2118', acento: '#7A3E2E', marco: 'rgba(122,62,46,.28)' },
    cuero: { nombre: 'Cuero', fondo: ['#4A2A1F', '#2E1A13'], texto: '#F6EEDC', acento: '#D9B77A', marco: 'rgba(217,183,122,.35)' },
    noche: { nombre: 'Noche', fondo: ['#1C2333', '#10151F'], texto: '#EEF0F5', acento: '#D8B76A', marco: 'rgba(216,183,106,.3)' },
    amanecer: { nombre: 'Amanecer', fondo: ['#F6D9B8', '#C97B63'], texto: '#2A1712', acento: '#5B2A1E', marco: 'rgba(91,42,30,.25)' }
  };
  let dialogo, lienzo, fotoFondo = null, sel = { desde: 1, hasta: 1 };

  function textoDe(numero) {
    const v = document.querySelector(`#verses .verse[data-verse="${numero}"]`);
    if (!v) return '';
    const copia = v.cloneNode(true);
    copia.querySelectorAll('sup, .strong-code').forEach(n => n.remove());
    return copia.textContent.replace(/\s+/g, ' ').trim();
  }
  function versiculosDelCapitulo() {
    return [...document.querySelectorAll('#verses .verse[data-verse]')].map(v => Number(v.dataset.verse)).filter(Number.isInteger);
  }
  function referencia() {
    const p = (typeof state !== 'undefined' && state.position) || null;
    const libro = p && window.BIBLE?.books?.[p.book]?.name;
    if (!libro) return '';
    const rango = sel.desde === sel.hasta ? `${sel.desde}` : `${sel.desde}-${sel.hasta}`;
    return `${libro} ${p.chapter}:${rango}`;
  }
  function version() {
    const s = $('#version-select');
    return s && s.selectedOptions[0] ? s.selectedOptions[0].textContent.trim() : '';
  }

  // Parte el texto en líneas que caben en «ancho» con la letra actual del contexto.
  function lineas(ctx, texto, ancho) {
    const salida = []; let linea = '';
    for (const palabra of texto.split(' ')) {
      const prueba = linea ? linea + ' ' + palabra : palabra;
      if (ctx.measureText(prueba).width <= ancho || !linea) linea = prueba;
      else { salida.push(linea); linea = palabra; }
    }
    if (linea) salida.push(linea);
    return salida;
  }

  async function dibujar() {
    const formato = FORMATOS[$('#imagen-formato').value] || FORMATOS.vertical;
    const estilo = ESTILOS[$('#imagen-estilo').value] || ESTILOS.pergamino;
    const W = formato.ancho, H = formato.alto;
    lienzo.width = W; lienzo.height = H;
    const ctx = lienzo.getContext('2d');
    try { await Promise.all([document.fonts.load('64px "Cormorant Garamond"'), document.fonts.load('600 32px "Inter Tight"')]); } catch { /* usa la letra disponible */ }

    // Fondo: degradado del estilo o la foto elegida, con un velo para que el texto se lea.
    if (fotoFondo) {
      const escala = Math.max(W / fotoFondo.width, H / fotoFondo.height);
      const w = fotoFondo.width * escala, h = fotoFondo.height * escala;
      ctx.drawImage(fotoFondo, (W - w) / 2, (H - h) / 2, w, h);
      ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(0, 0, W, H);
    } else {
      const g = ctx.createLinearGradient(0, 0, W * 0.4, H);
      g.addColorStop(0, estilo.fondo[0]); g.addColorStop(1, estilo.fondo[1]);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    const colorTexto = fotoFondo ? '#FFFFFF' : estilo.texto, colorAcento = fotoFondo ? '#F1D9A6' : estilo.acento;
    // Marco fino, como el filete de un libro.
    const m = Math.round(W * 0.045);
    ctx.strokeStyle = fotoFondo ? 'rgba(255,255,255,.35)' : estilo.marco; ctx.lineWidth = 3;
    ctx.strokeRect(m, m, W - 2 * m, H - 2 * m);

    const texto = $('#imagen-texto').value.trim() || '…';
    const cuerpo = `«${texto}»`;
    const anchoTexto = W - 2 * m - W * 0.12;
    const altoDisponible = H - 2 * m - H * 0.26;
    // La letra más grande que entra (de 92 px hacia abajo).
    let tam = 92, filas;
    for (; tam >= 30; tam -= 2) {
      ctx.font = `${tam}px "Cormorant Garamond", Georgia, serif`;
      filas = lineas(ctx, cuerpo, anchoTexto);
      if (filas.length * tam * 1.28 <= altoDisponible) break;
    }
    const interlinea = tam * 1.28, bloque = filas.length * interlinea;
    let y = (H - bloque) / 2 - H * 0.03 + tam * 0.85;
    ctx.fillStyle = colorTexto; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    for (const f of filas) { ctx.fillText(f, W / 2, y); y += interlinea; }

    // Filete y referencia.
    y += tam * 0.25;
    ctx.strokeStyle = colorAcento; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(W / 2 - 60, y); ctx.lineTo(W / 2 + 60, y); ctx.stroke();
    ctx.fillStyle = colorAcento;
    ctx.font = `600 ${Math.round(W * 0.034)}px "Inter Tight", system-ui, sans-serif`;
    const ref = [$('#imagen-referencia').value.trim(), $('#imagen-version').checked ? version() : ''].filter(Boolean).join(' · ');
    ctx.fillText(ref.toUpperCase(), W / 2, y + W * 0.06);
  }

  function nombreArchivo() {
    return (referencia() || 'versiculo').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.png';
  }

  async function guardarOCompartir() {
    await dibujar();
    const dataUrl = lienzo.toDataURL('image/png');
    const nombre = nombreArchivo();
    const aviso = $('#imagen-estado');
    try {
      if (window.BibliaPlataforma?.compartirImagen) {
        await window.BibliaPlataforma.compartirImagen({ dataUrl, nombre, titulo: referencia() });
        aviso.textContent = '';
      } else {
        const a = document.createElement('a');
        a.href = dataUrl; a.download = nombre; document.body.append(a); a.click(); a.remove();
        aviso.textContent = 'Imagen lista: elige dónde guardarla.';
      }
    } catch (e) { aviso.textContent = 'No se pudo: ' + ((e && e.message) || 'error desconocido'); }
  }

  function llenarSelectores() {
    const nums = versiculosDelCapitulo();
    const opciones = nums.map(n => `<option value="${n}">${n}</option>`).join('');
    $('#imagen-desde').innerHTML = opciones; $('#imagen-hasta').innerHTML = opciones;
    $('#imagen-desde').value = String(sel.desde); $('#imagen-hasta').value = String(sel.hasta);
  }
  function actualizarTexto() {
    sel.desde = Number($('#imagen-desde').value); sel.hasta = Math.max(sel.desde, Number($('#imagen-hasta').value));
    $('#imagen-hasta').value = String(sel.hasta);
    const partes = [];
    for (let n = sel.desde; n <= sel.hasta; n++) partes.push(textoDe(n));
    $('#imagen-texto').value = partes.filter(Boolean).join(' ');
    $('#imagen-referencia').value = referencia();
    dibujar();
  }

  function construir() {
    dialogo = document.createElement('dialog');
    dialogo.id = 'imagen-dialog';
    dialogo.setAttribute('aria-labelledby', 'imagen-titulo');
    dialogo.innerHTML = `
      <div class="section-heading"><h2 id="imagen-titulo">Imagen con versículos</h2><button type="button" class="quiet" id="imagen-cerrar">Cerrar ✕</button></div>
      <div class="imagen-cuerpo">
        <canvas id="imagen-lienzo" aria-label="Vista previa de la imagen"></canvas>
        <div class="imagen-opciones">
          <div class="imagen-fila"><label>Desde el versículo <select id="imagen-desde"></select></label><label>hasta <select id="imagen-hasta"></select></label></div>
          <label>Texto (puedes acortarlo)<textarea id="imagen-texto" rows="4"></textarea></label>
          <label>Referencia<input id="imagen-referencia" type="text" maxlength="80"></label>
          <label class="imagen-check"><input id="imagen-version" type="checkbox" checked> Mostrar la versión</label>
          <div class="imagen-fila"><label>Estilo <select id="imagen-estilo">${Object.entries(ESTILOS).map(([id, e]) => `<option value="${id}">${e.nombre}</option>`).join('')}</select></label>
          <label>Tamaño <select id="imagen-formato">${Object.entries(FORMATOS).map(([id, f]) => `<option value="${id}">${f.nombre}</option>`).join('')}</select></label></div>
          <div class="imagen-fila"><label class="imagen-foto">Foto de fondo (opcional)<input id="imagen-foto" type="file" accept="image/*"></label><button type="button" class="quiet" id="imagen-sin-foto" hidden>Quitar foto</button></div>
          <div id="imagen-ia" class="imagen-ia" hidden>
            <p class="imagen-ia-titulo">✦ Fondo creado con IA</p>
            <div id="imagen-ideas" class="imagen-ideas"></div>
            <p id="imagen-ideas-origen" class="muted"></p><button type="button" class="quiet" id="imagen-otras-ideas">Pedir otras ideas</button>
            <label>Mi idea (o la idea elegida)<textarea id="imagen-ia-texto" rows="3" maxlength="500" placeholder="Describe el fondo que imaginas…"></textarea></label>
            <label class="imagen-check" id="imagen-mejorar-fila"><input id="imagen-mejorar" type="checkbox"> Mejorar mi idea con IA antes de crear</label>
            <button type="button" class="quiet" id="imagen-ia-crear">✦ Crear este fondo</button>
          </div>
          <div class="imagen-acciones"><button type="button" class="primary" id="imagen-guardar"></button></div>
          <p id="imagen-estado" class="muted" role="status"></p>
        </div>
      </div>`;
    document.body.append(dialogo);
    lienzo = $('#imagen-lienzo');
    $('#imagen-guardar').textContent = window.BibliaPlataforma?.compartirImagen ? 'Compartir o guardar' : 'Guardar imagen';
    $('#imagen-cerrar').addEventListener('click', () => dialogo.close());
    for (const id of ['imagen-desde', 'imagen-hasta']) $('#' + id).addEventListener('change', actualizarTexto);
    for (const id of ['imagen-texto', 'imagen-referencia']) $('#' + id).addEventListener('input', dibujar);
    for (const id of ['imagen-estilo', 'imagen-formato', 'imagen-version']) $('#' + id).addEventListener('change', dibujar);
    $('#imagen-guardar').addEventListener('click', guardarOCompartir);
    $('#imagen-foto').addEventListener('change', e => {
      const archivo = e.target.files && e.target.files[0];
      if (!archivo) return;
      const lector = new FileReader();
      lector.onload = () => { const img = new Image(); img.onload = () => { fotoFondo = img; $('#imagen-sin-foto').hidden = false; dibujar(); }; img.src = lector.result; };
      lector.readAsDataURL(archivo);
    });
    $('#imagen-sin-foto').addEventListener('click', () => { fotoFondo = null; $('#imagen-foto').value = ''; $('#imagen-sin-foto').hidden = true; dibujar(); });
    $('#imagen-ia-crear').addEventListener('click', crearFondoIA);
    $('#imagen-otras-ideas').addEventListener('click', () => pedirIdeas(true));
  }

  // Fondo con IA (CONSENSO-IA-ESTUDIO.md): 3 ideas según el versículo (Escena · Metáfora · Minimalista), «Mi idea»
  // con «Mejorar con IA», costo antes de crear y aviso al pasar de 30 fondos al mes. La IA crea SOLO el fondo:
  // el versículo lo dibuja la app. Sin texto y sin representar a Dios ni el rostro de Jesús (decisión de Edward).
  const ASPECTO = { vertical: '4:5', cuadrado: '1:1', historia: '9:16' };
  const COSTO = 'unos US$0,03';
  const AVISO_MES = 30;
  const REGLAS = ' Sin texto, letras ni logotipos. Sin representar a Dios ni el rostro de Jesús: usa símbolos como luz, camino, agua, cruz vacía o paloma.';
  let ideasDe = '';
  const mesActual = () => new Date().toISOString().slice(0, 7);
  const contador = () => { try { const d = JSON.parse(localStorage.getItem('biblioteca-fondos-ia') || '{}'); return d.mes === mesActual() ? d.n : 0; } catch { return 0; } };
  const contar = () => { try { localStorage.setItem('biblioteca-fondos-ia', JSON.stringify({ mes: mesActual(), n: contador() + 1 })); } catch { /* sin almacenamiento */ } };
  const capacidades = async () => { try { return (await window.libraryDesktop?.getCapabilities?.())?.operations || {}; } catch { return {}; } };

  // Sin IA de texto: tres plantillas a partir del versículo (no se presentan como análisis de la IA).
  function ideasLocales(texto) {
    const corto = texto.split(/[.;:]/)[0].slice(0, 140);
    return [
      { titulo: 'Escena', prompt: `Paisaje bíblico sereno que evoque «${corto}», luz cálida de amanecer, estilo pintura al óleo` },
      { titulo: 'Metáfora', prompt: `Símbolo visual de «${corto}»: un camino de luz entre colinas y agua tranquila, estilo acuarela` },
      { titulo: 'Minimalista', prompt: 'Fondo minimalista de colinas suaves y cielo amplio en tonos crema y salvia, mucho espacio libre para el texto' }
    ];
  }
  function pintarIdeas(lista, origen) {
    const caja = $('#imagen-ideas'); caja.replaceChildren();
    for (const idea of lista.slice(0, 3)) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'imagen-idea';
      const t = document.createElement('b'); t.textContent = idea.titulo || 'Idea';
      const p = document.createElement('span'); p.textContent = ' · ' + idea.prompt;
      b.append(t, p);
      b.addEventListener('click', () => {
        $('#imagen-ia-texto').value = idea.prompt; $('#imagen-mejorar').checked = false;
        caja.querySelectorAll('.imagen-idea').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      });
      caja.append(b);
    }
    $('#imagen-ideas-origen').textContent = origen;
  }
  async function pedirIdeas(forzar) {
    const texto = $('#imagen-texto').value.trim(), ref = $('#imagen-referencia').value.trim();
    if (!texto || (!forzar && ideasDe === ref + texto)) return;
    ideasDe = ref + texto;
    const ops = await capacidades();
    if (!ops.aiImageIdeas?.available) { pintarIdeas(ideasLocales(texto), 'Ideas de plantilla (sin IA de texto). Toca una para usarla o escribe tu idea.'); return; }
    $('#imagen-ideas-origen').textContent = 'Pensando tres ideas para este versículo…';
    try {
      const r = await window.libraryDesktop.aiImageIdeas({ ref, texto });
      pintarIdeas(Array.isArray(r?.ideas) && r.ideas.length ? r.ideas : ideasLocales(texto), 'Ideas de la IA para este versículo. Toca una para usarla; puedes editarla.');
    } catch (e) { pintarIdeas(ideasLocales(texto), 'No se pudieron pedir ideas a la IA (' + ((e && e.message) || 'error') + '). Estas son de plantilla.'); }
  }
  async function crearFondoIA() {
    const aviso = $('#imagen-estado'), boton = $('#imagen-ia-crear');
    const prompt = $('#imagen-ia-texto').value.trim();
    if (!prompt) { aviso.textContent = 'Toca una idea o escribe tu idea para el fondo.'; return; }
    const ops = await capacidades();
    // «Mejorar con IA»: primero muestra la descripción mejorada; se crea al tocar otra vez (Edward la aprueba).
    if ($('#imagen-mejorar').checked && ops.aiImagePrompt?.available) {
      boton.disabled = true; aviso.textContent = 'Mejorando tu idea…';
      try {
        const r = await window.libraryDesktop.aiImagePrompt({ idea: prompt });
        if (r?.prompt) { $('#imagen-ia-texto').value = r.prompt; $('#imagen-mejorar').checked = false; aviso.textContent = 'Esta es tu idea mejorada. Revísala o edítala y toca «Crear este fondo».'; return; }
      } catch (e) { aviso.textContent = 'No se pudo mejorar (' + ((e && e.message) || 'error') + '). Puedes crear con tu idea tal cual.'; return; }
      finally { boton.disabled = false; }
    }
    const usados = contador();
    if (usados >= AVISO_MES && boton.dataset.confirmado !== mesActual()) {
      boton.dataset.confirmado = mesActual();
      aviso.textContent = `Este mes ya creaste ${usados} fondos (${COSTO} cada uno). Toca «Crear este fondo» otra vez para seguir.`;
      return;
    }
    boton.disabled = true; aviso.textContent = 'Creando el fondo… puede tardar unos segundos.';
    try {
      const r = await window.libraryDesktop.aiImage({ prompt: (prompt + REGLAS).slice(0, 600), aspect: ASPECTO[$('#imagen-formato').value] || '4:5' });
      await new Promise((ok, mal) => { const img = new Image(); img.onload = () => { fotoFondo = img; ok(); }; img.onerror = () => mal(new Error('La imagen recibida no se pudo abrir.')); img.src = r.dataUrl; });
      contar();
      $('#imagen-sin-foto').hidden = false; await dibujar();
      aviso.textContent = 'Fondo creado' + (r.model ? ' con ' + r.model : '') + '. Si no te gusta, elige otra idea o cambia la descripción.';
    } catch (e) {
      const m = (e && e.message) || 'No se pudo crear el fondo.';
      aviso.textContent = !/OpenRouter|Gemini/.test(m) && /conex|conect|LOCKED|UNAVAILABLE/i.test(m + (e && e.code || '')) ? m + ' Conecta Gemini u OpenRouter en Inteligencia artificial.' : m;
    } finally { boton.disabled = false; }
  }
  async function mostrarIA() {
    const ops = await capacidades();
    const ok = !!ops.aiImage?.available;
    $('#imagen-ia').hidden = !ok;
    $('#imagen-mejorar-fila').hidden = !ops.aiImagePrompt?.available;
    $('#imagen-ia-crear').textContent = `✦ Crear este fondo (${COSTO})`;
    if (ok) pedirIdeas(false);
  }

  function abrir() {
    if (!dialogo) construir();
    const actual = (typeof state !== 'undefined' && state.position && state.position.verse) || Number(document.querySelector('#verses .verse.selected')?.dataset.verse) || 1;
    sel = { desde: actual, hasta: actual };
    $('#imagen-estado').textContent = '';
    llenarSelectores();
    actualizarTexto();
    mostrarIA();
    dialogo.showModal();
  }

  // Botón en «Mis notas» (escritorio y teléfono), junto a los subrayados del versículo elegido.
  function boton() {
    const tintas = document.querySelector('.notes-content .ink-colors');
    if (!tintas || document.getElementById('imagen-abrir')) return;
    const b = document.createElement('button');
    b.type = 'button'; b.id = 'imagen-abrir'; b.className = 'quiet imagen-abrir';
    b.textContent = '🖼 Crear imagen';
    b.addEventListener('click', abrir);
    tintas.after(b);
  }
  window.BibliaImagen = { abrir, dibujar: () => dibujar(), _lienzo: () => lienzo };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boton); else boton();
})();
