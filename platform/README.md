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

El ensamblador móvil puede usar `platform/scripts-movil.json`: lista ordenada de rutas relativas a `www/`. Los tres núcleos personales anteriores se adelantan aparte, como ya hace `build-www.cjs`. `voice-core.js` se carga desde la etiqueta común de `index.html` antes de `app.js`; no necesita otra inserción en la lista del puente.

El punto de entrada acordado es `window.LibraryAndroidServices.handlers()`. El registro se carga con `platform/android/services.js` y comienza vacío: no publica servicios nativos todavía inexistentes. Los repositorios nativos, después de inicializarse, usarán `LibraryAndroidServices.register({...})`; `handlers()` devuelve una copia congelada. Después de registrar `bootstrap` y `savePersonal` y abrir el repositorio, `setStorage('sqlite')` permite anunciar el almacén real. Crear el puente con `{handlers:LibraryAndroidServices.handlers(),storage:LibraryAndroidServices.storage()}`. Si se registran servicios después de crear el puente, actualizarlo con `adapter.register(...)`; la copia de manejadores no se actualiza sola. El registro no instala SQLite ni sustituye su inicialización.

Voz y Share siguen en las integraciones de Claude. `app/voice-core.js` selecciona el puente cuando `playVoice`, `stopVoice` y `voiceOptions` están disponibles; Windows mantiene Web Speech con voces locales. En Android no se usa el shim para fingir una capacidad ausente. El TTS se divide por versículos y fragmentos de hasta 3000 unidades UTF-16; la pausa reinicia el fragmento interrumpido y un callback cancelado no salta versículos. Los textos comunes dicen «Voz del dispositivo». La respuesta `voiceOptions` puede conservar `localService`; si declara false, esa voz se excluye. Una voz sin ese dato no se anuncia como offline.

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

## Traspaso desde la PC (pieza 7, datos)

Se añaden `transferScan` y `transferInstall`. No reutilizan `restoreBackup`, porque esta operación sustituye **base y paquete** como una sola instalación recuperable. `platform/scripts-movil.json` incluye las dependencias nuevas antes de los controladores; todo sigue siendo UMD, sin Node/Electron en producción.

```js
// Selección que ya devuelve la integración de Claude: copyFile, readData:false.
const seleccion = await BibliaPlataforma.elegirArchivosTraspaso();
const revision = await libraryDesktop.transferScan(seleccion);
// Mostrar revision.resumen, esperar una confirmación explícita del lector.
const resultado = await libraryDesktop.transferInstall({token:revision.token, confirmado:true});
// resultado.requiereRecarga: abrir una sesión nueva, sin guardar el estado anterior.
```

`transferScan({carpeta:'traspaso-entrante',archivos:[{nombre,ruta,bytes}]})` solo admite rutas de esa carpeta privada, nunca URI SAF ni rutas arbitrarias. La selección debe contener exactamente `traspaso.json`, la base, `manifest.json` y los módulos enumerados. `bytes` debe ser el tamaño real **después** de copiar; si el proveedor no lo informa, usar `Filesystem.stat` sobre el destino. Los nombres duplicados se rechazan, también cambiando mayúsculas. Conviene detectarlos en el selector antes de copiar con overwrite.

Verifica tamaños/SHA-256 de cada archivo y ambas listas de módulos; crea un candidato privado y vuelve a verificar cada copia. SHA-256 incremental procesa bloques de 256 KiB mediante `readFileInChunks`, sin cargar el módulo completo. Lee SQLite por conexión NC **de solo lectura**, con `integrity_check`, claves externas, esquema, ordinales, referencias, progreso e IDs válidos. El resumen sale de la base, no de los conteos del exportador. Conserva manifest/licencias/atribución/iaPermitida sin transformar. Las huellas detectan corrupción; no autentican un editor ni conceden permisos sobre el texto.

El resultado es `{token,expiresAt,resumen,requiereConfirmacion:true}`. `resumen` solo incluye conteos, títulos/IDs/tipos de módulos, modo personal, versión, bytes y `conservaPin`; no contiene notas, oraciones, respuestas ni pasajes. Con bóveda, devuelve `estadoCifrado:true` y omite `oraciones`. El token dura 30 minutos, se usa una vez y queda ligado a la revisión de la biblioteca. Una copia alterada o una biblioteca modificada desde el resumen no se instala.

