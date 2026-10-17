import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const E=require('../game/v2/engine.js');
const S=require('../game/v2/save.js');
const fresh=()=>E.createFreshGame({seed:'progression',playerId:'qa',campaign:true});
const loadout={henchmen:['mal','kevin'],equipment:['tractor','ledger']};
test('new campaign cannot skip straight to the Moon, even through engine calls',()=>{
 const s=fresh(),before=JSON.stringify(s),r=E.startMission(s,'moon',loadout);
 assert.match(r.error,/Payroll/);assert.equal(JSON.stringify(s),before);
 assert.equal(E.missionAvailability(s,'funding').ok,true);
});
test('operations consume a command point and reserve the day, including forfeit',()=>{
 let s=fresh();s=E.startMission(s,'funding',loadout).state;
 assert.equal(s.cp,1);assert.equal(s.money,560);
 assert.ok(E.spendCommandPoint(s,{kind:'end_day'}).error);
 s=E.abortMission(s,'funding').state;
 assert.match(E.startMission(s,'funding',loadout).error,/tomorrow/);
 s=E.dawnTick(s).state;
 assert.equal(E.missionAvailability(s,'funding').ok,true);
});
test('later jobs require actual construction and the finale requires researched gear',()=>{
 const s=fresh();s.missions.funding.status='success';
 assert.match(E.missionAvailability(s,'satellite').reason,/Server Room/);
 s.buildings.push('server_room');assert.equal(E.missionAvailability(s,'satellite').ok,true);
 s.missions.satellite.status='success';assert.match(E.missionAvailability(s,'prototype').reason,/Laboratory/);
 s.buildings.push('lab');assert.equal(E.missionAvailability(s,'prototype').ok,true);
 s.missions.prototype.status='success';assert.match(E.missionAvailability(s,'moon').reason,/research/i);
 s.equipmentUnlocked.push('aid');assert.equal(E.missionAvailability(s,'moon').ok,true);
});
test('campaign saves round trip and legacy saves retain their original mission rules',()=>{
 const s=fresh();assert.deepEqual(S.importJSON(S.exportJSON(s)),s);
 const legacy=E.createFreshGame({seed:'old'});assert.ok(!legacy.campaign);
 assert.equal(E.startMission(legacy,'moon',loadout).error,undefined);
 const bad=structuredClone(s);bad.campaign.lastOperationDay=-1;
 assert.throws(()=>S.importJSON(JSON.stringify(bad)),/invalid save/i);
});
test('laying low has a real cost and cannot spend a point for no benefit',()=>{
 const s=fresh();assert.ok(E.spendCommandPoint(s,{kind:'laylow'}).error);
 s.heat=40;const r=E.spendCommandPoint(s,{kind:'laylow'});
 assert.equal(r.state.heat,25);assert.equal(r.state.money,575);assert.equal(r.state.cp,1);
 assert.equal(s.heat,40);
});
test('contract objectives improve the finale without granting an automatic victory',()=>{
 const s=fresh();s.missions.moon.assigned=['mal','kevin'];s.missions.moon.loadout=[];
 const before=E.stageProbability(s,'moon','breach',{henchmen:['mal'],skill:'science',equipment:[]});
 s.missions.satellite.status='success';s.missions.prototype.status='success';
 const after=E.stageProbability(s,'moon','breach',{henchmen:['mal'],skill:'science',equipment:[]});
 assert.equal(after.modifier-before.modifier,10);assert.equal(E.checkOutcome(s),'running');
});
test('consuming researched equipment does not erase campaign research progress',()=>{
 let s=fresh();s.buildings=['server_room','lab'];s.research=4;
 s=E.spendCommandPoint(s,{kind:'research',equipment:'emp'}).state;
 assert.equal(s.campaign.researchCompleted,true);
 s.equipmentUnlocked=[];s.equipment=s.equipment.filter(id=>id!=='emp');s.cp=2;
 for(const id of ['funding','satellite','prototype'])s.missions[id].status='success';
 assert.equal(E.missionAvailability(s,'moon').ok,true);
 assert.deepEqual(S.importJSON(S.exportJSON(s)),s);
});
test('a successful shrink-ray breach survives failed escape and save import',()=>{
 let s=fresh();s.buildings=['server_room','lab'];s.equipmentUnlocked=['aid'];
 s.missions.funding.status=s.missions.satellite.status='success';
 let result;
 for(let i=0;i<100;i++){
  const candidate=structuredClone(s);candidate.seed='ray-proof-'+i;
  candidate.missions.prototype={...candidate.missions.prototype,stage:'breach',status:'in_progress',assigned:['boris','mal'],loadout:['hammer']};
  result=E.resolveBreach(candidate,'prototype',null);if(result.pass)break;
 }
 assert.equal(result.pass,true);assert.equal(result.state.missions.prototype.carriedBonuses.prototypeTested,true);
 s=E.abortMission(result.state,'prototype').state;
 assert.equal(E.missionAvailability(s,'moon').ok,true);
 assert.deepEqual(S.importJSON(S.exportJSON(s)),s);
});
