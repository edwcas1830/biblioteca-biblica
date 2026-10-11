(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(globalThis.crypto);
  else root.BibliaChatCripto=factory(root.crypto);
})(typeof globalThis!=='undefined'?globalThis:this,function(cripto){
  'use strict';
  // Conversación con Laura (CONSENSO-CHAT.md, unánime): WebCrypto P-256 sin dependencias.
  // ECDSA P-256/SHA-256 firma · ECDH P-256 efímero + HKDF-SHA256 envuelve · AES-256-GCM cifra.
  // El AAD ata versión, grupo, época, hilo, id y dispositivo; el cliente lo coteja con las columnas del servidor.
  const subtle=cripto&&cripto.subtle;
  if(!subtle)throw new Error('Este dispositivo no ofrece WebCrypto.');
  const V=1, enc=new TextEncoder(), dec=new TextDecoder();
  const ECDSA={name:'ECDSA',namedCurve:'P-256'}, ECDH={name:'ECDH',namedCurve:'P-256'}, FIRMA={name:'ECDSA',hash:'SHA-256'};
  const b64=bytes=>{let s='';const u=new Uint8Array(bytes);for(let i=0;i<u.length;i++)s+=String.fromCharCode(u[i]);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');};
  const deb64=t=>{if(typeof t!=='string'||!/^[A-Za-z0-9_-]*$/.test(t)||t.length%4===1)throw new Error('Base64 no válido.');let s;try{s=atob(t.replace(/-/g,'+').replace(/_/g,'/')+'==='.slice((t.length+3)%4));}catch{throw new Error('Base64 no válido.');}const u=new Uint8Array(s.length);for(let i=0;i<s.length;i++)u[i]=s.charCodeAt(i);if(b64(u)!==t)throw new Error('Base64 no canónico.');return u;};
  const J=partes=>enc.encode(JSON.stringify(partes));
  const unir=(...trozos)=>{const n=trozos.reduce((a,t)=>a+t.length,0),u=new Uint8Array(n);let o=0;for(const t of trozos){u.set(t,o);o+=t.length;}return u;};
  const azar=n=>cripto.getRandomValues(new Uint8Array(n));
  const sha=async datos=>new Uint8Array(await subtle.digest('SHA-256',datos));
  const falla=m=>{const e=new Error(m);e.code='CRIPTO';throw e;};
  const texto=(v,max)=>typeof v==='string'&&v.length>0&&v.length<=max;

  // Claves del dispositivo: firma y acuerdo. Las públicas van al servidor (SPKI); las privadas, al llavero (PKCS8).
  async function nuevasClaves(){
    const firma=await subtle.generateKey(ECDSA,true,['sign','verify']);
    const acuerdo=await subtle.generateKey(ECDH,true,['deriveBits']);
    return {
      publicas:{firma:b64(await subtle.exportKey('spki',firma.publicKey)),acuerdo:b64(await subtle.exportKey('spki',acuerdo.publicKey))},
      privadas:{firma:b64(await subtle.exportKey('pkcs8',firma.privateKey)),acuerdo:b64(await subtle.exportKey('pkcs8',acuerdo.privateKey))}
    };
  }
  // Al usarlas se importan NO exportables (en memoria; se descartan con el candado).
  const privadaFirma=pk=>subtle.importKey('pkcs8',deb64(pk),ECDSA,false,['sign']);
  const privadaAcuerdo=pk=>subtle.importKey('pkcs8',deb64(pk),ECDH,false,['deriveBits']);
  const publicaFirma=spki=>subtle.importKey('spki',deb64(spki),ECDSA,false,['verify']);
  const publicaAcuerdo=spki=>subtle.importKey('spki',deb64(spki),ECDH,false,[]);

  // Huella de un dispositivo (se fija tras comparar) y huella del par para leer en voz alta: 20 dígitos (5×4).
  async function huellaDispositivo(d){
    if(!texto(d.id,80)||!texto(d.firma,400)||!texto(d.acuerdo,400))falla('Dispositivo incompleto.');
    return b64(await sha(J(['bb/dispositivo',V,d.id,d.firma,d.acuerdo])));
  }
  async function huellaPar(a,b){
    const [x,y]=[a,b].sort((p,q)=>p.id<q.id?-1:p.id>q.id?1:0);
    const h=await sha(J(['bb/huella-par',V,await huellaDispositivo(x),await huellaDispositivo(y)]));
    let n=0n;for(const byte of h.slice(0,9))n=(n<<8n)|BigInt(byte);
    const digitos=(n%(10n**20n)).toString().padStart(20,'0');
    return digitos.match(/.{4}/g).join(' ');
  }

  const nuevaClaveGrupo=()=>b64(azar(32));

  // Envoltura de la clave de grupo para un dispositivo: ECDH efímero → HKDF → AES-GCM, firmada por el emisor.
  async function envolver({claveGrupo,grupo,epoca,para,de}){
    if(!Number.isInteger(epoca)||epoca<1)falla('Época no válida.');
    const efimera=await subtle.generateKey(ECDH,true,['deriveBits']);
    const q=b64(await subtle.exportKey('spki',efimera.publicKey)),salt=azar(32),n=azar(12);
    const fp=await huellaDispositivo(para);
    const aad=J(['bb/envoltura',V,grupo,epoca,para.id,de.id,fp,q,b64(salt)]);
    const secreto=await subtle.deriveBits({name:'ECDH',public:await publicaAcuerdo(para.acuerdo)},efimera.privateKey,256);
    const base=await subtle.importKey('raw',secreto,'HKDF',false,['deriveKey']);
    const clave=await subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt,info:aad},base,{name:'AES-GCM',length:256},false,['encrypt']);
    const c=new Uint8Array(await subtle.encrypt({name:'AES-GCM',iv:n,additionalData:aad},clave,deb64(claveGrupo)));
    const s=new Uint8Array(await subtle.sign(FIRMA,await privadaFirma(de.privadaFirma),unir(aad,n,c)));
    return JSON.stringify({v:V,q,salt:b64(salt),n:b64(n),c:b64(c),s:b64(s)});
  }
  async function desenvolver({envoltura,grupo,epoca,yo,de}){
    let e;try{e=JSON.parse(envoltura);}catch{falla('Envoltura ilegible.');}
    if(!e||e.v!==V||!texto(e.q,400))falla('Envoltura de otra versión.');
    const fp=await huellaDispositivo(yo);
    const aad=J(['bb/envoltura',V,grupo,epoca,yo.id,de.id,fp,e.q,e.salt]);
    const n=deb64(e.n),c=deb64(e.c);
    if(n.length!==12)falla('Nonce no válido.');
    if(!await subtle.verify(FIRMA,await publicaFirma(de.firma),deb64(e.s),unir(aad,n,c)))falla('La envoltura no la firmó ese dispositivo.');
    const secreto=await subtle.deriveBits({name:'ECDH',public:await subtle.importKey('spki',deb64(e.q),ECDH,false,[])},await privadaAcuerdo(yo.privadaAcuerdo),256);
    const base=await subtle.importKey('raw',secreto,'HKDF',false,['deriveKey']);
    const clave=await subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:deb64(e.salt),info:aad},base,{name:'AES-GCM',length:256},false,['decrypt']);
    try{return b64(new Uint8Array(await subtle.decrypt({name:'AES-GCM',iv:n,additionalData:aad},clave,c)));}catch{falla('La envoltura fue alterada.');}
  }

  // Sobre de un mensaje (o del título de un hilo): cifrado con la clave de la época y firmado por el autor.
  const aadSobre=(tipo,m)=>J([tipo==='hilo'?'bb/hilo':'bb/msg',V,m.g,m.e,m.h,m.id,m.d]);
  async function sellar({contenido,claveGrupo,g,e,h,id,d,privadaFirma:pf,tipo='mensaje'}){
    const m={g,e,h,id,d};for(const k of ['g','h','id','d'])if(!texto(m[k],80))falla('Campo «'+k+'» no válido.');
    if(!Number.isInteger(e)||e<1)falla('Época no válida.');
    const datos=enc.encode(JSON.stringify(contenido));if(datos.length>12000)falla('El mensaje es demasiado largo.');
    const aad=aadSobre(tipo,m),n=azar(12);
    const clave=await subtle.importKey('raw',deb64(claveGrupo),'AES-GCM',false,['encrypt']);
    const c=new Uint8Array(await subtle.encrypt({name:'AES-GCM',iv:n,additionalData:aad},clave,datos));
    const s=new Uint8Array(await subtle.sign(FIRMA,await privadaFirma(pf),unir(aad,n,c)));
    return JSON.stringify({v:V,...m,n:b64(n),c:b64(c),s:b64(s)});
  }
  // Abre un sobre comprobando que coincide con la fila del servidor (grupo, época, hilo, id, dispositivo).
  async function abrir({sobre,fila,claveGrupo,firmaAutor,tipo='mensaje'}){
    let x;try{x=JSON.parse(sobre);}catch{falla('Sobre ilegible.');}
    if(!x||x.v!==V)falla('Sobre de otra versión.');
    const columnas={g:fila.grupo_id,e:fila.epoca,h:fila.hilo_id??fila.id,id:fila.id,d:fila.dispositivo_id};
    for(const k of ['g','e','h','id','d'])if(x[k]!==columnas[k])falla('El sobre no coincide con el servidor ('+k+').');
    const aad=aadSobre(tipo,x),n=deb64(x.n),c=deb64(x.c);
    if(n.length!==12)falla('Nonce no válido.');
    if(!await subtle.verify(FIRMA,await publicaFirma(firmaAutor),deb64(x.s),unir(aad,n,c)))falla('La firma no es del autor.');
    const clave=await subtle.importKey('raw',deb64(claveGrupo),'AES-GCM',false,['decrypt']);
    let datos;try{datos=await subtle.decrypt({name:'AES-GCM',iv:n,additionalData:aad},clave,c);}catch{falla('El mensaje fue alterado o es de otra época.');}
    return JSON.parse(dec.decode(datos));
  }
  // Token de invitación (128 bits) y su hash (lo único que ve el servidor).
  async function nuevaInvitacion(){const token=b64(azar(16));return {token,hash:await sha(enc.encode(token))};}

  return Object.freeze({V,nuevasClaves,huellaDispositivo,huellaPar,nuevaClaveGrupo,envolver,desenvolver,sellar,abrir,nuevaInvitacion,b64,deb64});
});
