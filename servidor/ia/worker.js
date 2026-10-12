// IA integrada de Biblioteca Bíblica (CONSENSO-HABITO.md, entrega 4): el «portero» en Cloudflare.
// La app manda la pregunta, el modo y los versículos que ELLA encontró en su Biblia; aquí se fija la
// instrucción del sistema, se cuidan las cuotas y el gasto, y se llama a Workers AI. No se guarda el texto
// de nadie (solo cuentas por día); el texto se guarda únicamente cuando la persona toca «Reportar».
//
// Recursos (wrangler.toml): AI (Workers AI) y DB (D1, esquema en esquema.sql).
// Variables: MODELO, TOPE_DIARIO_USD, CUOTA_GRATIS, CUOTA_PLUS, CUOTA_PROBADOR, CUOTA_IP, TOKEN_ADMIN (secreto).

export const MODOS = {
  explicar: { titulo: 'Explicar un pasaje', maxTokens: 650 },
  tema: { titulo: 'Qué dice la Biblia sobre…', maxTokens: 700 },
  devocional: { titulo: 'Devocional sobre un tema', maxTokens: 800 },
  oracion: { titulo: 'Ayúdame a orar', maxTokens: 450 }
};

// Precio aproximado de Workers AI en US$ por millón de tokens [entrada, salida] (tabla pública de Cloudflare,
// oct-2026; revisar al lanzar). Sirve para el tope diario: no es una factura.
export const PRECIOS = {
  '@cf/openai/gpt-oss-120b': [0.35, 0.75],
  '@cf/openai/gpt-oss-20b': [0.2, 0.3],
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast': [0.293, 2.253],
  '@cf/meta/llama-3.1-8b-instruct-fp8-fast': [0.045, 0.384],
  '@cf/qwen/qwen3-30b-a3b-fp8': [0.051, 0.335],
  '@cf/google/gemma-3-12b-it': [0.345, 0.556],
  '@cf/mistralai/mistral-small-3.1-24b-instruct': [0.351, 0.555]
};
export const MODELO_PREDETERMINADO = '@cf/openai/gpt-oss-120b';

const LIMITES = { pregunta: 600, pasaje: 700, pasajes: 14, cita: 40 };

export const INSTRUCCION = `Eres el asistente de estudio de «Biblioteca Bíblica», una app cristiana de estudio de la Biblia.
Respondes SIEMPRE en español, con calidez, claridad y respeto, para personas de cualquier tradición cristiana.
Reglas:
1. Usa SOLO los versículos que vienen en «Pasajes de la Biblia de la persona». Cita así: (Juan 3:16) o (Salmos 23:1-3). No inventes citas ni cites versículos que no estén en los pasajes.
1b. Entre comillas pon SOLO palabras copiadas tal cual de esos pasajes; si parafraseas, no uses comillas. No escribas palabras en griego ni en hebreo ni números Strong si no vienen en los pasajes. No atribuyas un texto a un autor distinto del que lo escribió.
1c. No afirmes nada que los pasajes no sostengan; si das contexto histórico (autor, destinatarios, época), que sea el comúnmente aceptado y sin fechas dudosas.
2. Si los pasajes no alcanzan para responder, dilo con sencillez y sugiere qué leer.
3. No sustituyes el acompañamiento pastoral ni profesional. Si notas dolor fuerte, anima a hablar con alguien de confianza.
4. Sin política partidista, sin atacar otras iglesias, sin profecías ni promesas de resultados.
5. Responde solo a temas bíblicos, de fe, de oración y de vida cristiana. Si piden otra cosa, explica amablemente que aquí solo estudias la Biblia.
6. Sé breve: unas 200 a 300 palabras, con párrafos cortos. Sin títulos en mayúsculas ni listas largas.`;

const FORMATO = {
  explicar: 'Explica el pasaje en este orden: 1) contexto histórico breve (quién escribe, a quién, en qué situación); 2) el capítulo inmediato (qué viene antes y después y cómo encaja el pasaje); 3) lo que revela el pasaje, preciso y profundo; 4) un dato relevante que la persona quizá no sabía; 5) una aplicación concreta para hoy.',
  tema: 'Responde qué enseña la Biblia sobre el tema, agrupando las ideas principales, cada una con su cita y el contexto breve de donde viene (quién lo dijo y en qué situación); agrega un matiz o dato relevante que la persona quizá no sabía.',
  devocional: 'Escribe un devocional corto: una historia o imagen breve, la enseñanza con citas, un cierre y «Para hoy» con una acción concreta. Termina con una oración de 2 o 3 líneas.',
  oracion: 'Escribe una oración en primera persona, sencilla y sincera, basada en los pasajes, de unas 120 palabras. Puedes empezar con una cita breve.'
};

