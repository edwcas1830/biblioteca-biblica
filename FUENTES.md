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
