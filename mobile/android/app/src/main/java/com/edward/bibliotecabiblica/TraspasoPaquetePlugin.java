package com.edward.bibliotecabiblica;

import android.net.Uri;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.BufferedInputStream;
import java.io.EOFException;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Traspaso en UN archivo: desempaca el paquete .bbt (formato tar «ustar» que arma traspaso-pc.cjs en la PC)
 * directamente desde lo que se eligió en OneDrive hasta files/traspaso-entrante, leyendo por bloques
 * (200 MB nunca pasan por la memoria del WebView). Solo acepta archivos normales con nombres simples;
 * las huellas SHA-256 de cada archivo las vuelve a comprobar después la revisión del traspaso (transferScan).
 */
@CapacitorPlugin(name = "TraspasoPaquete")
public class TraspasoPaquetePlugin extends Plugin {

    private static final Pattern NOMBRE = Pattern.compile("^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$");
    private static final int MAX_ARCHIVOS = 64;
    private static final long MAX_ARCHIVO = 2L * 1024 * 1024 * 1024;
    private static final long MAX_TOTAL = 4L * 1024 * 1024 * 1024;
    private static final long RESERVA = 64L * 1024 * 1024;
    private static final String CARPETA = "traspaso-entrante";

    @PluginMethod
    public void desempacar(PluginCall call) {
        String desde = call.getString("desde");
        if (desde == null || desde.isEmpty()) {
            call.reject("Falta el archivo del traspaso.", "VALIDATION");
            return;
        }
        long esperado = call.getLong("bytes", 0L);
        new Thread(() -> {
            File destino = new File(getContext().getFilesDir(), CARPETA);
            try (InputStream crudo = abrir(Uri.parse(desde)); InputStream in = new BufferedInputStream(crudo, 1 << 20)) {
                borrar(destino);
                if (!destino.mkdirs()) throw new IOException("No se pudo preparar la carpeta del traspaso.");
                JSArray archivos = desempacarEn(in, destino, esperado);
                JSObject r = new JSObject();
                r.put("carpeta", CARPETA);
                r.put("archivos", archivos);
                call.resolve(r);
            } catch (PaqueteInvalido e) {
                borrar(destino);
                call.reject(e.getMessage(), "CORRUPT");
            } catch (Exception e) {
                borrar(destino);
                call.reject("No se pudo abrir el paquete del traspaso: " + e.getMessage(), "CORRUPT");
            }
        }, "traspaso-paquete").start();
    }

    private InputStream abrir(Uri uri) throws IOException {
        String esquema = uri.getScheme();
        InputStream in;
        if (esquema == null || "file".equals(esquema)) in = new FileInputStream(new File(uri.getPath()));
        else in = getContext().getContentResolver().openInputStream(uri);
        if (in == null) throw new IOException("Android no entregó el archivo elegido.");
        return in;
    }

