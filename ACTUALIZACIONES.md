# Actualizaciones de Biblioteca Bíblica

Desde la versión 0.2.1 el actualizador usa GitHub Releases del repositorio propio y público `edwcas1830/biblioteca-biblica` (creado el 9-oct-2026). La 0.2.0 apuntaba a `castillo-digital-ia` y nunca recibió releases: hay que instalar la 0.2.1 una vez con el instalador.

**Estado del canal al 9 de octubre de 2026:** los archivos están preparados localmente; todavía no se han subido ni se ha publicado una release. La conexión de GitHub rechazó la creación de la rama con HTTP 403, «Resource not accessible by integration». Hace falta una conexión con permiso de escritura para completar la publicación. El instalador local sí está disponible. Buscar actualizaciones puede mostrar un error mientras no exista la primera release.

Al abrir la app instalada se comprueban nuevas versiones después de diez segundos y luego cada seis horas mientras la app permanece abierta. También existe **Buscar actualizaciones**. La app presenta un aviso cuando hay una versión mayor, deja elegir la descarga, muestra su progreso y ofrece **Instalar y reiniciar** al terminar. No descarga ni reinicia sin esa acción del usuario. Si no hay internet, la lectura local sigue disponible.

La comprobación utiliza `electron-updater` y la configuración `app-update.yml` generada por el empaquetador. `latest.yml` y el instalador se publican juntos en una release. Las descargas se comprueban con la integridad incluida en los metadatos. La firma de editor de Windows queda como siguiente paso de distribución; esta versión de evaluación y sus primeras actualizaciones no están firmadas digitalmente.

## Publicar una versión

1. Cambiar `version` en `package.json` y actualizar `package-lock.json` de forma consistente.
2. Añadir las novedades a `RELEASE.md`.
3. Proponer y revisar los cambios. La comprobación construye el instalador y ejecuta las pruebas.
4. Al integrar cambios en `main`, el flujo vuelve a validar, construye el instalador y publica `v<VERSION>` si aún no existe. También puede iniciarse manualmente desde Actions.

El flujo usa el token de GitHub Actions proporcionado por GitHub para esa ejecución. No hay tokens ni contraseñas en la app. Cuando una etiqueta ya existe, el flujo no reemplaza la versión publicada; es necesario subir el número de versión para publicar una actualización.

El flujo crea primero una release borrador, sube el instalador, el mapa de descarga y `latest.yml`, y publica la release cuando los tres archivos están disponibles. Un fallo no debe exponer una actualización incompleta a los lectores.

## Instalación inicial

La versión 0.1.0 no puede buscar actualizaciones porque no incluía este mecanismo. Hace falta instalar 0.2.0 una vez con el instalador. La identidad de la app y su almacenamiento personal se conservan. Las copias de 0.1 siguen siendo recuperables.

## Datos personales

Los planes, las notas y las oraciones se guardan localmente. La nube distribuye nuevas versiones de la app. No se publican los documentos importados ni las copias personales como parte del código o los instaladores.

## Validación pendiente

Las pruebas comprueban el aviso, la descarga como estado, el bloqueo del reinicio antes de terminar y los errores de red. El ejecutable empaquetado se comprueba con un perfil aislado. Una actualización completa entre dos versiones instaladas se validará con la próxima versión publicada; no se simula como si ya hubiera ocurrido.

Referencia: [actualizaciones de electron-builder v26](https://www.electron.build/v26/docs/features/auto-update/).
