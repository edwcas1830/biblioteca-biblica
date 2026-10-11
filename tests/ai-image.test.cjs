'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm'),zlib=require('node:zlib');
const images=require('../shared/ai-image.js'),mobile=require('../platform/ai/openrouter.js'),services=require('../platform/ai/service.js'),contract=require('../platform/bridge-contract.js'),{AiService}=require('../lib/ai-service.cjs');
const token='sk-or-v1-'+'s'.repeat(64),selection={prompt:'Una montaña tranquila al amanecer',aspect:'4:5'};
function chunk(type,data){const name=Buffer.from(type),value=Buffer.concat([name,data]);let crc=0xffffffff;for(const byte of value){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}const head=Buffer.alloc(4),tail=Buffer.alloc(4);head.writeUInt32BE(data.length);tail.writeUInt32BE((crc^0xffffffff)>>>0);return Buffer.concat([head,value,tail]);}
const header=Buffer.alloc(13);header.writeUInt32BE(1,0);header.writeUInt32BE(1,4);header[8]=8;header[9]=6;
const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(Buffer.from([0,200,180,140,255]))),chunk('IEND',Buffer.alloc(0))]);
const dataUrl='data:image/png;base64,'+png.toString('base64');
const reply=(value={choices:[{finish_reason:'stop',message:{images:[{image_url:{url:dataUrl}}],content:'Texto del proveedor que no se publica'}}]},status=200,headers={})=>new Response(JSON.stringify(value),{status,headers});
async function fixture(t,kind,{fetchImpl=async()=>reply(),connected=true}={}){
  if(kind==='Android'){
    const provider=mobile.create({fetchImpl,credentialStore:{leer:async()=>connected?token:null,guardar:async()=>{},borrar:async()=>{}}});await provider.ready;t.after(()=>provider.close());return provider;
  }
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'biblia-image-test-'));
  const provider=new AiService({root,fetchImpl,openExternal:async()=>{},safeStorage:{isEncryptionAvailable:()=>true,encryptString:v=>Buffer.from('fixture:'+v),decryptString:v=>v.toString().slice(8)}});
  t.after(()=>{provider.stop();const absolute=path.resolve(root);if(!absolute.startsWith(path.resolve(os.tmpdir())+path.sep)||!path.basename(absolute).startsWith('biblia-image-test-'))throw Error('Perfil de prueba inválido');fs.rmSync(absolute,{recursive:true,force:true});});
  if(connected)provider.store(token);return provider;
}
for(const kind of ['Windows','Android']){
  test(kind+': background uses existing account, fixed image model/aspect and sends no implicit study context',async t=>{
    const requests=[],provider=await fixture(t,kind,{fetchImpl:async(url,input)=>{requests.push({url,input});return reply();}});
    for(const aspect of ['4:5','1:1','9:16'])assert.deepEqual(await provider.image({...selection,aspect}),{dataUrl,model:images.MODEL,...images.estimate()});
    assert.equal(requests.length,3);
    for(const {url,input}of requests){
      assert.equal(url,'https://openrouter.ai/api/v1/chat/completions');assert.equal(input.headers.Authorization,'Bearer '+token);assert.equal(input.redirect,'error');assert.equal(input.credentials,'omit');
      const body=JSON.parse(input.body);assert.equal(body.model,images.MODEL);assert.deepEqual(body.modalities,['image','text']);assert.equal(body.stream,false);assert.equal(body.max_tokens,2048);assert.equal(body.provider.allow_fallbacks,false);assert.equal(body.provider.data_collection,'deny');assert.equal(body.provider.max_price,undefined,'Image request must not be silently limited to free text pricing');
      assert.match(body.messages[0].content,/exactamente UNA/);assert.match(body.messages[0].content,/No dibujes texto/);assert.equal(body.messages[1].content,selection.prompt);assert.deepEqual(Object.keys(body.image_config),['aspect_ratio','image_size']);assert.equal(body.image_config.image_size,'1K');assert.match(body.messages[0].content,/sin representar a Dios/);assert.doesNotMatch(input.body,/sk-or-|sources|history|notes|prayer|tools/);
    }
  });
  test(kind+': invalid input and absent account perform no HTTP request',async t=>{
    let calls=0;const provider=await fixture(t,kind,{connected:false,fetchImpl:async()=>{calls++;return reply();}});
    for(const input of [null,{}, {...selection,prompt:''},{...selection,prompt:' '.repeat(600)},{...selection,prompt:'x'.repeat(601)},{...selection,aspect:'16:9'},{...selection,notes:'NO ENVIAR'},{...selection,model:'paid-other'}])await assert.rejects(provider.image(input),{code:'VALIDATION'});
    await assert.rejects(provider.image(selection),{code:'UNAVAILABLE'});assert.equal(calls,0);
  });
  test(kind+': HTTP errors, quota and provider bodies never expose secrets or auto-retry',async t=>{
    for(const [status,code]of [[401,'LOCKED'],[403,'LOCKED'],[402,'QUOTA'],[429,'QUOTA'],[400,'UNAVAILABLE'],[503,'UNAVAILABLE']]){
      let calls=0;const provider=await fixture(t,kind,{fetchImpl:async()=>{calls++;return reply({error:{message:token+' PRIVATE'}},status);}});
      await assert.rejects(provider.image(selection),e=>e.code===code&&!e.message.includes(token)&&!e.message.includes('PRIVATE'));assert.equal(calls,1);assert.equal(provider.busy||false,false);
    }
    const offline=await fixture(t,kind,{fetchImpl:async()=>{throw Error(token+' raw transport');}});await assert.rejects(offline.image(selection),e=>e.code==='UNAVAILABLE'&&!e.message.includes(token));
    const embedded=await fixture(t,kind,{fetchImpl:async()=>reply({error:{code:402,message:token}})});await assert.rejects(embedded.image(selection),{code:'QUOTA'});
  });
  test(kind+': integrated PNG/JPEG validation rejects links, SVG, bad base64, incomplete files and pixel bombs without fetching them',async t=>{
    const huge=Buffer.from(png);huge.writeUInt32BE(65535,16);
    for(const [url,code]of [['https://private.invalid/image.png','CORRUPT'],['data:image/svg+xml;base64,PHN2Zz4=','CORRUPT'],['data:image/jpeg;base64,/9j/','CORRUPT'],['data:image/png;base64,@@@@','CORRUPT'],['data:image/png;base64,'+png.subarray(0,-5).toString('base64'),'CORRUPT'],['data:image/png;base64,'+huge.toString('base64'),'QUOTA'],['data:image/png;base64,'+'A'.repeat(Math.ceil(images.MAX_IMAGE/3)*4+4),'QUOTA']]){
      let calls=0;const provider=await fixture(t,kind,{fetchImpl:async()=>{calls++;return reply({choices:[{message:{images:[{image_url:{url}}]}}]});}});await assert.rejects(provider.image(selection),{code});assert.equal(calls,1);
    }
  });
  test(kind+': response caps apply both to announced size and chunked bytes',async t=>{
    const announced=await fixture(t,kind,{fetchImpl:async()=>reply(undefined,200,{'content-length':String(images.MAX_RESPONSE+1)})});await assert.rejects(announced.image(selection),{code:'QUOTA'});
    let cancelled=false;
    const provider=await fixture(t,kind,{fetchImpl:async()=>new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array(images.MAX_RESPONSE));c.enqueue(new Uint8Array(1));},cancel(){cancelled=true;}}))});
    await assert.rejects(provider.image(selection),{code:'QUOTA'});assert.equal(cancelled,true);
    const malformed=await fixture(t,kind,{fetchImpl:async()=>new Response('not JSON '+token)});await assert.rejects(malformed.image(selection),e=>e.code==='CORRUPT'&&!e.message.includes(token));
  });
  test(kind+': refusal, text-only, multiple images and truncation do not produce a background',async t=>{
    for(const value of [{choices:[{message:{content:'Sin imagen'}}]},{choices:[{message:{refusal:'PRIVATE',images:[{image_url:{url:dataUrl}}]}}]},{choices:[{finish_reason:'length',message:{images:[{image_url:{url:dataUrl}}]}}]},{choices:[{message:{images:[{image_url:{url:dataUrl}},{image_url:{url:dataUrl}}]}}]}]){
      const provider=await fixture(t,kind,{fetchImpl:async()=>reply(value)});await assert.rejects(provider.image(selection),e=>e.code==='UNAVAILABLE'&&!e.message.includes('PRIVATE'));
    }
  });
  test(kind+': cancellation/disconnect discard a late image, and text shares the same busy slot',async t=>{
    let release;const provider=await fixture(t,kind,{fetchImpl:()=>new Promise(resolve=>release=()=>resolve(reply()))});
    const pending=provider.image(selection);await new Promise(r=>setImmediate(r));assert.ok(release);
    await assert.rejects(provider.image(selection),{code:'CONFLICT'});await assert.rejects(provider.ask({prompt:'Otra pregunta'}));
    if(kind==='Android')provider.cancel();else provider.controller.abort();release();await assert.rejects(pending,{code:'CANCELLED'});
    const late=provider.image(selection);await new Promise(r=>setImmediate(r));await provider.disconnect();release();await assert.rejects(late,{code:'CANCELLED'});
  });
  test(kind+': a lock check beforeSend aborts generation before transmitting the prompt',async t=>{
    let calls=0;const provider=await fixture(t,kind,{fetchImpl:async()=>{calls++;return reply();}});
    await assert.rejects(provider.image(selection,{beforeSend:()=>{throw new images.ImageError('LOCKED','Cuaderno bloqueado');}}),{code:'LOCKED'});assert.equal(calls,0);
  });
}
test('aiImage bridge capability is additive, validates input, and service cancels on lock/epoch without reading notes',async t=>{
  let locked=false,epoch=0,release,privateReads=0;
  const svc=services.create({epoch:()=>epoch,credentialStore:{leer:async name=>name==='openrouter'?token:null,guardar:async()=>{},borrar:async()=>{}},call:async name=>{if(name==='privacyStatus')return {locked};if(name==='catalog')return {modules:[]};privateReads++;throw Error('No source or private data should be read');},fetchImpl:()=>new Promise(r=>release=()=>r(reply()))});t.after(()=>svc.close());
  const adapter=contract.createBridge();assert.equal((await adapter.bridge.getCapabilities()).operations.aiImage.available,false);adapter.register(svc.handlers());assert.equal((await adapter.bridge.getCapabilities()).operations.aiImage.available,true);
  await assert.rejects(adapter.bridge.aiImage({...selection,prompt:'x'.repeat(601)}),{code:'VALIDATION',operation:'aiImage'});
  locked=true;await assert.rejects(adapter.bridge.aiImage(selection),{code:'LOCKED'});assert.equal(release,undefined);locked=false;
  const late=adapter.bridge.aiImage(selection);await new Promise(r=>setImmediate(r));epoch++;release();await assert.rejects(late,{code:'CONFLICT'});assert.equal(privateReads,0);
  const pending=adapter.bridge.aiImage(selection);await new Promise(r=>setImmediate(r));adapter.bridge.aiCancel();release();await assert.rejects(pending,{code:'CANCELLED'});
});
test('Desktop preload unwraps image success/errors and capability without leaking IPC internals',async()=>{
  let bridge,call;
  const sandbox={require:()=>({contextBridge:{exposeInMainWorld:(_name,value)=>bridge=value},ipcRenderer:{invoke:async(name,input)=>{call={name,input};return name==='library:capabilities'?{operations:{aiImage:{available:true}}}:{ok:true,value:{dataUrl,model:images.MODEL}};}}}),process:{argv:[]}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../preload.cjs'),'utf8'),sandbox);
  assert.equal((await bridge.getCapabilities()).operations.aiImage.available,true);assert.deepEqual(await bridge.aiImage(selection),{dataUrl,model:images.MODEL});assert.equal(call.name,'library:ai-image');assert.equal(call.input,selection);
  sandbox.require=()=>({contextBridge:{exposeInMainWorld:(_name,value)=>bridge=value},ipcRenderer:{invoke:async()=>({ok:false,error:{code:'QUOTA',message:'Saldo insuficiente'}})}});
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../preload.cjs'),'utf8'),{require:sandbox.require,process:{argv:[]}});await assert.rejects(bridge.aiImage(selection),{code:'QUOTA',operation:'aiImage',message:'Saldo insuficiente'});
  const packaged=JSON.parse(fs.readFileSync(path.join(__dirname,'../package.json'),'utf8')).build.files;assert.ok(packaged.includes('platform/bridge-contract.js'));assert.ok(packaged.includes('shared/**/*.js'));
});
