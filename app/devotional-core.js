(function(root){
 'use strict';
 const bounded=(n,max)=>Number.isInteger(n)?Math.max(0,Math.min(max,n)):0;
 function metadata(dev){const total=dev.entries.length,completed=[...new Set(dev.completed||[])].filter(i=>Number.isInteger(i)&&i>=0&&i<total),finished=total>0&&completed.length===total;return {status:finished?'finished':'in-progress',finishedAt:finished&&typeof dev.finishedAt==='string'&&!Number.isNaN(Date.parse(dev.finishedAt))?dev.finishedAt:null,lastIndex:bounded(dev.lastIndex,total-1),pages:Object.fromEntries(Object.entries(dev.pages||{}).filter(([k,v])=>/^\d+$/.test(k)&&Number(k)<total&&Number.isInteger(v)&&v>=0&&v<10000)),importWarnings:Array.isArray(dev.importWarnings)?dev.importWarnings.filter(s=>typeof s==='string').slice(0,30).map(s=>s.slice(0,1000)):[]};}
 function progress(dev,now=new Date().toISOString()){const m=metadata(dev);Object.assign(dev,m,{finishedAt:m.status==='finished'?(m.finishedAt||now):null});return dev;}
 const api={metadata,progress};if(typeof module==='object'&&module.exports)module.exports=api;else root.DevotionalCore=api;
})(typeof window==='object'?window:globalThis);