La fábrica nativa es `LibraryAndroidTransfer.create({filesystem,sqlite,books,repository})`; recibe los plugins **raw** Filesystem y CapacitorSQLite, y los libros canónicos. Primero llamar `await servicio.recover()` **antes de abrir el repositorio**. Después registrar `servicio.handlers()` en `LibraryAndroidServices` y, si el puente ya existe, en `adapter.register(...)`. No se instala automáticamente al cargar el script. Sin repositorio conectado solo registra `transferScan`; `transferInstall` conserva capacidad ausente. No usar IndexedDB como respaldo silencioso ni anunciar `storage:'sqlite'` por tener un importador.

`repository` debe suministrar estas cinco operaciones; son parte de la conexión al repositorio nativo, **no implementaciones simuladas para producción**:

- `revision()` devuelve una revisión comparable que cambia con cualquier guardado.
- `exclusive(fn)` serializa el traspaso con todos los guardados y cambios de catálogo/PIN.
- `quiesce()` detiene las colas, limpia claves en memoria, cierra conexiones y termina/checkpointa WAL. Una base activa con sidecars bloquea la sustitución.
- `activate({database,modules,locked,generation})` abre y valida la base instalada y enlaza su catálogo; invalida la sesión previa. Los destinos lógicos son `biblioteca-personal.sqlite` y `modulos/personal`, dentro de DATA/files. Si el repositorio usa la base conformada del plugin en `databases/`, necesita un adaptador de ubicaciones/transacción que incluya **esa base activa** en el respaldo; copiar solo un snapshot de files no basta. La fábrica actual no presume esa conexión.
- `resume({installed,blockWritesUntilBootstrap})` reabre el conjunto correcto. Al instalar mantiene bloqueados los guardados de la sesión anterior hasta un nuevo bootstrap; al revertir restaura la sesión anterior. Así un autosave tardío no sobrescribe la importación.

`transferInstall({token,confirmado:true})` vuelve a comprobar el candidato, pausa el repositorio y conserva el conjunto anterior en `respaldos/traspaso-<id>/` antes de sustituirlo. Un diario pequeño y una marca de commit permiten recuperar una interrupción de proceso: sin marca vuelve al conjunto anterior; con marca conserva el nuevo. Si la recuperación falla, mantiene el diario y el repositorio cerrado, devuelve `LOCKED` y exige recuperación antes de abrir. Un fallo de limpieza después del commit no convierte el éxito en fallo. No se promete resistencia a un corte eléctrico sin verificar durabilidad/fsync en Android. El resultado es `{instalado:true,resumen,respaldo,requiereRecarga:true}`.

El PIN no se solicita ni se guarda durante el traspaso: se conserva exactamente la bóveda Windows scrypt/AES-GCM. Se comprueba su estructura y que no mezcle texto privado abierto; autenticar/abrir el contenido cifrado corresponde al servicio de PIN pendiente. La prueba Node demuestra que el mismo PIN abre el resultado en Windows; **todavía no demuestra desbloqueo en Android**. Credenciales del proveedor y tokens de Windows no están entre los archivos admitidos.

Dos cuidados para `traspaso-pc.cjs`, propiedad de Claude: detectar `meta['private-vault']` para `estadoCifrado`, no inferirlo de un fallo al leer `meta.state`; dejar el snapshot en `PRAGMA journal_mode=DELETE` tras el backup y antes de las huellas. Una copia WAL abierta incluso en solo lectura puede crear `-wal`/`-shm`; esos archivos no forman parte del formato plano y se rechazan como extras. Esto se hace en la copia, nunca en el perfil real.

`node --test tests/android-transfer.test.cjs` utiliza exclusivamente fixtures temporales inventados, con SQLite real y adaptadores de plugins que operan esos archivos en Node. Comprueba huellas, 329/1189, dos devocionales, notas/IDs, PIN, errores y recuperación. No usa la carpeta privada de OneDrive y **no equivale a ejecutar los plugins en un teléfono**. La conexión del repositorio nativo, selección SAF/OneDrive, almacenamiento lleno, PIN nativo, reinicio y APK siguen en la matriz pendiente.

## Lectores y estudio (pieza 4)

La lista ordenada actual es `platform/scripts-movil.json`; prevalece sobre la enumeración inicial de este documento. Web publica `catalog`, `metadata`, `chapter`, `search`, `comments`, `dictionary`, `compare`, `connections`, `graphicsChapter`, `graphicsChronology`, `graphicsPeople`, `graphicsGenealogy` y `studySources`. Los resultados conservan el contrato de escritorio y las referencias canónicas. `PlanCore` y `GraphicsCore` pueden seguir en sus etiquetas originales antes de app.js: el servicio de estudio los busca al usar cada operación.

