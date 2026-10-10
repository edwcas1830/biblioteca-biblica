package com.edward.bibliotecabiblica;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Llavero seguro: guarda las claves de IA (OpenRouter, Gemini) cifradas con una llave AES-GCM que vive en
 * el Android Keystore y nunca sale del teléfono. En el almacén de la app solo queda el texto cifrado.
 * Solo acepta nombres de una lista cerrada. allowBackup=false ya impide copiarlo en respaldos.
 */
@CapacitorPlugin(name = "LlaveroSeguro")
public class LlaveroSeguroPlugin extends Plugin {

    private static final String ALIAS = "biblioteca-llavero-v1";
    private static final String PREFERENCIAS = "biblioteca-llavero";
    private static final Set<String> NOMBRES = new HashSet<>(Arrays.asList("openrouter", "gemini"));
    private static final int MAX_VALOR = 8192;

    @PluginMethod
    public void disponible(PluginCall call) {
        JSObject r = new JSObject();
        try {
            llave();
            r.put("disponible", true);
        } catch (Exception e) {
            r.put("disponible", false);
        }
        call.resolve(r);
    }

    @PluginMethod
    public void guardar(PluginCall call) {
        String nombre = call.getString("nombre");
        String valor = call.getString("valor");
        if (!NOMBRES.contains(nombre)) { call.reject("Nombre no permitido en el llavero.", "VALIDATION"); return; }
        if (valor == null || valor.isEmpty() || valor.length() > MAX_VALOR) { call.reject("Valor no válido para el llavero.", "VALIDATION"); return; }
        try {
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.ENCRYPT_MODE, llave());
            c.updateAAD(nombre.getBytes(StandardCharsets.UTF_8));
            byte[] cifrado = c.doFinal(valor.getBytes(StandardCharsets.UTF_8));
            String guardado = Base64.encodeToString(c.getIV(), Base64.NO_WRAP) + ":" + Base64.encodeToString(cifrado, Base64.NO_WRAP);
            if (!preferencias().edit().putString(nombre, guardado).commit()) throw new IllegalStateException("no se escribió");
            call.resolve();
        } catch (Exception e) {
            call.reject("No se pudo guardar en el llavero seguro del teléfono.", "STORAGE");
        }
    }

    @PluginMethod
    public void leer(PluginCall call) {
        String nombre = call.getString("nombre");
        if (!NOMBRES.contains(nombre)) { call.reject("Nombre no permitido en el llavero.", "VALIDATION"); return; }
        JSObject r = new JSObject();
        String guardado = preferencias().getString(nombre, null);
        if (guardado == null) { r.put("valor", (String) null); call.resolve(r); return; }
        try {
            String[] partes = guardado.split(":", 2);
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.DECRYPT_MODE, llave(), new GCMParameterSpec(128, Base64.decode(partes[0], Base64.NO_WRAP)));
            c.updateAAD(nombre.getBytes(StandardCharsets.UTF_8));
            r.put("valor", new String(c.doFinal(Base64.decode(partes[1], Base64.NO_WRAP)), StandardCharsets.UTF_8));
            call.resolve(r);
        } catch (Exception e) {
            // Llave perdida (p. ej. tras restaurar el teléfono): se olvida el valor y se pide conectar de nuevo.
            preferencias().edit().remove(nombre).commit();
            r.put("valor", (String) null);
            call.resolve(r);
        }
    }

    @PluginMethod
    public void borrar(PluginCall call) {
        String nombre = call.getString("nombre");
        if (!NOMBRES.contains(nombre)) { call.reject("Nombre no permitido en el llavero.", "VALIDATION"); return; }
        preferencias().edit().remove(nombre).commit();
        call.resolve();
    }

    private SharedPreferences preferencias() {
        return getContext().getSharedPreferences(PREFERENCIAS, Context.MODE_PRIVATE);
    }

    private SecretKey llave() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        if (ks.containsAlias(ALIAS)) return ((KeyStore.SecretKeyEntry) ks.getEntry(ALIAS, null)).getSecretKey();
        KeyGenerator g = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        g.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .build());
        return g.generateKey();
    }
}
