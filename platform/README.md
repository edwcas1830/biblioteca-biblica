# Puente común, contrato v1

Responsable de `platform/` y `shared/`: Codex. `mobile/`, CSS y controles móviles: Claude.

`bridge-contract.js` es UMD, sin Node ni Electron. Los 67 nombres de `preload.cjs` se conservan; sus resultados se describen por operación en `bridge-contract.d.ts`. Se añaden `getCapabilities`, `playVoice`, `stopVoice`, `voiceOptions` y `shareText`. No hace falta TypeScript para usarlos.

Todas las operaciones ordinarias devuelven una promesa con el resultado descrito, o rechazan con `BridgeError {code,message,operation}`. **Nunca** se devuelve `{disponible:false}` en lugar de un resultado. Los cinco eventos son síncronos: reciben un callback y devuelven una función de desuscripción idempotente. No hay callbacks de OAuth ni credenciales copiadas de Windows.

## Integración antes de app/app.js

Cargar el contrato y el adaptador antes de cualquier controlador. Web, en orden:

1. Datos `app/bible-data.js` y núcleos `app/prayer-core.js`, `app/guide-core.js`, `app/study-chat-core.js` (ya forman parte de la app).
2. `platform/bridge-contract.js`, `shared/references.js`, `shared/personal-model.js`.
3. `platform/web/personal-store.js`, `platform/web/library.js`, `platform/web/bridge.js`.
4. Crear el adaptador y asignar `window.libraryDesktop`. Después cargar los controladores de interfaz.

```js
const adapter = LibraryWebBridge.create({bible: window.BIBLE, dbName: 'biblioteca-preview-v1'});
// Android, después de inicializar SQLite: LibraryAndroidBridge.create({handlers, events, storage:'sqlite'}).
window.libraryDesktop = adapter.bridge;
const capabilities = await window.libraryDesktop.getCapabilities();
if (!capabilities.operations.readPdf.available) ocultarImportarPDF();
```

Claude registra las integraciones sin editar archivos de Codex:

```js
adapter.register({
  playVoice: async ({text, lang = 'es', rate = 1}) => { await miTTS.speak({text, lang, rate}); },
  stopVoice: async () => { await miTTS.stop(); },
  voiceOptions: async () => misVocesNormalizadas(),
  shareText: async ({text, title}) => { await miShare.share({text, title}); return {completed:true}; }
});
```

Se deben normalizar los resultados de plugins al contrato (por ejemplo, `speak()` devuelve un objeto del plugin: el adaptador debe devolver `undefined` si el contrato dice `void`). `register()` actualiza las capacidades consultables, valida todos los nombres antes de modificar nada y no se expone en `window.libraryDesktop`. El objeto `adapter` queda en la integración de plataforma.

Los eventos se habilitan con `events:['onMusicPause','onFullscreen',…]` al crear el adaptador y se emiten con `adapter.emit('onMusicPause')`. Un evento no habilitado genera `UNAVAILABLE`; consultarlo antes de suscribirse. No habilitarlo sin conectar primero el ciclo de vida correspondiente. Si se reemplaza un manejador durante una operación, el que ya estaba en ejecución termina normalmente.

## Límites que la interfaz debe respetar

- No basta comprobar que existe la función: todos los nombres están presentes. Consultar `getCapabilities().operations[nombre].available` antes de mostrar un control o suscribirse.
- Web usa una base IndexedDB distinta del perfil Windows. Para probar Android, **no** instalar el adaptador web como respaldo silencioso de SQLite.
- `nativeVerified:false` es deliberado hasta la prueba de APK real. La fábrica Android es el punto de ensamblado del contrato, todavía no implementa SQLite ni dice que lo haya probado.
- Capacidades no implementadas (PIN, módulos SQLite, PDF, círculo, IA conectada, actualizaciones) rechazan con `UNAVAILABLE`. Cada entrega ampliará esa lista; nunca se fingirá un resultado vacío de módulo personal. En particular, los controladores de Windows llaman directamente a `onAiState` y otros eventos: la integración móvil debe condicionar esas suscripciones; no basta desactivar botones.
- `aiConnect({code})` reserva el segundo paso del PKCE manual; el primer paso sin argumento podrá devolver `authorizationUrl`, `requiresCode` y `expiresAt`. No anunciar conexión automática ni abrir OAuth en la WebView.
- Los mensajes `BridgeError` son seguros para mostrar al lector. Un error nativo inesperado se convierte en `INTERNAL` sin divulgar rutas, payloads ni secretos. Los errores esperados deben convertirse al código apropiado dentro del servicio.

## Pruebas

`node --test tests/bridge-contract.test.cjs` comprueba cobertura real de preload, capacidades, registro atómico, validación, desuscripción y errores seguros. No ejecuta Gradle, plugins nativos ni conexión con proveedores.

`node scripts/test-android-web.cjs` comprueba IndexedDB real en Chromium/Electron oculto con perfil temporal y dos cargas de página. No carga el preload de la app ni accede a internet. `node scripts/test-android-windows-regression.cjs` reutiliza las 48 vistas de Windows con un plan y dos módulos auxiliares sintéticos. Ambas pruebas necesitan permiso de ejecución de ventanas/servidores locales si el sandbox los bloquea.

## Guardado de la vista previa (pieza 2)

`bootstrap({legacy,initial,legacyValid})` migra una copia JSON v1 a IndexedDB. Antes conserva el texto exacto de la copia antigua en `backups`; no borra localStorage. La base existente prevalece. Guardado y restauración usan transacciones y revisión optimista entre pestañas. Se conservan IDs y nombres de campos; referencias internas `b001`–`b066` y notas con namespace de módulo. SHA-256 es asíncrono con WebCrypto, pero genera exactamente los mismos IDs que Windows.

`restoreBackup({state})` valida antes de sustituir y guarda el estado anterior como respaldo en la misma transacción. `exportBackup()` devuelve JSON compatible con Windows. PIN/copia cifrada bloquean la importación hasta la pieza de cifrado, sin degradarlos a texto. No se copian credenciales ni claves de proveedores. Un esquema futuro o corrupto se conserva y genera `CORRUPT`, sin crear una biblioteca vacía encima.

Para ofrecer recuperación de las copias locales, la integración puede usar `adapter.store.listBackups()` y `adapter.store.backup(id)`. El primer método devuelve registros que pueden contener contenido privado: no volcarlos a consola ni mandarlos al servidor. `backup(id)` devuelve el JSON previo (objeto) o el texto exacto de una migración antigua. Estos métodos de mantenimiento quedan fuera del puente de los controladores. Al desmontar la vista previa, llamar `await adapter.store.close()`.

RV1909 usa el texto público suministrado en `bible`; pasar también `manifest` desde `app/data/rv1909-manifest.json` conserva permiso de IA y atribución. La búsqueda web cooperativa admite texto/prefijos y concordancia de palabra exacta sin tildes. **No es FTS5** ni un lector de módulos SQLite. Las operaciones para módulos personales rechazan `NOT_FOUND`; comentarios, diccionario y gráficos seguirán sin capacidad hasta su entrega.
