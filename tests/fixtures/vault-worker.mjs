import {parentPort} from 'node:worker_threads';
import {scrypt} from '@noble/hashes/scrypt.js';
import {create} from '../../platform/android/vault-engine.mjs';
const engine=create({scrypt});let queue=Promise.resolve();
parentPort.on('message',data=>{
  queue=queue.catch(()=>{}).then(async()=>{
    try{parentPort.postMessage({id:data.id,result:await engine.execute(data.name,data.value)});}
    catch(e){parentPort.postMessage({id:data.id,error:{code:e.code||'STORAGE',message:'Sin contenido privado en errores'}});}
  });
});
