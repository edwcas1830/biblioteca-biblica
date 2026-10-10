'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const voiceCore=require('../app/voice-core.js'),services=require('../platform/android/services.js');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const capabilities=()=>({platform:'android',operations:Object.fromEntries(['playVoice','stopVoice','voiceOptions'].map(name=>[name,{available:true}]))});
const bridgeFixture=()=>({getCapabilities:async()=>capabilities(),voiceOptions:async()=>[{id:'7',name:'Español local',lang:'es-ES',localService:true},{id:'8',name:'Inglés',lang:'en-US',localService:true},{id:'9',name:'Español en línea',lang:'es-ES',localService:false}],stopVoice:async()=>{}});
test('Voice uses advertised bridge operations, keeps native voice IDs and excludes explicitly online voices',async()=>{
  const calls=[],statuses=[],bridge=bridgeFixture();bridge.playVoice=async data=>{calls.push(data);};
  const controller=voiceCore.create({bridge,speech:{getVoices(){throw Error('Should not use speech shim');}},onStatus:text=>statuses.push(text)});
  assert.deepEqual((await controller.loadVoices()).map(v=>v.id),['7']);
  await controller.play('Primer versículo.\nSegundo versículo.','7');assert.equal(calls.length,2);assert.equal(calls[0].voice,'7');assert.equal(calls[0].lang,'es-ES');assert.equal(statuses.at(-1),'Lectura terminada.');await controller.destroy();
});
test('Native pause repeats current verse; stale completion cannot skip a verse or finish a newer request',async()=>{
  const requests=[],bridge=bridgeFixture();bridge.playVoice=data=>new Promise((resolve,reject)=>requests.push({data,resolve,reject}));
  const controller=voiceCore.create({bridge});await controller.loadVoices();const reading=controller.play('Uno\nDos','7');await tick();assert.equal(requests[0].data.text,'Uno');
  await controller.togglePause();await controller.togglePause();await tick();assert.equal(requests[1].data.text,'Uno');
  requests[0].resolve();await tick();assert.equal(requests.length,2,'Old completion must not advance');
  requests[1].resolve();await tick();assert.equal(requests[2].data.text,'Dos');requests[2].resolve();await reading;await controller.destroy();
});
test('Stop invalidates old callbacks and resolves canceled reading without reporting a later failure',async()=>{
  const requests=[],statuses=[],bridge=bridgeFixture();bridge.playVoice=data=>new Promise((resolve,reject)=>requests.push({data,resolve,reject}));
  const controller=voiceCore.create({bridge,onStatus:text=>statuses.push(text)});await controller.loadVoices();const first=controller.play('Antes','7');await tick();await controller.stop();await first;
  const second=controller.play('Después','7');await tick();requests[0].reject(Error('Canceled engine'));await tick();assert.equal(statuses.at(-1),'Leyendo…');requests[1].resolve();await second;assert.equal(statuses.at(-1),'Lectura terminada.');await controller.destroy();
});
test('Stop during queued start prevents delayed native playback',async()=>{
  const pending=[],bridge=bridgeFixture();let plays=0;bridge.stopVoice=()=>new Promise(resolve=>pending.push(resolve));bridge.playVoice=async()=>{plays++;};
  const controller=voiceCore.create({bridge});await controller.loadVoices();const reading=controller.play('No leer','7');await tick();const stopping=controller.stop();pending[0]();await tick();pending[1]();await stopping;await reading;assert.equal(plays,0);
});
test('Desktop uses local Web Speech, while an unavailable Android bridge never claims shim playback capability',async()=>{
  const listeners=new Map(),speech={getVoices:()=>[{name:'Local',lang:'es',localService:true},{name:'Remote',lang:'es',localService:false}],addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name),cancel:()=>{},speak:u=>{speech.current=u;},pause:()=>{speech.paused=true;},resume:()=>{speech.paused=false;}};
  const controller=voiceCore.create({speech,Utterance:function(text){this.text=text;}});assert.equal((await controller.loadVoices()).length,1);const reading=controller.play('Texto','0');await tick();assert.equal(speech.current.text,'Texto');await controller.togglePause();assert.equal(speech.paused,true);await controller.togglePause();assert.equal(speech.paused,false);speech.current.onend();await reading;await controller.destroy();assert.equal(listeners.size,0);
  const native=voiceCore.create({bridge:{getCapabilities:async()=>({platform:'android',operations:{}})},speech:{getVoices(){throw Error('No shim discovery');}},Utterance:function(){}});assert.deepEqual(await native.loadVoices(),[]);await assert.rejects(native.play('Texto','0'),/Elige una voz/);
});
test('TTS chunks stay under the engine limit without splitting surrogate pairs',()=>{
  const text='😀'.repeat(4000)+'fin',parts=voiceCore.chunks(text);assert.ok(parts.every(p=>p.length<=3000));assert.equal(parts.join(''),text);assert.ok(parts.every(p=>!/[\uD800-\uDBFF]$/.test(p)&&!/^[\uDC00-\uDFFF]/.test(p)));
});
test('Native service registry starts honestly empty and validates registrations atomically',()=>{
  const registry=services.create();assert.deepEqual(registry.handlers(),{});assert.equal(registry.storage(),'none');assert.throws(()=>registry.setStorage('sqlite'),{code:'VALIDATION'});
  assert.throws(()=>registry.register({bootstrap:()=>{},typo:()=>{}}),{code:'VALIDATION'});assert.deepEqual(registry.handlers(),{});
  registry.register({bootstrap:()=>{},savePersonal:()=>{}});registry.setStorage('sqlite');assert.equal(registry.storage(),'sqlite');assert.ok(Object.isFrozen(registry.handlers()));
});
test('Ordered mobile manifest loads dependencies before adapters and native services',()=>{
  const list=JSON.parse(fs.readFileSync(path.join(__dirname,'../platform/scripts-movil.json'),'utf8'));assert.equal(new Set(list).size,list.length);
  for(const file of list){assert.match(file,/^(?:(platform|shared)\/[-a-z0-9/]+|ai-core)\.js$/);assert.ok(fs.existsSync(path.join(__dirname,'..',file==='ai-core.js'?'app/'+file:file)));}
  assert.ok(list.indexOf('platform/ai/service.js')>list.indexOf('ai-core.js'));assert.ok(list.indexOf('platform/ai/service.js')>list.indexOf('shared/ai-context.js'));assert.ok(list.indexOf('platform/android/services.js')>list.indexOf('platform/ai/service.js'));
  assert.ok(list.indexOf('shared/personal-model.js')>list.indexOf('shared/references.js'));assert.ok(list.indexOf('platform/web/bridge.js')>list.indexOf('platform/web/personal-store.js'));assert.ok(list.indexOf('platform/android/services.js')>list.indexOf('platform/bridge-contract.js'));
});
