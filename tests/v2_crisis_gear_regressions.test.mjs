import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),E=require('../game/v2/engine.js'),C=require('../game/v2/crises.js'),S=require('../game/v2/save.js');
const fresh=()=>E.createFreshGame({seed:'deadline-test',campaign:true});
test('crises have two decision days, then a single advertised consequence',()=>{
 let s=fresh();s.crises=[{id:'C3_audit_letter',appearedDay:1}];
 assert.equal(C.expirationInfo(s.crises[0]).dueDay,3);
 const before=structuredClone(s);let r=C.expireOverdue(s);assert.equal(r.events.length,0);assert.deepEqual(s,before);
 s.day=2;assert.equal(C.expireOverdue(s).events.length,0);
 s.day=3;r=C.expireOverdue(s);assert.equal(r.state.money,s.money-100);assert.equal(r.state.crises.length,0);
 assert.equal(C.expireOverdue(r.state).state.money,r.state.money);
});
test('ignored theft actually removes gear; manual resolution prevents duplicate consequences',()=>{
 let s=fresh();s.day=3;s.crises=[{id:'C9_equip_theft',appearedDay:1}];
 assert.equal(C.expireOverdue(s).state.equipment.length,s.equipment.length-1);
 const resolved=C.resolveCrisisChoice(s,'C9_equip_theft','recover').state;
 assert.equal(C.expireOverdue(resolved).state.equipment.length,s.equipment.length);
});
test('legacy saves keep their prior rules and expiry never silently spends CP',()=>{
 const s=fresh();s.day=4;s.crises=[{id:'C7_union',appearedDay:1}];s.cp=0;
 assert.equal(C.expireOverdue(s).state.cp,0);
 delete s.campaign;assert.deepEqual(C.expireOverdue(s).state,s);
});
test('broken or stolen gear cannot affect previews or future stage rewards',()=>{
 let s=E.createFreshGame({seed:'broken-stage'});
 s=E.startMission(s,'moon',{henchmen:['boris','mal'],equipment:['hammer','tractor']}).state;
 s.missions.moon.stage='breach';s.equipmentBroken=['hammer'];
 const p=E.stageProbability(s,'moon','breach',{henchmen:['boris'],skill:'force',equipment:['hammer']});
 assert.ok(!p.reasons.some(x=>x.includes('Hammer synergy')));
 assert.deepEqual(E.workingEquipment(s,s.missions.moon.loadout),['tractor']);
 for(let i=0;i<100;i++){
  const candidate=structuredClone(s);candidate.seed='broken-win-'+i;
  const r=E.resolveBreach(candidate,'moon',{choice:'force',confidence:0.9,probabilities:{force:0.9,science:0.1}});
  if(r.pass){assert.ok(!r.events.some(e=>e.includes('Hammer success')));return;}
 }
 assert.fail('Expected at least one successful breach');
});
test('broken aid and rabbit do not grant recovery or a reroll',()=>{
 const s=fresh();s.equipment.push('aid','rabbit');s.equipmentBroken=['aid','rabbit'];
 s.missions.funding={...s.missions.funding,stage:'breach',status:'in_progress',assigned:['mal','kevin'],loadout:['aid','rabbit']};
 for(let i=0;i<100;i++){
  const candidate=structuredClone(s);candidate.seed='broken-kit-'+i;
  const r=E.resolveBreach(candidate,'funding',null);
  assert.ok(!r.events.some(e=>/reroll|recovered 20/.test(e)));
 }
 assert.deepEqual(S.importJSON(S.exportJSON(s)),s);
});