El adaptador web carga bajo demanda los JSON/gzip públicos de `app/data` (en móvil: `www/data`). `LibraryWebResources` comprueba SHA-256, limita bytes y descompresión y no permite rutas ajenas a esos recursos del mismo origen. Pasar `resourceBase` solo si el ensamblador cambia esa ubicación. Se usa DecompressionStream del navegador moderno; si falta, la operación rechaza UNAVAILABLE. Las revisiones públicas `revisionKind:'gzip-json'` identifican el recurso comprimido; no son la huella del SQLite original. Se conservan las licencias y atribuciones.

**El paquete público actual no trae comentarios.** No se fabrica contenido para llenar el panel: el catálogo lo advierte. Comments está implementado y se ha probado con comentarios inventados CC0; en Android lee los comentarios del paquete que importe el usuario. El web preview busca cooperativamente; no anuncia FTS5. Diccionario, comparación y todos los gráficos sí usan los recursos públicos reales.

Android recibe los plugins raw Filesystem y CapacitorSQLite:

```js
await LibraryAndroidServices.attach(adapter, {
  bible: window.BIBLE, manifest: window.BibliaManifiestos.rv1909,
  filesystem: Filesystem, sqlite: CapacitorSQLite
});
await LibraryAndroidServices.loadReader(); // carga administrada; puede correr en segundo plano
```

El lector descubre DATA/modulos/<paquete>/manifest.json, verifica tamaño/huella/esquema y abre los bblx/cmtx/dctx mediante conexiones NC de solo lectura. Conserva rangos, introducciones, Strong, diccionarios repartidos y rojo únicamente NT. Un cambio del archivo invalida su lectura. Services ahora administra su cierre y recreación durante el traspaso: no crear otra instancia por fuera de loadReader(), porque sus conexiones quedarían fuera del bloqueo de sustitución.

FTS5 vive en una base derivada `biblioteca-indice` separada: nunca modifica los módulos. Construye por lotes un índice de versículos y otro de claves de diccionario; evita traer RAE entero a memoria. Las revisiones y la versión del parser invalidan cachés. Cada reemplazo es transaccional y un motor sin FTS5 falla explícitamente. Este lector **no** implementa el repositorio personal: no llamar setStorage('sqlite') solo por inicializarlo. La recuperación del traspaso debe preceder a la apertura del lector.

RTF tiene una sola implementación en shared/rtf.js, usada también por Windows. Solo produce etiquetas controladas y texto escapado; no ejecuta HTML del módulo. Los enlaces palabra→Strong solo se crean al cotejar la redacción. No confundir las capacidades disponibles con nativeVerified: las pruebas Node usan SQLite real, pero adaptadores de plugin sintéticos; todavía falta ejecutar los plugins en APK.

## Documentos en segundo plano (pieza 5)

Ejecutar `node scripts/prepare-assets.cjs` **antes** de build-www. Copia la versión instalada y fijada de pdfjs-dist a app/vendor/pdfjs (API, Worker, CMaps, fuentes estándar, codecs y licencia Apache-2.0). vendor sigue ignorado en Git; los archivos se generan a partir del lock, no se descargan al importar ni necesitan una CDN. El ensamblador existente copia app/ a www/, por tanto vendor/ queda al lado de platform/ y shared/. No agregar shared/pdf-document.js como script de la página: lo importa el Worker.

LibraryWebBridge.create habilita readPdf automáticamente cuando LibraryWebDocuments está cargado y hay Workers. En Android, registrar explícitamente el servicio, sin prometer almacenamiento SQLite:

```js
const documentos = LibraryAndroidDocuments.create();
LibraryAndroidServices.register(documentos.handlers());
adapter.register(documentos.handlers()); // si ya está creado
// Al desmontar: documentos.close(); en web, adapter.documents.close().
```

El controlador PlanDocuments no cambia: PDF usa readPdf y DOCX sigue usando el JSZip local. readPdf conserva PdfResult y transfiere una **copia** del Uint8Array, sin separar el archivo del lector. Extraction/reflow se hace en un Worker módulo local y PDF.js recibe un Worker real mediante GlobalWorkerOptions.workerPort. No hay respaldo silencioso al hilo principal. Una lectura simultánea devuelve CONFLICT; cierre y tiempo máximo (120 s) cancelan/terminan los Workers, sin guardar parcialmente.