// Crisis: no se llama al modelo; se responde con un mensaje fijo (política de Play y del consenso).
const CRISIS = /\b(suicid\w*|quitarme la vida|matarme|no quiero (seguir )?vivir|hacerme daño|autolesi\w*|cortarme|me (están|esta) (pegando|golpeando|abusando)|abus(o|aron|an) de m[ií])\b/i;
export const MENSAJE_CRISIS = 'Lo que estás viviendo importa, y no tienes que cargarlo a solas. Si estás en peligro o piensas hacerte daño, llama ahora al número de emergencias de tu país (911 en muchos países de América) o a una línea de ayuda en crisis, y busca a una persona de confianza: un familiar, tu pastor o un amigo. «Cercano está Jehová á los quebrantados de corazón» (Salmos 34:18). Esta app no puede acompañarte como una persona; por favor, pide ayuda hoy.';

const json = (cuerpo, estado = 200) => new Response(JSON.stringify(cuerpo), { status: estado, headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type, x-dispositivo, authorization', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'cache-control': 'no-store' } });
const error = (codigo, mensaje, estado = 400) => json({ error: codigo, mensaje }, estado);
const diaUTC = (ahora = new Date()) => ahora.toISOString().slice(0, 10);
const entero = (v, d) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.floor(n) : d; };
const texto = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ').trim().slice(0, max);

async function sha256(t) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}

export function validarSolicitud(c) {
  if (!c || typeof c !== 'object') return 'Solicitud vacía.';
  if (!MODOS[c.modo]) return 'Modo no válido.';
  const pregunta = texto(c.pregunta, LIMITES.pregunta + 1);
  if (!pregunta) return 'Escribe tu pregunta.';
  if (pregunta.length > LIMITES.pregunta) return 'La pregunta es demasiado larga (máximo 600 caracteres).';
  if (!Array.isArray(c.pasajes) || c.pasajes.length > LIMITES.pasajes) return 'Pasajes no válidos.';
  for (const p of c.pasajes) if (!p || typeof p.cita !== 'string' || typeof p.texto !== 'string' || !p.cita.trim() || p.cita.length > LIMITES.cita) return 'Pasaje no válido.';
  if (c.idem !== undefined && !/^[A-Za-z0-9_-]{8,64}$/.test(c.idem)) return 'Identificador no válido.';
  return '';
}

export function armarMensajes(c) {
  const pasajes = c.pasajes.map(p => `(${texto(p.cita, LIMITES.cita)}) ${texto(p.texto, LIMITES.pasaje)}`).join('\n');
  const usuario = `Modo: ${MODOS[c.modo].titulo}. ${FORMATO[c.modo]}\n\nPregunta de la persona: ${texto(c.pregunta, LIMITES.pregunta)}\n\nPasajes de la Biblia de la persona${c.version ? ' (' + texto(c.version, 40) + ')' : ''}:\n${pasajes || '(no se encontraron pasajes)'}`;
  return [{ role: 'system', content: INSTRUCCION }, { role: 'user', content: usuario }];
}

// Workers AI devuelve formatos distintos según el modelo (chat clásico o «Responses» de OpenAI en gpt-oss).
export function textoDeRespuesta(r) {
  if (!r) return '';
  if (typeof r === 'string') return r;
  if (typeof r.response === 'string') return r.response;
  if (typeof r.output_text === 'string') return r.output_text;
  if (Array.isArray(r.output)) {
    const partes = [];
    for (const o of r.output) if (o && o.type === 'message' && Array.isArray(o.content)) for (const c of o.content) if (typeof c.text === 'string') partes.push(c.text);
    if (partes.length) return partes.join('\n');
  }
  const m = r.choices && r.choices[0] && r.choices[0].message;
  return m && typeof m.content === 'string' ? m.content : '';
}
export function costoUSD(modelo, uso, mensajes, salida) {
  const [pe, ps] = PRECIOS[modelo] || PRECIOS[MODELO_PREDETERMINADO];
  // Sin datos de uso se estima con ~4 caracteres por token.
  const entrada = uso && Number(uso.prompt_tokens || uso.input_tokens) || Math.ceil(mensajes.reduce((n, m) => n + m.content.length, 0) / 4);
  const generados = uso && Number(uso.completion_tokens || uso.output_tokens) || Math.ceil((salida || '').length / 4);
  return (entrada * pe + generados * ps) / 1e6;
}

