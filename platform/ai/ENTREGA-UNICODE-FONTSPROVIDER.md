# Acentos de imágenes y diagnóstico FontsProvider

## Prompt de imagen

No hay conversión a ASCII en `shared/ai-image-prompts.js`, `shared/ai-image.js` ni en el envío de Gemini/OpenRouter. `safePrompt` solo valida, recorta espacios externos y añade las reglas visuales. La conversión de `app/verse-image.js` sirve únicamente al nombre del PNG. La ausencia de tildes observada parece proceder de la redacción del modelo; no la he comprobado con una clave real.

Se pide explícitamente español con ortografía correcta, tildes, diéresis y ñ, sin transliteración. Una prueba recorre `aiImagePrompt` con Gemini y OpenRouter sintéticos y verifica la idea enviada y la salida exacta: «León sobre una montaña, fotografía al óleo; pequeño río y luz cálida». No se intenta adivinar/restaurar acentos mediante sustituciones.

Validación: **19/19** pruebas de imágenes, acciones y precios. Sin cuenta real, publicación ni APK.

## FontsProvider: hipótesis fuerte, pendiente confirmar en APK

Evidencia local: `mobile/android/app/build.gradle` incluye AppCompat 1.7.1; Capacitor `BridgeActivity` hereda de `AppCompatActivity`. El manifiesto fuente no desactiva `EmojiCompatInitializer`. Las tipografías de lectura usan TTF locales en `app/fonts/fonts.css`; no encontré una solicitud propia de fuentes descargables.

Android documenta la carga automática de fuentes de emoji mediante AppCompat/EmojiCompat. El mensaje de muerte coincide con la rama de ActivityManager que mata al cliente cuando muere un ContentProvider con conexión estable. Esto explica el mecanismo, pero no identifica por sí solo al solicitante. Fuentes consultadas el 11-oct-2026: [Android Emoji2](https://developer.android.com/develop/ui/views/text-and-emoji/emoji2), [AOSP ContentProviderHelper](https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/services/core/java/com/android/server/am/ContentProviderHelper.java).

Comprobar en el manifiesto fusionado si aparece `androidx.emoji2.text.EmojiCompatInitializer`, y en `dumpsys activity providers` la conexión a FontsProvider. Si se confirma, probar el siguiente cambio en tu manifiesto, añadiendo `xmlns:tools="http://schemas.android.com/tools"` a `<manifest>`:

```xml
<provider
    android:name="androidx.startup.InitializationProvider"
    android:authorities="${applicationId}.androidx-startup"
    android:exported="false"
    tools:node="merge">
    <meta-data
        android:name="androidx.emoji2.text.EmojiCompatInitializer"
        tools:node="remove" />
</provider>
```

Eliminar solo ese inicializador, conservando los demás de AndroidX Startup. No reinicializar EmojiCompat con el proveedor descargable; si se necesita compatibilidad de emojis en widgets nativos, usar una fuente empaquetada. Probar renderizado de emojis nativos y HTML, PIN, selector de archivos y estabilidad cuando GMS falle en el emulador. Si aún aparece la conexión, investigar otro cliente antes de atribuirlo a WebView. No modifiqué archivos `mobile/`, compilé ni ejecuté el emulador.
