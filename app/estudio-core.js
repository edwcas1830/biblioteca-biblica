(function(root){
  'use strict';
  // «Mi estudio» (CONSENSO-MOVIL.md, paso 4): un solo modelo de marcas sobre versículos, al estilo AndBible.
  // marcas: marcador · etiqueta (con nombre) · memoria; colores: nombre para cada color de resaltado
  // («Highlight Labels» de e-Sword, lo que Edward llamó «resaltar nombres»); historial: lo último leído.
  // Viaja en state.estudio (copias, traspaso PC → teléfono). Las notas siguen en state.notes (bajo el candado).
  const TIPOS=['marcador','etiqueta','memoria'], COLORES=['gold','sage','rose'];
  const MAX_MARCAS=5000, MAX_HISTORIAL=200;
  const vacio=()=>({marcas:[],colores:{gold:'',sage:'',rose:''},historial:[]});
  const texto=(v,max)=>String(v??'').replace(/[\u0000-\u001f]/g,' ').trim().slice(0,max);
  const entero=v=>Number.isInteger(v)&&v>0;
  function refValida(r,validPosition){
    if(!r||!Number.isInteger(r.book)||r.book<0||r.book>65||!entero(r.chapter))return false;
    if(r.verse!==undefined&&!entero(r.verse))return false;
    if(r.endVerse!==undefined&&(!entero(r.endVerse)||r.verse===undefined||r.endVerse<r.verse))return false;
    if(typeof validPosition==='function'&&!validPosition({book:r.book,chapter:r.chapter,verse:r.verse||1}))return false;
    if(typeof validPosition==='function'&&r.endVerse!==undefined&&!validPosition({book:r.book,chapter:r.chapter,verse:r.endVerse}))return false;
    return true;
  }
  const soloRef=r=>({book:r.book,chapter:r.chapter,...(r.verse!==undefined?{verse:r.verse}:{}),...(r.endVerse!==undefined&&r.endVerse!==r.verse?{endVerse:r.endVerse}:{})});
  // Lo guardado se valida igual que el resto del estado: lo que no cumple se descarta (no rompe la copia).
  function validar(entrada,validPosition){
    const e=vacio();
    if(!entrada||typeof entrada!=='object'||Array.isArray(entrada))return e;
    const ids=new Set();
    for(const m of Array.isArray(entrada.marcas)?entrada.marcas.slice(0,MAX_MARCAS):[]){
      if(!m||typeof m!=='object'||!/^m-[a-z0-9-]{4,60}$/.test(m.id)||ids.has(m.id)||!TIPOS.includes(m.tipo)||!refValida(m,validPosition))continue;
      const etiqueta=m.tipo==='etiqueta'?texto(m.etiqueta,40):'';
      if(m.tipo==='etiqueta'&&!etiqueta)continue;
      ids.add(m.id);
      e.marcas.push({id:m.id,tipo:m.tipo,...soloRef(m),...(etiqueta?{etiqueta}:{}),creado:typeof m.creado==='string'&&!isNaN(Date.parse(m.creado))?m.creado:new Date(0).toISOString()});
    }
    const c=entrada.colores&&typeof entrada.colores==='object'?entrada.colores:{};
    for(const k of COLORES)e.colores[k]=texto(c[k],30);
    for(const h of Array.isArray(entrada.historial)?entrada.historial.slice(0,MAX_HISTORIAL):[]){
      if(!h||!refValida(h,validPosition)||!Number.isFinite(h.t))continue;
      e.historial.push({...soloRef({book:h.book,chapter:h.chapter,verse:h.verse}),t:h.t});
    }
    return e;
  }
  const mismaRef=(a,b)=>a.book===b.book&&a.chapter===b.chapter&&(a.verse||0)===(b.verse||0)&&(a.endVerse||0)===(b.endVerse||0);
  const nuevoId=()=>'m-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);
  // Historial por capítulo: el más reciente arriba, sin repetir el mismo capítulo seguido.
  function alHistorial(e,pos,ahora=Date.now()){
    const h=(e.historial||[]).filter(x=>!(x.book===pos.book&&x.chapter===pos.chapter));
    h.unshift({book:pos.book,chapter:pos.chapter,...(pos.verse?{verse:pos.verse}:{}),t:ahora});
    return {...e,historial:h.slice(0,MAX_HISTORIAL)};
  }
  const tiene=(e,tipo,ref,etiqueta)=>(e.marcas||[]).some(m=>m.tipo===tipo&&mismaRef(m,ref)&&(tipo!=='etiqueta'||m.etiqueta===etiqueta));
  // Marcador y memoria se alternan; una etiqueta se agrega (o se quita si ya estaba con ese nombre).
  function alternar(e,tipo,ref,etiqueta=''){
    if(!TIPOS.includes(tipo))throw new Error('Tipo de marca no válido.');
    const nombre=tipo==='etiqueta'?texto(etiqueta,40):'';
    if(tipo==='etiqueta'&&!nombre)throw new Error('Escribe el nombre de la etiqueta.');
    if(tiene(e,tipo,ref,nombre))return {...e,marcas:e.marcas.filter(m=>!(m.tipo===tipo&&mismaRef(m,ref)&&(tipo!=='etiqueta'||m.etiqueta===nombre)))};
    if((e.marcas||[]).length>=MAX_MARCAS)throw new Error('Llegaste al máximo de marcas.');
    return {...e,marcas:[{id:nuevoId(),tipo,...soloRef(ref),...(nombre?{etiqueta:nombre}:{}),creado:new Date().toISOString()},...(e.marcas||[])]};
  }
  const etiquetas=e=>[...new Set((e.marcas||[]).filter(m=>m.tipo==='etiqueta').map(m=>m.etiqueta))].sort((a,b)=>a.localeCompare(b,'es'));
  function nombreRef(r,books){return books[r.book].name+' '+r.chapter+(r.verse?':'+r.verse+(r.endVerse?'-'+r.endVerse:''):'');}
  // Resaltados y notas viven en el estado de siempre (claves «libro:cap:vers»); aquí solo se listan.
  function desdeClaves(obj){return Object.entries(obj||{}).map(([k,v])=>{const [book,chapter,verse]=k.split('@').at(-1).split(':').map(Number);return {book,chapter,verse,valor:v,clave:k};}).filter(x=>Number.isInteger(x.book)).sort((a,b)=>a.book-b.book||a.chapter-b.chapter||a.verse-b.verse);}
  const api={TIPOS,COLORES,vacio,validar,alHistorial,alternar,tiene,etiquetas,nombreRef,desdeClaves,mismaRef};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.EstudioCore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
