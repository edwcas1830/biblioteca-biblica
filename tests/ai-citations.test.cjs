'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const citations=require('../shared/ai-citations.js'),or=require('../platform/ai/openrouter.js'),gemini=require('../platform/ai/gemini.js'),{AiService}=require('../lib/ai-service.cjs'),{PersonalAi,reply}=require('../lib/personal-ai.cjs');
const books=Array.from({length:66},(_,book)=>({name:'Libro '+book,chapters:Array.from({length:150},()=>176)}));books[18].chapters[22]=6;books[42].chapters[2]=36;
const selected=[{ref:'Sal 23:1'},{ref:'Juan 3:16'},{ref:'Ro 8:28'},{ref:'1 Corintios 13:4'}],expected=[{book:18,chapter:23,verse:1},{book:42,chapter:3,verse:16},{book:44,chapter:8,verse:28},{book:45,chapter:13,verse:4}];
test('Citas por nombre coinciden con el canon, no con índices desde uno; metadata y BIBLE.books funcionan',()=>{
  assert.deepEqual(citations.normalize(selected,books),expected);const bible=books.map(b=>({...b,chapters:b.chapters.map(n=>({length:n}))}));assert.deepEqual(citations.normalize(selected,bible),expected);
  assert.deepEqual(citations.normalize([{ref:'Juan 3:16-18'},{ref:'Jn 3:16-18'}],books),[{book:42,chapter:3,verse:16,endVerse:18}]);
});
test('Nombre inválido nunca cae al número; rechaza fuera del canon y no confía en textos del modelo',()=>{
  assert.deepEqual(citations.normalize([{ref:'Libro inexistente 3:16',book:43,chapter:3,verse:16},{ref:'Sal 23:7'},{ref:'Juan 3:37'},{ref:'Juan 999:1'}],books),[]);
  assert.deepEqual(citations.normalize([{ref:'Jn 3:16',book:43,chapter:3,verse:16,text:'INVENTADO'}],books),[expected[1]]);assert.deepEqual(citations.normalize(selected),[]);
  assert.deepEqual(citations.normalize([{book:42,chapter:3,verse:16,text:'INVENTADO'},{book:0,chapter:1,verse:1}],books),[expected[1],{book:0,chapter:1,verse:1}]);
});
test('Instrucción reemplaza ejemplo numérico y exige referencias por nombre',()=>{
  const actual=citations.instruction(require('../app/study-chat-core.js').instruction);assert.match(actual,/"citations":\[\{"ref":"Juan 3:16"\}\]/);assert.doesNotMatch(actual,/"book":42/);assert.match(actual,/No envíes índices numéricos/);
});
for(const kind of ['Android OpenRouter','Android Gemini','Windows OpenRouter','Windows Gemini'])test(kind+': convierte las citas reales reportadas y solicita nombres, sin clave real',async()=>{
  let sent;const content=JSON.stringify({text:'Observación',citations:selected});
  const prompt=require('../app/ai-core.js').prepare({task:'explain',study:true,context:{reference:'Juan 3:16',sources:[]}}).prompt;
  const fetchImpl=async(url,input)=>{
    if(url.includes('/models?'))return Response.json({models:[{name:'models/gemini-flash-latest',supportedGenerationMethods:['generateContent']}]});
    sent=JSON.parse(input.body);return url.includes(':generateContent')?Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:content}]}}]}):Response.json({choices:[{message:{content}}]});
  };
  let api,result;
  if(kind==='Android OpenRouter'){api=or.create({books,fetchImpl,credentialStore:{leer:async()=> 'sk-or-'+'x'.repeat(40),guardar:async()=>{},borrar:async()=>{}}});await api.ready;result=await api.ask({prompt,study:true});}
  if(kind==='Android Gemini'){api=gemini.create({books,fetchImpl,credentialStore:{leer:async()=> 'AQ.'+'x'.repeat(50),guardar:async()=>{},borrar:async()=>{}}});await api.ready;result=await api.ask({prompt,model:'gemini-flash-latest',study:true});}
  if(kind==='Windows OpenRouter'){api=new AiService({root:'.',books,fetchImpl});api.key=()=> 'sk-or-'+'x'.repeat(40);result=await api.ask({prompt,study:true});}
  if(kind==='Windows Gemini'){api=new PersonalAi({root:'.',books,policy:async()=>({available:true,default:true}),fetchImpl});api.key=()=> 'AQ.'+'x'.repeat(50);result=await api.ask({provider:'gemini-api',model:'gemini-flash-latest',prompt,study:true});}
  assert.deepEqual(result.citations,expected);assert.match(JSON.stringify(sent),/No envíes índices numéricos/);assert.doesNotMatch(JSON.stringify(sent),/\\"book\\":42/);if(kind.startsWith('Android'))await api.close();
});
test('Parser de CLI mantiene referencias antiguas y convierte las nuevas sin desplazar libro',()=>{
  const answer=reply(JSON.stringify({text:'Respuesta',citations:selected}),'Claude',undefined,books);assert.deepEqual(answer.citations,expected);
  assert.deepEqual(reply(JSON.stringify({text:'Respuesta',citations:[{book:42,chapter:3,verse:16}]}),'Claude').citations,[expected[1]]);
});
