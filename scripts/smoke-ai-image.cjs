'use strict';
const assert=require('node:assert/strict');
module.exports=async({evaluate})=>{
  const result=await evaluate(`(async()=>{
    const caps=await window.libraryDesktop.getCapabilities();
    const status=await window.libraryDesktop.aiStatus();
    const error=async data=>{try{await window.libraryDesktop.aiImage(data);return {accepted:true};}catch(e){return {code:e.code,message:e.message,operation:e.operation};}};
    return {platform:caps.platform,image:caps.operations.aiImage.available,voice:caps.operations.playVoice.available,connected:status.connected,invalid:await error({prompt:'x'.repeat(601),aspect:'4:5'}),missing:await error({prompt:'Una montaña de prueba',aspect:'1:1'}),verses:document.querySelector('#verses').children.length};
  })()`);
  assert.equal(result.platform,'desktop');assert.equal(result.image,true);assert.equal(result.voice,false);assert.equal(result.connected,false,'Esta prueba solo admite un perfil inventado sin cuenta');assert.ok(result.verses>0);assert.equal(result.invalid.code,'VALIDATION');assert.equal(result.invalid.operation,'aiImage');assert.equal(result.missing.code,'UNAVAILABLE');assert.equal(result.missing.operation,'aiImage');assert.doesNotMatch(JSON.stringify(result),/sk-or-|openrouter\.bin|Error:|at AiService/);
  return {passed:8,...result};
};
