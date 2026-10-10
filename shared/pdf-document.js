(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.LibraryPdfDocument=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  class PdfImportError extends Error { constructor(code,message){super(message);this.name='PdfImportError';this.code=code;} }
function recordsFromItems(items,styles,fontNames={}){
  const lines=[];
  for(const item of items){
    if(typeof item.str!=='string'||!item.str.trim())continue;
    const y=item.transform[5],height=Math.abs(item.transform[3])||item.height||12,x=item.transform[4];
    let line=lines.find(l=>Math.abs(l.y-y)<Math.max(2,height*.2));
    if(!line){line={y,height,items:[]};lines.push(line);}line.height=Math.max(line.height,height);line.items.push({...item,x,height});
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
    return {text,spans,x:Math.min(...line.items.map(i=>i.x)),y:line.y,height:line.height,checkbox:'none',kind:line.height>normal*1.25?'heading':/^\s*[•▪\-*]\s/.test(text)?'list':'paragraph'};
  });
}
const normalized=text=>text.trim().replace(/\s+/g,' ').toLocaleLowerCase('es');
const dayNumber=text=>text.match(/^\s*(?:día|dia|day|jornada)\s*(\d+)\b/i)?.[1];
const sentenceTitle=text=>text===text.toLocaleUpperCase('es')?text.slice(0,1)+text.slice(1).toLocaleLowerCase('es'):text;
function reflowParagraphs(records){
  const result=[];let lastY=0;
  for(const record of records){
    const r={...record,spans:[...record.spans]},previous=result.at(-1),gap=lastY-r.y;
    const label=r.text.length<80&&/\p{L}/u.test(r.text)&&r.text===r.text.toLocaleUpperCase('es')&&r.spans.filter(s=>s.text.trim()).every(s=>s.bold);
    if(label&&r.page!==1)r.kind='heading';
    // Lines with the same leading and indentation form one paragraph; larger gaps keep sections apart.
    if(r.page!==1&&previous?.page===r.page&&previous.kind==='paragraph'&&r.kind==='paragraph'&&gap>0&&gap<=r.height*1.7&&Math.abs(previous.height-r.height)<r.height*.1&&Math.abs(previous.x-r.x)<10&&!dayNumber(previous.text)&&!dayNumber(r.text)&&!/^\s*[•●▪\-*]\s*/.test(r.text)){
      previous.spans.push({text:' '},...r.spans);previous.text+=' '+r.text;
    }else result.push(r);
    lastY=r.y;
  }
  return result;
}
function prepareRecords(records,pages,metadata={}){
  // Only repeated marginal lines are furniture. A repeated prayer in the body is content.
  const marginal=r=>r.y>r.pageHeight*.92||r.y<r.pageHeight*.06,occurrences=new Map();
  for(const r of records)if(marginal(r)){const key=normalized(r.text);if(!occurrences.has(key))occurrences.set(key,new Set());occurrences.get(key).add(r.page);}
  const repeated=new Set([...occurrences].filter(([,p])=>p.size>=Math.max(3,Math.ceil(pages*.5))).map(([key])=>key));
  const clean=records.filter(r=>!(marginal(r)&&(repeated.has(normalized(r.text))||/^\s*(?:\d+|p[aá]gina\s+\d+(?:\s+de\s+\d+)?)\s*$/i.test(r.text))));
  const byPage=new Map();for(const r of clean){if(!byPage.has(r.page))byPage.set(r.page,[]);byPage.get(r.page).push(r);}
  const indexPages=new Set(),indexTitles={},lastDayPage=new Map();for(const r of clean){const n=dayNumber(r.text);if(n)lastDayPage.set(n,Math.max(r.page,lastDayPage.get(n)||0));}
  // A compact list is a TOC only when its numbered days reappear later as readings.
  for(const [page,rows] of byPage){
    const markers=rows.filter(r=>dayNumber(r.text));if(markers.length<3)continue;
    const repeatedDays=markers.filter(r=>lastDayPage.get(dayNumber(r.text))>page).length;
    const prose=rows.filter(r=>!dayNumber(r.text)&&!/^\s*(?:[•●▪\-*]+|(?:contenido|índice|indice|tabla de contenido|contents)|semana\s+\d+[^\n]*)\s*$/i.test(r.text)).map(r=>r.text).join(' ');
    if(repeatedDays===markers.length&&!prose.trim()){indexPages.add(page);for(const r of markers)indexTitles[dayNumber(r.text)]=r.text.trim();}
  }
  const reading=clean.filter(r=>!indexPages.has(r.page)),cover=byPage.get(1)||[];
  const largest=Math.max(0,...cover.map(r=>r.height)),first=cover.findIndex(r=>r.height>=largest*.75),titleLines=[];
  if(first>=0)for(const r of cover.slice(first,first+6)){if(r.height<largest*.75||dayNumber(r.text))break;titleLines.push(r);}
  const coverTitle=titleLines.map(r=>r.text.trim()).join(' '),metaTitle=typeof metadata.Title==='string'?metadata.Title.trim():'';
  const title=sentenceTitle((metaTitle&&!/^(?:untitled|document|microsoft word)/i.test(metaTitle)?metaTitle:coverTitle).slice(0,200));
  let subtitle='';
  if(titleLines.length){const start=cover.indexOf(titleLines.at(-1))+1,candidates=cover.slice(start,start+2);if(candidates.length&&candidates[0].height<largest*.5){subtitle=candidates[0].text.trim();if(candidates[1]&&/^(?:de |para |of |for )/i.test(candidates[1].text.trim()))subtitle+=' '+candidates[1].text.trim();subtitle=sentenceTitle(subtitle.slice(0,500));}}
  const warnings=[];if(clean.length!==records.length)warnings.push('Se omitieron encabezados y números de página repetidos en los márgenes.');
  if(indexPages.size)warnings.push(`Se reconocieron ${indexPages.size} páginas de índice; sus entradas no cuentan como días.`);
  return {records:reflowParagraphs(reading),title,subtitle,indexTitles,warnings};
}
async function readPdf(bytes,{getDocument,options={}}={}){
  if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>10000000)throw new PdfImportError('VALIDATION','El PDF debe tener hasta 10 MB.');
  if(typeof getDocument!=='function')throw new PdfImportError('UNAVAILABLE','Falta el lector PDF local.');
  const task=getDocument({data:bytes,isEvalSupported:false,useSystemFonts:false,disableFontFace:true,fontExtraProperties:true,useWorkerFetch:false,verbosity:0,maxImageSize:4000000,isOffscreenCanvasSupported:false,isImageDecoderSupported:false,...options});let pdf;
  try{
    pdf=await task.promise;if(pdf.numPages>300)throw new PdfImportError('VALIDATION','El PDF supera las 300 páginas. Divide el documento.');
    const records=[],warnings=['El PDF se interpreta por su texto y posición. Revisa el orden de columnas y las marcas de avance; los tachados dibujados no se reconocen automáticamente.'];let total=0,blank=0;
    for(let i=1;i<=pdf.numPages;i++){
      const page=await pdf.getPage(i),content=await page.getTextContent();
      if(content.items.length>60000||content.items.reduce((n,item)=>n+(item.str?.length||0),total)>2000000)throw new PdfImportError('VALIDATION','El PDF supera el límite de 2 MB de texto.');
      await page.getOperatorList();
      const names={};for(const fontName of new Set(content.items.map(item=>item.fontName).filter(Boolean))){
        const font=await new Promise(resolve=>page.commonObjs.get(fontName,resolve));
        names[fontName]={name:font?.name,bold:font?.bold,italic:font?.italic};
      }
      const rows=recordsFromItems(content.items,content.styles,names);if(!rows.length)blank++;
      for(const r of rows){r.page=i;r.pageHeight=page.view[3]-page.view[1];total+=r.text.length;records.push(r);}if(total>2000000||records.length>20000)throw new PdfImportError('VALIDATION','El PDF supera el límite de 2 MB de texto.');page.cleanup();
    }
    if(!records.length)throw new PdfImportError('VALIDATION','Este PDF no contiene texto legible. Puede ser un documento escaneado. Usa un PDF con texto o un Word DOCX; todavía no hay OCR.');
    if(blank)warnings.push(`${blank} páginas sin texto extraíble: revisa si contienen imágenes o lecturas escaneadas.`);
    const prepared=prepareRecords(records,pdf.numPages,(await pdf.getMetadata()).info);return {...prepared,warnings:[...warnings,...prepared.warnings],pages:pdf.numPages};
  }catch(error){if(error.name==='PasswordException')throw new PdfImportError('VALIDATION','El PDF está protegido con contraseña. Guarda una copia sin contraseña para importarla.');throw error;}
  finally{await task.destroy();}
}
return Object.freeze({readPdf,recordsFromItems,prepareRecords,PdfImportError});

});
