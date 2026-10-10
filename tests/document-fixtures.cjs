'use strict';
// Original fixture text by this project, dedicated to the public domain (CC0).
const JSZip=require('jszip');
const documentXml=`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
<w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t>Un recorrido de gratitud</w:t></w:r></w:p>
<w:p><w:r><w:t>Indicaciones: lee despacio y escribe una observación.</w:t></w:r></w:p>
<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Día 1 · Detenerse</w:t></w:r></w:p>
<w:p><w:r><w:t>Pasaje: Salmos 23:1-3.</w:t></w:r></w:p>
<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Una pausa pequeña</w:t></w:r><w:r><w:t xml:space="preserve"> permite mirar con </w:t></w:r><w:r><w:rPr><w:i/></w:rPr><w:t>atención</w:t></w:r><w:r><w:t> lo cotidiano.</w:t></w:r></w:p>
<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>Anota algo que agradeces.</w:t></w:r></w:p>
<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Día 2 · Compartir</w:t></w:r></w:p>
<w:p><w:r><w:t>Pasaje: Juan 3:16.</w:t></w:r></w:p>
<w:p><w:r><w:t>Reflexión original para probar el lector; no procede de una obra publicada.</w:t></w:r></w:p>
<w:p><w:r><w:t>&lt;script&gt;alert(1)&lt;/script&gt; permanece como texto.</w:t></w:r></w:p>
</w:body></w:document>`;
async function docx(){
  const zip=new JSZip();zip.file('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>');
  zip.file('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/_rels/document.xml.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdNumber" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>');
  zip.file('word/styles.xml','<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:rPr><w:sz w:val="44"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="36"/></w:rPr></w:style></w:styles>');
  zip.file('word/numbering.xml','<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>');
  zip.file('word/document.xml',documentXml);return zip.generateAsync({type:'nodebuffer'});
}
function pdf(scanned=false){
  const content=scanned?'0 0 100 100 re f':[
    ['F2',22,740,'Un recorrido de gratitud'],['F1',12,710,'Indicaciones: lee despacio.'],
    ['F2',18,665,'Día 1 · Detenerse'],['F1',12,635,'Pasaje: Salmos 23:1-3.'],
    ['F2',12,610,'Una pausa pequeña'],['F3',12,588,'Atención a lo cotidiano.'],['F1',12,560,'- Anota algo que agradeces.'],
    ['F2',18,510,'Día 2 · Compartir'],['F1',12,482,'Pasaje: Juan 3:16.'],['F1',12,455,'Reflexión original para probar el lector.']
  ].map(([font,size,y,text])=>`BT /${font} ${size} Tf 50 ${y} Td (${text.replace(/[\\()]/g,'\\$&')}) Tj ET`).join('\n');
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R /F2 6 0 R /F3 7 0 R >> >> /Contents 4 0 R >>',`<< /Length ${Buffer.byteLength(content,'latin1')} >>\nstream\n${content}\nendstream`,...['Helvetica','Helvetica-Bold','Helvetica-Oblique'].map(f=>`<< /Type /Font /Subtype /Type1 /BaseFont /${f} /Encoding /WinAnsiEncoding >>`)];
  let source='%PDF-1.4\n',offsets=[0];objects.forEach((o,i)=>{offsets.push(Buffer.byteLength(source,'latin1'));source+=`${i+1} 0 obj\n${o}\nendobj\n`;});const xref=Buffer.byteLength(source,'latin1');source+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;return Buffer.from(source,'latin1');
}
module.exports={docx,pdf,documentXml};
if(require.main===module){const fs=require('node:fs'),path=require('node:path'),out=path.resolve(process.argv[2]||'../../work/v05-fixtures');fs.mkdirSync(out,{recursive:true});docx().then(bytes=>{fs.writeFileSync(path.join(out,'recorrido-original.docx'),bytes);fs.writeFileSync(path.join(out,'recorrido-original.pdf'),pdf());fs.writeFileSync(path.join(out,'escaneado-ejemplo.pdf'),pdf(true));console.log(out);});}
