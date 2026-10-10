'use strict';
const shared=require('../shared/pdf-document.js');
async function readPdf(bytes){
  const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
  return shared.readPdf(bytes,{getDocument});
}
module.exports={...shared,readPdf};
