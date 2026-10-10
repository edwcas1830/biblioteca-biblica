// Crypto runs only in a local Worker. No network, storage or keys returned to the page.
const bytes=new TextEncoder(),text=new TextDecoder('utf-8',{fatal:true}),aad=bytes.encode('biblioteca-privada-v1');
const fail=(code,message)=>{throw Object.assign(Error(message),{code});};
const hex=b=>Array.from(b,n=>n.toString(16).padStart(2,'0')).join('');
const unhex=s=>Uint8Array.from(s.match(/../g),h=>parseInt(h,16));
const base64=b=>{let s='';for(let i=0;i<b.length;i+=8192)s+=String.fromCharCode(...b.subarray(i,i+8192));return btoa(s);};
const unbase64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
function envelope(e){
  if(!e||e.v!==1||!/^[a-f0-9]{32}$/.test(e.salt)||!/^[a-f0-9]{24}$/.test(e.iv)||!/^[a-f0-9]{32}$/.test(e.tag)||typeof e.data!=='string'||!e.data.length||e.data.length>16000000||e.data.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(e.data))fail('CORRUPT','El cuaderno cifrado no es compatible.');return e;
}
export function create({scrypt,crypto=globalThis.crypto}={}){
  const sessions=new Map();
  function get(id){if(!sessions.has(id))fail('LOCKED','Abre tu cuaderno antes de cambiarlo.');return sessions.get(id);}
  function discard(id){sessions.get(id)?.key.fill(0);sessions.delete(id);}
  async function derive(pin,salt){
    if(typeof pin!=='string'||!/^\d{6,12}$/.test(pin))fail('VALIDATION','Usa un PIN de 6 a 12 cifras.');
    const password=bytes.encode(pin),saltBytes=unhex(salt);
    try{return scrypt(password,saltBytes,{N:32768,r:8,p:1,dkLen:32,maxmem:64*1024*1024});}finally{password.fill(0);saltBytes.fill(0);}
  }
  async function crypt(key,data,iv,decrypt=false){
    const imported=await crypto.subtle.importKey('raw',key,{name:'AES-GCM'},false,[decrypt?'decrypt':'encrypt']);
    return new Uint8Array(await crypto.subtle[decrypt?'decrypt':'encrypt']({name:'AES-GCM',iv,additionalData:aad,tagLength:128},imported,data));
  }
  async function encrypt(session,part){
    const {key,salt}=get(session),iv=crypto.getRandomValues(new Uint8Array(12));let raw;
    try{const source=JSON.stringify(part);if(!source||source.length>12000000)fail('VALIDATION','El cuaderno supera el tamaño admitido.');raw=bytes.encode(source);const cipher=await crypt(key,raw,iv);return {v:1,salt,iv:hex(iv),tag:hex(cipher.subarray(-16)),data:base64(cipher.subarray(0,-16))};}
    finally{raw?.fill(0);}
  }
  async function decrypt(key,e){
    envelope(e);let plain;
    try{const data=unbase64(e.data),joined=new Uint8Array(data.length+16);joined.set(data);joined.set(unhex(e.tag),data.length);plain=await crypt(key,joined,unhex(e.iv),true);return JSON.parse(text.decode(plain));}
    catch{fail('LOCKED','PIN incorrecto o copia cifrada dañada.');}finally{plain?.fill(0);}
  }
  return Object.freeze({
    async execute(name,value){
      if(name==='ready'){if(!crypto?.subtle||typeof scrypt!=='function')fail('UNAVAILABLE','El dispositivo no dispone de cifrado local.');return {ready:true};}
      if(name==='discard'){discard(value);return true;}
      if(name==='lock'){for(const id of [...sessions.keys()])discard(id);return true;}
      if(name==='create'||name==='unlock'){
        if(sessions.size>=2)fail('CONFLICT','Termina el cambio de candado anterior.');
        const salt=name==='create'?hex(crypto.getRandomValues(new Uint8Array(16))):envelope(value.vault).salt,key=await derive(value.pin,salt),session=hex(crypto.getRandomValues(new Uint8Array(16)));
        try{const part=name==='unlock'?await decrypt(key,value.vault):value.part;sessions.set(session,{key,salt});return name==='create'?{session,vault:await encrypt(session,part)}:{session,part};}
        catch(e){key.fill(0);sessions.delete(session);throw e;}
      }
      if(name==='encrypt')return encrypt(value.session,value.part);
      if(name==='decrypt'){const {key,salt}=get(value.session);if(envelope(value.vault).salt!==salt)fail('LOCKED','Recarga y abre el candado de esta biblioteca.');return decrypt(key,value.vault);}
      fail('VALIDATION','Operación de candado no válida.');
    }
  });
}
