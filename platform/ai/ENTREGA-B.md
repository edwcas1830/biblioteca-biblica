# B · OpenRouter con elección y presupuesto (2026-10-10)

aiModels() devuelve gratis y modelos de texto de OpenAI/Anthropic con nombre «vía OpenRouter», paid, via y pricing:{currency:'USD',prompt,completion,inputPerMillion,outputPerMillion,checkedAt}. Precios tomados de /models, no fijados por versión. Se excluyen costos por solicitud u otros costos adicionales no presupuestables.

aiAsk({id,provider:'openrouter',model,paid:{confirmed:true,maxCostUsd:0.02}}) para pago. Falta de confirmación, estimación mayor al límite o precio con más de 15 minutos impiden enviar. No cambia de modelo, no reintenta con pago, allow_fallbacks:false; gratis conserva max_price cero. Los límites de salida e importes se calculan con UTF-8 y un margen conservador para el contexto. Respuesta estimatedCostUsd y costNotice; es estimación por consulta, no contador mensual ni garantía del cobro final. Un límite real de cuenta se configura en la clave de OpenRouter. No incluye la comisión de recarga.

Para la UI: selección de modelo y confirmación son explícitas. No reusar silenciosamente el permiso tras cambiar modelo o proveedor. La conexión de escritorio declara device-secure y texto persistente; Android ya distingue llavero y sesión.

Fuentes verificadas 2026-10-10: https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties (pricing en USD por token); https://openrouter.ai/docs/guides/routing/provider-selection (max_price por millón, sin fallback). Pruebas sin cuentas reales ni cobros.
