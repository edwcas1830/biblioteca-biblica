(function(root){
  'use strict';
  // Memorizar (entrega 3B): repaso espaciado de los versículos marcados «Para memorizar». Cada versículo está en
  // una «caja» (0 a 5); acertar lo sube y lo aleja (1, 3, 7, 14, 30, 60 días); fallar lo vuelve a la caja 0 (mañana).
  // Las pistas van de leerlo completo a solo la primera letra de cada palabra. Todo local; viaja en state.memorizar.
  const DIAS=[1,3,7,14,30,60];
  const NIVELES=['Léelo completo','Faltan algunas palabras','Faltan la mitad','Solo la primera letra'];
  const dos=n=>String(n).padStart(2,'0');
  const clave=(d=new Date())=>d.getFullYear()+'-'+dos(d.getMonth()+1)+'-'+dos(d.getDate());
  const sumar=(k,n)=>{const [a,m,d]=k.split('-').map(Number);return clave(new Date(a,m-1,d+n));};
  const idDe=r=>r.book+':'+r.chapter+':'+r.verse+(r.endVerse?'-'+r.endVerse:'');
  function validar(e){
    const r={};
    if(!e||typeof e!=='object'||Array.isArray(e))return r;
    for(const [k,v] of Object.entries(e).slice(0,5000)){
      if(!/^\d{1,2}:\d{1,3}:\d{1,3}(-\d{1,3})?$/.test(k)||!v||typeof v!=='object')continue;
      const caja=Number.isInteger(v.caja)?Math.max(0,Math.min(DIAS.length-1,v.caja)):0;
      const proximo=typeof v.proximo==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v.proximo)?v.proximo:'';
      r[k]={caja,proximo,repasos:Number.isInteger(v.repasos)&&v.repasos>=0?Math.min(v.repasos,1e5):0};
    }
    return r;
  }
  // El nivel de pista sale de la caja: los nuevos se leen completos; los avanzados casi sin ayuda.
  const nivelDe=caja=>caja<=0?0:caja===1?1:caja<=3?2:3;
  function repasar(estado,ref,acierto,hoy=new Date()){
    const k=idDe(ref),antes=estado[k]||{caja:0,proximo:'',repasos:0},h=clave(hoy);
    const caja=acierto?Math.min(DIAS.length-1,antes.caja+(antes.repasos?1:0)):0;
    return {...estado,[k]:{caja,proximo:sumar(h,acierto?DIAS[caja]:1),repasos:antes.repasos+1}};
  }
  // Versículos marcados, con los que tocan hoy primero (los nuevos también tocan hoy).
  function lista(marcas,estado,hoy=new Date()){
    const h=clave(hoy);
    return marcas.filter(m=>m.tipo==='memoria').map(m=>{const r={book:m.book,chapter:m.chapter,verse:m.verse,...(m.endVerse?{endVerse:m.endVerse}:{})},p=estado[idDe(r)]||{caja:0,proximo:'',repasos:0};return {...r,id:idDe(r),...p,toca:!p.proximo||p.proximo<=h};})
      .sort((a,b)=>(b.toca-a.toca)||(a.proximo||'').localeCompare(b.proximo||''));
  }
  // Oculta palabras según el nivel, siempre las mismas para el mismo versículo (semilla = id).
  function pistas(texto,nivel,semilla=''){
    const partes=String(texto).split(/(\s+)/);let s=0;for(const c of semilla)s=(s*31+c.charCodeAt(0))>>>0;
    const azar=()=>{s=(s*1103515245+12345)>>>0;return (s>>>8)/16777216;};
    return partes.map(p=>{
      if(/^\s+$/.test(p)||!/[\p{L}\p{N}]/u.test(p))return {t:p,oculta:false};
      const ocultar=nivel===3||(nivel===2&&azar()<0.5)||(nivel===1&&azar()<0.25);
      if(!ocultar)return {t:p,oculta:false};
      const m=/^([^\p{L}\p{N}]*)([\p{L}\p{N}])([\p{L}\p{N}]*)(.*)$/u.exec(p);
      return m?{t:p,oculta:true,pista:m[1]+m[2]+'_'.repeat(Math.min(8,m[3].length))+m[4]}:{t:p,oculta:false};
    });
  }
  const api={DIAS,NIVELES,validar,repasar,lista,pistas,nivelDe,idDe,clave,sumar};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.MemorizarCore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
