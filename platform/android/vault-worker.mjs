import {scrypt} from '../../vendor/noble-hashes/scrypt.js';
import {create} from './vault-engine.mjs';
const engine=create({scrypt});let queue=Promise.resolve();
self.onmessage=({data})=>{
  queue=queue.catch(()=>{}).then(async()=>{
    try{self.postMessage({id:data.id,result:await engine.execute(data.name,data.value)});}
    catch(e){self.postMessage({id:data.id,error:{code:['VALIDATION','CORRUPT','LOCKED','CONFLICT','UNAVAILABLE'].includes(e?.code)?e.code:'STORAGE',message:'No se pudo completar el candado local.'}});}
  });
};
