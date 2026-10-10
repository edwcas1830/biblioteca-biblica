'use strict';
// Pasa un estado por la MISMA validación que hace la pantalla al abrir (validateState de app/app.js).
// Si esa validación falla, la app se queda con la biblioteca vacía aunque la base esté bien: por eso
// la simulación y las pruebas la usan sobre lo que devuelve bootstrap.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const DEPENDENCIAS = ['core.js', 'plan-core.js', 'appearance-core.js', 'pane-layout-core.js', 'devotional-core.js', 'music-core.js', 'content-core.js'];

module.exports = function validarComoPantalla(ventana, www, estado) {
  for (const f of DEPENDENCIAS) {
    const ruta = path.join(www, f);
    if (fs.existsSync(ruta)) vm.runInContext(fs.readFileSync(ruta, 'utf8'), ventana, { filename: f });
  }
  const app = fs.readFileSync(path.join(www, 'app.js'), 'utf8').replace(/\r\n/g, '\n');
  const inicio = app.indexOf('const $ =');
  const desde = app.indexOf('function validateState(');
  const fin = app.indexOf('\n  return result;\n}\n', desde);
  if (inicio < 0 || desde < 0 || fin < 0) throw new Error('No encontré validateState en app.js');
  // contentCore lo define journey.js en la página real.
  const codigo = '(function(){const contentCore=window.ContentCore;' + app.slice(inicio, fin) + '\n  return result;\n}\nreturn validateState;})()';
  const validateState = vm.runInContext(codigo, ventana, { filename: 'app.js (validateState)' });
  try { validateState(JSON.parse(JSON.stringify(estado))); return { acepta: true }; }
  catch (e) { return { acepta: false, motivo: e.message }; }
};