async function llamarModelo(env, modelo, mensajes, maxTokens) {
  const esResponses = /gpt-oss/.test(modelo);
  const entrada = esResponses
    ? { instructions: mensajes[0].content, input: mensajes[1].content, max_output_tokens: maxTokens, reasoning: { effort: 'low' } }
    : { messages: mensajes, max_tokens: maxTokens, temperature: 0.4 };
  const r = await env.AI.run(modelo, entrada);
  return { texto: textoDeRespuesta(r).trim(), uso: r && r.usage };
}

// ---------- Cuotas (D1) ----------
async function planDe(env, dispositivo) {
  const fila = await env.DB.prepare('SELECT plan, hasta FROM planes WHERE dispositivo = ?').bind(dispositivo).first();
  if (!fila) return 'gratis';
  if (fila.hasta && fila.hasta < new Date().toISOString()) return 'gratis';
  return fila.plan === 'plus' || fila.plan === 'probador' ? fila.plan : 'gratis';
}
function limiteDe(env, plan) {
  if (plan === 'plus') return entero(env.CUOTA_PLUS, 10);
  if (plan === 'probador') return entero(env.CUOTA_PROBADOR, 30);
  return entero(env.CUOTA_GRATIS, 3);
}
async function usadas(env, clave, dia) {
  const f = await env.DB.prepare('SELECT n FROM uso WHERE clave = ? AND dia = ?').bind(clave, dia).first();
  return f ? f.n : 0;
}
async function sumar(env, clave, dia) {
  await env.DB.prepare('INSERT INTO uso (clave, dia, n) VALUES (?, ?, 1) ON CONFLICT(clave, dia) DO UPDATE SET n = n + 1').bind(clave, dia).run();
}
async function gastoDelDia(env, dia) {
  const f = await env.DB.prepare('SELECT usd FROM gasto WHERE dia = ?').bind(dia).first();
  return f ? f.usd : 0;
}
async function sumarGasto(env, dia, usd) {
  await env.DB.prepare('INSERT INTO gasto (dia, usd, llamadas) VALUES (?, ?, 1) ON CONFLICT(dia) DO UPDATE SET usd = usd + excluded.usd, llamadas = llamadas + 1').bind(dia, usd).run();
}

export async function estado(env, dispositivo, ahora = new Date()) {
  const dia = diaUTC(ahora), plan = await planDe(env, dispositivo), limite = limiteDe(env, plan);
  const n = await usadas(env, 'd:' + dispositivo, dia);
  return { plan, limite, quedan: Math.max(0, limite - n) };
}

