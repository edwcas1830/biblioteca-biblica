'use strict';
// Imagen con versículos: se abre desde «Mis notas», arma el texto de un rango y dibuja en los tres tamaños.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async({evaluate,screenshot,wait,args})=>{
 const report={};
 report.boton=await evaluate("!!document.querySelector('#imagen-abrir')");
 assert.equal(report.boton,true);
 await evaluate("go(18,23,1)");await wait(600);
 await evaluate("document.querySelector('#imagen-abrir').click()");await wait(500);
 await evaluate("document.querySelector('#imagen-hasta').value='3';document.querySelector('#imagen-hasta').dispatchEvent(new Event('change'))");await wait(800);
 report.texto=await evaluate("document.querySelector('#imagen-texto').value");
 report.fondoIA=await evaluate("!document.querySelector('#imagen-ia').hidden");
 assert.equal(report.fondoIA,true,'el botón Fondo con IA aparece');
 report.ideas=await evaluate("[...document.querySelectorAll('#imagen-ideas .imagen-idea')].map(b=>b.textContent.slice(0,40))");
 assert.equal(report.ideas.length,3,'tres ideas para el fondo');
 await evaluate("document.querySelector('#imagen-ideas .imagen-idea').click()");await wait(200);
 report.ideaElegida=await evaluate("document.querySelector('#imagen-ia-texto').value.slice(0,60)");
 assert.ok(report.ideaElegida.length>10,'la idea se copia a Mi idea');
 report.botonCosto=await evaluate("document.querySelector('#imagen-ia-crear').textContent");
 assert.match(report.botonCosto,/US\$0,03/);
 await evaluate("document.querySelector('#imagen-ia-crear').click()");await wait(1500);
 report.sinConexion=await evaluate("document.querySelector('#imagen-estado').textContent");
 assert.match(report.sinConexion,/OpenRouter/,'sin conexión explica que hay que conectar OpenRouter');
 report.referencia=await evaluate("document.querySelector('#imagen-referencia').value");
 assert.match(report.texto,/JEHOVÁ es mi pastor/);assert.match(report.texto,/Confortará mi alma/);assert.doesNotMatch(report.texto,/\b[123]\b(?= [A-Z])/);
 assert.equal(report.referencia,'Salmos 23:1-3');
 report.tamanos={};
 for(const [formato,estilo] of [['vertical','pergamino'],['cuadrado','noche'],['historia','cuero']]){
  await evaluate(`document.querySelector('#imagen-formato').value='${formato}';document.querySelector('#imagen-estilo').value='${estilo}';window.BibliaImagen.dibujar()`);await wait(700);
  const r=await evaluate("(()=>{const c=window.BibliaImagen._lienzo();return {w:c.width,h:c.height,png:c.toDataURL('image/png')};})()");
  report.tamanos[formato]=r.w+'x'+r.h;
  fs.writeFileSync(path.join(args.output,`v064-imagen-${formato}-${estilo}.png`),Buffer.from(r.png.split(',')[1],'base64'));
 }
 assert.deepEqual(report.tamanos,{vertical:'1080x1350',cuadrado:'1080x1080',historia:'1080x1920'});
 await screenshot('v064-imagen-dialogo');
 await evaluate("document.querySelector('#imagen-cerrar').click()");
 return report;
};
