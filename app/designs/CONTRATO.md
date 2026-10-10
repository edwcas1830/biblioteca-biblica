# Contrato de diseño v0.4 — base común

Rama `v0.4-diseno`, desde v0.3. **La aclaración final de Edward reemplaza el trío comentario/diccionario/notas:** son **Biblia · Comentario · Diccionario visibles simultáneamente**, cada uno con desplazamiento vertical independiente. Notas queda aparte. A, B y C son preferencias permanentes. Las vistas flexibles se comparten entre los tres diseños.

## Archivos y carga

`index.html` → `styles.css`, `plan-styles.css`, `library-styles.css`, `fonts/fonts.css`, `designs/common.css`, finalmente `<link id="design-css">`. Cada autor edita **solo su `design-a.css`, `design-b.css` o `design-c.css`**. No copiar JS ni cambiar módulos/datos. Es conveniente delimitar selectores con `html[data-design="a|b|c"]`. El selector superior guarda la elección en SQLite; sin elección anterior, A.

```text
html[data-design=a|b|c][data-theme=marfil|sepia|noche][data-study-scope=chapter|verse|range]
 body (.night derivada del tema; .reading-only; .focus; .resizing)
  aside.rail: marca, nav [data-view=read|dev|plan], fuentes y copias
  main#main-content
   header.topbar > .topbar-actions
    nav.compact-nav [data-view] (alternativa si se oculta rail)
    details.library-menu > [data-action] (fuentes, copias, actualizaciones)
    #design-select, #theme-select, #night, #focus
   section#read-view.view
    .intro (oculta en lector), #plan-reading-session[hidden]
    .reading-toolbar: .pane-view-controls, .reading-actions, #pane-layout-notice
      .pane-toggles: #pane-bible-toggle (fijo), #pane-comment-toggle, #pane-dictionary-toggle
      .pane-orientation: #layout-columns, #layout-rows
      #study-open, #dictionary-from-selection, #search-open, #smaller, #larger
    #library-controls: #show-strong, .voice-controls, #voice-status
    #module-status
    section#panes.reading-layout[data-active=true|false][data-sources-ready=true|false]
     [data-layout=columns|rows][data-visible=biblia|biblia,comentario|biblia,diccionario|biblia,comentario,diccionario]
     article.pane.reading-space.open-book[data-pane=biblia]
      header.pane-head: .pane-heading > #bible-title, #book-label
       .passage-picker > #book, #chapter; #version-select; #bible-ref.pane-ref
       #passage-heading[hidden] (compatibilidad)
      div#verses.verses.pane-body[tabindex=0][role=region]
       button.verse[data-verse][aria-pressed] > sup (número), texto saneado
        .reading-word[data-word]; .strong-number > .strong-code[data-strong]
        .jesus-words; .module-heading; .rtf-bold; .rtf-italic
      footer.pane-foot > .page-controls: #previous, #next
       #edition-footer[hidden], #chapter-footer[hidden] (compatibilidad)
     #pane-resizer-primary.pane-resizer[data-axis=x|y][data-between][role=separator][tabindex=0]
     article.pane[data-pane=comentario]
      header.pane-head: #comment-title, #comment-scope; #comment-select; .pane-close[data-hide-pane=comentario]
       #selected-ref.pane-ref.study-ref[aria-live=polite]
      div#comment-content.pane-body.module-content[tabindex=0][aria-busy]
       .comment-entry > h4, div; details.comment-introduction opcional
      footer.pane-foot
     #pane-resizer-secondary.pane-resizer[data-axis=x][data-between]
     article.pane[data-pane=diccionario]
      header.pane-head: #dictionary-title; .pane-close[data-hide-pane=diccionario]; form#dictionary-form
       #dictionary-select; .dictionary-query-row > #dictionary-query, #dictionary-submit
       #dictionary-ref.pane-ref[aria-live=polite]
      div#dictionary-content.pane-body.module-content[tabindex=0][aria-busy]
       ul.dictionary-results > li > button.dictionary-result[data-dictionary-entry][aria-pressed]
       article.dictionary-entry > h4, .source-caption, div
      footer.pane-foot > #dictionary-status[role=status]
    details.pane-notes (fuera de #panes)
     summary: Mis notas, #note-reference
     .notes-content: .ink-colors [data-ink], #note, details.study-guide, #save-status
   #dev-view.view[hidden], #plan-view.view[hidden]; footer.app-footer
  dialog: #search-dialog, #sources-dialog, #books-dialog, #update-dialog
  button#back-to-top (.is-visible), #toast[hidden]
```

## Variables de cada diseño

