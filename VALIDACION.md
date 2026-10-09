# Verificación de Biblioteca Bíblica

Fecha: 9 de octubre de 2026.

## Versión 0.2.0

- Catorce pruebas automatizadas aprobadas: núcleo original, referencias y planes importados, validación de archivos, combinación de avances y estados del actualizador.
- Documento personal real: 1.189 lecturas importadas, todas sus referencias reconocidas. Comparación de cada lectura contra el texto original sin pérdidas; 329 celdas con resaltado contadas como completadas después de la confirmación del usuario.
- Interfaz: revisión editable, marcado, persistencia tras recargar, apertura de pasajes, rangos de versículos, reimportación sin perder avance de la app y recuperación de copias de 0.1 y 0.2.
- Documento de prueba: tachados, tachados dobles, marcas parciales y casillas Word comprobados. El documento original no se modifica. No se pudo renderizar el Word porque LibreOffice no está disponible; la verificación usó su XML y la interfaz importada.
- Ejecutable Windows empaquetado: importación del Word real, 329 completadas, recarga, continuación de una lectura, marcado de la número 330 y recuperación de copia de 0.1; sin errores de JavaScript. Perfil temporal aislado, sin alterar los datos personales.
- Puente de actualizaciones y ventana de estado comprobados dentro del ejecutable; eventos de disponibilidad, descarga y reinicio mediante pruebas del servicio. La instalación real de una actualización entre dos versiones publicadas sigue pendiente.
- Instalador definitivo: `dist/biblioteca-biblica-setup-0.2.0.exe`. Su nombre coincide con `latest.yml` y el canal generado apunta al repositorio elegido.
- Publicación pendiente: GitHub rechazó crear la rama con HTTP 403; no hay pull request ni release de esta app. Se preparó un ZIP con la estructura de publicación, excluyendo documentos y progreso personales.

## Validación de la versión 0.1

## Resultado

Se generó el instalador Windows x64 y se ejecutó la aplicación empaquetada en una ventana invisible con un perfil de prueba separado. No se instaló la app ni se escribieron anotaciones de prueba en la biblioteca personal del usuario.

## Comprobaciones realizadas

- Cinco pruebas del núcleo aprobadas: corpus completo, planes sin omisiones ni capítulos duplicados, tiempos de devoción, referencias de las plantillas y rechazo de parámetros o archivos inválidos.
- Corpus: 66 libros, 1,189 capítulos, 31,102 versículos; comprobaciones puntuales de Salmos 23:1 y Juan 3:16.
- Navegación y búsqueda en la interfaz; selección de versículos, subrayado y notas que persisten después de recargar.
- Cambio de iluminación y entrada/salida del modo intimidad.
- Creación de devocional de 14 días y 20 minutos, cambio entre lecturas y recuperación de respuestas personales.
- Importación del ejemplo JSON y de texto que contenía etiquetas HTML; estas se mostraron como texto y no se ejecutaron.
- Creación del plan de Nuevo Testamento de 90 días; marcado de progreso y recuperación tras recargar.
- Exportación de biblioteca JSON y restauración de notas, devocionales y planes.
- Comprobación de anchos de 1,480, 1,024 y 580 píxeles, sin desbordamiento horizontal.
- Ejecutable Windows: lectura del corpus offline, guardado de notas, creador guiado, importación JSON y creación de un plan.
- Configuración del ejecutable: acceso de Node.js desde el contenido desactivado, aislamiento de contexto y sandbox activados.

Se verificó la interfaz en Chromium y también dentro del ejecutable Electron. No hubo errores de JavaScript en los recorridos comprobados. `vista-previa.png` muestra la pantalla inicial sin datos personales.

## Límites de la validación

No se probó la instalación en otra computadora, ni Windows de 32 bits, ni un lector de pantalla. Falta una comparación editorial de todo el texto bíblico contra una segunda fuente y una validación de comentarios de estudio, que aún no están incorporados. El instalador inicial no está firmado digitalmente.

Las herramientas de construcción fijadas son Electron 44.7.0 y electron-builder 26.15.3. La revisión de dependencias reportó ocho alertas moderadas en dependencias de desarrollo del empaquetador, relacionadas con la cadena de `sprintf-js`; esas dependencias no se incluyen como módulos de ejecución de esta aplicación. Su actualización queda registrada para la preparación de una distribución pública.
