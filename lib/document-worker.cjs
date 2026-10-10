'use strict';
const {parentPort,workerData}=require('node:worker_threads');
const {readPdf}=require('./pdf-document.cjs');
readPdf(workerData.bytes).then(result=>parentPort.postMessage({result})).catch(error=>parentPort.postMessage({error:error.message}));
