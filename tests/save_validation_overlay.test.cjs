const {test} = require('node:test');
const assert = require('node:assert/strict');
const E = require('../game/v2/engine.js');
const S = require('../game/v2/save.js');
const fresh = () => E.createFreshGame({playerId:'qa',seed:'qa-save-regression'});
test('complete save round trips without changing gameplay state', () => {
  const state=fresh(); assert.deepEqual(S.importJSON(S.exportJSON(state)),state);
});
test('incomplete save and malformed nested fields are rejected', () => {
  for (const alter of [s=>({schema:'v02'}),s=>({...s,henchmen:{}}),s=>({...s,equipment:['unknown']}),s=>({...s,crises:[{id:'unknown',appearedDay:1}]}),s=>({...s,cp:'2'}),s=>({...s,missions:{moon:null}})]) {
    assert.throws(()=>S.importJSON(JSON.stringify(alter(fresh()))));
  }
});
test('supported older saves retain forward-fill compatibility', () => {
  const state=fresh(); delete state.missions.prep; delete state.quietDays;
  delete state.recentCrises; delete state.debuffs.moon_intel_days;
  const restored=S.importJSON(JSON.stringify(state));
  assert.equal(restored.missions.prep.stage,'idle');assert.equal(restored.quietDays,0);
});
test('running, failed, and victorious mission saves remain importable', () => {
  let state=fresh(); state=E.startMission(state,'moon',{henchmen:['mal','boris'],equipment:['hammer']}).state;
  assert.deepEqual(S.importJSON(JSON.stringify(state)),state);
  state=E.abortMission(state,'moon').state;assert.deepEqual(S.importJSON(JSON.stringify(state)),state);
  state.outcome='victory';state.missions.moon.status='success';assert.deepEqual(S.importJSON(JSON.stringify(state)),state);
});
test('invalid persisted data fails closed instead of crashing startup', () => {
  global.localStorage={getItem:()=>'{"schema":"v02"}'};
  assert.equal(S.load(),null);delete global.localStorage;
});
