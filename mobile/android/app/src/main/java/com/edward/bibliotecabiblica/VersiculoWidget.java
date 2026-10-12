package com.edward.bibliotecabiblica;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Widget «Versículo del día» (CONSENSO-HABITO.md · entrega 2C). La app le deja los versículos de los próximos días
 * (fecha local, cita y texto, de la Biblia que la persona eligió); el widget muestra el de hoy aunque la app no se
 * abra, y tocarlo abre la app en «Hoy». Sin red y sin permisos nuevos.
 */
public class VersiculoWidget extends AppWidgetProvider {

    static final String PREFS = "versiculo_widget";
    static final String CLAVE = "proximos";

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) manager.updateAppWidget(id, vista(context));
    }

    /** Vuelve a dibujar todos los widgets puestos (lo llama el plugin cuando la app guarda versículos nuevos). */
    static void actualizarTodos(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, VersiculoWidget.class));
        for (int id : ids) manager.updateAppWidget(id, vista(context));
    }

    static RemoteViews vista(Context context) {
        RemoteViews v = new RemoteViews(context.getPackageName(), R.layout.widget_versiculo);
        String[] hoy = deHoy(context);
        v.setTextViewText(R.id.widget_texto, hoy[1].isEmpty() ? "Abre la app para ver el versículo de hoy." : "«" + hoy[1] + "»");
        v.setTextViewText(R.id.widget_cita, hoy[0]);
        Intent abrir = new Intent(context, MainActivity.class);
        abrir.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        abrir.putExtra("destino", "hoy");
        PendingIntent pi = PendingIntent.getActivity(context, 7300, abrir, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        v.setOnClickPendingIntent(R.id.widget_raiz, pi);
        return v;
    }

    /** [cita, texto] del día de hoy (fecha local); si no hay, el más reciente anterior. */
    static String[] deHoy(Context context) {
        SharedPreferences p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String hoy = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
        String[] mejor = { "Versículo del día", "" };
        try {
            JSONArray lista = new JSONArray(p.getString(CLAVE, "[]"));
            String fechaMejor = "";
            for (int i = 0; i < lista.length(); i++) {
                JSONObject o = lista.getJSONObject(i);
                String f = o.optString("fecha");
                if (f.compareTo(hoy) <= 0 && f.compareTo(fechaMejor) > 0) {
                    fechaMejor = f;
                    mejor = new String[] { o.optString("cita"), o.optString("texto") };
                }
            }
        } catch (Exception ignorado) {
            // Datos dañados: se muestra la invitación a abrir la app.
        }
        return mejor;
    }
}
