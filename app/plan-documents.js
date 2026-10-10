(function(root){
  'use strict';
  const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const W14='http://schemas.microsoft.com/office/word/2010/wordml';
  const children=(node,name,ns=W)=>Array.from(node?.children||[]).filter(el=>el.localName===name&&el.namespaceURI===ns);
  const child=(node,name,ns=W)=>children(node,name,ns)[0];
  const descendants=(node,name,ns=W)=>Array.from(node.getElementsByTagNameNS(ns,name));
  const val=node=>node?.getAttributeNS(W,'val')??node?.getAttributeNS(W14,'val')??node?.getAttribute('val');
  const bool=node=>node? !['0','false','off'].includes(val(node)):undefined;
  function xml(text){
    if(/<!DOCTYPE|<!ENTITY/i.test(text))throw new Error('El documento contiene una estructura XML no admitida.');
    const doc=new DOMParser().parseFromString(text,'application/xml');
    if(doc.getElementsByTagName('parsererror').length)throw new Error('El archivo Word tiene XML dañado.');return doc;
  }
  async function boundedText(file,max){
    let size=0,text='';const decoder=new TextDecoder();
    return new Promise((resolve,reject)=>{
      const stream=file.internalStream('uint8array');let stopped=false;
      stream.on('data',chunk=>{if(stopped)return;size+=chunk.byteLength;if(size>max){stopped=true;stream.pause();reject(new Error('El contenido del Word supera el límite de lectura.'));return;}text+=decoder.decode(chunk,{stream:true});});
      stream.on('error',reject);stream.on('end',()=>{if(!stopped)resolve(text+decoder.decode());});stream.resume();
    });
  }
  function recordsFromXml(documentText,stylesText='',core=root.PlanCore,books=root.BIBLE.books){
    const doc=xml(documentText),styleMap=new Map();
    if(stylesText)for(const style of descendants(xml(stylesText),'style'))styleMap.set(style.getAttributeNS(W,'styleId'),style);
    function styleStrike(id,seen=new Set()){
      if(!id||seen.has(id))return undefined;seen.add(id);const style=styleMap.get(id);if(!style)return undefined;
      const rpr=child(style,'rPr'),direct=bool(child(rpr,'strike')),double=bool(child(rpr,'dstrike'));
      if(direct!==undefined||double!==undefined)return Boolean(direct||double);
      return styleStrike(val(child(style,'basedOn')),seen);
    }
    function styleFormat(id,name,seen=new Set()){
      if(!id||seen.has(id))return undefined;seen.add(id);const style=styleMap.get(id);if(!style)return undefined;
      return bool(child(child(style,'rPr'),name))??styleFormat(val(child(style,'basedOn')),name,seen);
    }
    let defaultStrike=false;
    if(stylesText){const defaults=descendants(xml(stylesText),'rPrDefault')[0];defaultStrike=bool(child(child(defaults,'rPr'),'strike'))===true;}
    function recordFromParagraph(p){
      const pstyle=val(child(child(p,'pPr'),'pStyle'));let text='',spans=[];
      const boxes=descendants(p,'checked',W14).map(bool);
      for(const box of descendants(p,'checkBox')){const checked=child(box,'checked');boxes.push(bool(checked)??bool(child(box,'default'))??false);}
      const boxStates=new Set(boxes);const checkbox=boxStates.size>1?'mixed':boxes.length?(boxes[0]?'checked':'unchecked'):'none';
      function walk(node){
        if(node.namespaceURI===W&&['del','moveFrom','pPr'].includes(node.localName))return;
        if(node.namespaceURI===W&&node.localName==='r'){
          const rpr=child(node,'rPr'),single=bool(child(rpr,'strike')),double=bool(child(rpr,'dstrike'));
          const inherited=styleStrike(val(child(rpr,'rStyle')))??styleStrike(pstyle)??defaultStrike;
          const strike=single!==undefined||double!==undefined?Boolean(single||double):inherited;
          const highlight=val(child(rpr,'highlight'))||'',rstyle=val(child(rpr,'rStyle'));
          const bold=(bool(child(rpr,'b'))??styleFormat(rstyle,'b')??styleFormat(pstyle,'b'))===true,italic=(bool(child(rpr,'i'))??styleFormat(rstyle,'i')??styleFormat(pstyle,'i'))===true;
          for(const item of Array.from(node.childNodes)){
            if(item.namespaceURI!==W)continue;
            let value=item.localName==='t'?item.textContent:item.localName==='tab'?'\t':['br','cr'].includes(item.localName)?'\n':'';
            if(item.localName==='sym'){const code=item.getAttributeNS(W,'char');if(['F0FE','F0FC'].includes(code?.toUpperCase()))value='☑';else if(code?.toUpperCase()==='F0A8')value='☐';}
            if(value){text+=value;spans.push({text:value,strike,highlight,bold,italic});}
          }
          return;
        }
        for(const item of Array.from(node.children||[]))walk(item);
      }
      const outline=val(child(child(p,'pPr'),'outlineLvl')),numbered=!!child(child(p,'pPr'),'numPr');
      const kind=/heading|title|titulo|título/i.test(pstyle||'')||outline!==undefined?'heading':numbered?'list':/quote|cita/i.test(pstyle||'')?'quote':'paragraph';
      walk(p);return {text,spans,checkbox,kind,blocks:[{kind,spans}]};
    }
    function combine(records,separator='\t'){
      let text='',spans=[];const statuses=[];
      records.forEach((record,i)=>{if(i){text+=separator;spans.push({text:separator,strike:false});}text+=record.text;spans.push(...record.spans);if(record.checkbox!=='none')statuses.push(record.checkbox);});
      const set=new Set(statuses);return {text,spans,blocks:records.flatMap(r=>r.blocks||[]),checkbox:set.size>1||set.has('mixed')?'mixed':statuses[0]||'none'};
    }
    const records=[],warnings=[];
    function table(tbl){
      const rows=children(tbl,'tr');let headings=[],schedule=false;
      for(let i=0;i<rows.length;i++){
        const cells=children(rows[i],'tc').map(cell=>combine(descendants(cell,'p').map(recordFromParagraph),'\n'));
        if(!cells.length)continue;
        const cellsWithRefs=cells.filter(c=>core.parseReferences(c.text,books).refs.length).length;
        if(i===0&&cellsWithRefs===0){headings=cells.map(c=>c.text.trim());schedule=headings.slice(1).filter(h=>/lunes|martes|miercoles|jueves|viernes|sabado|domingo|dia\s*\d/.test(core.clean(h))).length>=2;records.push(combine(cells));continue;}
        if(schedule&&cells.length>=3){
          cells.slice(1).forEach((cell,j)=>{if(!/[\p{L}\p{N}]/u.test(cell.text))return;records.push({...cell,dayTitle:`${cells[0].text.trim()} · ${headings[j+1]||'Lectura '+(j+1)}`.slice(0,200)});});
        }else if(cellsWithRefs>=2&&cells.filter(c=>/^(?:dia\s*\d|\d{1,2}[/.]\d{1,2})/.test(core.clean(c.text).trim())).length>=2){
          cells.forEach(cell=>{if(cell.text.trim())records.push(cell);});
        }else records.push(combine(cells));
      }
      if(schedule)warnings.push('Cada casilla de lectura se importa por separado. Las fechas de fila y los nombres de las columnas se conservan como etiquetas; no se recalcula el calendario.');
    }
    function bodyWalk(node){
      for(const item of Array.from(node.children||[])){
        if(item.namespaceURI===W&&item.localName==='p')records.push(recordFromParagraph(item));
        else if(item.namespaceURI===W&&item.localName==='tbl')table(item);
        else if(item.namespaceURI===W&&!['sectPr','del','moveFrom'].includes(item.localName))bodyWalk(item);
      }
    }
    const body=descendants(doc,'body')[0];if(!body)throw new Error('El archivo no contiene un documento Word legible.');bodyWalk(body);
    if(records.length>20000||records.reduce((n,r)=>n+r.text.length,0)>2000000)throw new Error('El documento supera el límite de lectura.');
    return {records,warnings};
  }
  async function readDocx(file){
    if(file.size>10000000)throw new Error('El Word supera los 10 MB.');
    const zip=await root.JSZip.loadAsync(await file.arrayBuffer());
    if(Object.keys(zip.files).length>2000)throw new Error('El Word contiene demasiados componentes.');
    const document=zip.file('word/document.xml');if(!document)throw new Error('Este archivo no es un Word DOCX válido.');
    const styles=zip.file('word/styles.xml');
    const documentText=await boundedText(document,8000000),stylesText=styles?await boundedText(styles,2000000):'';
    return recordsFromXml(documentText,stylesText);
  }
  async function read(file){
    if(/\.docx$/i.test(file.name))return readDocx(file);
    if(/\.pdf$/i.test(file.name)){if(!root.libraryDesktop?.readPdf)throw new Error('Abre la aplicación de Windows para importar PDF.');if(file.size>10000000)throw new Error('El PDF supera los 10 MB.');return root.libraryDesktop.readPdf(new Uint8Array(await file.arrayBuffer()));}
    throw new Error('Elige un PDF o un Word DOCX.');
  }
  root.PlanDocuments={read,readDocx,recordsFromXml};
})(window);