La lógica compartida es shared/pdf-document.js. Windows conserva su Worker Node e import legacy; ahora espera la carga asíncrona de fuentes para mantener negrita/cursiva también en navegador. Límites: 10 MB, 300 páginas, 2 MB de texto, 20.000 registros; no OCR, ni interpretación automática de tachados dibujados. Mantiene portada, subtítulo, índice de días, márgenes y avisos de revisión. No ejecuta acciones JavaScript del PDF, no abre vínculos ni carga fuentes del sistema. PDFs dañados/protegidos reciben errores humanos sin devolver rutas o texto crudo en el error.

La prueba de navegador usa script-src self, worker-src self y connect-src self, con todas las solicitudes externas bloqueadas. No hace falta JavaScript unsafe-eval. Algunos codecs opcionales de PDF.js necesitan WebAssembly: la cobertura entregada comprueba PDFs de texto originales CC0, no todos los formatos/encodings ni imágenes escaneadas; verificar esos casos y la política WebView en APK antes de ampliar las promesas. No desactivar la CSP como solución.

`node scripts/test-android-documents.cjs` ejecuta PDF/DOCX reales sintéticos en Chromium sin preload y comprueba Workers, títulos/28 días, referencias, formato, errores, límites y que la página siga atendiendo su temporizador. `tests/android-documents.test.cjs` comprueba copia de subarrays, cancelación/cierre/timeout, reintento y limpieza. Un parser probado en Chromium no demuestra acceso SAF ni compatibilidad del WebView Android real.

## Inicio Android y repositorio SQLite (pieza 2 nativa)

El registro ya puede inicializar la biblioteca desde arranque.js. Crear el adaptador como hasta ahora, conectar las integraciones de voz/Share y exponer libraryDesktop; después:

```js
const sqlite = Capacitor.registerPlugin('CapacitorSQLite'); // plugin raw, no SQLiteConnection wrapper
const filesystem = Capacitor.registerPlugin('Filesystem');
const lista = LibraryAndroidServices.attach(adaptador, {
  sqlite, filesystem, bible: window.BIBLE, manifest: window.BibliaManifiestos.rv1909
});
// Tu interfaz muestra «Preparando tu biblioteca…» mientras espera lista.
try { await lista; /* retirar el aviso; bootstrap del controlador ya puede terminar */ }
catch (error) { /* mostrar error.message + acción para reabrir; no iniciar una copia vacía */ }
```

attach devuelve una promesa de capacidades y es idempotente para el mismo adaptador. No hace falta esperar para exponer libraryDesktop: bootstrap/savePersonal/exportBackup/restoreBackup/privacyStatus esperan el inicio dentro de sus manejadores. El lector público se registra inmediatamente; usa la lógica portable RV1909/recursos libres sin IndexedDB. El módulo documents.js añade PDF Workers si está disponible. LibraryAndroidServices.status() informa idle/preparing/ready/failed/closed con errores seguros. El aviso de UI y su retirada siguen siendo responsabilidad de Claude; no se tocó mobile/.

register() ahora propaga nuevos manejadores al adaptador adjunto. setStorage() también actualiza su getCapabilities(): storage es none hasta abrir y validar la base, y sqlite después. setStorage es una herramienta administrativa del adaptador, no una operación expuesta en libraryDesktop. nativeVerified permanece false. Un fallo de apertura llega al aviso y a bootstrap; no se usa localStorage/IndexedDB para simular éxito de guardado nativo.

LibraryAndroidStore.PersonalStore usa las operaciones raw beginTransaction/commitTransaction/rollbackTransaction del plugin 8.1.1. Guarda esquema canónico 3 (meta/annotations/plans/plan_days), compatible con Windows, y añade meta.android-revision para evitar sobreescrituras desde sesiones antiguas. Los IDs de días no cambian. Inserciones por lotes de 100 y SQL con parámetros. Migración retiene el JSON antiguo exacto antes de escribir; restauración conserva el estado previo antes de cambiar la biblioteca activa. Un fallo revierte las cuatro tablas.

Base principal conformada del plugin: biblioteca-personal → databases/biblioteca-personalSQLite.db. Respaldos en una segunda base biblioteca-respaldos, abierta bajo demanda; los snapshots y el texto legacy se quedan locales. El respaldo previo puede quedar guardado si luego falla la restauración: la biblioteca activa se revierte. No se afirma atomicidad distribuida entre las dos bases ni durabilidad ante pérdida eléctrica sin APK. La base principal usa journal_mode DELETE verificado por query y secure_delete, sin escribir sobre esquemas futuros/dañados.

## Traspaso sobre la base activa (pieza 7 nativa)

