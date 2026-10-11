(function(root){
  'use strict';
  // Buscador único (CONSENSO-MOVIL.md, paso 1): entiende lo que la persona escribe y propone, en orden,
  // ir a la referencia → libros por prefijo → buscar la palabra en el texto → número Strong.
  // «rey» → 1 Reyes, 2 Reyes · «jn 3 16» → Juan 3:16 · «primera de reyes 8» → 1 Reyes 8 · «h7121» → Strong.
  const limpiar=s=>String(s??'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase()
    .replace(/[–—−]/g,'-').replace(/[.,;]/g,' ').replace(/\s+/g,' ').trim();
  // Ordinales escritos («primera de», «1ra», «I», «segundo»…) → «1 », «2 », «3 ».
  const ORDINALES=[[/^(primera|primero|primer|1ra|1era|1a|1o|i)\s+(de\s+)?/,'1 '],[/^(segunda|segundo|2da|2a|2o|ii)\s+(de\s+)?/,'2 '],[/^(tercera|tercero|3ra|3a|3o|iii)\s+(de\s+)?/,'3 ']];
  // Nombre principal y abreviaturas (RV1960 y comunes). El orden es el canónico: el índice es el libro.
  const ALIAS=[['genesis','gen','gn'],['exodo','ex','exo','exod'],['levitico','lev','lv'],['numeros','num','nm'],['deuteronomio','deut','dt'],['josue','jos'],['jueces','jue','jc'],['rut','rt','ruth'],['1 samuel','1 sam','1 s','1 sa'],['2 samuel','2 sam','2 s','2 sa'],['1 reyes','1 rey','1 re','1 r'],['2 reyes','2 rey','2 re','2 r'],['1 cronicas','1 cro','1 cr'],['2 cronicas','2 cro','2 cr'],['esdras','esd'],['nehemias','neh'],['ester','est'],['job','jb'],['salmos','salmo','sal','sl','ps'],['proverbios','prov','pr','pro'],['eclesiastes','ecl','ec'],['cantares','cantar de los cantares','cant','cnt','cantico de los canticos'],['isaias','isa','is'],['jeremias','jer','jr'],['lamentaciones','lam','lm'],['ezequiel','eze','ez'],['daniel','dan','dn'],['oseas','os'],['joel','jl'],['amos','am'],['abdias','abd','ab'],['jonas','jon'],['miqueas','miq','mi'],['nahum','nah'],['habacuc','hab'],['sofonias','sof'],['hageo','hag','ag'],['zacarias','zac'],['malaquias','mal'],['mateo','mat','mt'],['marcos','mar','mr','mc'],['lucas','luc','lc'],['juan','jn','jua'],['hechos','hech','hch','hec'],['romanos','rom','ro'],['1 corintios','1 cor','1 co'],['2 corintios','2 cor','2 co'],['galatas','gal','ga'],['efesios','efe','ef'],['filipenses','filip','fil','flp'],['colosenses','col'],['1 tesalonicenses','1 tes','1 ts'],['2 tesalonicenses','2 tes','2 ts'],['1 timoteo','1 tim','1 ti','1 tm'],['2 timoteo','2 tim','2 ti','2 tm'],['tito','tit'],['filemon','flm','filem'],['hebreos','heb','he'],['santiago','sant','stg','stgo'],['1 pedro','1 ped','1 pe','1 p'],['2 pedro','2 ped','2 pe','2 p'],['1 juan','1 jn','1 jua'],['2 juan','2 jn','2 jua'],['3 juan','3 jn','3 jua'],['judas','jud'],['apocalipsis','apoc','ap','revelacion']];
  const normalNombre=s=>{let t=limpiar(s);for(const [re,r] of ORDINALES)t=t.replace(re,r);return t.replace(/^([123])\s*(?=[a-z])/,'$1 ');};
  const exacto=new Map();ALIAS.forEach((lista,b)=>lista.forEach(a=>exacto.set(a.replace(/\s/g,''),b)));

  // Libros cuyo nombre (o una de sus palabras) empieza por lo escrito. «rey» → 1 y 2 Reyes; «1 r» → 1 Reyes.
  function librosPorPrefijo(texto,books){
    const t=normalNombre(texto);if(!t)return [];
    const compacto=t.replace(/\s/g,'');
    const fijo=exacto.get(compacto);
    const res=[];
    ALIAS.forEach((lista,b)=>{
      if(b>=(books?.length??66))return;
      const nombre=limpiar(books?.[b]?.name)||lista[0];
      const candidatos=[nombre,lista[0]];
      const num=/^([123]) (.*)$/.exec(t);
      const coincide=candidatos.some(c=>{
        if(num){const cn=/^([123]) (.*)$/.exec(c);return !!cn&&cn[1]===num[1]&&cn[2].startsWith(num[2]);}
        return c.startsWith(t)||c.split(' ').some(p=>p.length>1&&p.startsWith(t));
      });
      if(coincide||fijo===b)res.push(b);
    });
    // El que coincide exactamente con una abreviatura va primero.
    if(fijo!==undefined&&res.includes(fijo))res.splice(res.indexOf(fijo),1),res.unshift(fijo);
    return res;
  }

  // «jn 3 16», «juan 3:16», «1 r 8», «primera de reyes 8», «sal 23:1-4», «filemon 4» (libro de un capítulo).
  function referencia(texto,books){
    const t=normalNombre(texto);
    const m=/^((?:[123] )?[a-zñ]+(?: [a-zñ]+)*?) ?(\d+)(?:(?: ?: ?| )(\d+)(?: ?- ?(\d+))?)?$/.exec(t);
    if(!m)return null;
    let b=exacto.get(m[1].replace(/\s/g,''));
    if(b===undefined){const p=librosPorPrefijo(m[1],books);if(p.length!==1)return null;b=p[0];}
    const capitulos=books?.[b]?.chapters?.length;if(!capitulos)return null;
    let capitulo=Number(m[2]),verso=m[3]===undefined?undefined:Number(m[3]),hasta=m[4]===undefined?undefined:Number(m[4]);
    // Libros de un capítulo: «judas 4» es el versículo 4.
    if(capitulos===1&&verso===undefined&&capitulo>1){verso=capitulo;capitulo=1;}
    if(capitulo<1||capitulo>capitulos)return null;
    const versos=books[b].chapters[capitulo-1].length;
    if(verso!==undefined&&(verso<1||verso>versos))return null;
    if(hasta!==undefined&&(verso===undefined||hasta<verso||hasta>versos))hasta=undefined;
    return {book:b,chapter:capitulo,...(verso!==undefined?{verse:verso}:{}),...(hasta!==undefined&&hasta!==verso?{endVerse:hasta}:{})};
  }

  const strong=texto=>{const m=/^\s*([hg])\s*0*(\d{1,5})\s*$/i.exec(String(texto??''));return m?m[1].toUpperCase()+Number(m[2]):null;};

  function sugerencias(texto,books){
    const crudo=String(texto??'').trim();
    if(!crudo)return {ir:null,libros:[],palabra:null,strong:null};
    const s=strong(crudo);
    if(s)return {ir:null,libros:[],palabra:null,strong:s};
    const ir=referencia(crudo,books);
    // Sin referencia única («rey 8» puede ser 1 o 2 Reyes): libros por la parte del nombre, con el capítulo escrito.
    const t=normalNombre(crudo),cola=/\s(\d+)(?:\s*[: ]\s*\d+)*(?:\s*-\s*\d+)?$/.exec(t);
    const parteNombre=cola?t.slice(0,cola.index).trim():t;
    const libros=ir?[]:librosPorPrefijo(parteNombre,books).slice(0,8);
    const capitulo=!ir&&cola?Number(cola[1]):null;
    const palabra=crudo.length>=2&&!/^\d+$/.test(crudo)&&!ir?crudo.slice(0,100):null;
    return {ir,libros,capitulo,palabra,strong:null};
  }

  function nombre(ref,books){return books[ref.book].name+' '+ref.chapter+(ref.verse?':'+ref.verse+(ref.endVerse?'-'+ref.endVerse:''):'');}

  const api={limpiar,normalNombre,librosPorPrefijo,referencia,strong,sugerencias,nombre,ALIAS};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.BuscadorCore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
