(function(root){
  'use strict';
  const panels=['biblia','comentario','diccionario'];
  const combinations=[['biblia'],['biblia','comentario'],['biblia','diccionario'],panels];
  const key=(layout,visible)=>layout+'|'+visible.join(',');
  function defaults(layout,visible){return {weights:visible.length<2?[100]:layout==='columns'&&visible.length===3?[42,30,28]:layout==='columns'?[58,42]:visible.length===3?[50,50]:[60,40],...(layout==='rows'&&visible.length===3?{aux:[50,50]}:{})};}
  const validWeights=(values,length)=>Array.isArray(values)&&values.length===length&&values.every(n=>Number.isFinite(n)&&n>=10&&n<=90)&&Math.abs(values.reduce((a,b)=>a+b,0)-100)<.01;
  function normalize(value,legacy){
    const layout=value?.layout==='rows'?'rows':'columns';
    const visible=['biblia',...panels.slice(1).filter(id=>!Array.isArray(value?.visible)||value.visible.includes(id))];
    const sizes={};
    for(const orientation of ['columns','rows'])for(const group of combinations){
      if(group.length===1)continue;
      const id=key(orientation,group),candidate=value?.sizes?.[id],expected=defaults(orientation,group);
      if(candidate&&validWeights(candidate.weights,expected.weights.length)&&(!expected.aux||validWeights(candidate.aux,2)))sizes[id]={weights:[...candidate.weights],...(expected.aux?{aux:[...candidate.aux]}:{})};
    }
    const legacyValues=legacy&&panels.map(id=>legacy[id]);
    const legacyKey=key('columns',panels);
    if(!sizes[legacyKey]&&validWeights(legacyValues,3))sizes[legacyKey]={weights:legacyValues};
    return {layout,visible,sizes};
  }
  const configuration=(views,visible=views.visible)=>views.sizes[key(views.layout,visible)]||defaults(views.layout,visible);
  // Rebalance a pair without moving a third track, bounded by pixels and valid saved weights.
  function resize(config,field,first,second,ratio,span,minimum){
    const values=[...config[field]],total=values[first]+values[second];
    const low=Math.max(1000/total,Math.min(50,100*minimum/span)),high=100-low;
    ratio=Math.max(low,Math.min(high,ratio));
    values[first]=total*ratio/100;values[second]=total-values[first];
    return {...config,[field]:values};
  }
  const api={panels,key,defaults,normalize,configuration,resize};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.PaneLayoutCore=api;
})(typeof window==='object'?window:globalThis);