Definir para los tres temas: `--bg` fondo, `--paper` páginas, `--panel` superficies secundarias, `--ink` texto, `--muted` auxiliares, `--line` separación suave, `--control-border` borde identificable de controles, `--accent` acciones, `--accent-ink` texto sobre acción, `--red` palabras de Jesús, `--strong` códigos, `--highlight` dorado, `--highlight-sage` verde, `--highlight-rose` rosa, `--focus` foco. También `--font-ui`, `--font-reader`, `--font-heading`. `--verse-size` pertenece al tamaño elegido por el usuario (16–28 px): **no fijarlo desde CSS**. Los colores deben contrastar también sobre los subrayados dorado/verde/rosa. `.night` es un alias antiguo; evitar que los selectores viejos anulen los tokens.

Fuentes locales disponibles, normales e itálicas: Literata, Cormorant Garamond, Inter Tight, Inter, Source Sans 3. `app/fonts/FUENTES.json` registra URL oficial, commit y SHA256; cada familia tiene su OFL original. No CDN ni nuevas fuentes remotas. La política de seguridad permanece intacta.

## Disposición y separadores

La Biblia siempre está. `data-visible` enumera los paneles elegidos en orden canónico; los demás usan `hidden`. `data-layout` mantiene la orientación elegida, aun con Biblia sola. Los interruptores de Comentario/Diccionario permanecen disponibles; las ✕ devuelven el foco a su interruptor. Solo lectura apaga ambos; Abrir estudio abre los dos. Intimidad oculta auxiliares temporalmente y al salir recupera la combinación guardada. Encender un interruptor desde intimidad permite elegir únicamente ese auxiliar.

**Solo `common.css` define las columnas, filas y áreas de `#panes`.** No poner templates en A/B/C ni sus media queries. La base usa `--view-w1/2/3` para las proporciones principales y `--view-a1/2` para el reparto de los dos auxiliares en filas, aplicadas por JS. Separación común `--pane-split-size:12px`. Una Biblia sola queda centrada con la medida propia de cada diseño; dos paneles ocupan toda el área en 58/42 columnas o 60/40 filas; tres columnas parten de 42/30/28. Tres en filas parten de 50/50: Biblia arriba, abajo Comentario | Diccionario en 50/50 para dejar texto útil en ambos.

`appearance.views` guarda `{layout, visible, sizes}` dentro de las preferencias SQLite existentes. `sizes` usa claves `columns|biblia,comentario`, `rows|biblia,diccionario`, etc., con `{weights:[...], aux:[...]}` para el reparto inferior de tres filas. Cada combinación/orientación conserva su configuración y se comparte entre diseños. Los antiguos `appearance.panes` se conservan y se traducen al tamaño de las tres columnas. No nueva migración de datos.

`#pane-resizer-primary` controla el primer par en columnas, Biblia/auxiliar en dos filas, o Biblia/la fila inferior completa en tres filas. `#pane-resizer-secondary` solo aparece con tres paneles: comentario/diccionario, siempre en eje x. JS establece `data-axis`, `aria-orientation`, límites, controles y etiqueta. El marcador horizontal usa `row-resize`, el vertical `col-resize`. Flechas del eje correspondiente ajustan; Home/End respetan mínimos; Escape cancela el arrastre; doble clic restaura **la combinación actual**. Guardado al terminar, no por movimiento.

Mínimos de panel: 220 px de ancho y 160 px de alto. Las proporciones se limitan por píxeles y los tracks usan `minmax` para ajustarse al tamaño sin corromper la preferencia guardada. Si el área no alcanza esos mínimos, aparece aviso con botón para probar la otra orientación; no se ocultan paneles ni se cambia la preferencia sin intervención. El diseño mantiene `min-height:0` en contenedores para permitir ese cálculo.

`.pane-body`: desplazamiento independiente, `overflow:auto`, `overscroll-behavior:contain`; Biblia usa `column-count:auto;column-width:auto`. En filas, la base compacta encabezados y pies conservando fuentes, colores y superficies. Retira únicamente el relleno vacío inicial del RTF al presentar comentarios/definiciones; el módulo en disco no se modifica. En filas la procedencia del diccionario queda debajo de la definición y los resultados forman una tira desplazable. El pasaje seleccionado vuelve a quedar visible al cambiar vista y los auxiliares recuperan su posición de desplazamiento; un nuevo comentario/consulta empieza arriba.

Conservar reglas de `.reading-only` para la medida de página y `.focus` para intimidad, **sin templates ni ocultaciones que contradigan `hidden`/`data-visible`**. La base aplica esos estados. No ocultar los interruptores de reapertura.

## Comportamientos comunes

Desde v0.5, `#journey-view` presenta devocionales y planes: `.journey-index` con días paginados, `.journey-sheet` y `.document-prose`, progreso, pasajes enlazados, marcado y nota personal por día. `journey.css` usa las fuentes y colores del diseño activo, sin fijar una paleta propia ni modificar `#panes`. PDF se extrae en un worker independiente; DOCX usa JSZip local. El formato de origen se guarda como bloques y spans validados, nunca como HTML importado. La revisión editable de devocionales vive en `#dev-review`; la de planes conserva su marcado. Las notas de planes usan `planNotes[planId:dayId]` y las de devocionales mantienen las claves antiguas de `devResponses`.

