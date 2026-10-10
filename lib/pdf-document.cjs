'use strict';
function recordsFromItems(items,styles,fontNames={}){
  const lines=[];
  for(const item of items){
    if(typeof item.str!=='string'||!item.str.trim())continue;
    const y=item.transform[5],height=Math.abs(item.transform[3])||item.height||12,x=item.transform[4];
    let line=lines.find(l=>Math.abs(l.y-y)<Math.max(2,height*.2));
    if(!line){line={y,height,items:[]};lines.push(line);}line.items.push({...item,x,height});
  }
  const normal=lines.map(l=>l.height).sort((a,b)=>a-b)[Math.floor(lines.length*.45)]||12;
  return lines.sort((a,b)=>b.y-a.y).map(line=>{
    let spans=[],lastEnd=null;
    for(const item of line.items.sort((a,b)=>a.x-b.x)){
      const font=fontNames[item.fontName],family=font?.name||styles[item.fontName]?.fontFamily||item.fontName;
      if(lastEnd!==null&&item.x-lastEnd>Math.max(1,item.height*.15))spans.push({text:item.x-lastEnd>item.height*2?'\t':' '});
      spans.push({text:item.str,bold:font?.bold===true||/bold|black|heavy/i.test(family),italic:font?.italic===true||/italic|oblique/i.test(family)});lastEnd=item.x+item.width;
    }
    const text=spans.map(s=>s.text).join('');
    return {text,spans,checkbox:'none',kind:line.height>normal*1.25?'heading':/^\s*[•▪\-*]\s/.test(text)?'list':'paragraph'};
  });
}
async function readPdf(bytes){
  if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>10000000)throw new Error('El PDF debe tener hasta 10 MB.');
  const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task=getDocument({data:bytes,isEvalSupported:false,useSystemFonts:false,disableFontFace:true,useWorkerFetch:false,verbosity:0});let pdf;
  try{
    pdf=await task.promise;if(pdf.numPages>300)throw new Error('El PDF supera las 300 páginas. Divide el documento.');
    const records=[],warnings=['El PDF se interpreta por su texto y posición. Revisa el orden de columnas y las marcas de avance; los tachados dibujados no se reconocen automáticamente.'];let total=0,blank=0;
    for(let i=1;i<=pdf.numPages;i++){
      const page=await pdf.getPage(i),content=await page.getTextContent();await page.getOperatorList();
      const names={};for(const item of content.items){if(page.commonObjs.has(item.fontName)){const font=page.commonObjs.get(item.fontName);names[item.fontName]={name:font?.name,bold:font?.bold,italic:font?.italic};}}
      const rows=recordsFromItems(content.items,content.styles,names);if(!rows.length)blank++;
      for(const r of rows){r.page=i;total+=r.text.length;records.push(r);}if(total>2000000||records.length>20000)throw new Error('El PDF supera el límite de 2 MB de texto.');page.cleanup();
    }
    if(!records.length)throw new Error('Este PDF no contiene texto legible. Puede ser un documento escaneado. Usa un PDF con texto o un Word DOCX; todavía no hay OCR.');
    if(blank)warnings.push(`${blank} páginas sin texto extraíble: revisa si contienen imágenes o lecturas escaneadas.`);
    return {records,warnings,pages:pdf.numPages};
  }catch(error){if(error.name==='PasswordException')throw new Error('El PDF está protegido con contraseña. Guarda una copia sin contraseña para importarla.');throw error;}
  finally{await task.destroy();}
}
module.exports={readPdf,recordsFromItems};
