'use strict';
const {Worker}=require('node:worker_threads'),path=require('node:path'),clients=require('../platform/android/private-vault.js');
function workerFactory(){
  const thread=new Worker(path.join(__dirname,'fixtures/vault-worker.mjs')),proxy={postMessage:message=>thread.postMessage(message),terminate:()=>thread.terminate()};
  thread.on('message',data=>proxy.onmessage?.({data}));thread.on('error',()=>proxy.onerror?.({preventDefault(){}}));return proxy;
}
module.exports={workerFactory,privacyFactory:options=>clients.create({...options,workerFactory})};
