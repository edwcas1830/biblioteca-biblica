# A · Acciones y rangos (2026-10-10)

Contrato aditivo: aiPrepare({action,scope,book,chapter,verse,endVerse,module,comment,question?,history?}) admite también ref:{book,chapter,verse,endVerse}. aiAsk({id,provider,model,action?}) usa exclusivamente la preparación guardada; cambiar action exige preparar de nuevo.

Respuesta: brief, texto, interpretacion, conexiones (cadenas), fuentes:[{sourceId,ref|modulo,strong?,extracto,title,license,attribution}], seguimientos:[3], más los campos antiguos text/model/sources. Los extractos son locales; el modelo elige sourceId. Marcadores inválidos quedan rotulados como fuente no verificada. No se afirma que las interpretaciones de IA estén validadas teológicamente.

Cargar shared/study-model.js tras study-chat-core.js y shared/study-actions.js antes de ai-context/service en escritorio. El orden móvil ya está en scripts-movil.json. El modelo mantiene IDs antiguos y distingue un rango con sufijo -endVerse. Los validadores SQLite y bóveda de Windows usan el modelo ampliado.

Material automático autorizado: pasaje, vecinos (rotulados como contexto inmediato, sin inventar límites editoriales de párrafo), comentario elegido, lugares/cronología, Strong verificados y entradas exactas STEP/Strong/Vine disponibles, referencias locales de OpenBible y comentario permitido. No se consulta estado personal. Máximo 34.000 caracteres locales; capítulo hasta 176 versículos. Faltan límites editoriales de párrafo en los módulos: se avisa explícitamente.

Pruebas: npm test 252/252, con cuentas y perfiles sintéticos. Sin consultar claves reales, publicar ni construir APK. Las pruebas visuales y de Gemini real corresponden a Claude.

Cierre de paridad: Paralelos añade hasta seis extractos autorizados (máximo cinco versículos por conexión dentro del mismo capítulo). Las conexiones que cruzan capítulos conservan la referencia del índice, sin inventar un extracto. RV1960 requiere permiso y revisión independiente de rv1960-strong para transmitir sus códigos asociados. Fuentes de cronología incluyen la nota metodológica del manifiesto; las fechas no se presentan como consenso histórico.