test('real dawn expires only due crises, preserves full new debuff duration and resets CP normally',()=>{
 const s=fresh();s.day=2;s.cp=0;s.buildings=['server_room'];
 s.crises=[{id:'C2_chaos_rollback',appearedDay:1},{id:'C3_audit_letter',appearedDay:2}];
 const before=structuredClone(s),r=E.dawnTick(s);
 assert.deepEqual(s,before,'dawn must not mutate the input save');
 assert.equal(r.state.day,3);assert.equal(r.state.cp,2);
 assert.equal(r.state.debuffs.chaos_debuff_days,2,'new penalty must not immediately decay');
 assert.ok(!r.state.crises.some(c=>c.id==='C2_chaos_rollback'),'expired crisis must not immediately respawn');
 assert.ok(r.state.crises.some(c=>c.id==='C3_audit_letter'&&c.appearedDay===2),'newer card retains its grace period');
 assert.equal(r.state.money,s.money+30,'audit is not due yet');
 const next=E.dawnTick(r.state).state;
 assert.equal(next.money,r.state.money+30-100,'audit consequence applies on its own deadline');
 assert.equal(next.debuffs.chaos_debuff_days,1);
});

test('expired crisis is excluded even when its chain would force it on the same dawn',()=>{
 const s=fresh();s.day=2;s.crises=[{id:'C3_audit_letter',appearedDay:1}];
 s.pendingChains=[{child:'C3_audit_letter',dueDay:3}];
 const r=E.dawnTick(s);
 assert.ok(!r.state.crises.some(c=>c.id==='C3_audit_letter'));
 assert.equal(r.state.pendingChains.length,0,'due chain must be consumed');
});

test('theft cleans inventory references so the resulting save remains importable',()=>{
 const s=fresh();s.equipment.push('rabbit');s.equipmentUnlocked.push('rabbit');s.equipmentBroken.push('rabbit');
 s.crises=[{id:'C9_equip_theft',appearedDay:1}];
 const r=C.resolveCrisisChoice(s,'C9_equip_theft','lose');
 assert.ok(!r.error);
 assert.ok(!r.state.equipment.includes('rabbit'));
 assert.ok(!r.state.equipmentBroken.includes('rabbit'));
 assert.ok(!r.state.equipmentUnlocked.includes('rabbit'));
 assert.deepEqual(S.importJSON(S.exportJSON(r.state)),r.state);
});

test('stolen gear remaining in a mission loadout grants no preview modifier',()=>{
 let s=E.createFreshGame({seed:'stolen-stage'});
 s=E.startMission(s,'moon',{henchmen:['boris','mal'],equipment:['hammer','tractor']}).state;
 s.equipment=s.equipment.filter(id=>id!=='hammer');
 const withStolen=E.stageProbability(s,'moon','breach',{henchmen:['boris'],skill:'force',equipment:['hammer']});
 const without=E.stageProbability(s,'moon','breach',{henchmen:['boris'],skill:'force',equipment:[]});
 assert.deepEqual(withStolen,without,'ownership must be checked as well as broken status');
});

test('gear broken during a real stage keeps that roll but stops helping the next stage',()=>{
 for(let i=0;i<200;i++){
  let s=E.createFreshGame({seed:'actual-break-'+i});
  s=E.startMission(s,'moon',{henchmen:['boris','mal'],equipment:['hammer','tractor']}).state;
  const expected=E.stageProbability(s,'moon','scout',{henchmen:['boris'],skill:'force',equipment:['hammer']});
  const r=E.resolveScout(s,'moon',{henchman:'boris',equipment:'hammer'});
  if(!r.state.equipmentBroken.includes('hammer'))continue;
  assert.equal(r.state.missions.moon.stageResults[0].dc,expected.effectiveDC,'the resolved roll still used working gear');
  const inputs={henchmen:['boris'],skill:'force'};
  assert.deepEqual(E.stageProbability(r.state,'moon','approach',{...inputs,equipment:['hammer']}),
   E.stageProbability(r.state,'moon','approach',{...inputs,equipment:[]}),'subsequent stage loses broken gear modifier');
  return;
 }
 assert.fail('Expected Boris to break the selected hammer in one of 200 seeded stages');
});
