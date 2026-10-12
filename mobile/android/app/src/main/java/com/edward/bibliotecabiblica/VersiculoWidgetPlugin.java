package com.edward.bibliotecabiblica;

import android.content.Context;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONArray;
import org.json.JSONObject;

/** La app le pasa al widget los versículos de los próximos días: [{fecha:"2026-10-13", cita, texto}, …]. */
@CapacitorPlugin(name = "VersiculoWidget")
public class VersiculoWidgetPlugin extends Plugin {

    @PluginMethod
    public void guardar(PluginCall call) {
        JSArray lista = call.getArray("proximos");
        if (lista == null) { call.reject("Faltan los versículos."); return; }
        try {
            JSONArray limpia = new JSONArray();
            for (int i = 0; i < lista.length() && i < 31; i++) {
                JSONObject o = lista.getJSONObject(i);
                String fecha = o.optString("fecha");
                if (!fecha.matches("\\d{4}-\\d{2}-\\d{2}")) continue;
                JSONObject x = new JSONObject();
                x.put("fecha", fecha);
                x.put("cita", recortar(o.optString("cita"), 60));
                x.put("texto", recortar(o.optString("texto"), 400));
                limpia.put(x);
            }
            Context c = getContext();
            c.getSharedPreferences(VersiculoWidget.PREFS, Context.MODE_PRIVATE).edit().putString(VersiculoWidget.CLAVE, limpia.toString()).apply();
            VersiculoWidget.actualizarTodos(c);
            JSObject r = new JSObject();
            r.put("guardados", limpia.length());
            r.put("hoy", VersiculoWidget.deHoy(c)[0]);
            call.resolve(r);
        } catch (Exception e) {
            call.reject("No se pudieron guardar los versículos del widget.", e);
        }
    }

    private static String recortar(String t, int max) { return t.length() <= max ? t : t.substring(0, max - 1) + "…"; }
}