- Cambiar capítulo muestra referencia de capítulo; tocar versículo o leer con desplazamiento manual sincroniza el comentario. Desplazamiento programático no decide el versículo por sí solo. Una selección del plan puede ser un rango; las notas conservan su anclaje a un versículo y edición, como v0.3.
- Comentario inicial: Mundo Hispano si existe, o primera fuente. Rangos del módulo pueden abarcar todo un capítulo; no fingir comentarios individuales donde la fuente no los tiene.
- Tocar palabra consulta el diccionario actual; si estaba Strong cambia a RAE (o Vine si RAE no existe). Tocar código Strong cambia a Strong español. **No inferir hebreo/griego a partir de una palabra española ni asociar números cuya alineación no exista.** Consultar selección y formulario son alternativas explícitas. Rojo NT y Strong siguen dependiendo de los módulos de v0.3.
- RAE combina `drae-1/2/3`: exactas primero, luego prefijo; sin tildes ni sufijos de acepción. Resultados planos y definición dentro del panel. No consultar/cargar toda una base por render ni copiar módulos al repo.
- `#back-to-top` aparece al superar 600 px en Biblia o ventana/main. Vuelve al principio y enfoca `#book`; no reinicia comentario/diccionario. Respeta movimiento reducido.
- Tema automático: hora local 07:00–18:59 marfil; resto noche; se actualiza cada minuto y al regresar a la ventana. Sepia y temas manuales se respetan.

## Accesibilidad y límites

Texto principal de estudio mínimo 16 px a los dos tamaños objetivo; auxiliares mínimo 13 px. Biblia conserva el ajuste personal. Contraste AA: 4,5:1 texto normal; 3:1 texto grande y elementos de foco/controles. Foco visible, títulos/labels existentes, `.sr-only` accesible, regiones desplazables navegables con teclado. No sobrescribir `[hidden]`, `aria-*`, ni `prefers-reduced-motion`. No quitar advertencias de cobertura/fuentes. Si se oculta rail, mostrar `.compact-nav` **y** `.library-menu` para conservar planes, devocionales, copias y fuentes.

No nuevas funciones de datos, IA, música, imágenes, oración, ni nueva migración. No tocar perfil real ni `biblioteca-biblica-prueba-v03`. Pruebas: `work/v04-design-profile` separado. Sin release/main. El código público contiene solamente fuentes tipográficas OFL y la base libre ya existente; los módulos personales siguen excluidos.
# IA v0.5

`app/ai.js` presenta la cuenta y el contexto; `app/ai-core.js` prepara consultas. El proceso principal conserva vistas previas con caducidad; `lib/ai-service.cjs` gestiona OAuth PKCE S256 con callback aleatorio en loopback, credenciales cifradas con safeStorage y precios máximos cero. No entrega tokens al renderer ni al respaldo personal.

El contexto pasa por `Library.aiContext` y vuelve a comprobar revisión y permiso antes de copiar o enviar. RV1909 es el texto público ofrecido para consultas; los comentarios requieren `iaPermitida: true` en su manifiesto, tras comprobar el permiso de la licencia. No lee notas, respuestas ni oraciones. Las citas estructuradas se verifican y presentan desde la biblioteca local. Las respuestas son texto, nunca HTML del proveedor.
# Cuaderno privado v0.5

`prayer.js` usa `#prayer-view`; `privacy.js` coordina el PIN y limpia notas/peticiones del renderer al cerrar. `PersonalStore` conserva mapas privados y oración en un único sobre AES-GCM cuando está activo el candado. Los cambios de lectura mientras está cerrado conservan el sobre. Una recuperación cifrada verifica PIN/autenticidad antes de escribir; exportar no abre el sobre. El PIN y la clave no forman parte del estado UI ni del respaldo. Nuevas reflexiones guiadas deben ir a `guideResponses`, incluido en el sobre privado. Los respaldos anteriores permanecen intactos.
# Series y guías v0.5

`#series-create` usa los tokens activos. `#guide-card` acompaña la lectura del día, muestra una pregunta y alterna turnos sin cambiar la disposición de paneles bíblicos. `dev.guide` guarda método, modo, personas y paso por día; `guideResponses` conserva respuestas por devocional/día/método/paso/persona dentro del cuaderno privado. La IA recibe los parámetros elegidos y las fuentes permitidas del recorrido, nunca esas respuestas. Todo borrador pasa por la revisión de importación, con su origen visible.
# Música v0.5

`#music-panel` flota a 480 px de ancho con vídeo de 270 px de alto. El encabezado permite moverlo con puntero o flechas y respeta los límites de ventana. No cubrir el vídeo con adornos ni reducirlo bajo 200 × 200 px. `music.js` valida origen y ventana de los mensajes del iframe local; `MusicServer` sirve solo player.html/.js/.css por una ruta aleatoria, sin datos personales. El iframe remoto carece de acceso al preload. Al minimizar se pausa; cerrar lo descarga del DOM activo; no se carga al iniciar.
