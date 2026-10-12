package com.edward.bibliotecabiblica;

import android.Manifest;
import android.content.Intent;
import android.os.Build;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * Puente entre la app y LecturaVozService. La app manda la cola de capítulos (texto por versículo), la voz,
 * la velocidad y el temporizador; el servicio avisa con eventos «capitulo», «parte», «estado», «terminado»,
 * «temporizador» y «error». Pide el permiso de notificaciones (Android 13+) para mostrar los controles.
 */
@CapacitorPlugin(name = "LecturaVoz", permissions = { @Permission(alias = "notificaciones", strings = { Manifest.permission.POST_NOTIFICATIONS }) })
public class LecturaVozPlugin extends Plugin {

    private static final int MAX_COLA = 2_000_000; // caracteres: unos 40 capítulos largos

    @Override
    public void load() {
        LecturaVozService.oyente = (tipo, datos) -> notifyListeners(tipo, datos);
    }

    @PluginMethod
    public void permiso(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || getPermissionState("notificaciones") == PermissionState.GRANTED) {
            JSObject r = new JSObject(); r.put("concedido", true); call.resolve(r); return;
        }
        requestPermissionForAlias("notificaciones", call, "permisoRespondido");
    }

    @PermissionCallback
    private void permisoRespondido(PluginCall call) {
        JSObject r = new JSObject(); r.put("concedido", getPermissionState("notificaciones") == PermissionState.GRANTED); call.resolve(r);
    }

    @PluginMethod
    public void iniciar(PluginCall call) {
        JSArray cola = call.getArray("cola");
        if (cola == null || cola.length() == 0) { call.reject("No hay nada para leer.", "VALIDATION"); return; }
        String texto = cola.toString();
        if (texto.length() > MAX_COLA) { call.reject("La lectura es demasiado larga.", "VALIDATION"); return; }
        Double velocidad = call.getDouble("velocidad", 1.0);
        Double apagarMs = call.getDouble("apagarMs", 0.0);
        Intent i = new Intent(getContext(), LecturaVozService.class).setAction(LecturaVozService.INICIAR)
            .putExtra("cola", texto)
            .putExtra("voz", call.getString("voz", ""))
            .putExtra("velocidad", velocidad == null ? 1f : velocidad.floatValue())
            .putExtra("apagarMs", apagarMs == null ? 0L : apagarMs.longValue());
        try {
            ContextCompat.startForegroundService(getContext(), i);
            call.resolve();
        } catch (Exception e) {
            call.reject("No se pudo empezar la lectura en segundo plano.", "UNAVAILABLE");
        }
    }

    private void enviar(PluginCall call, String accion) {
        try { getContext().startService(new Intent(getContext(), LecturaVozService.class).setAction(accion)); call.resolve(); }
        catch (Exception e) { call.reject("La lectura no está activa.", "UNAVAILABLE"); }
    }
    @PluginMethod public void pausar(PluginCall call) { enviar(call, LecturaVozService.PAUSAR); }
    @PluginMethod public void reanudar(PluginCall call) { enviar(call, LecturaVozService.REANUDAR); }
    @PluginMethod public void siguiente(PluginCall call) { enviar(call, LecturaVozService.SIGUIENTE); }
    @PluginMethod public void detener(PluginCall call) { enviar(call, LecturaVozService.DETENER); }
}
