import test from 'node:test';
import assert from 'node:assert/strict';
import engine from '../game/engine.js';
const {AVAILABLE_TOOLS, CHARACTERS, MISSIONS, acceptDecisionChoice, chooseOfflineSpecialist, createFreshGame, resolveMission}=engine;

test('preserves the three missions and four henchmen',()=>{
  assert.deepEqual(MISSIONS.map(m=>m.name),['Steal the Moon','Outlaw Mondays','Control All Coffee']);
  assert.deepEqual(CHARACTERS.map(c=>c.name),['Dr. Malpractice','Boris the Brute','CHAOS-9000','Kevin from Accounting']);
});

for(const mission of MISSIONS){
  test(`${mission.name} resolves its success branch`,()=>{
    const result=resolveMission(createFreshGame(),mission,0,mission.plans[0].skill,{luck:0});
    assert.equal(result.win,true); assert.equal(result.story,mission.plans[0].win);
    assert.equal(result.state.wins,1); assert.equal(result.state.losses,0);
  });
  test(`${mission.name} resolves its failure branch`,()=>{
    const result=resolveMission(createFreshGame(),mission,0,mission.plans[0].skill,{luck:99});
    assert.equal(result.win,false); assert.equal(result.story,mission.plans[0].lose);
    assert.equal(result.state.wins,0); assert.equal(result.state.losses,1);
  });
}

test('success applies cost, reward, heat, infamy, loyalty, and day arithmetic',()=>{
  const before=createFreshGame(); const mission=MISSIONS[0]; const plan=mission.plans[0];
  const {state}=resolveMission(before,mission,0,plan.skill,{luck:0});
  assert.equal(state.money,600-plan.cost+mission.reward); assert.equal(state.heat,8+mission.heat+4);
  assert.equal(state.infamy,9); assert.equal(state.loyalty.mal,71); assert.equal(state.day,2);
  assert.equal(before.money,600,'pure resolver must not mutate input');
});

test('failure applies cost, heat, infamy, and loyalty arithmetic',()=>{
  const before=createFreshGame(); const mission=MISSIONS[1]; const plan=mission.plans[0];
  const {state}=resolveMission(before,mission,0,plan.skill,{luck:99});
  assert.equal(state.money,600-plan.cost); assert.equal(state.heat,8+mission.heat+8);
  assert.equal(state.infamy,2); assert.equal(state.loyalty.chaos,46); assert.equal(state.day,2);
});

test('raid preserves its heat and budget clamps',()=>{
  const state={...createFreshGame(),money:100,heat:90};
  const result=resolveMission(state,MISSIONS[0],1,'force',{luck:99});
  assert.equal(result.state.heat,35); assert.equal(result.state.money,100);
  assert.equal(result.events.length,1);
});

test('emergency funding adds 120 dollars below the floor',()=>{
  const state={...createFreshGame(),money:100,heat:8};
  const result=resolveMission(state,MISSIONS[0],1,'force',{luck:99});
  assert.equal(result.state.money,165); assert.match(result.events[0],/Emergency funding/);
});

test('offline specialist fallback deterministically uses the plan skill',()=>{
  for(const mission of MISSIONS) for(const plan of mission.plans)
    assert.deepEqual(chooseOfflineSpecialist(plan),{provider:'deterministic demo',choice:plan.skill,confidence:null});
});

test('invalid or malformed remote choices fall back without a false mismatch',()=>{
  const plan=MISSIONS[0].plans[0];
  assert.equal(acceptDecisionChoice({provider:'decider',choice:'magic'},plan).choice,'science');
  assert.equal(acceptDecisionChoice({provider:'other',choice:'force'},plan).choice,'science');
  assert.equal(acceptDecisionChoice({provider:'decider',choice:'force'},plan).choice,'force');
  assert.deepEqual(AVAILABLE_TOOLS,['science','force','deception','finance']);
});

test('unavailable fallback skill is rejected explicitly',()=>{
  assert.throws(()=>chooseOfflineSpecialist(MISSIONS[0].plans[0],['force']),/unavailable/);
});
