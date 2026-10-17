import test from 'node:test';
import assert from 'node:assert/strict';
import engine from '../game/engine.js';
const {AVAILABLE_TOOLS, CHARACTERS, NPC_STAFF, MISSIONS, acceptDecisionChoice, chooseOfflineSpecialist, createFreshGame, maybeHrIntervention, resolveMission}=engine;

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

test('Dolores is NPC staff and not a selectable specialist',()=>{
  assert.deepEqual(NPC_STAFF[0],{id:'dolores',name:'Dolores',icon:'📋',job:'Director of Human Resources',voice:'deadpan-hr',bio:'Can stop world domination with a mandatory meeting.'});
  assert.equal(CHARACTERS.some(character=>character.id==='dolores'),false);
  assert.equal(AVAILABLE_TOOLS.length,4);
});

test('HR intervention fires at exactly 85 heat',()=>{
  assert.equal(maybeHrIntervention({...createFreshGame(),heat:85},MISSIONS[0]).event,'hr_intervention');
});

test('HR intervention does not fire at 84 heat',()=>{
  assert.equal(maybeHrIntervention({...createFreshGame(),heat:84},MISSIONS[0]),null);
});

test('HR intervention fires at 100 heat',()=>{
  assert.equal(maybeHrIntervention({...createFreshGame(),heat:100},MISSIONS[0]).event,'hr_intervention');
});

test('HR intervention changes only day, heat, and one Dolores log entry',()=>{
  const before={...createFreshGame(),heat:85,infamy:17,wins:2,losses:3,completed:['moon']};
  const {state}=maybeHrIntervention(before,MISSIONS[1]);
  assert.equal(state.money,before.money,'budget must be unchanged');
  assert.equal(state.day,before.day+1,'day must advance exactly once');
  assert.equal(state.heat,before.heat-10,'heat must fall by exactly 10');
  assert.deepEqual(state.loyalty,before.loyalty,'loyalty must be unchanged');
  assert.equal(state.log.length,before.log.length+1,'exactly one log entry must be added');
  assert.match(state.log[0],/Dolores/);
  assert.equal(state.log.filter(entry=>/Dolores/.test(entry)).length,1);
  assert.equal(state.wins,before.wins,'mission must not be won');
  assert.equal(state.losses,before.losses,'mission must not be lost');
  assert.equal(state.infamy,before.infamy,'infamy must not change');
  assert.deepEqual(state.completed,before.completed,'completed missions must not grow');
  assert.deepEqual(before.log,['Day 1: Evil Genius Incorporated established. No refunds.'],'input must not be mutated');
});
