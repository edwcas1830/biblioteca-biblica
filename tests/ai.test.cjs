const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const core=require('../app/ai-core.js'),{AiService}=require('../lib/ai-service.cjs'),{Library}=require('../lib/library.cjs');
const {installPublicPackage}=require('../lib/free-package.cjs');

test('Fuentes libres declaran permiso y envían atribución, procedencia y licencia sin textos privados',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'biblia-ai-open-')),appRoot=path.join(__dirname,'..');
  installPublicPackage(root,appRoot);
  const library=new Library({root,resources:path.join(root,'resources'),appRoot});
  t.after(()=>{library.close();fs.rmSync(root,{recursive:true,force:true});});
  const catalog=await library.catalog();
  for(const id of ['rv1909','onbv2008','step-greek','step-hebrew']){
    const m=catalog.modules.find(m=>m.id===id);assert.equal(m.iaPermitida,true);assert.ok(m.atribucion);assert.match(m.origen,/^https:/);
  }
  for(const module of ['rv1909','onbv2008']){
    const context=library.aiContext({module,book:42,chapter:3,verse:16,includeBible:true});
    assert.equal(context.notices.length,0);assert.equal(context.sources.length,1);
    const source=context.sources[0],prepared=core.prepare({task:'explain',context});
    for(const value of [source.license,source.attribution,source.origin])assert.ok(prepared.prompt.includes(value));
    if(module==='onbv2008')assert.match(prepared.prompt,/https:\/\/creativecommons.org\/licenses\/by-sa\/4.0\//);
    assert.equal(library.verifyAiSources(prepared.sources),true);
  }
  const merged=library.aiContext({module:'onbv2008',book:0,chapter:1,verse:12,includeBible:true});
  assert.ok(merged.sources[0].text.length>20,'El versículo contenido en un rango unido también aporta su texto');
  library.modules.get('rv1909').iaPermitida=false;
  assert.equal(library.aiContext({book:42,chapter:3,verse:16,includeBible:true}).sources.length,0);
  assert.throws(()=>library.verifyAiSources([{module:'rv1909',revision:library.get('rv1909').sha256}]),/permiso/);
});
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
test('Modelos gratis mantienen precio cero y rechazan modelos fuera del catálogo; errores recuperables',async()=>{
  assert.deepEqual(core.freeModels([{id:'qwen/test:free',pricing:{prompt:'0',completion:'0'}},{id:'paid',pricing:{prompt:'1',completion:'1'}}]).map(m=>m.id),['qwen/test:free']);
  let request;const service=setup({fetchImpl:async(url,options)=>{request=JSON.parse(options.body);return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({text:'Una observación.',citations:[{book:42,chapter:3,verse:16},{book:99,chapter:1,verse:1}]})}}]}));}});service.store(token);
  const response=await service.ask({prompt:'Una pregunta'});assert.equal(request.provider.max_price.prompt,0);assert.equal(request.provider.data_collection,'deny');assert.equal(response.citations.length,1);await assert.rejects(()=>service.ask({model:'paid',prompt:'x'}),{code:'VALIDATION'});
  service.fetch=async()=>new Response('',{status:429});await assert.rejects(()=>service.ask({prompt:'x'}),/límite/);assert.equal(service.busy,false);
  const insecure=setup({safeStorage:{isEncryptionAvailable:()=>false}});await assert.rejects(()=>insecure.connect(),/proteger/);assert.throws(()=>insecure.store(token),/proteger/);
});
test('Contexto elegido excluye notas y comentarios personales sin permiso; citas y enlaces usan referencias locales',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'biblia-ai-sources-')),library=new Library({root,resources:path.join(root,'resources'),appRoot:path.join(__dirname,'..')});t.after(()=>library.close());await library.catalog();
  library.modules.set('private-comment',{id:'private-comment',tipo:'comentario',titulo:'Privado',sha256:'a'.repeat(64)});
  const context=library.aiContext({book:42,chapter:3,verse:16,includeBible:true,includeComment:true,comment:'private-comment'});assert.equal(context.sources.length,1);assert.equal(context.sources[0].module,'rv1909');assert.equal(context.notices.length,1);
  const prompt=core.prepare({task:'explain',context,question:'¿Qué debo observar?',notes:'NO ENVIAR ESTO'});assert.doesNotMatch(prompt.prompt,/NO ENVIAR ESTO/);assert.match(prompt.prompt,/<FUENTE_1>/);assert.throws(()=>core.prepare({task:'summary',context}),/permiso/);
  assert.equal(core.external('chatgpt',prompt.prompt),'https://chatgpt.com/');assert.match(core.external('claude','Pregunta breve'),/^https:\/\/claude.ai\/new\?q=/);assert.throws(()=>core.external('__proto__','x'),/Proveedor/);
  const series=library.aiSeriesContext({series:{topic:'paz',minutes:15,days:5,method:'oia',mode:'couple'},includeBible:true});assert.equal(series.sources.length,5);assert.equal(library.verifyAiSources(series.sources),true);assert.match(core.prepare({task:'draft',context:series}).prompt,/exactamente 5 días/);assert.equal(series.series.participants,2);
});
