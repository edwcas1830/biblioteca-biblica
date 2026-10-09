# Biblioteca Bíblica

Un espacio personal para leer la Palabra, estudiarla y cultivar un tiempo de intimidad con Dios. Versión 0.2 para Windows, creada a partir de la idea de Edward.

## Nuevo en 0.2

**Plan de lectura → Subir mi plan** admite Word DOCX, TXT, MD, CSV y JSON. La app reconoce días, fechas, libros, capítulos y rangos de versículos; conserva las indicaciones originales y presenta una revisión editable antes de guardar. En tablas de calendario con días en columnas, cada casilla de lectura se convierte en un día del plan, conservando la etiqueta de fecha de su fila y el nombre de su columna. No se recalcula el calendario a partir de esas etiquetas.

Los tachados y las casillas marcadas se detectan como avance. Si el documento usa resaltados para indicar lecturas completadas, activa esa opción en la revisión. Los tachados parciales y referencias no válidas se señalan para revisión. Puedes corregir el texto, el título o el estado de cada día. El Word original no se modifica.

Cada día completado aparece tachado en la app. Puedes filtrar lo pendiente, continuar por la siguiente lectura, abrir su pasaje en la Biblia y marcarlo allí. Los rangos de versículos se delimitan visualmente, manteniendo disponible el contexto del capítulo.

Para subir una copia más avanzada del mismo plan, elige **Actualizar** en la revisión. Se conserva lo completado en la app y se añade lo detectado en el documento. Si el archivo quitó días o cambió sus pasajes, se pide guardarlo como un plan nuevo para conservar el anterior. **Exportar plan** genera un JSON transferible con su avance. Las copias personales de la versión 0.1 siguen siendo recuperables.

Se incorporó el aviso de actualización, descarga y reinicio para instalar versiones futuras. El canal apunta a GitHub Releases; su publicación se prepara en el repositorio `edwcas1830/castillo-digital-ia`. Lee `ACTUALIZACIONES.md` para el funcionamiento y la publicación. Desde 0.1 hace falta instalar 0.2 una vez con el instalador.

## La experiencia

La entrada es una biblioteca pequeña y cálida. Una Biblia con cubierta de cuero, papel marfil, tipografía de libro y un marcador de tela evocan la lectura física. El texto ocupa el centro; las notas viven al margen. El modo intimidad despeja la pantalla para que la lectura tenga espacio.

La app abre donde terminaste. Funciona sin conexión después de su preparación y no exige una cuenta. No contiene publicidad, estadísticas de competencia ni rachas.

## Incluido en esta primera versión

- **Biblia completa:** Reina-Valera 1909, 66 libros, 1,189 capítulos y 31,102 versículos.
- **Lectura:** selector de libro y capítulo, índice de libros, búsqueda de palabras o frases, capítulo anterior y siguiente.
- **Ambiente:** páginas de libro, tamaño de letra, tema oscuro y modo intimidad.
- **Estudio personal:** seleccionar un versículo, subrayar en tres colores y escribir una nota u oración. Preguntas propias de observación, contexto y aplicación.
- **Devocionales existentes:** cargar TXT, MD o JSON. TXT y MD se presentan como una lectura; JSON permite organizar varios días con pasajes asociados. El contenido se muestra como texto, sin ejecutar HTML.
- **Creador guiado:** elegir paz, fe, gratitud o esperanza; entre 5 y 60 minutos por día; entre 1 y 90 días; y una intención personal. Produce un recorrido con pasajes y tiempos de lectura, reflexión y oración, que el usuario completa. A partir del día ocho se repite el ciclo de siete pasajes del tema.
- **Plan bíblico:** Biblia completa, Nuevo Testamento o Salmos, con duración elegida por el usuario, capítulos distribuidos en orden y registro manual de días completados. Pueden coexistir varios planes.
- **Datos personales:** notas, subrayados, devocionales, respuestas y progreso guardados en el equipo; exportación y recuperación de una copia JSON.
- **Windows:** proyecto Electron y configuración para generar un instalador o una versión portátil.

El creador actual usa plantillas locales. No genera explicaciones con IA ni reemplaza comentarios bíblicos de una edición de estudio. Los minutos distribuyen una sesión de devoción; no garantizan que el texto de cada capítulo pueda leerse en ese tiempo.

## Abrir la primera versión

`dist/biblioteca-biblica-setup-0.2.0.exe` es el nuevo instalador para Windows de 64 bits. No está firmado digitalmente. Esta es una versión de evaluación.

También puedes revisar el diseño abriendo `app/index.html` en un navegador. La aplicación de Windows y el navegador guardan sus datos por separado. Para transferir tu trabajo entre ellos, exporta y recupera una copia.

## Continuar el desarrollo

Necesitas Node.js y npm. Las dependencias están fijadas en `package-lock.json`.

```powershell
npm ci
npm run prepare:assets
npm run bible    # Solo si falta el texto bíblico o quieres descargarlo de nuevo
npm test
npm start
```

Vista previa local:

```powershell
npm run preview
```

Abre `http://127.0.0.1:4317`.

Crear instalador o ejecutable portátil:

```powershell
npm run build:win
npm run build:portable
```

## Cómo cargar tu devocional

