# Publicación en GitHub

Repositorio propio y público: `edwcas1830/biblioteca-biblica` (creado el 9-oct-2026 por Claude Code con la cuenta de Edward; Edward eligió público para que el aviso de actualización funcione sin guardar claves en la app). El código no incluye documentos personales, avances, copias de notas ni instaladores.

El flujo `.github/workflows/biblioteca-biblica.yml` valida en cada cambio y, al integrar en `main`, construye el instalador en Windows y publica la release `v<VERSION>` si no existe (borrador → sube instalador, blockmap y `latest.yml` → publica). Para una versión nueva: subir `version` en `package.json` y `package-lock.json`, actualizar `RELEASE.md` e integrar en `main`.

La 0.2.0 apuntaba a `castillo-digital-ia` (sin releases); desde 0.2.1 el canal es este repositorio. Hay que instalar la 0.2.1 una vez a mano.
