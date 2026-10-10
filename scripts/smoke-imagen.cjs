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
