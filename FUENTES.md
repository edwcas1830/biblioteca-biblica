# Datos libres incluidos

Los módulos personales nunca forman parte de este repositorio ni del paquete público. Los datos siguientes se incluyen para uso sin conexión.

## OpenBible.info · referencias cruzadas

Autor: OpenBible.info. [Página y descarga oficial](https://www.openbible.info/labs/cross-references/). [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Descargado el 9 de octubre de 2026; cabecera de la fuente: 2026-10-05. 344.799 conexiones. Datos procedentes principalmente del Treasury of Scripture Knowledge; los votos son señales de relación, no una valoración doctrinal ni un grado de certeza.

Se convirtieron los identificadores OSIS a libro/capítulo/versículo y se agruparon por versículo, ordenando por votos. Se incluyen solamente referencias y votos, sin citas de ESV ni texto de otras traducciones. Fuentes, fechas, modificaciones y SHA-256 de la descarga descomprimida y del archivo distribuido: `app/data/openbible/manifest.json`. Reconstrucción: `node scripts/prepare-crossrefs.cjs <cross_references.txt>`.

## Gráficos offline (9-oct-2026)

Los manifiestos de `app/data/atlas`, `natural-earth`, `bibledata` y `theographic` registran las huellas SHA-256 de entrada y del archivo incluido. Se regeneran con `python scripts/prepare-graphics.py <carpeta-de-descargas>`.

- [OpenBible Geocoding](https://github.com/openbibleinfo/Bible-Geocoding-Data): CC BY 4.0. Lugares por capítulo y coordenadas preferidas; se omiten fotos, geometrías y coordenadas de OSM. Las ubicaciones se muestran como probables o sin punto conocido. [Datos antiguos](https://raw.githubusercontent.com/openbibleinfo/Bible-Geocoding-Data/main/data/ancient.jsonl) y [modernos](https://raw.githubusercontent.com/openbibleinfo/Bible-Geocoding-Data/main/data/modern.jsonl). Licencia en el módulo.
- [Natural Earth](https://www.naturalearthdata.com/about/terms-of-use/): dominio público. Tierras 1:110m, sin fronteras políticas. [Archivo del repositorio oficial](https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_land.geojson).
- [BibleData, Brady Stephenson](https://github.com/BradyStephenson/bible-data): CC BY 4.0. Metadatos de eventos, épocas, personas y referencias; no las citas bíblicas presentes en las descripciones originales. La cronología AH conserva las hipótesis de esa fuente y no representa consenso histórico. Licencia incluida.
- [Theographic, Robert Rouse](https://github.com/robertrouse/theographic-bible-metadata): **CC BY-SA 4.0**, adaptación en un **módulo de datos separado** (`app/data/theographic`) bajo la misma licencia, con licencia completa y manifiesto. Nombres y relaciones; sin citas de diccionario, imágenes ni fechas. Nombres frecuentes traducidos editorialmente; identificadores y homónimos conservados. [Entrada](https://raw.githubusercontent.com/robertrouse/theographic-bible-metadata/master/json/people.json).
- Bosquejos y lecturas paralelas: elaboración propia en `app/graphics-core.js`; divisiones iniciales de lectura de los 66 libros y 12 encuentros entre los evangelios. No reproduce encabezados de Biblias de estudio.

## Biblia y léxicos del paquete público (9-oct-2026)

El instalador lleva datos abiertos comprimidos en `app/data/free-package`. Al iniciar se crea/verifica `modulos/libre` en los datos del usuario, usando el mismo lector SQLite que los módulos personales. Los datos tienen módulos y licencias separados; `scripts/prepare-free-package.py` reproduce su adaptación. El manifiesto registra SHA-256 de la entrada y del archivo distribuido; el manifiesto instalado registra además el SHA-256 de cada SQLite. `iaPermitida:false` por defecto, salvo el tratamiento ya existente de RV1909.

- **Biblica® Open Nueva Biblia Viva 2008**. © 2006, 2008 Biblica, Inc. CC BY-SA 4.0. [Fuente y condiciones oficiales](https://ebible.org/Bible/details.php?id=spaonbv), [VPL/XML](https://ebible.org/Scriptures/spaonbv_vpl.zip). Aviso completo en `ONBV-LICENCIA.txt` y pantalla de fuentes. The original Work by its copyright holders is available for free at www.biblica.com and open.bible. Adaptación de formato a SQLite/RTF, sin revisar la redacción; el VPL oficial excluye notas, títulos y formato. Conserva 29.102 registros, 1.147 rangos unidos y la numeración original; un rango unido se muestra como tal, sin duplicar el texto ni presentarlo como omisión. Este módulo de datos/adaptación continúa bajo CC BY-SA 4.0; no implica aval de Biblica a la app.
- **STEPBible TBESG**, griego. [Repositorio oficial](https://github.com/STEPBible/STEPBible-Data), [lexicones](https://github.com/STEPBible/STEPBible-Data/tree/master/Lexicons). Data created by www.STEPBible.org based on work at Tyndale House Cambridge (CC BY 4.0). 9.550 entradas con variantes, lema, transliteración, glosa y definición en inglés. HTML convertido a texto seguro, conservando identificador extendido.
- **STEPBible TBESH**, hebreo/arameo. Mismo crédito y CC BY 4.0. 10.258 entradas de lemas, transliteración, morfología y glosa en inglés. **Las definiciones abridged BDB/Online Bible no se distribuyen**, porque el encabezado específico del archivo solicita permiso adicional antes de aplicarlas en un proyecto. Encabezados íntegros en `STEP-hebrew-FUENTE.txt` / `STEP-greek-FUENTE.txt`; el aviso de omisión también aparece en cada entrada hebrea.
- **RV1909** continúa con procedencia en `FUENTE-BIBLIA.json`; las notas de esta fuente mantienen su espacio de referencias. Se admite 3 Juan 1:15 en el repositorio de referencias para ediciones que lo numeran por separado; no se inventa un versículo en el texto RV1909.

Los módulos importados desde e-Sword quedan exclusivamente en los datos de usuario, con derechos no verificados, IA desactivada y aviso original. Nunca pasan al repositorio ni al instalador público.
