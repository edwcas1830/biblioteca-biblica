const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const core=require('../app/ai-core.js'),{AiService}=require('../lib/ai-service.cjs'),{Library}=require('../lib/library.cjs');
const token='sk-or-v1-'+ 'a'.repeat(64),storage={isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from('encrypted:'+Buffer.from(s).toString('base64')),decryptString:b=>Buffer.from(b.toString().slice(10),'base64').toString()};
const setup=(options={})=>new AiService({root:fs.mkdtempSync(path.join(os.tmpdir(),'biblia-ai-')),safeStorage:storage,openExternal:async()=>{},...options});
test('OAuth local usa PKCE S256, ruta impredecible, rechaza callbacks ajenos y no expone el token',async t=>{
  let opened,exchange;const service=setup({openExternal:async url=>opened=new URL(url),fetchImpl:async(url,options)=>{exchange=JSON.parse(options.body);return new Response(JSON.stringify({key:token}),{headers:{'Content-Type':'application/json'}});}});t.after(()=>service.stop());
  await service.connect();const callback=new URL(opened.searchParams.get('callback_url'));assert.equal(callback.hostname,'127.0.0.1');assert.match(callback.pathname,/^\/oauth\/[a-f0-9]{48}$/);assert.equal(opened.searchParams.get('code_challenge_method'),'S256');
  const bad=new URL('/oauth/wrong',callback);assert.equal((await fetch(bad)).status,404);const wrong=new URL(callback);wrong.searchParams.set('code','abc');wrong.searchParams.set('state','other');assert.equal((await fetch(wrong)).status,404);
  callback.searchParams.set('code','code-from-account');assert.equal((await fetch(callback)).status,200);
  assert.equal(crypto.createHash('sha256').update(exchange.code_verifier).digest('base64url'),opened.searchParams.get('code_challenge'));assert.equal(service.status().connected,true);assert.equal(JSON.stringify(service.status()).includes(token),false);assert.equal(fs.readFileSync(service.file).includes(Buffer.from(token)),false);assert.equal(service.key(),token);service.disconnect();assert.equal(service.status().connected,false);
});
test('Desconectar durante un intercambio impide guardar una autorización tardía',async t=>{
  let opened,release;const service=setup({openExternal:async url=>opened=new URL(url),fetchImpl:()=>new Promise(resolve=>release=()=>resolve(new Response(JSON.stringify({key:token}))))});t.after(()=>service.stop());await service.connect();const callback=new URL(opened.searchParams.get('callback_url'));callback.searchParams.set('code','late-code');const request=fetch(callback);for(let i=0;i<500&&!release;i++)await new Promise(r=>setTimeout(r,5));assert.ok(release,'El callback no llegó al intercambio');service.disconnect();release();assert.equal((await request).status,400);assert.equal(service.status().connected,false);
});
test('Solo ofrece modelos gratis y limita precios; errores del proveedor son recuperables',async()=>{
  assert.deepEqual(core.freeModels([{id:'qwen/test:free',pricing:{prompt:'0',completion:'0'}},{id:'paid',pricing:{prompt:'1',completion:'1'}}]).map(m=>m.id),['qwen/test:free']);
  let request;const service=setup({fetchImpl:async(url,options)=>{request=JSON.parse(options.body);return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({text:'Una observación.',citations:[{book:42,chapter:3,verse:16},{book:99,chapter:1,verse:1}]})}}]}));}});service.store(token);
  const response=await service.ask({prompt:'Una pregunta'});assert.equal(request.provider.max_price.prompt,0);assert.equal(request.provider.data_collection,'deny');assert.equal(response.citations.length,1);await assert.rejects(()=>service.ask({model:'paid',prompt:'x'}),/gratuitos/);
  service.fetch=async()=>new Response('',{status:429});await assert.rejects(()=>service.ask({prompt:'x'}),/límite/);assert.equal(service.busy,false);
  const insecure=setup({safeStorage:{isEncryptionAvailable:()=>false}});await assert.rejects(()=>insecure.connect(),/proteger/);assert.throws(()=>insecure.store(token),/proteger/);
});
test('Contexto elegido excluye notas y comentarios personales sin permiso; citas y enlaces usan referencias locales',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'biblia-ai-sources-')),library=new Library({root,resources:path.join(root,'resources'),appRoot:path.join(__dirname,'..')});t.after(()=>library.close());await library.catalog();
  library.modules.set('private-comment',{id:'private-comment',tipo:'comentario',titulo:'Privado',sha256:'a'.repeat(64)});
  const context=library.aiContext({book:42,chapter:3,verse:16,includeBible:true,includeComment:true,comment:'private-comment'});assert.equal(context.sources.length,1);assert.equal(context.sources[0].module,'rv1909');assert.equal(context.notices.length,1);
  const prompt=core.prepare({task:'explain',context,question:'¿Qué debo observar?',notes:'NO ENVIAR ESTO'});assert.doesNotMatch(prompt.prompt,/NO ENVIAR ESTO/);assert.match(prompt.prompt,/<FUENTE_1>/);assert.throws(()=>core.prepare({task:'summary',context}),/permiso/);
  assert.equal(core.external('chatgpt',prompt.prompt),'https://chatgpt.com/');assert.match(core.external('claude','Pregunta breve'),/^https:\/\/claude.ai\/new\?q=/);assert.throws(()=>core.external('__proto__','x'),/Proveedor/);
});
