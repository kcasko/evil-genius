const {test}=require('node:test');
const assert=require('node:assert/strict');
const A=require('../game/aiStatus.js');
const response=(status,body)=>({status,ok:status>=200&&status<300,json:async()=>body});
test('a healthy bridge slower than the old 2.5-second window is accepted', {timeout:6000}, async()=>{
  A.resetAiStatusForTests();
  const result=await A.refreshAiStatus((url,{signal})=>new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>resolve(response(200,{ai_enabled:true})),3500);
    signal.addEventListener('abort',()=>{clearTimeout(timer);reject(Error('premature abort'))});
  }));
  assert.equal(result.mode,'live');
});
test('a stalled availability probe is still aborted and falls back', {timeout:12000}, async()=>{
  A.resetAiStatusForTests();let aborted=false;
  const result=await A.refreshAiStatus((url,{signal})=>new Promise((resolve,reject)=>{
    signal.addEventListener('abort',()=>{aborted=true;reject(Error('aborted'))});
  }));
  assert.equal(aborted,true);assert.equal(result.mode,'offline');
});
test('disabled, daily-limit and retry responses preserve status semantics',async()=>{
  assert.equal((await A.refreshAiStatus(async()=>response(503,{ai_enabled:false}))).reason,'disabled');
  assert.equal((await A.refreshAiStatus(async()=>response(429,{until:1792036800}))).mode,'degraded');
  assert.equal((await A.refreshAiStatus(async()=>response(200,{ai_enabled:true}))).mode,'live');
});
