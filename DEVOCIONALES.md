# Flujo mixto confirmado por Edward · 0.6.2

Decisión del 10 de octubre de 2026. Sustituye la espera de elección y la revisión obligatoria de 34c86eb. La recuperación de d60e04c ya incorporada en e94cdab coincide con la mezcla elegida; se conserva sin otro rediseño.

1. Importar PDF/DOCX/texto guarda automáticamente el devocional como **En curso** y abre la lectura. No requiere buscar Guardar ni pasar por una revisión obligatoria. Un fallo de almacenamiento no se presenta como importación guardada.
2. La lectura usa el papel y tipografía del diseño elegido, doble página cuando hay ancho suficiente, A−/A+ propios y pantalla completa con F11/Escape. Reanuda día/página, evita título duplicado, jerarquiza etiquetas en mayúsculas y destaca citas. Completar todos los días muestra **Terminados** con fecha.
3. **Editar contenido** abre una copia editable del devocional existente. Guardar cambios aparece arriba; Cancelar conserva el libro guardado. El editor no duplica textarea y vista previa. Guardar conserva el ID y sus notas; no agrega otro devocional. Los borradores creados por IA se revisan antes de incorporarse.

Se mantienen los datos y el avance existentes. No cambia la migración, los identificadores de planes/días, los proveedores personales, la conversación IA C, la atribución de fuentes libres ni YouTube. Los recursos con derechos y los datos personales siguen fuera del instalador base y del repositorio.

La prueba Windows `book` comprueba guardado inmediato en SQLite, cancelar/guardar edición sin duplicación, ID y nota conservados, reanudación, Terminados con fecha, pantalla completa por botón y por F11/Escape, fallo de almacenamiento y A/B/C en dos tamaños. Se usa un perfil aislado.
