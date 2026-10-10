'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),documents=require('../platform/web/documents.js'),shared=require('../shared/pdf-document.js');
const baseUrl='https://fixture.local/index.html';
function workerFixture(mode='wait'){
  const instances=[];
  class FakeWorker{
    constructor(url,options){this.url=url;this.options=options;this.terminated=false;instances.push(this);if(mode==='throw')throw Error('private path');}
    postMessage(data,transfers){this.data=data;this.transfers=transfers;if(mode==='fail')queueMicrotask(()=>this.onerror({preventDefault(){}}));}
    terminate(){this.terminated=true;}
  }return {instances,Worker:FakeWorker};
}
test('PDF lifecycle copies only the byte view and closing cancels the worker without detaching caller data',async()=>{
  const f=workerFixture(),service=documents.create({...f,baseUrl}),api=service.handlers(),whole=new Uint8Array([8,9,10,11]),view=whole.subarray(1,3),pending=api.readPdf(view);
  const rejected=assert.rejects(pending,{code:'CANCELLED'});assert.deepEqual([...f.instances[0].data.bytes],[9,10]);assert.notEqual(f.instances[0].data.bytes.buffer,whole.buffer);assert.equal(f.instances[0].data.bytes.byteLength,2);assert.equal(f.instances[0].transfers[0],f.instances[0].data.bytes.buffer);
  await assert.rejects(api.readPdf(view),{code:'CONFLICT'});service.close();await rejected;assert.equal(f.instances[0].terminated,true);assert.equal(whole.byteLength,4);await assert.rejects(api.readPdf(view),{code:'UNAVAILABLE'});
});
test('PDF timeout terminates a stalled worker and permits retry; failures do not expose paths',async()=>{
  const f=workerFixture(),service=documents.create({...f,baseUrl,timeoutMs:10}),api=service.handlers();await assert.rejects(api.readPdf(new Uint8Array([1])),{code:'CANCELLED'});assert.ok(f.instances[0].terminated);
  const second=api.readPdf(new Uint8Array([2])),rejected=assert.rejects(second,{code:'CANCELLED'});assert.equal(f.instances.length,2);service.close();await rejected;
  const broken=documents.create({...workerFixture('throw'),baseUrl});await assert.rejects(broken.handlers().readPdf(new Uint8Array([1])),e=>e.code==='UNAVAILABLE'&&!e.message.includes('private'));broken.close();
});
test('Missing Workers do not advertise readPdf and file validation happens before creating a worker',async()=>{
  assert.deepEqual(documents.create({Worker:null,baseUrl}).handlers(),{});
  const f=workerFixture(),service=documents.create({...f,baseUrl});for(const bytes of [null,new Uint8Array(),new Uint8Array(10000001)])await assert.rejects(service.handlers().readPdf(bytes),{code:'VALIDATION'});assert.equal(f.instances.length,0);service.close();
});
test('PDF reader cleans up tasks for password, page and text limits instead of returning partial invented content',async()=>{
  for(const mode of ['password','pages','text']){
    let destroyed=false;
    const fake={numPages:mode==='pages'?301:1,getPage:async()=>({getTextContent:async()=>({items:[{str:'x'.repeat(2000001)}]})})};
    const promise=mode==='password'?Promise.reject(Object.assign(Error('secret/path'),{name:'PasswordException'})):Promise.resolve(fake);
    await assert.rejects(shared.readPdf(new Uint8Array([1]),{getDocument:()=>({promise,destroy:async()=>{destroyed=true;}})}),e=>e.code==='VALIDATION'&&!e.message.includes('secret'));assert.ok(destroyed);
  }
  assert.equal(require('../lib/pdf-document.cjs').prepareRecords,shared.prepareRecords);
});
