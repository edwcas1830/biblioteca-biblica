'use strict';
const crypto=require('node:crypto');
const fields=['notes','devResponses','planNotes','prayers','prayerDrafts','guideResponses'];
const empty=()=>({notes:{},devResponses:{},planNotes:{},prayers:[],prayerDrafts:{},guideResponses:{}});
function privatePart(state){return Object.fromEntries(fields.map(f=>[f,state[f]??empty()[f]]));}
function validate(envelope){
 if(!envelope||envelope.v!==1||!/^([a-f0-9]{32})$/.test(envelope.salt)||!/^[a-f0-9]{24}$/.test(envelope.iv)||!/^[a-f0-9]{32}$/.test(envelope.tag)||typeof envelope.data!=='string'||envelope.data.length>16_000_000||!/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(envelope.data))throw new Error('La copia privada está dañada o no es compatible.');
 return {v:1,salt:envelope.salt,iv:envelope.iv,tag:envelope.tag,data:envelope.data};
}
function derive(pin,salt){if(typeof pin!=='string'||!/^\d{6,12}$/.test(pin))throw new Error('El PIN debe tener entre 6 y 12 números.');return crypto.scryptSync(pin,Buffer.from(salt,'hex'),32,{N:32768,r:8,p:1,maxmem:64*1024*1024});}
function encrypt(part,key,salt){const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from('biblioteca-privada-v1'));const data=Buffer.concat([cipher.update(JSON.stringify(part),'utf8'),cipher.final()]);return {v:1,salt,iv:iv.toString('hex'),tag:cipher.getAuthTag().toString('hex'),data:data.toString('base64')};}
function decrypt(envelope,key){const e=validate(envelope),cipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(e.iv,'hex'));cipher.setAAD(Buffer.from('biblioteca-privada-v1'));cipher.setAuthTag(Buffer.from(e.tag,'hex'));return JSON.parse(Buffer.concat([cipher.update(Buffer.from(e.data,'base64')),cipher.final()]).toString('utf8'));}
module.exports={fields,empty,privatePart,validate,derive,encrypt,decrypt};
