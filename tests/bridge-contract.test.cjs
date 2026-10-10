'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const contract=require('../platform/bridge-contract.js');
test('Android contract retains the 67 preload APIs plus additive aiImage',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../preload.cjs'),'utf8').split("exposeInMainWorld('libraryDesktop',{")[1];
  const names=[...source.matchAll(/(?:^|[,\n])\s*(\w+)\s*:\s*(?:\([^)]*\)|\w+)\s*=>/g)].map(m=>m[1]).filter(n=>n!=='getCapabilities');
  assert.equal(names.length,68);assert.deepEqual([...contract.preloadNames].sort(),names.sort());
});
test('Capabilities reflect actual registration, missing operations reject with a typed error',async()=>{
  const adapter=contract.createBridge({handlers:{privacyStatus:()=>({enabled:false,locked:false,retryAt:0})}});
  const caps=await adapter.bridge.getCapabilities();assert.equal(caps.operations.setPin.available,false);assert.equal(caps.operations.privacyStatus.available,true);
  await assert.rejects(adapter.bridge.setPin('123456'),{name:'BridgeError',code:'UNAVAILABLE',operation:'setPin'});
  await assert.rejects(adapter.bridge.setPin('1'),{code:'VALIDATION'});
  adapter.register({setPin:()=>({version:1})});assert.equal((await adapter.bridge.getCapabilities()).operations.setPin.available,true);
  assert.throws(()=>adapter.register({aiCancel:()=>true,typo:()=>true}),{code:'VALIDATION'});assert.equal((await adapter.bridge.getCapabilities()).operations.aiCancel.available,false);
});
test('Events unsubscribe independently, listener exceptions do not invalidate completed operations',()=>{
  const adapter=contract.createBridge({events:['onAiProgress']});let count=0;const fn=()=>count++;
  const off1=adapter.bridge.onAiProgress(fn),off2=adapter.bridge.onAiProgress(fn);
  adapter.bridge.onAiProgress(()=>{throw Error('consumer');});adapter.emit('onAiProgress',{text:'a'});assert.equal(count,2);
  off1();off1();adapter.emit('onAiProgress',{text:'b'});assert.equal(count,3);off2();adapter.emit('onAiProgress',{});assert.equal(count,3);
  assert.throws(()=>adapter.bridge.onUpdateState(()=>{}),{code:'UNAVAILABLE'});
});
test('Bridge rejects oversized/invalid inputs and hides native secrets and stack traces',async()=>{
  let called=false;const adapter=contract.createBridge({handlers:{chapter:()=>{called=true;},aiCancel:()=>{throw Error('secret key and local filename');},readPdf:()=>true}});
  await assert.rejects(adapter.bridge.chapter({book:66,chapter:1}),{code:'VALIDATION'});assert.equal(called,false);
  await assert.rejects(adapter.bridge.readPdf(new Uint8Array()),{code:'VALIDATION'});
  await assert.rejects(adapter.bridge.aiCancel(),error=>error.code==='INTERNAL'&&!error.message.includes('secret'));
});
