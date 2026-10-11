# Calidad de imágenes · 11-oct-2026

Contrato aditivo: `aiImage({prompt,aspect,provider?,calidad?})`. `calidad` admite únicamente `economica` o `alta`; omitirla selecciona Económica. Los tres aspectos anteriores se conservan, siempre 1K.

| Calidad | Gemini API | OpenRouter |
| --- | --- | --- |
| Económica (predeterminada) | `gemini-3.1-flash-lite-image` | `google/gemini-3.1-flash-lite-image` |
| Alta | `gemini-nano-banana-2.1` | `google/gemini-nano-banana-2.1` |

Cada petición captura su selección antes de enviarse. No hay lista de modelos para reintentos: 404, cuota o falla de red terminan con error sin probar otra calidad/proveedor. OpenRouter también recibe `allow_fallbacks:false`; si informa otro modelo en la respuesta, se rechaza. PNG y JPEG integrados tienen límites de bytes/píxeles; no se descargan URLs externas. Se conservan cancelación, sesión, llave protegida y contexto privado excluido.

La salida conserva `dataUrl`/`model` y añade `calidad`. `estimatedCostUsd` y `costEstimate.amount` se calculan como `imageTokens * imageOutputPerMillionUsd / 1e6`. `costEstimate` incluye `calidad`, `currency`, `resolution`, `imageTokens:1120`, tarifas de entrada/texto/imagen, `approximate:true`, `checkedAt`, `source` y `notice`. `LibraryAiImage.estimate(calidad)` usa el mismo cálculo para una vista previa si el helper está cargado.

## Corrección importante de precio para la UI

Las páginas oficiales separan texto y generación de imágenes. Flash Lite cobra US$1,50/M para texto/pensamiento y US$30/M para imagen; Alta cobra US$7,50/M para texto/pensamiento y US$30/M para imagen. Por tanto, **ambas estiman US$0,0336 de salida de imagen 1K (1.120 tokens)**. Económica reduce la tarifa de entrada/pensamiento, pero no permite anunciar US$0,002 por fondo con estas tarifas. La estimación no es el cargo real, no incluye entrada/pensamiento ni cargos de recarga, y no constituye un límite de facturación.

Fuentes primarias verificadas el 11-oct-2026: [Google, tarifas](https://ai.google.dev/gemini-api/docs/pricing), [OpenRouter Flash Lite Image](https://openrouter.ai/google/gemini-3.1-flash-lite-image), [OpenRouter Nano Banana 2.1](https://openrouter.ai/google/gemini-nano-banana-2.1). No usar solo `pricing.completion` textual para estimar la imagen.

## Validación y coordinación

**292/292 pruebas**. Casos nuevos en los cuatro proveedores: calidad omitida/expresa, modelos/aspecto 1K, tarifas, calidad inválida sin HTTP, cuota/404 sin cambio de modelo, contrato antiguo compatible, JPEG integrado y rechazo de modelo cambiado. Auditoría de recursos web: cero archivos prohibidos. Arranque Android simulado correcto, incluido almacenamiento SQLite y nota tras recargar.

No utilicé claves reales ni datos privados, no ejecuté generación facturada, Gradle ni APK, y no publiqué. La UI y el selector quedan a cargo de Claude; sus archivos `app/` y `mobile/` no se modificaron (salvo la auditoría local generada, excluida del commit). Para probar la integración, regenerar `www` antes del simulador o APK. Rama `android-ui`, correo noreply.
