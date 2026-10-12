package com.edward.bibliotecabiblica;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.drawable.Icon;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import com.getcapacitor.JSObject;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Lectura en voz alta en segundo plano (CONSENSO-BIBLIAS.md, entrega 2): un servicio en primer plano de tipo
 * «reproducción multimedia» que lee versículo por versículo con la voz del teléfono, sigue con la pantalla apagada,
 * pone pausa / siguiente / detener en la notificación y en la pantalla bloqueada (MediaSession), suelta el audio
 * si entra una llamada y se apaga solo con el temporizador. El WebView solo le manda la cola de capítulos.
 */
public class LecturaVozService extends Service implements TextToSpeech.OnInitListener {

    public interface Oyente { void evento(String tipo, JSObject datos); }
    static Oyente oyente;

    static final String INICIAR = "biblioteca.lectura.INICIAR";
    static final String PAUSAR = "biblioteca.lectura.PAUSAR";
    static final String REANUDAR = "biblioteca.lectura.REANUDAR";
    static final String SIGUIENTE = "biblioteca.lectura.SIGUIENTE";
    static final String DETENER = "biblioteca.lectura.DETENER";
    private static final String CANAL = "lectura";
    private static final int AVISO = 4021;
    private static final int MAX_PARTE = 3800; // por debajo del máximo de entrada del motor de voz

    private static final class Capitulo {
        final String titulo; final int libro; final int capitulo; final List<String> partes = new ArrayList<>();
        Capitulo(String t, int l, int c) { titulo = t; libro = l; capitulo = c; }
    }

    private final Handler principal = new Handler(Looper.getMainLooper());
    private final List<Capitulo> cola = new ArrayList<>();
    private TextToSpeech voz;
    private boolean vozLista = false, pausado = false, enPrimerPlano = false;
    private int item = 0, parte = 0, generacion = 0;
    private float velocidad = 1f;
    private String nombreVoz = "";
    private MediaSession sesion;
    private AudioManager audio;
    private AudioFocusRequest foco;
    private Runnable apagar;

    @Override public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onCreate() {
        super.onCreate();
        audio = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        sesion = new MediaSession(this, "BibliotecaLectura");
        sesion.setCallback(new MediaSession.Callback() {
            @Override public void onPlay() { reanudar(); }
            @Override public void onPause() { pausar(); }
            @Override public void onSkipToNext() { siguiente(); }
            @Override public void onStop() { detener(); }
        });
        voz = new TextToSpeech(this, this);
    }