attach({sqlite,filesystem,bible,manifest}) prepara el repositorio administrativo y publica window.LibraryAndroidRepository (en Node: services.repository()). Incluye revision/exclusive/quiesce/activate/resume y mapFilesystem. attach resuelve getUrl del plugin sin abrir ni crear una base vacía, recupera el diario pendiente y solo entonces abre la base principal. Scripts-movil.json coloca repository.js y transfer.js antes de services.js.

El destino lógico biblioteca-personal.sqlite se mapea a la URI real del plugin databases/biblioteca-personalSQLite.db, incluidos -wal/-shm/-journal. Candidatos, diario, respaldos y módulos siguen dentro de DATA. Movimientos entre ambas carpetas usan URI absolutas sin directory (requisito del Filesystem Android). El respaldo respalda **la base activa del plugin**, no otra copia en files. Nunca se lee la carpeta privada de Windows desde Android.

attach registra transferScan/transferInstall y ejecuta recover() internamente. **Eliminar el recover() previo y la creación externa de LibraryAndroidTransfer del arranque anterior**: no recuperar antes de conocer la URI de SQLite, ni capturar un fallo para continuar abriendo. La interfaz conserva su revisión/progreso y usa libraryDesktop.transferScan/transferInstall. No registrar una segunda instancia: cada escáner conserva su propio token.

Para los módulos, sustituir la creación externa por `const modulos = lista.then(() => LibraryAndroidServices.loadReader())`. No capturar el rechazo de lista para iniciar el lector igualmente. La creación inicial corre aparte para no demorar bootstrap mientras verifica bibliotecas grandes; es idempotente cuando ya hay lector. La sustitución pausa cargas nuevas y espera a la anterior antes de cerrar/mover. Las operaciones de un lector disponible sí comparten la cola del repositorio. Se recrea y coteja IDs/huellas con el manifiesto instalado. Una carga anterior no puede registrar el catálogo viejo después del traspaso. La UI sigue emitiendo biblioteca:capacidades cuando termine; estos servicios no modifican mobile/ ni sus avisos.

exclusive comparte la cola de bootstrap/guardado/restauración/lectura. revision comprueba el estado canónico y su revisión; un guardado posterior al resumen obliga a revisarlo otra vez. Tras instalar, guardados y restauraciones rechazan CONFLICT hasta un bootstrap exitoso. Los guardados que ya esperaban en cola quedan invalidados por generación aunque bootstrap ocurra después. transferInstall devuelve requiereRecarga:true: la UI debe recargar para usar el estado nuevo. No regenerar IDs.

Un error revierte base y módulos y recrea el catálogo anterior. Si falla esa recuperación, el diario se conserva, la base queda cerrada y storage cambia a none hasta reiniciar y recuperar antes de abrir. La marca de commit diferencia una instalación confirmada de un intercambio interrumpido; no se promete supervivencia a pérdida eléctrica sin validar en APK. FTS usa las transacciones oficiales del plugin, igual que el repositorio personal.

El lector admite `rol: 'apoyo'` en biblias, diccionarios y comentarios, igual que Windows, conservando la validación de tipo/extensión. El traspaso verifica por SHA-256 los bytes de cada copia preparada: el escaneo hace una sola pasada de hash por archivo después de copiar, además de comprobar previamente tipo/tamaño. Al instalar vuelve a verificar el candidato completo; no sustituye integridad por fecha/tamaño. La activación sigue cotejando el catálogo instalado y revierte si un módulo no pasa la revisión. La reducción es de pasadas de hash del escaneo, no una promesa de tiempo total en un teléfono.

## PIN nativo compatible con Windows

attach prepara el cifrado local y registra unlock/setPin/lockPrivate/disablePin únicamente si el Worker inicia correctamente. El repositorio admite bases con private-vault; bootstrap abre el estado público con privacyEnabled/privateLocked y campos privados vacíos. Sin Worker/WebCrypto, no anuncia controles de PIN ni inventa claves: permite conservar/leer el estado público cerrado y rechaza instalar una copia cifrada nueva que no podría abrir.

Antes de build-www, ejecutar `npm ci` y `node scripts/prepare-assets.cjs`. La dependencia directa fijada @noble/hashes 2.4.0 (MIT) se copia a app/vendor/noble-hashes con licencia/versionado, luego www/vendor; no hay descarga al abrir un cuaderno. El Worker de módulo local usa scrypt N=32768,r=8,p=1, clave 32 bytes y máximo 64 MiB; AES-256-GCM mediante WebCrypto, IV nuevo de 12 bytes, tag de 16 bytes y AAD biblioteca-privada-v1. Mantiene exactamente la envoltura Windows {v:1,salt,iv,tag,data}. No agregar vault-worker.mjs/vault-engine.mjs como scripts de la página. El manifiesto añade shared/private-vault.js y platform/android/private-vault.js en orden.