En **Devocionales → Cargar archivo**, selecciona un TXT, MD o JSON de hasta 2 MB. Los archivos Word, PDF e imágenes se incorporarán en una siguiente etapa; esta versión no los procesa.

Para varias lecturas, usa `ejemplo-devocional.json`. El campo `book` es un índice de 0 a 65 en el orden canónico; Génesis = 0, Salmos = 18, Juan = 42. `chapter` empieza en 1. El pasaje es opcional, pero si lo incluyes deben existir ambos campos. La importación no modifica el archivo original.

```json
{
  "title": "Mi recorrido de oración",
  "entries": [
    {
      "title": "Día 1",
      "book": 18,
      "chapter": 23,
      "body": "Mi lectura y preguntas de reflexión."
    }
  ]
}
```

## Plan del producto

### Etapa 1 — Base revisable (incluida)

Validar la experiencia de biblioteca, lectura offline, notas, devocionales importados y planes. Revisar con Edward los colores, el tamaño del libro, la navegación y el flujo devocional.

### Etapa 2 — Biblioteca de estudio

Seleccionar la edición exacta de Reina-Valera. Incorporar introducciones a los libros, referencias cruzadas y comentarios con procedencia y derechos de uso identificados. Añadir marcadores, vista de todas las notas, filtros temáticos, exportación de notas y restauración de versiones.

Los comentarios se mostrarán separados del texto bíblico y de las reflexiones personales. Las fuentes tendrán autor y referencia. No se presentarán interpretaciones generadas como si pertenecieran a una Biblia de estudio publicada.

### Etapa 3 — Tus devocionales y generación asistida

Importar PDF y Word; ofrecer una revisión del contenido detectado antes de guardarlo; identificar títulos, días y referencias. OCR queda reservado para documentos escaneados.

Ampliar los parámetros del creador: tema libre, minutos disponibles, número de días, nivel de profundidad, objetivo espiritual, audiencia, tono y pasajes preferidos. Si Edward elige integrar IA, la conexión será opcional, requerirá un proveedor configurado y explicará qué contenido se envía.

El resultado será editable y tendrá: pasaje bíblico verificable, reflexión, preguntas, oración sugerida y una aplicación concreta. El texto bíblico se obtendrá de la base local, no de la memoria del modelo. La IA deberá distinguir cita, paráfrasis y reflexión; se revisará la continuidad del recorrido completo.

### Etapa 4 — Distribución

Añadir instalación y actualización firmadas, guardado local robusto con versiones, pruebas de accesibilidad y escalado de Windows, validación del corpus, políticas de recuperación y exportación. Sincronización opcional si se necesita después; lectura y notas locales seguirán disponibles sin cuenta.

## Diseño y estructura técnica

- `desktop.cjs`: ventana de Windows, sin acceso de Node.js desde el contenido, aislamiento de contexto y sandbox activados; navegación externa y permisos bloqueados.
- `preload.cjs` y `update-service.cjs`: puente limitado para buscar, descargar e instalar nuevas versiones publicadas.
- `app/plan-core.js` y `app/plan-documents.js`: referencias, planes importados, lectura local del Word y detección de tachados, casillas y resaltados.
- `app/index.html` y `app/styles.css`: biblioteca, libro abierto, panel de estudio y vistas devocionales.
- `app/app.js`: interfaz, búsqueda, anotaciones, archivos y persistencia local.
- `app/core.js`: planificación, creación guiada y validación de importaciones, también comprobables fuera de la interfaz.
- `app/bible-data.js`: corpus bíblico preparado para lectura offline.
- `scripts/download-bible.cjs`: descarga y validación del corpus; genera su procedencia y huella SHA-256.
- `tests/core.test.cjs`: integridad del corpus, cobertura de planes, tiempos, parámetros y archivos inválidos.

En esta etapa los datos usan almacenamiento local del navegador integrado. No están cifrados. La copia de seguridad es un archivo de texto JSON y debe guardarse como cualquier documento personal. Antes de usar la versión con anotaciones importantes, guarda una copia periódicamente. No hay sincronización de datos personales. La comprobación de nuevas versiones consulta GitHub; los documentos y notas no se envían.

## Texto bíblico y fuentes

La edición incorporada es **Reina-Valera 1909**, identificada como texto de dominio público por [eBible.org](https://ebible.org/details.php?id=spaRV1909). No es la edición Reina-Valera 1960.

La representación JSON proviene de [scrollmapper/bible_databases — SpaRV](https://github.com/scrollmapper/bible_databases). `FUENTE-BIBLIA.json` registra URL, fecha de descarga, cantidades y huella del archivo original. Se validó la estructura completa y pasajes puntuales; todavía no se hizo una comparación editorial de todos los versículos con otra fuente.

La configuración de escritorio sigue las [recomendaciones oficiales de Electron](https://www.electronjs.org/docs/latest/tutorial/security).

## Pendientes que requieren una decisión de producto

1. Nombre definitivo; «Biblioteca Bíblica» es el nombre provisional.
2. Edición de Reina-Valera preferida y fuentes de estudio.
3. Formato real del devocional que Edward ya tiene.
4. Uso personal o distribución a otros lectores.
5. Generación guiada local, IA opcional o ambas.

Las herramientas y las traducciones nuevas se revisarán antes de publicar una versión para distribución.
