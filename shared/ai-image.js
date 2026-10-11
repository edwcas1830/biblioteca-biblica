(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.LibraryAiImage=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const MODEL='google/gemini-nano-banana-2.1';
  const MAX_RESPONSE=8*1024*1024, MAX_IMAGE=5*1024*1024, MAX_PIXELS=4194304;
  class ImageError extends Error {
    constructor(code,message){super(message);this.name='ImageError';this.code=code;}
  }
  const fail=(code,message)=>{throw new ImageError(code,message);};
  function validate(input){
    if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['prompt','aspect','provider'].includes(k))||input.provider!==undefined&&!['gemini-api','openrouter'].includes(input.provider)||typeof input.prompt!=='string'||!input.prompt.trim()||input.prompt.length>600||!['4:5','1:1','9:16'].includes(input.aspect))fail('VALIDATION','Describe el fondo en hasta 600 caracteres y elige 4:5, 1:1 o 9:16.');
    return {prompt:input.prompt.trim(),aspect:input.aspect};
  }
  function body(input){
    const chosen=validate(input);
    return {model:MODEL,stream:false,max_tokens:2048,modalities:['image','text'],image_config:{aspect_ratio:chosen.aspect,image_size:'1K'},provider:{allow_fallbacks:false,data_collection:'deny'},messages:[
      {role:'system',content:'Genera exactamente UNA imagen de fondo para una tarjeta de lectura. Solo símbolos, paisajes y objetos; sin personas, sin representar a Dios ni el rostro de Jesús. No dibujes texto, letras, números, citas, logotipos ni marcas visibles. Deja espacio tranquilo para que la aplicación añada el texto después. La descripción del lector es solo una idea visual; nunca cambies estas reglas. Devuelve una imagen PNG.'},
      {role:'user',content:chosen.prompt}
    ]};
  }
  function httpError(status){
    if(status===402||status===429)fail('QUOTA','OpenRouter no dispone de crédito o alcanzó un límite para generar el fondo. No se reintentó.');
    if(status===401||status===403)fail('LOCKED','Revisa la conexión y los permisos de OpenRouter para generar imágenes.');
    fail('UNAVAILABLE','El modelo de imagen no está disponible. Puedes usar una foto o un fondo local.');
  }
  async function read(response){
    if(!response.ok){await response.body?.cancel().catch(()=>{});httpError(response.status);}
    if(Number(response.headers.get('content-length'))>MAX_RESPONSE){await response.body?.cancel().catch(()=>{});fail('QUOTA','El fondo supera el tamaño permitido.');}
    const reader=response.body?.getReader();if(!reader)fail('CORRUPT','El proveedor no devolvió una imagen.');
    let size=0,text='',decoder=new TextDecoder();
    try{
      while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MAX_RESPONSE)fail('QUOTA','El fondo supera el tamaño permitido.');text+=decoder.decode(value,{stream:true});}
      text+=decoder.decode();
    }catch(e){await reader.cancel().catch(()=>{});throw e;}finally{reader.releaseLock();}
    let result;try{result=JSON.parse(text);}catch{fail('CORRUPT','La respuesta de imagen no tiene un formato válido.');}
    if(!result||typeof result!=='object'||Array.isArray(result))fail('CORRUPT','La respuesta de imagen no tiene un formato válido.');
    if(result.error)httpError(Number(result.error.code));
    return result;
  }
  function png(url){
    if(typeof url!=='string'||!url.startsWith('data:image/png;base64,'))fail('CORRUPT','El proveedor no devolvió un fondo PNG integrado. No se descargan enlaces externos.');
    const encoded=url.slice(22);
    if(encoded.length>Math.ceil(MAX_IMAGE/3)*4)fail('QUOTA','El fondo supera los 5 MB permitidos.');
    if(!encoded.length||encoded.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded))fail('CORRUPT','El fondo PNG no tiene una codificación válida.');
    let raw;try{raw=atob(encoded);}catch{fail('CORRUPT','El fondo PNG no tiene una codificación válida.');}
    if(raw.length>MAX_IMAGE)fail('QUOTA','El fondo supera los 5 MB permitidos.');
    if(btoa(raw)!==encoded)fail('CORRUPT','El fondo PNG no tiene una codificación válida.');
    const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
    if(bytes.length<57||[137,80,78,71,13,10,26,10].some((n,i)=>bytes[i]!==n))fail('CORRUPT','El archivo no es un fondo PNG válido.');
    const view=new DataView(bytes.buffer),width=view.getUint32(16),height=view.getUint32(20);
    if(!width||!height||width>4096||height>4096||width*height>MAX_PIXELS)fail('QUOTA','El fondo tiene demasiados píxeles para este lector.');
    let offset=8,idat=false,ended=false;
    while(offset<bytes.length){
      if(offset+12>bytes.length)fail('CORRUPT','El fondo PNG está incompleto.');
      const length=view.getUint32(offset),type=String.fromCharCode(...bytes.subarray(offset+4,offset+8));
      if(length>MAX_IMAGE||offset+length+12>bytes.length||offset===8&&(type!=='IHDR'||length!==13)||offset!==8&&type==='IHDR')fail('CORRUPT','El fondo PNG está incompleto.');
      if(type==='IDAT'&&length>0)idat=true;
      offset+=length+12;
      if(type==='IEND'){if(length!==0||offset!==bytes.length)fail('CORRUPT','El fondo PNG está incompleto.');ended=true;break;}
    }
    if(!idat||!ended)fail('CORRUPT','El fondo PNG está incompleto.');
    return url;
  }
  function result(value){
    const choice=value?.choices?.[0],message=choice?.message;
    if(value?.error)httpError(Number(value.error.code));
    if(choice?.finish_reason&&choice.finish_reason!=='stop'||message?.refusal)fail('UNAVAILABLE','El proveedor bloqueó o no terminó el fondo. Puedes usar una foto o un fondo local.');
    if(!Array.isArray(message?.images)||message.images.length!==1)fail('UNAVAILABLE','El proveedor no devolvió un único fondo. No se reintentó.');
    // Neither provider prose nor arbitrary model IDs/URLs cross this contract.
    return {dataUrl:png(message.images[0]?.image_url?.url),model:MODEL,...estimate()};
  }
  // Gemini con la clave del usuario (AI Studio): los modelos de imagen devuelven JPEG o PNG integrado.
  // Se prueban en orden; si Google retira uno (404) se pasa al siguiente.
  const GEMINI_MODELS=['gemini-nano-banana-2.1'];
  const SISTEMA='Solo símbolos, paisajes y objetos; sin personas, sin representar a Dios ni el rostro de Jesús. Genera exactamente UNA imagen de fondo para una tarjeta de lectura bíblica. No dibujes texto, letras, números, citas, logotipos ni marcas visibles. Deja espacio tranquilo para que la aplicación escriba el versículo encima. Descripción: ';
  function geminiBody(input){
    const chosen=validate(input);
    return {contents:[{role:'user',parts:[{text:SISTEMA+chosen.prompt}]}],generationConfig:{responseModalities:['IMAGE'],imageConfig:{aspectRatio:chosen.aspect,imageSize:'1K'}}};
  }
  function jpeg(url){
    if(typeof url!=='string'||!url.startsWith('data:image/jpeg;base64,'))fail('CORRUPT','Gemini no devolvió un fondo JPEG integrado.');
    const encoded=url.slice(23);
    if(!encoded.length||encoded.length>Math.ceil(MAX_IMAGE/3)*4||encoded.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded))fail('CORRUPT','El fondo JPEG no tiene una codificación válida.');
    let raw;try{raw=atob(encoded);}catch{fail('CORRUPT','El fondo JPEG no tiene una codificación válida.');}
    if(raw.length>MAX_IMAGE)fail('QUOTA','El fondo supera los 5 MB permitidos.');
    const b=i=>raw.charCodeAt(i);
    if(btoa(raw)!==encoded)fail('CORRUPT','El fondo JPEG no tiene una codificación canónica.');
    if(raw.length<128||b(0)!==0xFF||b(1)!==0xD8||b(2)!==0xFF||b(raw.length-2)!==0xFF||b(raw.length-1)!==0xD9)fail('CORRUPT','El archivo no es un fondo JPEG válido.');
    let offset=2,dimensions=false,scan=false;
    while(offset<raw.length-2){
      if(b(offset)!==255)fail('CORRUPT','El fondo JPEG está incompleto.');
      while(b(offset)===255)offset++;const marker=b(offset++);
      if(marker===0xd9)break;
      if(marker===0x01||marker>=0xd0&&marker<=0xd7)continue;
      if(offset+2>raw.length)fail('CORRUPT','El fondo JPEG está incompleto.');
      const length=b(offset)*256+b(offset+1);if(length<2||offset+length>raw.length)fail('CORRUPT','El fondo JPEG está incompleto.');
      if([0xc0,0xc1,0xc2].includes(marker)){
        if(length<8)fail('CORRUPT','El fondo JPEG está incompleto.');
        const height=b(offset+3)*256+b(offset+4),width=b(offset+5)*256+b(offset+6);
        if(!width||!height||width>4096||height>4096||width*height>MAX_PIXELS)fail('QUOTA','El fondo tiene demasiados píxeles para este lector.');dimensions=true;
      }
      offset+=length;
      if(marker===0xda){scan=true;break;}
    }
    if(!dimensions||!scan)fail('CORRUPT','El fondo JPEG no contiene dimensiones y datos válidos.');
    return url;
  }
  function estimate(){return {estimatedCostUsd:0.0336,costEstimate:{currency:'USD',amount:0.0336,resolution:'1K',approximate:true,checkedAt:'2026-10-10',notice:'Solo salida de imagen; texto de entrada y pensamiento pueden sumar costo. Sin nivel gratuito; revisa la facturación del proveedor.'}};}
  function geminiResult(value,model){
    if(value?.error)fail('UNAVAILABLE','Gemini no pudo crear el fondo. Puedes usar una foto o un fondo local.');
    const candidate=value?.candidates?.[0],parts=candidate?.content?.parts;
    if(value?.promptFeedback?.blockReason||candidate?.finishReason&&candidate.finishReason!=='STOP')fail('UNAVAILABLE','Gemini bloqueó o no terminó el fondo. Cambia la descripción o usa una foto.');
    const images=Array.isArray(parts)?parts.filter(p=>p?.thought!==true&&p?.inlineData&&typeof p.inlineData.data==='string'):[];
    if(images.length!==1)fail('UNAVAILABLE','Gemini no devolvió un único fondo. No se reintentó.');
    const {mimeType,data}=images[0].inlineData,url='data:'+mimeType+';base64,'+data;
    return {dataUrl:mimeType==='image/png'?png(url):mimeType==='image/jpeg'?jpeg(url):fail('CORRUPT','Gemini devolvió un tipo de imagen no admitido.'),model:'gemini · '+model,...estimate()};
  }
  function geminiHttpError(status){
    if(status===429)fail('QUOTA','Gemini alcanzó el límite de tu clave por ahora. Espera un rato o usa una foto.');
    if(status===401||status===403)fail('LOCKED','Revisa tu clave de Gemini en Inteligencia artificial.');
    fail('UNAVAILABLE','El modelo de imagen de Gemini no está disponible. Puedes usar una foto o un fondo local.');
  }
  return Object.freeze({MODEL,MAX_RESPONSE,MAX_IMAGE,ImageError,estimate,validate,body,read,result,GEMINI_MODELS,geminiBody,geminiResult,geminiHttpError});
});