La clave y la derivación viven en el Worker; la página recibe solo identificadores opacos de sesión y el texto autorizado al abrir. No se guardan PIN/clave en SQLite, Preferences ni archivos. Lock descarta y limpia los bytes de clave; cierre/timeout/fallo de Worker descarta la sesión. No se promete borrar cadenas JS inmutables o la memoria interna de WebCrypto. setPin/cambiar/desactivar/restaurar modifican la envoltura en la misma transacción que los datos. Un fallo conserva la clave anterior y las cuatro tablas. secure_delete, journal DELETE y VACUUM limpian la base activa después de cambiar protección; si falla la limpieza posterior al commit, se cierra la sesión y se bloquea guardar hasta reiniciar, indicando que el candado ya cambió.

Si el Worker falla, Services emite biblioteca:cuaderno-cerrado sin contenido. El controlador común privacy.js vacía inmediatamente los campos privados mostrados y pasa a candado cerrado; las escrituras de la sesión antigua quedan invalidadas. Un nuevo unlock puede reiniciar el Worker local; si cerró el servicio completo, se requiere reabrir la aplicación.

Se protegen notes/devResponses/planNotes/prayers/prayerDrafts/guideResponses/aiStudies. Planes, progreso, devocionales, posición y resaltados siguen legibles con el candado cerrado. Las notas sin resaltado no dejan filas de referencia abiertas. Guardar contenido privado cerrado rechaza LOCKED; los guardados anteriores a un cambio de candado se invalidan por generación. Intentos incorrectos se guardan en pin-attempts; desde el quinto, espera exponencial de 30 s a 5 min, persistente tras reinicio. Acertar elimina esos intentos.

exportBackup nunca incluye texto privado descifrado si hay PIN, incluso cuando el cuaderno está abierto. Restore verifica el PIN de la copia, valida el contenido antes de escribir, retiene el estado previo (cifrado si ya lo estaba), y termina cerrado con el PIN de la copia. La instalación por carpeta conserva la bóveda byte a byte y termina cerrada; resume elimina cualquier sesión anterior. Las copias/respaldos antiguos conservan su protección original; activar un PIN no cifra retroactivamente los respaldos viejos.

`node scripts/test-android-pin.cjs` ejecuta el Worker real en Chromium con CSP estricta, conexión externa bloqueada y perfil temporal. Las pruebas Node usan Worker threads, SQLite real y fixtures inventados; comprueban ida/vuelta con lib/private-vault.cjs de Windows, siete campos, reinicio, intentos, cambios de PIN, rollback, fallos y traspaso cifrado. La UI de privacy.js se reutiliza: no se cambió su diseño. Para cerrar al salir/segundo plano, Claude debe usar closePrivate() antes de suspender la vista, conservando su cola de guardado; la UI existente también cierra tras cinco minutos de inactividad.

Al desmontar, await LibraryAndroidServices.close(). nativeVerified sigue false: falta comprobar WebView, almacenamiento nativo, tiempos/RAM de scrypt y pausa/reinicio en dispositivo. Fuentes técnicas consultadas el 10-10-2026: https://github.com/paulmillr/noble-hashes (licencia y scrypt), https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/encrypt (AES-GCM); la compatibilidad afirmada se prueba contra el código real de Windows, sin cambiar su formato.

## IA móvil (pieza 6)

`shared/ai-context.js` construye extractos usando las operaciones del lector; `platform/ai/openrouter.js` hace PKCE S256 y consultas de texto limitadas a modelos gratis; `platform/ai/service.js` conserva hasta cinco preparaciones (30 minutos), verifica permisos/revisiones al enviar/copiar/compartir y devuelve las seis secciones de StudyChatCore. No lee bootstrap, notas, oraciones o copias para preparar contexto. Historia solo entra si la interfaz la entrega expresamente. Las citas se resuelven en la biblioteca local; los códigos Strong necesitan estar en las fuentes y existir en el diccionario. Se descarta una respuesta tardía tras candado/traspaso/cancelación. Android invalida preparaciones al cambiar protección o instalar; el cierre borra cuenta y contexto en memoria.

