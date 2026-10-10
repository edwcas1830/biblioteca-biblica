# Puente común, contrato v1

Responsable de `platform/` y `shared/`: Codex. `mobile/`, CSS y controles móviles: Claude.

`bridge-contract.js` es UMD, sin Node ni Electron. Los 67 nombres de `preload.cjs` se conservan; sus resultados se describen por operación en `bridge-contract.d.ts`. Se añaden `getCapabilities`, `playVoice`, `stopVoice`, `voiceOptions` y `shareText`. No hace falta TypeScript para usarlos.

Todas las operaciones ordinarias devuelven una promesa con el resultado descrito, o rechazan con `BridgeError {code,message,operation}`. **Nunca** se devuelve `{disponible:false}` en lugar de un resultado. Los cinco eventos son síncronos: reciben un callback y devuelven una función de desuscripción idempotente. No hay callbacks de OAuth ni credenciales copiadas de Windows.

## Integración antes de app/app.js

Cargar el contrato y el adaptador antes de cualquier controlador. Web: cargar también `shared/references.js`, `shared/personal-model.js`, `platform/web/personal-store.js`, `platform/web/library.js` y `platform/web/bridge.js`. En la pieza 2 se entrega este adaptador.

```js
const adapter = LibraryWebBridge.create({bible: window.BIBLE, dbName: 'biblioteca-preview-v1'});
// Android, cuando se inicialicen servicios nativos: LibraryAndroidBridge.create({handlers, events}).
window.libraryDesktop = adapter.bridge;
const capabilities = await window.libraryDesktop.getCapabilities();
if (!capabilities.operations.readPdf.available) ocultarImportarPDF();
```

Claude registra las integraciones sin editar archivos de Codex:

```js
adapter.register({
  playVoice: ({text, lang = 'es', rate = 1}) => miTTS.speak({text, lang, rate}),
  stopVoice: () => miTTS.stop(),
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
- Capacidades no implementadas (PIN, módulos SQLite, PDF, círculo, IA conectada, actualizaciones) rechazan con `UNAVAILABLE`. Cada entrega ampliará esa lista; nunca se fingirá un resultado vacío de módulo personal.
- `aiConnect({code})` reserva el segundo paso del PKCE manual; el primer paso sin argumento podrá devolver `authorizationUrl`, `requiresCode` y `expiresAt`. No anunciar conexión automática ni abrir OAuth en la WebView.
- Los mensajes `BridgeError` son seguros para mostrar al lector. Un error nativo inesperado se convierte en `INTERNAL` sin divulgar rutas, payloads ni secretos. Los errores esperados deben convertirse al código apropiado dentro del servicio.

## Pruebas

`node --test tests/bridge-contract.test.cjs` comprueba cobertura real de preload, capacidades, registro atómico, validación, desuscripción y errores seguros. No ejecuta Gradle, plugins nativos ni conexión con proveedores.
