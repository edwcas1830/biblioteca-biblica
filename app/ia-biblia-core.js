(function(root){
  'use strict';
  // IA integrada (entrega 4): lo que la app hace sin red. Elige los pasajes que acompañan la pregunta y,
  // al volver la respuesta, revisa cada cita contra la Biblia instalada («Cita encontrada en tu Biblia»).
  const MODOS=[
    {id:'explicar',nombre:'Explicar un pasaje',ejemplo:'¿Qué significa este pasaje?'},
    {id:'tema',nombre:'¿Qué dice la Biblia?',ejemplo:'¿Qué dice la Biblia sobre el perdón?'},
    {id:'devocional',nombre:'Devocional',ejemplo:'Un devocional sobre la ansiedad'},
    {id:'oracion',nombre:'Ayúdame a orar',ejemplo:'Ayúdame a orar por mi familia'}
  ];
  const AVISO='La IA puede equivocarse. Comprueba las citas. No sustituye el acompañamiento pastoral.';
  const ABREV={'gn':'Génesis','gen':'Génesis','ex':'Éxodo','lv':'Levítico','nm':'Números','dt':'Deuteronomio','jos':'Josué','jue':'Jueces','1 s':'1 Samuel','2 s':'2 Samuel','1 r':'1 Reyes','2 r':'2 Reyes','1 cr':'1 Crónicas','2 cr':'2 Crónicas','esd':'Esdras','neh':'Nehemías','est':'Ester','sal':'Salmos','salmo':'Salmos','pr':'Proverbios','prov':'Proverbios','ec':'Eclesiastés','ecl':'Eclesiastés','cnt':'Cantares','cantar de los cantares':'Cantares','is':'Isaías','jer':'Jeremías','lm':'Lamentaciones','lam':'Lamentaciones','ez':'Ezequiel','dn':'Daniel','dan':'Daniel','os':'Oseas','jl':'Joel','am':'Amós','abd':'Abdías','jon':'Jonás','mi':'Miqueas','miq':'Miqueas','nah':'Nahúm','hab':'Habacuc','sof':'Sofonías','hag':'Hageo','zac':'Zacarías','mal':'Malaquías','mt':'Mateo','mat':'Mateo','mr':'Marcos','mc':'Marcos','lc':'Lucas','luc':'Lucas','jn':'Juan','hch':'Hechos','ro':'Romanos','rom':'Romanos','1 co':'1 Corintios','2 co':'2 Corintios','gá':'Gálatas','gal':'Gálatas','ef':'Efesios','fil':'Filipenses','flp':'Filipenses','col':'Colosenses','1 ts':'1 Tesalonicenses','2 ts':'2 Tesalonicenses','1 ti':'1 Timoteo','2 ti':'2 Timoteo','tit':'Tito','flm':'Filemón','he':'Hebreos','heb':'Hebreos','stg':'Santiago','sant':'Santiago','1 p':'1 Pedro','2 p':'2 Pedro','1 jn':'1 Juan','2 jn':'2 Juan','3 jn':'3 Juan','jud':'Judas','ap':'Apocalipsis','apoc':'Apocalipsis'};
  const sinTildes=t=>String(t).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();

  function indiceDeLibros(nombres){
    const mapa=new Map();
    nombres.forEach((n,i)=>{mapa.set(sinTildes(n),i);mapa.set(sinTildes(n).replace(/^([123]) /,'$1'),i);});
    for(const [a,n] of Object.entries(ABREV)){const i=nombres.indexOf(n);if(i>=0){mapa.set(sinTildes(a),i);mapa.set(sinTildes(a).replace(/^([123]) /,'$1'),i);}}
    mapa.set('salmo',nombres.indexOf('Salmos'));mapa.set('cantar de los cantares',nombres.indexOf('Cantares'));
    return mapa;
  }
  // «Juan 3:16», «1 Juan 4:7-8», «Sal 23:1», «Filipenses 4:6,7» → referencias {book, chapter, verse, endVerse, texto, inicio, fin}.
  function extraerCitas(texto,nombres){
    const mapa=indiceDeLibros(nombres),resultado=[];
    const re=/((?:[123]\s?)?[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+(?:\s(?:de\s)?(?:los\s)?[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+)?)\.?\s(\d{1,3}):(\d{1,3})(?:\s?[-–‑‐]\s?(\d{1,3})|,\s?(\d{1,3}))?/g;
    let m;
    while((m=re.exec(String(texto||'')))){
      let nombre=sinTildes(m[1]).replace(/\s+/g,' ').trim();
      let book=mapa.get(nombre);
      // «… en Juan 3:16»: si el nombre trae una palabra de más delante, se prueba con la última.
      // La cita marcada empieza en el nombre del libro, sin la palabra de más («y», «en»…).
      let sobra=0;
      if(book===undefined){const partes=m[1].trim().split(/\s+/);for(let k=1;k<partes.length&&book===undefined;k++){book=mapa.get(sinTildes(partes.slice(k).join(' ')));if(book!==undefined)sobra=m[0].indexOf(partes[k],m[0].length-m[0].trimStart().length);}}
      if(book===undefined||book<0)continue;
      const verse=Number(m[3]),fin=Number(m[4]||m[5]||0),inicio=m.index+(sobra||(m[0].length-m[0].trimStart().length));
      resultado.push({book,chapter:Number(m[2]),verse,...(fin>verse?{endVerse:fin}:{}),texto:m[0].slice(inicio-m.index),inicio,fin:m.index+m[0].length});
    }
    return resultado;
  }
  // Una cita existe si el capítulo y los versículos están en la Biblia instalada (versos por capítulo).
  function existe(r,libros){const cap=libros[r.book]&&libros[r.book].chapters[r.chapter-1];if(!cap)return false;const n=Array.isArray(cap)?cap.length:Number(cap);return r.verse>=1&&r.verse<=n&&(!r.endVerse||r.endVerse<=n);}
  const clave=r=>r.book+':'+r.chapter+':'+r.verse;
  // ¿La cita estaba entre los pasajes que mandó la app? (si no, igual puede existir: se marca distinto).
  function dentroDe(r,pasajes){return pasajes.some(p=>p.book===r.book&&p.chapter===r.chapter&&r.verse>=p.verse&&(r.endVerse||r.verse)<=(p.endVerse||p.verse));}
  function verificar(texto,nombres,libros,pasajes=[]){
    return extraerCitas(texto,nombres).map(c=>({...c,existe:existe(c,libros),enPasajes:dentroDe(c,pasajes)}));
  }
  // Cuántas veces se puede preguntar hoy (lo dice el servidor; aquí solo el texto).
  const textoCuota=(quedan,limite)=>quedan===undefined?'':quedan<=0?'Ya usaste tus '+limite+' preguntas de hoy.':(quedan===1?'Te queda 1 de ':'Te quedan '+quedan+' de ')+limite+' hoy.';
  const idem=()=>{const a=new Uint8Array(12);(globalThis.crypto||require('node:crypto').webcrypto).getRandomValues(a);return [...a].map(x=>x.toString(16).padStart(2,'0')).join('');};
  // Historial local: últimas 30 conversaciones, sin nada más.
  function validarHistorial(h){
    if(!Array.isArray(h))return [];
    return h.filter(x=>x&&MODOS.some(m=>m.id===x.modo)&&typeof x.pregunta==='string'&&typeof x.respuesta==='string').slice(0,30)
      .map(x=>({modo:x.modo,pregunta:x.pregunta.slice(0,600),respuesta:x.respuesta.slice(0,8000),fecha:typeof x.fecha==='string'?x.fecha.slice(0,30):'',ref:typeof x.ref==='string'?x.ref.slice(0,40):''}));
  }
  const api={MODOS,AVISO,extraerCitas,existe,verificar,dentroDe,textoCuota,idem,validarHistorial,clave,sinTildes};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.IaBibliaCore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
