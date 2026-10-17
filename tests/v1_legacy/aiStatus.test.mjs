import test from 'node:test';
import assert from 'node:assert/strict';
import statusApi from '../game/aiStatus.js';

const response=(status,body)=>({status,ok:status>=200&&status<300,json:async()=>body});

test('health probe caches for 60 seconds and forced refresh bypasses cache',async()=>{
  statusApi.resetAiStatusForTests();
  const original=Date.now;let now=1000,calls=0;Date.now=()=>now;
  const fetchImpl=async()=>{calls++;return response(200,{ai_enabled:true})};
  try{
    assert.equal((await statusApi.probeAiAvailability(fetchImpl)).mode,'live');
    now+=59000;await statusApi.probeAiAvailability(fetchImpl);assert.equal(calls,1);
    await statusApi.refreshAiStatus(fetchImpl);assert.equal(calls,2);
  }finally{Date.now=original}
});

test('health probe maps disabled, rate limited, and failed probes',async()=>{
  statusApi.resetAiStatusForTests();
  assert.deepEqual(await statusApi.refreshAiStatus(async()=>response(503,{})),{mode:'offline',reason:'disabled'});
  assert.deepEqual(await statusApi.refreshAiStatus(async()=>response(429,{until:1234})),{mode:'degraded',reason:'rate_limited',until:1234000});
  assert.deepEqual(await statusApi.refreshAiStatus(async()=>{throw new Error('down')}),{mode:'offline',reason:'error'});
});

test('429 reset timestamps normalize seconds to epoch milliseconds',async()=>{
  statusApi.resetAiStatusForTests();
  assert.deepEqual(
    await statusApi.refreshAiStatus(async()=>response(429,{until:1792036800})),
    {mode:'degraded',reason:'rate_limited',until:1792036800000},
  );
});

test('failed probes are not cached and use a mobile-safe timeout',async()=>{
  statusApi.resetAiStatusForTests();
  let calls=0;
  const fetchImpl=async()=>{calls++;if(calls===1)throw new Error('down');return response(200,{ai_enabled:true})};
  assert.equal(statusApi.PROBE_TIMEOUT_MS,2500);
  assert.deepEqual(await statusApi.probeAiAvailability(fetchImpl),{mode:'offline',reason:'error'});
  assert.deepEqual(await statusApi.probeAiAvailability(fetchImpl),{mode:'live',reason:'ok'});
  assert.equal(calls,2);
});

test('synchronous getter reflects explicit offline toggle',()=>{
  statusApi.setAiStatus({mode:'offline',reason:'disabled'});
  assert.deepEqual(statusApi.getAiStatus(),{mode:'offline',reason:'disabled'});
});
