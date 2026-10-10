'use strict';
// Produce structured text only. No source HTML, links, objects or scripts are executed.
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clean=s=>s.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();
const ansiDecoder=new TextDecoder('windows-1252');
const ansiBytes=new Map(Array.from({length:256},(_,i)=>[ansiDecoder.decode(Uint8Array.of(i)),i]));
function parseRtf(source,{nt=false,esword=false}={}){
 if(typeof source!=='string'||source.length>4_000_000)throw new Error('Texto de módulo demasiado grande o cifrado.');
 let state={bold:false,italic:false,super:false,color:0,skip:false,heading:false,uc:1,font:0},stack=[],tokens=[],fallback=0;
 // e-Sword RTF fragments omit their header: font 1 is Greek, 2 Hebrew.
 // An explicit font table overrides that convention.
 const charsets={0:'windows-1252',161:'windows-1253',177:'windows-1255'};
 const fonts=esword?{1:'windows-1253',2:'windows-1255'}:{};
 for(const match of source.matchAll(/\{\\f(\d+)[^{}]*?\\fcharset(\d+)[^{}]*?\}/g))fonts[Number(match[1])]=charsets[Number(match[2])]||'windows-1252';
 const decoders=new Map(),byteText=byte=>{const encoding=fonts[state.font]||'windows-1252';if(!decoders.has(encoding))decoders.set(encoding,new TextDecoder(encoding));return decoders.get(encoding).decode(Uint8Array.of(byte));};
 const push=text=>{if(state.skip||!text)return;const kind=state.super?'super':state.heading&&state.bold?'heading':'text',style={kind,red:nt&&state.color===6&&!state.super,bold:state.bold,italic:state.italic};const last=tokens.at(-1);if(last&&last.kind===kind&&last.red===style.red&&last.bold===style.bold&&last.italic===style.italic)last.text+=text;else tokens.push({...style,text});};
 const destinations=new Set(['fonttbl','colortbl','stylesheet','info','pict','object','objdata','fldinst','filetbl','generator','xmlopen','xmlattrname','xmlattrvalue','datastore','themedata','colorschememapping']);
 for(let i=0;i<source.length;){let c=source[i++];if(c==='{'){stack.push({...state});continue;}if(c==='}'){state=stack.pop()||{bold:false,italic:false,super:false,color:0,skip:false,heading:false,uc:1,font:0};continue;}if(c==='\r'||c==='\n')continue;
 if(c!=='\\'){if(fallback){fallback--;continue;}push(c.charCodeAt(0)>=128&&fonts[state.font]&&ansiBytes.has(c)?byteText(ansiBytes.get(c)):c);continue;}
 c=source[i++];if(c===undefined)break;if(c==='\\'||c==='{'||c==='}'){if(fallback)fallback--;else push(c);continue;}if(c==='*'){state.skip=true;continue;}if(c==="'"){const hex=source.slice(i,i+2);i+=2;if(fallback){fallback--;continue;}if(/^[a-f\d]{2}$/i.test(hex))push(byteText(parseInt(hex,16)));continue;}if(c==='~'){push(' ');continue;}if(c==='-'||c==='_'){push(c==='_'?'‑':'');continue;}if(!/[a-z]/i.test(c))continue;
 let word=c;while(/[a-z]/i.test(source[i]||'')&&i<source.length)word+=source[i++];let number='';if(source[i]==='-')number+=source[i++];while(/\d/.test(source[i]||'')&&i<source.length)number+=source[i++];if(source[i]===' ')i++;const n=number?Number(number):1;
 if(destinations.has(word)){state.skip=true;continue;}if(word==='bin'){i+=Math.max(0,n);continue;}if(word==='f')state.font=n;else if(word==='b')state.bold=n!==0;else if(word==='i')state.italic=n!==0;else if(word==='super')state.super=true;else if(word==='nosupersub')state.super=false;else if(word==='cf')state.color=n;else if(word==='qc')state.heading=true;else if(word==='ql'||word==='pard')state.heading=false;else if(word==='plain'){state.bold=false;state.italic=false;state.super=false;state.color=0;state.font=0;}else if(word==='uc')state.uc=Math.max(0,Math.min(n,8));else if(word==='u'){push(String.fromCharCode(n<0?n+65536:n));fallback=state.uc;}else if(word==='par'||word==='line')push('\n');else if(word==='tab')push(' ');else if(word==='emdash')push('—');else if(word==='endash')push('–');else if(word==='lquote')push('‘');else if(word==='rquote')push('’');else if(word==='ldblquote')push('“');else if(word==='rdblquote')push('”');
 }
 tokens=tokens.flatMap(t=>{if(t.kind!=='super')return [t];const codes=[...new Set((t.text.match(/\b[HG]\d{1,5}\b/g)||[]).map(c=>c[0]+Number(c.slice(1))))];return codes.length?[{kind:'strong',text:codes.join(' '),codes,red:false,bold:false,italic:false}]:[];});
 const body=tokens.filter(t=>t.kind==='text').map(t=>t.text).join('').replace(/\s+/g,' ').trim();const codes=[...new Set(tokens.filter(t=>t.kind==='strong').flatMap(t=>t.codes))];return {tokens,text:body,strong:codes};
}
function html(parsed,{showStrong=false}={}){return parsed.tokens.filter(t=>showStrong||t.kind!=='strong').map(t=>t.kind==='strong'?`<sup class="strong-number">${esc(t.text)}</sup>`:`<span class="${t.red?'jesus-words ':''}${t.kind==='heading'?'module-heading ':''}${t.bold?'rtf-bold ':''}${t.italic?'rtf-italic':''}">${esc(t.text).replace(/\n/g,'<br>')}</span>`).join('');}
function withStrong(base,support){const norm=s=>clean(s).replace(/[^\p{L}\p{N}]/gu,'');const source=base.tokens.filter(t=>t.kind==='text'),flags=source.flatMap(t=>Array.from(norm(t.text),()=>t.red));if(norm(base.text)!==norm(support.text))return {...base,tokens:[...base.tokens,{kind:'strong',text:support.strong.join(' '),codes:support.strong}],strong:support.strong,alignment:false};let cursor=0;const tokens=support.tokens.flatMap(t=>{if(t.kind!=='text')return [t];let parts=[];for(const ch of t.text){const length=norm(ch).length,red=length?flags[cursor]===true:parts.at(-1)?.red===true;cursor+=length;const previous=parts.at(-1);if(previous&&previous.red===red)previous.text+=ch;else parts.push({...t,text:ch,red});}return parts;});return {...support,tokens:[...base.tokens.filter(t=>t.kind==='heading'),...tokens],alignment:true};}
module.exports={parseRtf,html,withStrong,clean};
