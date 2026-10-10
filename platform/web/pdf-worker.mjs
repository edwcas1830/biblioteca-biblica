// Two dedicated workers: extraction/reflow here, PDF.js parsing in its own port.
// No DOM, Node, document JavaScript, remote URL or arbitrary worker path.
import '../../shared/pdf-document.js';
import {getDocument,GlobalWorkerOptions} from '../../vendor/pdfjs/pdf.mjs';
let used=false;
self.onmessage=async ({data})=>{
  if(used)return;used=true;let parser;
  try{
    if(data?.type!=='readPdf'||!(data.bytes instanceof Uint8Array))throw new LibraryPdfDocument.PdfImportError('VALIDATION','El PDF debe tener hasta 10 MB.');
    parser=new Worker(new URL('../../vendor/pdfjs/pdf.worker.mjs',import.meta.url),{type:'module',name:'biblioteca-pdf-parser'});
    GlobalWorkerOptions.workerPort=parser;
    const assets=new URL('../../vendor/pdfjs/',import.meta.url);
    const result=await LibraryPdfDocument.readPdf(data.bytes,{getDocument,options:{
      cMapUrl:new URL('cmaps/',assets).href,cMapPacked:true,
      standardFontDataUrl:new URL('standard_fonts/',assets).href,wasmUrl:new URL('wasm/',assets).href,useWorkerFetch:true
    }});
    self.postMessage({result});
  }catch(error){
    const known=error instanceof LibraryPdfDocument.PdfImportError;
    self.postMessage({error:{code:known?error.code:'CORRUPT',message:known?error.message:'No se pudo leer este PDF. Comprueba que el archivo esté completo y no esté dañado.'}});
  }finally{parser?.terminate();GlobalWorkerOptions.workerPort=null;}
};
