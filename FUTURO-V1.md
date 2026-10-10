# Firma de Windows y teléfono: preparación para v1.0

Revisado 9-oct-2026. Documentación, sin activar firma, compras ni versión móvil.

## Instalador firmado

El constructor actual es electron-builder 26.15.3. Haría falta una identidad de publicación validada y certificado Authenticode con clave custodiada (proveedor/almacén o servicio compatible). Alternativa: Azure Trusted Signing, sujeto a elegibilidad y verificación de identidad. Configurar el método que admita **v26**, no copiar opciones exclusivas de v27; mantener secretos fuera del repo. Firmar app e instalador con sello de tiempo, comprobar firma en Windows y publisherName de electron-updater; probar actualización desde 0.5.0 conservando datos en una copia de perfil. La firma no garantiza confianza instantánea de SmartScreen.

Fuentes oficiales: [electron-builder v26 · Windows](https://www.electron.build/v26/docs/features/code-signing/code-signing-win/) y [firma v26](https://www.electron.build/v26/docs/features/code-signing/).

## Teléfono

Los núcleos JavaScript de lectura/planes/documentos/referencias/diseño ya están separados del escritorio, pero Electron, workers de Node, node:sqlite, safeStorage de Windows y diálogos de carpeta no corren directamente en teléfono. Haría falta elegir contenedor móvil, adaptar SQLite/archivos/voz/custodia de claves, conservar IDs canónicos y preparar el empaquetado de módulos públicos. Validar tamaños, carga diferida de diccionarios y lectura offline en equipos modestos. La biblioteca personal se importa con permiso y no se publica como parte de la app.

El transporte del círculo mediante carpetas de OneDrive es un piloto Windows: en teléfono necesita un mecanismo de archivos/autorización compatible o un transporte alternativo elegido con Edward, conservando cifrado e intercambio de eventos, sin sincronizar una SQLite activa. Adaptar también OpenRouter OAuth y el reproductor YouTube a las normas de cada plataforma. Probar recuperación de claves y cruces Windows/teléfono antes del uso real.

La arquitectura permite reutilizar datos y lógica; **no implica que exista todavía una app móvil lista**.
