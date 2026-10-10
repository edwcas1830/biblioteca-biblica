'use strict';
const crypto=require('node:crypto');
const prayerCore=require('../app/prayer-core.js'),guideCore=require('../app/guide-core.js');
const fields=['notes','devResponses','planNotes','prayers','prayerDrafts','guideResponses'];
const empty=()=>({notes:{},devResponses:{},planNotes:{},prayers:[],prayerDrafts:{},guideResponses:{}});
function privatePart(state){return Object.fromEntries(fields.map(f=>[f,state[f]??empty()[f]]));}
function validatePrivate(part,books){
 if(!part||typeof part!=='object'||Array.isArray(part))throw new Error('Cuaderno privado no válido.');const out=privatePart(part);
 const validRef=r=>Number.isInteger(r.book)&&r.book>=0&&r.book<66&&Number.isInteger(r.chapter)&&r.chapter>0&&Number.isInteger(r.verse)&&r.verse>0&&(!books||r.verse<=(books[r.book]?.chapters[r.chapter-1]?.length||0));
 for(const field of ['notes','devResponses','planNotes']){const values=out[field];if(!values||typeof values!=='object'||Array.isArray(values)||Object.keys(values).length>35000)throw new Error('Notas privadas no válidas.');for(const [key,text]of Object.entries(values)){if(typeof text!=='string'||text.length>100000)throw new Error('Contenido privado no válido.');if(field==='devResponses'){if(!/^(dev|import)-[a-z0-9-]+:\d+$/.test(key))throw new Error('Referencia privada no válida.');}else if(field==='planNotes'){if(!/^plan-\d+(?:-[a-z0-9]+)?:day-[a-f0-9]{32}$/.test(key))throw new Error('Nota de día no válida.');}else{if(!/^([a-z0-9-]{1,80}@)?\d+:\d+:\d+$/.test(key))throw new Error('Referencia privada no válida.');const [book,chapter,verse]=key.split('@').at(-1).split(':').map(Number);if(!validRef({book,chapter,verse}))throw new Error('Referencia privada fuera del canon.');}}}
 out.prayers=prayerCore.validate(out.prayers);for(const p of out.prayers)if(p.answer&&!validRef(p.answer.reference))throw new Error('Versículo privado fuera del canon.');out.prayerDrafts=prayerCore.drafts(out.prayerDrafts);out.guideResponses=guideCore.responses(out.guideResponses);return out;
}
function validate(envelope){
 if(!envelope||envelope.v!==1||!/^([a-f0-9]{32})$/.test(envelope.salt)||!/^[a-f0-9]{24}$/.test(envelope.iv)||!/^[a-f0-9]{32}$/.test(envelope.tag)||typeof envelope.data!=='string'||envelope.data.length>16_000_000||!/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(envelope.data))throw new Error('La copia privada está dañada o no es compatible.');
 return {v:1,salt:envelope.salt,iv:envelope.iv,tag:envelope.tag,data:envelope.data};
}
function derive(pin,salt){if(typeof pin!=='string'||!/^\d{6,12}$/.test(pin))throw new Error('El PIN debe tener entre 6 y 12 números.');return crypto.scryptSync(pin,Buffer.from(salt,'hex'),32,{N:32768,r:8,p:1,maxmem:64*1024*1024});}
function encrypt(part,key,salt){const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from('biblioteca-privada-v1'));const data=Buffer.concat([cipher.update(JSON.stringify(part),'utf8'),cipher.final()]);return {v:1,salt,iv:iv.toString('hex'),tag:cipher.getAuthTag().toString('hex'),data:data.toString('base64')};}
function decrypt(envelope,key){const e=validate(envelope),cipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(e.iv,'hex'));cipher.setAAD(Buffer.from('biblioteca-privada-v1'));cipher.setAuthTag(Buffer.from(e.tag,'hex'));return JSON.parse(Buffer.concat([cipher.update(Buffer.from(e.data,'base64')),cipher.final()]).toString('utf8'));}
module.exports={fields,empty,privatePart,validatePrivate,validate,derive,encrypt,decrypt};