Los servicios se registran automáticamente en WebBridge.create y AndroidServices.attach. El ensamblado debe adelantar study-chat-core.js (ya lo hace build-www) y usar scripts-movil.json: incluye `ai-core.js`, ruta raíz de www copiada desde app, sin duplicar su etiqueta. No hay Node, CLI, servidor loopback ni callback en el teléfono.

Contrato para la interfaz de Claude:

- Crear adaptador con `events: ['onMusicPause', 'onAiState']`. `onAiProgress` sigue no disponible: esta entrega usa JSON final, no simula streaming. Registrar `aiTextCopy` con Clipboard.write({string:text}) en Android, navigator.clipboard en la vista web. No registrar uno vacío si falta el portapapeles. `shareText` existente sirve sin cambios; un selector cancelado devuelve shared:false.
- Pasar `aiOptions: {openExternal: abrirFuera}` tanto a WebBridge.create como a AndroidServices.attach. La callback solo recibe URLs HTTPS conocidas de ChatGPT/Gemini/Claude al usar aiCopy; no contiene la pregunta. OAuth: abrir authorizationUrl mediante Browser (navegador del sistema), nunca iframe/WebView de login.
- `aiConnect()` → estado + authorizationUrl + expiresAt. Mostrar «Abre OpenRouter, autoriza y pega el código». `aiConnect({code})` → estado conectado. Vence a los diez minutos; una autorización nueva invalida la anterior. Desconectar borra la clave local y cancela consulta; no revoca la clave remota, que el usuario puede gestionar en OpenRouter.
- `aiStatus()` no hace red; incluye connected/waiting/secure, credentialStorage, connectionNotice, quota, retryAt y reporting. Sin puerto seguro, la vista web conserva `credentialStorage:'session'`. Con `aiOptions.credentialStore` restaura y guarda exclusivamente por el llavero (`device-secure`); nunca por IndexedDB, SQLite o respaldo/traspaso. Ver la ampliación siguiente para el contrato de persistencia y Gemini.
- `aiModels()` actualiza variantes :free de precio cero y openrouter/free. `aiQuota()` consulta /key: `{checkedAt,daily:{used,limit,remaining}|null,creditsRemaining:number|null,notice}`. Refrescar tras conectar y después de consultar, por acción del usuario; no convertir usage_daily (dinero) en consultas ni inventar 50 restantes cuando falta el contador. Mostrar checkedAt y manejar fallos sin quitar la alternativa de copiar. 402/429 → QUOTA + retryAt, sin reintentos automáticos ni cambio a modelos de pago.
- `aiPrepare()` conserva el contrato del escritorio: id/prompt/sources/reference/notices, tareas y series. IncludeBible/IncludeComment false por defecto; exige iaPermitida:true y atribuye fuentes. Vista previa antes de aiAsk({id,model,allowData}); ignorar un prompt alternativo en aiAsk. data_collection:'deny' por defecto; 'allow' solo si el lector lo elige. Puede reducir disponibilidad; no prometer privacidad absoluta del proveedor.
- `aiCopy({id})` copia; `{id,provider:'chatgpt'|'gemini'|'claude'}` copia y abre URL fija. `aiShare({id})` usa shareText con el mismo contexto elegido. Botones «Copiar pregunta» y «Compartir pregunta» sin depender de una cuenta conectada.
- `aiReport({text,model,reason,detail,confirmed:true})`: razón incorrecta/ofensiva/peligrosa/privacidad/otra, texto elegido de hasta 30.000 caracteres y detalle opcional de hasta 2.000. Mostrar revisión y confirmar explícitamente. No adjunta prompt, fuentes, historial, clave o notas. Sin un `aiOptions.reporter` devuelve sent:false/status:'sin-canal' y un borrador; **no marcar «enviado» ni guardar reported:true**. Con reporter(report) que confirme {accepted:true}, devuelve sent:true. Un borrador no se persiste ni se envía automáticamente.

**Play pendiente:** no hay canal aprobado de recepción por el desarrollador. La interfaz puede preparar el reporte y explicar el estado, pero esta alfa no satisface por ello la política de Play. Antes de distribuir allí se necesita un transporte de recepción dentro de la app, confirmación, gestión real de reportes/moderación y su declaración de datos. No se inventó un endpoint ni se enviaron mensajes a nadie.

