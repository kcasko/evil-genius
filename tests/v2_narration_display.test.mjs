import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),AI=require('../game/aiClient.js');
const reply=text=>({fetchImpl:async()=>({ok:true,status:200,json:async()=>({provider:'bedrock',narration:text})})});
test('cosmetic narration cannot display invented statistics',async()=>{
 const r=await AI.narrate({},reply('Our breach was executed with a 97% success rate, as anticipated. Perfect.'));
 assert.equal(r.fallback,true);assert.equal(r.reason,'unsupported_numbers');
});
test('character model names and ordinary flavor remain available',async()=>{
 const text='CHAOS-9000 approves of this paperwork. The moon can file a complaint.';
 const r=await AI.narrate({},reply(text));assert.equal(r.narration,text);
});

for(const text of ["At least we've conserved our precious CP.", 'We saved our command points.', 'No command-point cost today.', 'The crew spent CP wisely.']){
 test('reject generated spending claim: '+text,async()=>{
  const r=await AI.narrate({},reply(text));
  assert.equal(r.fallback,true);assert.equal(r.reason,'unsupported_command_points');
 });
}
