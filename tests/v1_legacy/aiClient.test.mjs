import test from 'node:test';
import assert from 'node:assert/strict';
import client from '../game/aiClient.js';

const response=(status,body,json=true)=>({status,ok:status>=200&&status<300,json:async()=>{if(!json)throw new Error('not json');return body}});

test('200 responses pass through unchanged',async()=>{
  const body={provider:'decider',choice:'science'};
  assert.deepEqual(await client.decide({}, {fetchImpl:async()=>response(200,body)}),body);
});

test('POST includes the payload hash CloudFront OAC requires',async()=>{
  let request;
  await client.decide({}, {fetchImpl:async(_url,options)=>{request=options;return response(200,{})}});
  assert.equal(request.body,'{}');
  assert.equal(request.headers['x-amz-content-sha256'],'44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a');
});

test('503 and 429 responses return typed fallbacks',async()=>{
  assert.deepEqual(await client.decide({}, {fetchImpl:async()=>response(503,{})}),{fallback:true,reason:'disabled'});
  assert.deepEqual(await client.decide({}, {fetchImpl:async()=>response(429,{until:42})}),{fallback:true,reason:'rate_limited',until:42});
});

test('external cancellation wins over a concurrently resolved AI response',async()=>{
  const controller=new AbortController();
  const fetchImpl=async()=>({
    status:200,
    ok:true,
    json:async()=>{controller.abort('cancelled');return {provider:'decider',choice:'science'}},
  });
  assert.deepEqual(
    await client.decide({}, {fetchImpl,signal:controller.signal}),
    {fallback:true,reason:'cancelled'},
  );
});

test('timeout returns fallback without waiting for the production timeout',async()=>{
  const fetchImpl=(_url,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true}));
  assert.deepEqual(await client.decide({}, {fetchImpl,timeoutMs:5}),{fallback:true,reason:'timeout'});
});

test('non-JSON and network failures return fallbacks',async()=>{
  assert.deepEqual(await client.narrate({}, {fetchImpl:async()=>response(200,null,false)}),{fallback:true,reason:'non_json'});
  assert.deepEqual(await client.narrate({}, {fetchImpl:async()=>{throw new Error('down')}}),{fallback:true,reason:'network_error'});
});
