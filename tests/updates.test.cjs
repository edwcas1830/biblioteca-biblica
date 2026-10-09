const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),{createUpdateService}=require('../update-service.cjs');
function fake(){const updater=new EventEmitter();updater.checkForUpdates=async()=>{updater.emit('checking-for-update');updater.emit('update-available',{version:'0.3.0'});};updater.downloadUpdate=async()=>{updater.emit('download-progress',{percent:50});updater.emit('update-downloaded',{version:'0.3.0'});};updater.quitAndInstall=()=>{updater.installed=true;};return updater;}
test('El aviso no descarga ni reinicia sin una acción del usuario',async()=>{
  const updater=fake(),events=[],service=createUpdateService({app:{isPackaged:true,getVersion:()=> '0.2.0'},updater,enabled:true,notify:s=>events.push(s.status)});
  assert.equal(updater.autoDownload,false);assert.equal(updater.autoInstallOnAppQuit,false);assert.equal(service.install().accepted,false);
  await service.check();assert.equal(service.getState().status,'available');assert.equal(updater.installed,undefined);
  await service.download();assert.equal(service.getState().status,'ready');assert.equal(service.getState().percent,100);assert.equal(service.install().accepted,true);assert.equal(updater.installed,true);assert.ok(events.includes('downloading'));
});
test('El canal desactivado y el modo de pruebas no consultan la red',async()=>{
  for(const [enabled,testing] of [[false,false],[true,true]]){const updater=fake();updater.checkForUpdates=()=>{throw new Error('No debe llamarse');};const service=createUpdateService({app:{isPackaged:true,getVersion:()=> '0.2.0'},updater,enabled,testing});await service.check();assert.equal(service.getState().status,'disabled');assert.equal(service.install().accepted,false);}
});
test('El error de red conserva un estado recuperable y no instala',async()=>{
  const updater=fake();updater.checkForUpdates=async()=>{throw new Error('Red sin conexión');};const service=createUpdateService({app:{isPackaged:true,getVersion:()=> '0.2.0'},updater,enabled:true});await service.check();assert.equal(service.getState().status,'error');assert.equal(service.install().accepted,false);
});