export async function preguntar(env, solicitud, dispositivo, ip, ahora = new Date()) {
  const fallo = validarSolicitud(solicitud);
  if (fallo) return error('VALIDACION', fallo);
  if (CRISIS.test(solicitud.pregunta)) return json({ respuesta: MENSAJE_CRISIS, crisis: true, sinCosto: true });
  const dia = diaUTC(ahora), plan = await planDe(env, dispositivo), limite = limiteDe(env, plan);
  const claveD = 'd:' + dispositivo, claveIP = 'i:' + (await sha256(dia + '|' + (ip || 'sin-ip'))).slice(0, 32);
  // Reintento del mismo pedido (misma idem): no se cobra otra vez.
  let repetido = false;
  if (solicitud.idem) repetido = !!(await env.DB.prepare('SELECT 1 FROM idem WHERE dispositivo = ? AND idem = ?').bind(dispositivo, solicitud.idem).first());
  const yaUsadas = await usadas(env, claveD, dia);
  if (!repetido && yaUsadas >= limite) return json({ error: 'CUOTA', mensaje: plan === 'gratis' ? 'Ya usaste tus ' + limite + ' preguntas de hoy. Mañana tienes más.' : 'Ya usaste tus preguntas de hoy.', plan, limite, quedan: 0 }, 429);
  if (!repetido && plan === 'gratis' && (await usadas(env, claveIP, dia)) >= entero(env.CUOTA_IP, 30)) return json({ error: 'CUOTA', mensaje: 'Esta conexión ya hizo muchas preguntas hoy. Intenta mañana.', quedan: 0 }, 429);
  if (plan === 'gratis' && (await gastoDelDia(env, dia)) >= Number(env.TOPE_DIARIO_USD || 1)) return json({ error: 'TOPE', mensaje: 'La IA gratis ya llegó a su límite de hoy. Vuelve mañana.', quedan: Math.max(0, limite - yaUsadas) }, 503);
  const modelo = env.MODELO || MODELO_PREDETERMINADO, mensajes = armarMensajes(solicitud);
  let resultado;
  try { resultado = await llamarModelo(env, modelo, mensajes, MODOS[solicitud.modo].maxTokens); }
  catch (e) { return json({ error: 'MODELO', mensaje: 'La IA no respondió. Intenta de nuevo; no se descontó tu pregunta.' }, 502); }
  if (!resultado.texto) return json({ error: 'MODELO', mensaje: 'La IA no respondió. Intenta de nuevo; no se descontó tu pregunta.' }, 502);
  // Se cobra solo lo que salió bien.
  await sumarGasto(env, dia, costoUSD(modelo, resultado.uso, mensajes, resultado.texto));
  if (!repetido) {
    await sumar(env, claveD, dia);
    if (plan === 'gratis') await sumar(env, claveIP, dia);
    if (solicitud.idem) await env.DB.prepare('INSERT OR IGNORE INTO idem (dispositivo, idem, dia) VALUES (?, ?, ?)').bind(dispositivo, solicitud.idem, dia).run();
  }
  const quedan = Math.max(0, limite - (repetido ? yaUsadas : yaUsadas + 1));
  return json({ respuesta: resultado.texto, modo: solicitud.modo, plan, limite, quedan });
}

export async function reportar(env, c, dispositivo, ahora = new Date()) {
  const motivo = texto(c && c.motivo, 300), pregunta = texto(c && c.pregunta, 700), respuesta = texto(c && c.respuesta, 6000);
  if (!pregunta || !respuesta) return error('VALIDACION', 'Falta la pregunta o la respuesta.');
  await env.DB.prepare('INSERT INTO reportes (dispositivo, creado, modo, pregunta, respuesta, motivo) VALUES (?, ?, ?, ?, ?, ?)').bind(dispositivo, ahora.toISOString(), texto(c.modo, 20), pregunta, respuesta, motivo).run();
  return json({ ok: true });
}

// Prueba de calidad (solo con TOKEN_ADMIN): misma instrucción, otro modelo, sin cuotas. Para que Edward juzgue a ciegas.
export async function prueba(env, c, autorizacion) {
  if (!env.TOKEN_ADMIN || autorizacion !== 'Bearer ' + env.TOKEN_ADMIN) return error('PERMISO', 'No autorizado.', 401);
  const fallo = validarSolicitud(c); if (fallo) return error('VALIDACION', fallo);
  if (!PRECIOS[c.modelo]) return error('VALIDACION', 'Modelo no válido.');
  const mensajes = armarMensajes(c), inicio = Date.now();
  const r = await llamarModelo(env, c.modelo, mensajes, MODOS[c.modo].maxTokens);
  return json({ respuesta: r.texto, modelo: c.modelo, ms: Date.now() - inicio, usd: costoUSD(c.modelo, r.uso, mensajes, r.texto) });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return json({});
    const url = new URL(request.url), dispositivo = request.headers.get('x-dispositivo') || '';
    const ip = request.headers.get('cf-connecting-ip') || '';
    try {
      if (url.pathname === '/v1/prueba' && request.method === 'POST') return await prueba(env, await request.json(), request.headers.get('authorization'));
      if (!/^[A-Za-z0-9_-]{16,64}$/.test(dispositivo)) return error('DISPOSITIVO', 'Falta el identificador del dispositivo.');
      if (url.pathname === '/v1/estado' && request.method === 'GET') return json(await estado(env, dispositivo));
      if (url.pathname === '/v1/preguntar' && request.method === 'POST') return await preguntar(env, await request.json(), dispositivo, ip);
      if (url.pathname === '/v1/reportar' && request.method === 'POST') return await reportar(env, await request.json(), dispositivo);
      return error('RUTA', 'No encontrado.', 404);
    } catch (e) {
      return error('SERVIDOR', 'Algo falló en el servidor. Intenta de nuevo.', 500);
    }
  }
};
