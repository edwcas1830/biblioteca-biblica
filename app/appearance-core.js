(function(root){
  'use strict';
  const designs=['a','b','c'],themes=['auto','marfil','sepia','noche'];
  function normalize(value){
    const result={design:designs.includes(value?.design)?value.design:'a',theme:themes.includes(value?.theme)?value.theme:'auto'};
    if(value?.views&&typeof value.views==='object')result.views=value.views;
    const panes=value?.panes;
    if(panes&&['biblia','comentario','diccionario'].every(id=>Number.isFinite(panes[id])&&panes[id]>=10&&panes[id]<=80)){
      const sum=panes.biblia+panes.comentario+panes.diccionario;
      if(Math.abs(sum-100)<.1)result.panes={biblia:panes.biblia,comentario:panes.comentario,diccionario:panes.diccionario};
    }
    return result;
  }
  function themeAt(preference,hour=new Date().getHours()){return preference!=='auto'&&themes.includes(preference)?preference:(hour>=7&&hour<19?'marfil':'noche');}
  const api={normalize,themeAt};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.AppearanceCore=api;
})(typeof window==='object'?window:globalThis);
