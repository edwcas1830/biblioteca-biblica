# Correcciones de acciones, fuentes Android y precios

## Instrucción y resultado

Gemini y OpenRouter importan `LibraryStudyActions` explícitamente y usan su selector común `system()`: una `action` válida tiene prioridad sobre `study` y sobre una instrucción antigua. El mismo selector se usa en los proveedores Windows y las CLI. Para acciones no se añaden las instrucciones `citations` ni el parser del esquema antiguo; las consultas sin acción conservan su compatibilidad. Las instrucciones propias de ideas de imágenes continúan funcionando.

La respuesta se normaliza con `StudyActions.result` en el servicio, después de verificar la sesión y las fuentes locales (el escritorio hace lo mismo). Una respuesta que solo trae `sections` del formato antiguo se rechaza con `CORRUPT`, en lugar de aparentar un estudio terminado con apartados vacíos. Los extractos de `fuentes` siguen saliendo exclusivamente del lector local.

## Material local

Los manifiestos gráficos de Android/web no siempre declaraban `id`; `studySources()` ahora devuelve identificadores estables, conservando `openbible-crossrefs`. Esto permite seleccionar y verificar Atlas/BibleData en Contexto.

No reproduje la falta de OpenBible en Paralelos con el código fuente actual: las nuevas pruebas recorren tanto la ruta web como `lector nativo → aiPrepare → Gemini → StudyActions.result`, con SQLite sintético, RV1909 y los recursos públicos reales. Sin comentario, confirman versículos vecinos, referencias OpenBible y textos de los paralelos; Contexto incluye Atlas y BibleData. Exégesis conserva pasaje y vecinos, sin incorporar indiscriminadamente todos los recursos.

## Precios y validación

La conversión a USD por millón normaliza el ruido binario (`0.09999999999999999` → `0.1`). La tarifa por token y el cálculo/validación del presupuesto no se redondean. Las pruebas vuelven a exigir igualdad exacta.

**280/280 pruebas**, incluyendo los proveedores Node y los proveedores cargados como scripts de navegador, sin `require`. Arranque Android simulado correcto: SQLite, lectura, referencias, portapapeles y nota persistida tras recargar. Recursos web regenerados; auditoría sin archivos prohibidos. La ejecución completa necesitó permisos para renombrados atómicos de archivos temporales sintéticos; no se usaron perfiles ni claves reales.

Antes de repetir `GEMINI_REAL=1`, ejecutar `node mobile/scripts/build-www.cjs`: el simulador carga los archivos generados de `www`, no directamente los fuentes. La prueba con Gemini real queda para el moderador. Sin publicación, APK ni cambios en main.
