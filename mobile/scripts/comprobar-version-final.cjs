'use strict';
// Comprueba en el emulador el APK que se ENTREGA (versión final, firma fija de Edward), después de la prueba
// completa con el APK de depuración. Auditoría 11-oct: el APK entregado no debe ser depurable (sin run-as,
// sin depuración del WebView, sin registros de los plugins con las claves).
// Uso: node comprobar-version-final.cjs <apk-final> <carpeta-de-resultados>
const { execFileSync } = require('node:child_process');
const fs = require('node:fs'), path = require('node:path');
const [apk, salida] = process.argv.slice(2);
const PKG = 'com.edward.bibliotecabiblica';
const adb = (...a) => execFileSync('adb', a, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 180000 });
const intentar = (...a) => { try { return { ok: true, salida: adb(...a) }; } catch (e) { return { ok: false, salida: String(e.stdout || '') + String(e.stderr || '') }; } };
const espera = ms => new Promise(r => setTimeout(r, ms));
const lineas = [];
const anotar = (ok, paso, detalle = '') => { const l = `${ok ? 'OK ' : 'FALLÓ'} ${paso}${detalle ? ' · ' + detalle : ''}`; lineas.push(l); console.log(l); return ok; };

(async () => {
  // La firma cambia (depuración → fija): hay que desinstalar la de prueba antes.
  intentar('uninstall', PKG);
  adb('install', apk);
  adb('logcat', '-c');
  adb('shell', 'monkey', '-p', PKG, '-c', 'android.intent.category.LAUNCHER', '1');
  let pid = '';
  for (let i = 0; i < 30 && !pid; i++) { await espera(1000); pid = intentar('shell', 'pidof', PKG).salida.trim(); }
  await espera(6000);
  pid = intentar('shell', 'pidof', PKG).salida.trim();
  try { fs.writeFileSync(path.join(salida, 'version-final.png'), execFileSync('adb', ['exec-out', 'screencap', '-p'], { maxBuffer: 64 * 1024 * 1024, timeout: 60000 })); } catch { /* sin captura */ }
  const paquete = adb('shell', 'dumpsys', 'package', PKG);
  const banderas = (paquete.match(/pkgFlags=\[[^\]]*\]/) || [''])[0];
  const runAs = intentar('shell', 'run-as', PKG, 'ls');
  const sockets = intentar('shell', 'cat', '/proc/net/unix').salida;
  const devtools = pid && new RegExp('webview_devtools_remote_' + pid).test(sockets);
  const registros = intentar('logcat', '-d', '-v', 'brief', 'Capacitor:V', 'Capacitor/Plugin:V', '*:S').salida;
  const todo = [
    anotar(!!pid, 'versión final arranca', 'pid ' + (pid || 'ninguno')),
    anotar(!/DEBUGGABLE/.test(banderas), 'versión final no depurable', banderas),
    anotar(!runAs.ok || /not debuggable|is unknown/i.test(runAs.salida), 'versión final sin run-as', runAs.salida.trim().slice(0, 120)),
    anotar(!/callback ID|LlaveroSeguro|methodName/i.test(registros), 'versión final no registra llamadas a plugins')
  ].every(Boolean);
  // El emulador de CI es «userdebug»: ahí el WebView puede abrir la depuración aunque la app no sea depurable,
  // así que solo se informa (en un teléfono normal la decide la bandera que sí se exige arriba).
  lineas.push(devtools ? 'AVISO el emulador userdebug abrió la depuración del WebView' : 'OK  versión final sin depuración del WebView');
  console.log(lineas.at(-1));
  fs.appendFileSync(path.join(salida, 'informe.txt'), lineas.join('\n') + '\n');
  process.exit(todo ? 0 : 1);
})().catch(e => {
  fs.appendFileSync(path.join(salida, 'informe.txt'), 'ERROR versión final: ' + e.message + '\n');
  console.error(e);
  process.exit(1);
});
