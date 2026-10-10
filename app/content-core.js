(function(root){
  'use strict';
  const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const kinds=['paragraph','heading','list','quote'];
  function blocks(value){
    if(!Array.isArray(value)||value.length>20000)throw new Error('Demasiados párrafos en la lectura.');
    let size=0;
    return value.map(block=>{
      if(!block||!Array.isArray(block.spans)||block.spans.length>10000)throw new Error('Párrafo no válido.');
      const spans=block.spans.map(s=>{if(typeof s.text!=='string')throw new Error('Texto no válido.');size+=s.text.length;if(size>2000000)throw new Error('La lectura supera 2 MB de texto.');return {text:s.text,bold:s.bold===true,italic:s.italic===true,strike:s.strike===true};});
      return {kind:kinds.includes(block.kind)?block.kind:'paragraph',level:Number.isInteger(block.level)?Math.max(2,Math.min(4,block.level)):3,spans};
    });
  }
  const textOf=value=>value.map(b=>b.spans.map(s=>s.text).join('')).join('\n');
  function fromText(text){return String(text).split(/\n/).map(line=>{const heading=line.match(/^#{1,4}\s+(.+)/),list=line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.+)/);let text=heading?.[1]||list?.[1]||line;const spans=text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/).filter(Boolean).map(t=>({text:t.replace(/^\*\*|\*\*$/g,'').replace(/^\*|\*$/g,''),bold:t.startsWith('**'),italic:t.startsWith('*')&&!t.startsWith('**')}));return {kind:heading?'heading':list?'list':'paragraph',spans};});}
  function recordsToDevotional(records,filename,books,plan){
    if(!Array.isArray(records)||records.reduce((n,r)=>n+r.text.length,0)>2000000)throw new Error('El documento supera 2 MB de texto.');
    const entries=[],preface=[];let current=null;
    const explicit=r=>/^(?:\[[ x✓]*\]|[☑☐✅✓✔])?\s*(?:día|dia|day|jornada)\s*\d+\b/i.test(r.text)||/^\s*\d{1,2}[/.\-]\d{1,2}(?:[/.\-]\d{2,4})?(?:\s|$)/.test(r.text)||/^\s*\d{1,2}\s+(?:de\s+)?(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/i.test(r.text);
    const hasDays=records.some(explicit);
    for(const record of records){
      if(!record.text.trim())continue;
      const heading=explicit(record)||!hasDays&&record.kind==='heading';
      if(heading){current={title:record.text.trim().slice(0,200),body:'',blocks:[]};entries.push(current);}
      if(!current)preface.push(...(record.blocks||[{kind:record.kind,spans:record.spans||[{text:record.text}]}]));
      else current.blocks.push(...(record.blocks||[{kind:record.kind,spans:record.spans||[{text:record.text}]}]));
    }
    if(!entries.length)entries.push({title:filename.replace(/\.[^.]+$/,''),blocks:preface.splice(0),body:''});
    if(entries.length>366)throw new Error('El devocional admite hasta 366 días o secciones.');
    for(const entry of entries){entry.blocks=blocks(entry.blocks);entry.body=textOf(entry.blocks);entry.readings=plan.parseReferences(entry.body,books).refs;}
    const titleRecord=records.find(r=>r.kind==='heading'&&!explicit(r));
    return {id:'import-'+Date.now()+'-'+Math.random().toString(36).slice(2,8),title:(hasDays&&titleRecord?titleRecord.text.trim():filename.replace(/\.[^.]+$/,'')).slice(0,200),origin:'Devocional importado · '+filename.slice(0,160),sourceName:filename.slice(0,200),description:textOf(blocks(preface)),introBlocks:blocks(preface),entries,completed:[]};
  }
  // Rebuild only escaped text and a small formatting vocabulary, never imported HTML.
  function render(value,books,plan){
    return blocks(value).map(block=>{
      const text=block.spans.map(s=>s.text).join(''),ranges=plan.parseReferences(text,books).ranges;
      const points=new Set([0,text.length]);let pos=0;for(const s of block.spans){points.add(pos);pos+=s.text.length;points.add(pos);}for(const r of ranges){points.add(r.start);points.add(r.end);}
      const cuts=[...points].sort((a,b)=>a-b);let html='',lastRange=null;
      for(let i=0;i<cuts.length-1;i++){
        const start=cuts[i],end=cuts[i+1];let offset=0;const span=block.spans.find(s=>{const inside=start>=offset&&start<offset+s.text.length;offset+=s.text.length;return inside;});
        const range=ranges.find(r=>start>=r.start&&end<=r.end);
        if(range!==lastRange){if(lastRange)html+='</button>';if(range){const ref=range.refs[0];html+=`<button class="passage-link" data-document-ref="${ref.book}:${ref.chapter}:${ref.verse||1}:${ref.endVerse||ref.verse||1}" title="Abrir el pasaje en la Biblia">`;}lastRange=range;}
        let fragment=escape(text.slice(start,end)).replace(/\n/g,'<br>');if(span?.bold)fragment='<strong>'+fragment+'</strong>';if(span?.italic)fragment='<em>'+fragment+'</em>';if(span?.strike)fragment='<s>'+fragment+'</s>';html+=fragment;
      }
      if(lastRange)html+='</button>';
      const tag=block.kind==='heading'?'h'+block.level:block.kind==='quote'?'blockquote':block.kind==='list'?'li':'p';
      return '<'+tag+'>'+html+'</'+tag+'>';
    }).join('').replace(/(?:<li>[\s\S]*?<\/li>)+/g,match=>'<ul>'+match+'</ul>');
  }
  const api={blocks,textOf,fromText,recordsToDevotional,render};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.ContentCore=api;
})(typeof window==='object'?window:globalThis);
