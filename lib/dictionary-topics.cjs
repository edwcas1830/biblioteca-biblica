'use strict';
const {clean}=require('./rtf.cjs');
const topicKey=topic=>clean(topic.replace(/\s*\(\d+\)\s*$/,'').trim());
class DictionaryTopics{
  constructor(){this.modules=new Map();}
  clear(){this.modules.clear();}
  find(module,db,query){
    let cached=this.modules.get(module.id);
    if(cached?.revision!==module.sha256){
      const topics=db.prepare('SELECT Topic FROM Dictionary').all().map(row=>({topic:row.Topic,key:topicKey(row.Topic)}));
      topics.sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:a.topic.localeCompare(b.topic,'es',{numeric:true}));
      cached={revision:module.sha256,topics};this.modules.set(module.id,cached);
    }
    const needle=topicKey(query),topics=cached.topics;let lo=0,hi=topics.length;
    while(lo<hi){const mid=(lo+hi)>>1;if(topics[mid].key<needle)lo=mid+1;else hi=mid;}
    const matches=[];for(let i=lo;i<topics.length&&topics[i].key.startsWith(needle)&&matches.length<30;i++)matches.push({...topics[i],exact:topics[i].key===needle,module:module.id,revision:module.sha256});
    return matches;
  }
}
module.exports={DictionaryTopics,topicKey};
