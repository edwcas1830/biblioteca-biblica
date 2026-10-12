# IA integrada · servidor en Cloudflare

Es el «portero» de la IA de la app («Preguntar a la Biblia»), según CONSENSO-HABITO.md. La app manda la pregunta, el modo y los versículos que encontró en la Biblia instalada. El Worker fija la instrucción del sistema, cuida las cuotas y el tope de gasto, y llama a **Workers AI**.

## Qué guarda
- Solo **cuentas por día**: por dispositivo, por conexión (IP con hash y sal diaria) y el gasto estimado del día.
- El texto de una pregunta y su respuesta se guarda **solo** si la persona toca «Reportar».
- No guarda nombres ni cuentas.

## Cuotas y tope
Están en `wrangler.toml`:
- **Gratis:** 3 preguntas al día.
- **Plus:** 10 al día (cuando exista Play Billing).
- **Probadores** (Edward y Laura en el piloto): 30 al día.
- **Por conexión:** 30 al día, para frenar a quien inventa dispositivos.
- **Tope de gasto:** US$1 al día (decisión de Edward, 12-oct). Al pasarlo, se apaga la IA **gratis** hasta el día siguiente; Plus y los probadores siguen.
- Un fallo de la IA no descuenta, y reintentar con la misma `idem` no cobra dos veces.
- **Crisis:** ante palabras de crisis (suicidio, autolesión, abuso) responde un mensaje fijo de ayuda, sin llamar al modelo y sin cobrar.

## Ponerlo en marcha (una vez)

**Edward:**
1. Entra o crea la cuenta: https://dash.cloudflare.com/sign-up. El plan gratis alcanza para el piloto: 10.000 «neuronas» diarias, unas 100 a 200 respuestas.
2. Autoriza esta PC en una terminal: `npx wrangler login`. Se abre el navegador; tú das el permiso, nunca se escribe una clave aquí.

**Claude**, desde la carpeta `servidor/ia`:
1. `npx wrangler d1 create biblia-ia` → copiar el `database_id` en `wrangler.toml`.
2. `npx wrangler d1 execute biblia-ia --remote --file esquema.sql`
3. `npx wrangler secret put TOKEN_ADMIN` (un valor al azar; solo sirve para la prueba de calidad).
4. `npx wrangler deploy` → da la dirección `https://biblia-ia.<cuenta>.workers.dev`.
5. Probadores: `npx wrangler d1 execute biblia-ia --remote --command "INSERT INTO planes VALUES ('<id del teléfono>','probador',NULL)"`. El id del teléfono está en ☰ › Preguntar a la Biblia (localStorage `biblioteca-ia-dispositivo`).
6. **Prueba de calidad:** `TOKEN_ADMIN=… node calidad/correr.mjs <dirección>` → `calidad/resultados.json` → página para que Edward juzgue a ciegas → poner el modelo ganador en `MODELO` y volver a hacer `deploy`.
7. **Activarla en la app:** `node scripts/configurar-ia.cjs <dirección>`. Esto cambia `app/ia-config.js` y la CSP; el teléfono la toma al compilar. Luego compilar la PC, el APK y la web.

## Pruebas
- `tests/ia-worker.test.cjs`: el Worker con una D1 y una IA de mentira (cuotas, tope, reintentos, crisis, formatos de los modelos, rutas).
- `node servidor/ia/local.mjs 8789`: el Worker en esta PC con una IA de mentira, para probar la pantalla. Antes: `node scripts/configurar-ia.cjs http://127.0.0.1:8789`; después: `node scripts/configurar-ia.cjs ""`.

## Pendiente antes de abrirlo al público
- **Play Integrity** (Android) y **Turnstile** (web), para que no se inventen dispositivos a gran escala. Necesitan un proyecto de Google Cloud y una clave de Turnstile en la cuenta de Edward.
- **Plan Workers de US$5** cuando el uso pase el tramo gratis.
- El modelo elegido por Edward en la prueba de calidad.