    @Override
    public void onInit(int estado) {
        principal.post(() -> {
            if (estado != TextToSpeech.SUCCESS) { emitir("error", texto("mensaje", "La voz del teléfono no está disponible.")); detener(); return; }
            vozLista = true;
            voz.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override public void onStart(String id) { }
                @Override public void onDone(String id) { principal.post(() -> alTerminarParte(id)); }
                @Override public void onError(String id) { principal.post(() -> alTerminarParte(id)); }
            });
            configurarVoz();
            if (!cola.isEmpty() && !pausado) hablar();
        });
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String accion = intent != null ? intent.getAction() : null;
        if (INICIAR.equals(accion)) iniciar(intent);
        else if (PAUSAR.equals(accion)) pausar();
        else if (REANUDAR.equals(accion)) reanudar();
        else if (SIGUIENTE.equals(accion)) siguiente();
        else if (DETENER.equals(accion)) detener();
        else if (!enPrimerPlano) stopSelf();
        return START_NOT_STICKY;
    }

    private void iniciar(Intent intent) {
        cola.clear(); item = 0; parte = 0; pausado = false; generacion++;
        try {
            JSONArray capitulos = new JSONArray(intent.getStringExtra("cola"));
            for (int i = 0; i < capitulos.length() && i < 40; i++) {
                JSONObject c = capitulos.getJSONObject(i);
                Capitulo cap = new Capitulo(c.optString("titulo", ""), c.optInt("libro", -1), c.optInt("capitulo", -1));
                JSONArray partes = c.getJSONArray("partes");
                for (int j = 0; j < partes.length(); j++) {
                    String p = partes.optString(j, "").trim();
                    while (p.length() > MAX_PARTE) { int corte = p.lastIndexOf(' ', MAX_PARTE); if (corte < MAX_PARTE / 2) corte = MAX_PARTE; cap.partes.add(p.substring(0, corte)); p = p.substring(corte).trim(); }
                    if (!p.isEmpty()) cap.partes.add(p);
                }
                if (!cap.partes.isEmpty()) cola.add(cap);
            }
        } catch (Exception e) {
            emitir("error", texto("mensaje", "No se pudo preparar la lectura."));
            detener(); return;
        }
        if (cola.isEmpty()) { detener(); return; }
        velocidad = Math.max(0.5f, Math.min(2f, intent.getFloatExtra("velocidad", 1f)));
        nombreVoz = intent.getStringExtra("voz") != null ? intent.getStringExtra("voz") : "";
        long apagarMs = intent.getLongExtra("apagarMs", 0);
        if (apagar != null) principal.removeCallbacks(apagar);
        apagar = null;
        if (apagarMs > 0) { apagar = () -> { emitir("temporizador", new JSObject()); detener(); }; principal.postDelayed(apagar, apagarMs); }
        enPrimerPlano();
        if (!pedirFoco()) { pausado = true; actualizar(); return; }
        if (vozLista) { configurarVoz(); hablar(); }
    }

    private void configurarVoz() {
        voz.setSpeechRate(velocidad);
        voz.setLanguage(new Locale("es"));
        if (nombreVoz.isEmpty()) return;
        try {
            for (Voice v : voz.getVoices()) if (nombreVoz.equals(v.getName())) { voz.setVoice(v); return; }
        } catch (Exception ignorada) { /* algunos motores no listan voces: queda la española por defecto */ }
    }

    private void hablar() {
        if (pausado || item >= cola.size()) return;
        Capitulo c = cola.get(item);
        if (parte >= c.partes.size()) { alTerminarCapitulo(); return; }
        if (parte == 0) { JSObject d = new JSObject(); d.put("item", item); d.put("libro", c.libro); d.put("capitulo", c.capitulo); d.put("titulo", c.titulo); emitir("capitulo", d); }
        JSObject d = new JSObject(); d.put("item", item); d.put("parte", parte); emitir("parte", d);
        Bundle p = new Bundle(); p.putInt(TextToSpeech.Engine.KEY_PARAM_STREAM, AudioManager.STREAM_MUSIC);
        voz.speak(c.partes.get(parte), TextToSpeech.QUEUE_FLUSH, p, generacion + ":" + item + ":" + parte);
        actualizar();
    }

    private void alTerminarParte(String id) {
        if (pausado || id == null || !id.equals(generacion + ":" + item + ":" + parte)) return; // llegó tarde (pausa, siguiente o nueva cola)
        parte++;
        hablar();
    }

    private void alTerminarCapitulo() {
        item++; parte = 0;
        if (item >= cola.size()) { emitir("terminado", new JSObject()); detener(); return; }
        hablar();
    }

    private void pausar() {
        if (pausado || cola.isEmpty()) return;
        pausado = true; generacion++;
        if (voz != null) voz.stop();
        actualizar(); emitir("estado", estado());
    }

    private void reanudar() {
        if (!pausado || cola.isEmpty()) return;
        if (!pedirFoco()) return;
        pausado = false; generacion++;
        hablar(); emitir("estado", estado());
    }

    private void siguiente() {
        if (cola.isEmpty()) return;
        generacion++;
        if (voz != null) voz.stop();
        pausado = false;
        alTerminarCapitulo();
    }

    private void detener() {
        generacion++;
        if (apagar != null) principal.removeCallbacks(apagar);
        apagar = null;
        if (voz != null) voz.stop();
        cola.clear(); pausado = false;
        soltarFoco();
        if (sesion != null) sesion.setActive(false);
        JSObject d = estado(); d.put("activo", false); emitir("estado", d);
        if (enPrimerPlano) { stopForeground(STOP_FOREGROUND_REMOVE); enPrimerPlano = false; }
        stopSelf();
    }

    // ---------- Foco de audio: una llamada o la música de otra app pausan la lectura ----------
    private final AudioManager.OnAudioFocusChangeListener cambioFoco = cambio -> principal.post(() -> {
        if (cambio == AudioManager.AUDIOFOCUS_LOSS || cambio == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT || cambio == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK) pausar();
    });
    private boolean pedirFoco() {
        AudioAttributes a = new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build();
        foco = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN).setAudioAttributes(a).setOnAudioFocusChangeListener(cambioFoco, principal).build();
        return audio.requestAudioFocus(foco) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
    }
    private void soltarFoco() { if (foco != null) audio.abandonAudioFocusRequest(foco); foco = null; }

    // ---------- Notificación y pantalla bloqueada ----------
    private void enPrimerPlano() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm.getNotificationChannel(CANAL) == null) {
            NotificationChannel canal = new NotificationChannel(CANAL, "Lectura en voz alta", NotificationManager.IMPORTANCE_LOW);
            canal.setDescription("Controles de la lectura de la Biblia en voz alta");
            canal.setShowBadge(false);
            nm.createNotificationChannel(canal);
        }
        sesion.setActive(true);
        Notification n = aviso();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) startForeground(AVISO, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        else startForeground(AVISO, n);
        enPrimerPlano = true;
    }

    private PendingIntent accion(String a, int codigo) {
        return PendingIntent.getService(this, codigo, new Intent(this, LecturaVozService.class).setAction(a), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private Notification aviso() {
        String titulo = item < cola.size() ? cola.get(item).titulo : "Biblioteca Bíblica";
        Intent abrir = new Intent(this, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        Notification.Builder b = new Notification.Builder(this, CANAL)
            .setSmallIcon(R.drawable.ic_lectura)
            .setContentTitle(titulo)
            .setContentText(pausado ? "En pausa" : "Leyendo en voz alta")
            .setContentIntent(PendingIntent.getActivity(this, 1, abrir, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT))
            .setDeleteIntent(accion(DETENER, 2))
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setOnlyAlertOnce(true)
            .setOngoing(!pausado)
            .addAction(new Notification.Action.Builder(Icon.createWithResource(this, pausado ? R.drawable.ic_continuar : R.drawable.ic_pausa), pausado ? "Continuar" : "Pausa", accion(pausado ? REANUDAR : PAUSAR, 3)).build())
            .addAction(new Notification.Action.Builder(Icon.createWithResource(this, R.drawable.ic_siguiente), "Siguiente", accion(SIGUIENTE, 4)).build())
            .addAction(new Notification.Action.Builder(Icon.createWithResource(this, R.drawable.ic_detener), "Detener", accion(DETENER, 5)).build())
            .setStyle(new Notification.MediaStyle().setMediaSession(sesion.getSessionToken()).setShowActionsInCompactView(0, 1, 2));
        return b.build();
    }

    private void actualizar() {
        if (sesion == null) return;
        String titulo = item < cola.size() ? cola.get(item).titulo : "";
        sesion.setMetadata(new MediaMetadata.Builder().putString(MediaMetadata.METADATA_KEY_TITLE, titulo).putString(MediaMetadata.METADATA_KEY_ARTIST, "Biblioteca Bíblica").build());
        sesion.setPlaybackState(new PlaybackState.Builder()
            .setActions(PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_PLAY_PAUSE | PlaybackState.ACTION_SKIP_TO_NEXT | PlaybackState.ACTION_STOP)
            .setState(pausado ? PlaybackState.STATE_PAUSED : PlaybackState.STATE_PLAYING, PlaybackState.PLAYBACK_POSITION_UNKNOWN, velocidad).build());
        if (enPrimerPlano) ((NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE)).notify(AVISO, aviso());
    }

    private JSObject estado() {
        JSObject d = new JSObject();
        d.put("activo", !cola.isEmpty()); d.put("pausado", pausado); d.put("item", item); d.put("parte", parte);
        return d;
    }
    private static JSObject texto(String k, String v) { JSObject d = new JSObject(); d.put(k, v); return d; }
    private void emitir(String tipo, JSObject datos) { Oyente o = oyente; if (o != null) o.evento(tipo, datos); }

    @Override
    public void onDestroy() {
        if (apagar != null) principal.removeCallbacks(apagar);
        if (voz != null) { voz.stop(); voz.shutdown(); }
        soltarFoco();
        if (sesion != null) sesion.release();
        super.onDestroy();
    }
}
