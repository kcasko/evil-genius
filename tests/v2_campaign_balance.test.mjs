import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const E=require('../game/v2/engine.js');
function fixture(id,stage,campaign=true,seed='balance') {
 const s=E.createFreshGame({seed,campaign,playerId:'qa',runId:'balance'});
 const m=s.missions[id];m.stage=stage;m.status='in_progress';m.assigned=['boris','chaos','kevin'];m.loadout=['hammer','ledger'];
 m.stageResults=[{stage:'scout',pass:true},{stage:'approach',pass:true,routeId:'front'}];
 return s;
}
test('campaign escape uses one relevant specialist and matching equipment, retaining meaningful plan differences',()=>{
 const s=fixture('funding','escape');
 const plans=Object.fromEntries(['fast','clever','loud'].map(plan=>[plan,E.stageProbability(s,'funding','escape',{plan})]));
 assert.ok(new Set(Object.values(plans).map(p=>p.probability)).size>1);
 assert.ok(!plans.clever.reasons.some(r=>/Ledger synergy|Hammer synergy/.test(r)));
 assert.equal(plans.clever.reasons.filter(r=>/^(Dr\. Malpractice|Boris the Brute|CHAOS-9000|Kevin from Accounting) \(/.test(r)).length,1);
 const extra=structuredClone(s);extra.missions.funding.assigned.push('mal');
 assert.equal(E.stageProbability(extra,'funding','escape',{plan:'clever'}).probability,plans.clever.probability);
 assert.equal(JSON.stringify(s),JSON.stringify(fixture('funding','escape')));
});
test('legacy escape keeps its original all-crew probabilities',()=>{
 const s=fixture('moon','escape',false);
 assert.equal(E.stageProbability(s,'moon','escape',{plan:'clever'}).probability,.86);
});
test('campaign escape preview matches the roll while the full crew still takes stress',()=>{
 const s=fixture('funding','escape');
 const p=E.stageProbability(s,'funding','escape',{plan:'clever'});
 const r=E.resolveEscape(s,'funding','clever');
 assert.equal(r.dc,p.effectiveDC);
 for(const id of ['chaos','kevin'])assert.ok(r.state.henchmen[id].stress>s.henchmen[id].stress);
 assert.ok(r.state.henchmen.boris.rage>s.henchmen.boris.rage);
 // The irrelevant ledger is not used to erase heat on a clever getaway.
 if(r.pass)assert.equal(r.state.heat-s.heat,5);
});
test('campaign failure refunds its launch fee without generating profit, for breach and escape',()=>{
 for(const [id,fee] of [['funding',40],['satellite',60],['prototype',80],['moon',150],['prep',60]]){
  for(const stage of id==='prep'?['breach']:['breach','escape']){
   let found=false;
   for(let i=0;i<200&&!found;i++){
    const s=fixture(id,stage,true,'refund-'+i);s.money=400;s.heat=70;
    const r=id==='prep'?E.resolvePrepPayoff(s,{sideOpKind:'surveillance'}):stage==='breach'?E.resolveBreach(s,id,null):E.resolveEscape(s,id,'loud');
    if(!r.pass){assert.equal(r.state.money,400+fee,id+' '+stage);found=true;}
   }
   assert.ok(found,'observed failure '+id+' '+stage);
  }
 }
});
test('legacy failed Moon retains its 50 percent payout',()=>{
 let found=false;
 for(let i=0;i<200&&!found;i++){
  const s=fixture('moon','breach',false,'legacy-'+i);const r=E.resolveBreach(s,'moon',null);
  if(!r.pass){assert.equal(r.state.money-s.money,190);found=true;}
 }
 assert.ok(found);
});
