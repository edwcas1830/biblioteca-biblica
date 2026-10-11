# Citas por nombre de libro

Los cuatro proveedores (Gemini y OpenRouter en Android/web; OpenRouter y Gemini/CLI en escritorio) solicitan `citations:[{"ref":"Juan 3:16"}]`. El helper compartido `shared/ai-citations.js` convierte las referencias con `PlanCore.parseReferences` y el canon local, valida capítulos, versículos y rangos, elimina duplicados y descarta referencias inválidas. Una referencia por nombre tiene prioridad y nunca se rescata con un número ambiguo.

El formato numérico antiguo sigue admitido como índice desde cero, sin restar uno automáticamente. También se sustituye el ejemplo numérico del material preparado, para que la vista previa coincida con lo enviado. No se cambia la interfaz ni el formato de los hilos existentes.

Casos comprobados: Sal 23:1 → libro 18; Juan 3:16 → 42; Ro 8:28 → 44; 1 Corintios 13:4 → 45. Las pruebas cubren rangos, límites del canon, nombres inválidos, compatibilidad antigua y las peticiones/respuestas de los cuatro proveedores.

Validación: **271/271 pruebas**, construcción de recursos web sin archivos prohibidos y arranque Android simulado correcto (SQLite, Juan 3, servicios disponibles, nota persistida tras recarga y Clipboard exacto). No se usaron claves reales ni el traspaso privado de Edward. Pendiente repetir la llamada Gemini real en el dispositivo/pila del moderador.

Rama `android-ui`; sin publicación, release ni APK.