Fuentes oficiales consultadas 10-10-2026: https://openrouter.ai/docs/guides/overview/auth/oauth (sin callback, S256, diez minutos); https://openrouter.ai/docs/api_reference/limits (/key, contador real y errores); https://openrouter.ai/docs/guides/privacy/data-collection (controles y límites); https://support.google.com/googleplay/android-developer/answer/13985936 (reportes al desarrollador dentro de la app). Pruebas sin cuentas reales; pendiente OAuth/CORS/Browser en WebView y red del APK.

### Llavero nativo y Gemini API — ampliación alfa7

Pasar el mismo objeto a `AndroidServices.attach(...,{aiOptions:{openExternal,credentialStore}})`. Métodos asíncronos del puerto: `leer(nombre)` → cadena o null, `guardar(nombre,valor)` y `borrar(nombre)` → éxito (true/void) o rechazo. Solo usa los nombres `openrouter` y `gemini`; nunca permite rutas, otros nombres ni devuelve claves por el puente. No pasar un puerto vacío ni false cuando no existe: omitirlo. El plugin debe fallar si Keystore no funciona, sin degradar a preferencias en texto plano. El objeto completo `BibliaLlavero` también sirve si cumple esos tres métodos.

OpenRouter inicia una lectura local; `await aiStatus()` espera esa preparación. Cerrar o recargar conserva la credencial en el llavero y descarta su copia de memoria. **Desconectar** borra la credencial local, cancela conexión/consulta y espera el borrado; si falla, devuelve STORAGE y `credentialError` seguro, nunca éxito ficticio. Las escrituras se serializan y una conexión cancelada mientras escribe revierte antes del siguiente cambio. La revocación de la clave remota sigue siendo gestión del usuario en OpenRouter. Sin llavero, OpenRouter anuncia honestamente sesión temporal; Gemini no se registra como disponible.

Con llavero se añaden los nombres de preload existentes `aiGeminiKey`, `aiGeminiModels`, `aiPersonalEnable` y `aiPersonalLogin`. Gemini usa `provider:'gemini-api'` en `aiAsk`, conservando ID/preparación, citas locales y diseño C. Solo se admite en un catálogo con `personalDefault:true`, como el paquete personal de Edward; el paquete público sigue OpenRouter + copiar/abrir. `aiPersonalStatus()` expone únicamente Gemini API, nunca instala ni anuncia las CLI de Windows en Android. Después de preparar módulos, la interfaz debe refrescar ese estado para mostrar el selector y filtrar CLI no disponibles. El interruptor de modo personal es de esta sesión; su valor inicial viene del paquete. Desactivarlo no borra claves.

`aiGeminiKey(cadena)` guarda en el llavero y devuelve el estado personal que ya consume app/ai.js; `aiGeminiKey(null)` borra incluso si el modo personal está desactivado. `aiGeminiModels()` consulta hasta cinco páginas de modelos `generateContent`, selecciona hasta 40 de texto y prioriza Flash; no fija un nombre ni anuncia que todo modelo sea gratis. `aiPersonalLogin('gemini-api')` abre AI Studio con Browser. Otros proveedores CLI rechazan UNAVAILABLE. Si falla leer/proteger la credencial, el lector sigue disponible y el estado/conexión muestran el error seguro.

Gemini: REST oficial v1beta, clave solo en header x-goog-api-key; sin clave/prompt en URL, redirecciones ni herramientas. Respuesta JSON final, sin streaming ni partes thought; respuestas bloqueadas/truncadas no se presentan como completas. Revalida fuentes/candado después de cargar modelos y antes de enviar, además de después de recibir. 401/403 → LOCKED, 429/402 → QUOTA con espera y sin reintento; red → UNAVAILABLE. Cuota desconocida: no hay contador equivalente a /key, ni garantía de costo cero; rigen cuota, facturación, región y términos del proyecto de AI Studio. OpenRouter conserva selección :free, max_price cero y data_collection deny. Ese control de OpenRouter no configura la política de datos de Gemini.

`scripts-movil.json` añade credentials.js y gemini.js antes de service.js. CSP requiere connect-src https://generativelanguage.googleapis.com (lado build-www de Claude). La implementación del plugin, montaje de la clave en el formulario, explicación del aviso/plan y prueba real de persistencia al matar la app quedan en la integración móvil. Pruebas de esta ampliación usan un puerto sintético y red simulada, sin cuentas ni claves reales. Fuentes oficiales verificadas 10-10-2026: https://ai.google.dev/gemini-api/docs/api-key (incluida transición a claves de autorización), https://ai.google.dev/api/models, https://ai.google.dev/api/generate-content, https://ai.google.dev/gemini-api/docs/structured-output, https://ai.google.dev/gemini-api/docs/rate-limits.