    private JSArray desempacarEn(InputStream in, File destino, long esperado) throws IOException {
        byte[] cabecera = new byte[512];
        byte[] bufer = new byte[1 << 20];
        Set<String> vistos = new HashSet<>();
        JSArray archivos = new JSArray();
        long total = 0, leidos = 0, avisado = 0;
        boolean fin = false;
        while (leerBloque(in, cabecera)) {
            leidos += 512;
            if (vacio(cabecera)) { fin = true; break; }
            if (!"ustar".equals(texto(cabecera, 257, 5))) throw new PaqueteInvalido("El archivo elegido no es un paquete de traspaso.");
            if (octal(cabecera, 148, 8) != suma(cabecera)) throw new PaqueteInvalido("El paquete del traspaso está dañado (cabecera).");
            char tipo = (char) cabecera[156];
            String nombre = texto(cabecera, 0, 100);
            if ((tipo != '0' && tipo != 0) || cabecera[345] != 0) throw new PaqueteInvalido("El paquete trae algo que no es un archivo: «" + nombre + "».");
            if (!NOMBRE.matcher(nombre).matches() || nombre.contains("..")) throw new PaqueteInvalido("Nombre no permitido en el paquete: «" + nombre + "».");
            if (!vistos.add(nombre.toLowerCase(Locale.ROOT))) throw new PaqueteInvalido("El paquete repite el archivo «" + nombre + "».");
            if (vistos.size() > MAX_ARCHIVOS) throw new PaqueteInvalido("El paquete trae demasiados archivos.");
            long tam = octal(cabecera, 124, 12);
            if (tam < 0 || tam > MAX_ARCHIVO || (total += tam) > MAX_TOTAL) throw new PaqueteInvalido("El paquete es demasiado grande.");
            if (destino.getUsableSpace() - tam < RESERVA) throw new PaqueteInvalido("No hay espacio suficiente en el teléfono para el traspaso.");
            File archivo = new File(destino, nombre);
            try (OutputStream out = new FileOutputStream(archivo)) {
                long resta = tam;
                while (resta > 0) {
                    int n = in.read(bufer, 0, (int) Math.min(bufer.length, resta));
                    if (n < 0) throw new PaqueteInvalido("El paquete del traspaso está incompleto (¿terminó de descargarse?).");
                    out.write(bufer, 0, n);
                    resta -= n;
                    leidos += n;
                    if (leidos - avisado >= 4L * 1024 * 1024) { avisado = leidos; progreso(nombre, leidos, esperado); }
                }
                out.getFD().sync();
            }
            long relleno = (512 - (tam % 512)) % 512;
            if (relleno > 0) {
                if (!leerExacto(in, bufer, (int) relleno)) throw new PaqueteInvalido("El paquete del traspaso está incompleto.");
                leidos += relleno;
            }
            JSObject a = new JSObject();
            a.put("nombre", nombre);
            a.put("ruta", CARPETA + "/" + nombre);
            a.put("bytes", tam);
            archivos.put(a);
        }
        if (!fin || archivos.length() == 0) throw new PaqueteInvalido("El paquete del traspaso está incompleto (¿terminó de descargarse?).");
        progreso(null, esperado > 0 ? esperado : leidos, esperado > 0 ? esperado : leidos);
        return archivos;
    }

    private void progreso(String archivo, long copiados, long total) {
        JSObject p = new JSObject();
        p.put("archivo", archivo);
        p.put("copiados", copiados);
        p.put("total", total);
        notifyListeners("progreso", p);
    }

    private static boolean leerBloque(InputStream in, byte[] b) throws IOException {
        int n = 0;
        while (n < b.length) {
            int r = in.read(b, n, b.length - n);
            if (r < 0) {
                if (n == 0) return false;
                throw new PaqueteInvalido("El paquete del traspaso está incompleto.");
            }
            n += r;
        }
        return true;
    }

    private static boolean leerExacto(InputStream in, byte[] b, int largo) throws IOException {
        int n = 0;
        while (n < largo) {
            int r = in.read(b, n, largo - n);
            if (r < 0) return false;
            n += r;
        }
        return true;
    }

    private static boolean vacio(byte[] b) {
        for (byte x : b) if (x != 0) return false;
        return true;
    }

    private static String texto(byte[] b, int desde, int largo) {
        int fin = desde;
        while (fin < desde + largo && b[fin] != 0) fin++;
        return new String(b, desde, fin - desde, StandardCharsets.US_ASCII).trim();
    }

    private static long octal(byte[] b, int desde, int largo) throws PaqueteInvalido {
        String s = texto(b, desde, largo);
        if (s.isEmpty() || !s.matches("[0-7]+")) throw new PaqueteInvalido("El paquete del traspaso está dañado (tamaño).");
        return Long.parseLong(s, 8);
    }

    private static long suma(byte[] b) {
        long s = 0;
        for (int i = 0; i < 512; i++) s += (i >= 148 && i < 156) ? 32 : (b[i] & 0xff);
        return s;
    }

    private static void borrar(File f) {
        if (f == null || !f.exists()) return;
        File[] hijos = f.listFiles();
        if (hijos != null) for (File h : hijos) borrar(h);
        //noinspection ResultOfMethodCallIgnored
        f.delete();
    }

    private static class PaqueteInvalido extends EOFException {
        PaqueteInvalido(String mensaje) { super(mensaje); }
    }
}
