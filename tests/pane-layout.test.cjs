const test=require('node:test'),assert=require('node:assert/strict'),core=require('../app/pane-layout-core.js');
const all=['biblia','comentario','diccionario'];
test('La Biblia permanece y las preferencias antiguas pasan a tres columnas sin perder diseño ni tamaños',()=>{
 assert.deepEqual(core.normalize().visible,all);assert.deepEqual(core.normalize({visible:['diccionario','desconocido'],layout:'ruta.css'}).visible,['biblia','diccionario']);
 const prior={biblia:46,comentario:26,diccionario:28},views=core.normalize(undefined,prior);
 assert.deepEqual(core.configuration(views).weights,[46,26,28]);
});
test('Cada combinación guarda sus proporciones sin contaminar otra orientación o pareja',()=>{
 const key=core.key('columns',['biblia','diccionario']);const views=core.normalize({layout:'columns',visible:['biblia','diccionario'],sizes:{[key]:{weights:[70,30]}}});
 assert.deepEqual(core.configuration(views).weights,[70,30]);assert.deepEqual(core.configuration({...views,layout:'rows'}).weights,[60,40]);assert.deepEqual(core.configuration(views,['biblia','comentario']).weights,[58,42]);
 assert.deepEqual(core.defaults('rows',all),{weights:[50,50],aux:[50,50]});
});
test('Proporciones corruptas, rutas y valores no finitos no alcanzan el template ni el perfil normalizado',()=>{
 const id=core.key('rows',all);
 for(const bad of [{weights:[99,1],aux:[50,50]},{weights:[50,50],aux:[NaN,50]},{weights:[40,40],aux:[50,50]},{weights:[50,50]}])assert.deepEqual(core.normalize({sizes:{[id]:bad,'externo':{weights:[50,50]}}}).sizes,{});
});
test('Redimensionar respeta mínimos en píxeles, mantiene la suma y no mueve el tercer panel',()=>{
 const config={weights:[42,30,28]},next=core.resize(config,'weights',0,1,95,800,220);
 assert.ok(Math.abs(next.weights.reduce((a,b)=>a+b)-100)<.001);assert.equal(next.weights[2],28);assert.deepEqual(config.weights,[42,30,28]);assert.ok(800*next.weights[1]/(next.weights[0]+next.weights[1])>=220-1e-6);
 const row=core.resize({weights:[50,50],aux:[50,50]},'weights',0,1,99,480,160);assert.ok(480*row.weights[1]/100>=160-1e-6);
 assert.deepEqual(row.aux,[50,50]);
});
