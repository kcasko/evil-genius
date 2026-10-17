// V2 contract tests. Must pass before UI/content layering.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const Rng = (await import('../game/v2/rng.js')).default || await import('../game/v2/rng.js');
const C   = (await import('../game/v2/content.js')).default || await import('../game/v2/content.js');
const Crises = (await import('../game/v2/crises.js')).default || await import('../game/v2/crises.js');
const E   = (await import('../game/v2/engine.js')).default || await import('../game/v2/engine.js');
const Save = (await import('../game/v2/save.js')).default || await import('../game/v2/save.js');

test('createFreshGame returns v02 state with core fields', () => {
  const s = E.createFreshGame({ playerId: 'p1', runId: 'r1' });
  assert.equal(s.schema, 'v02');
  assert.equal(s.day, 1);
  assert.equal(s.cp, 2);
  assert.equal(s.money, 600);
  assert.equal(s.infamy, 5);
  assert.ok(s.henchmen.mal && s.henchmen.boris && s.henchmen.chaos && s.henchmen.kevin);
  assert.equal(s.henchmen.boris.rage, 0);
  assert.ok(Array.isArray(s.equipment));
  assert.deepEqual(s.outcome, 'running');
});

test('riskBucket thresholds match contract', () => {
  assert.equal(E.riskBucket(0.2), 'HIGH');
  assert.equal(E.riskBucket(0.5), 'RISKY');
  assert.equal(E.riskBucket(0.65), 'FAVORABLE');
  assert.equal(E.riskBucket(0.8), 'STRONG');
});

test('riskBarSegments stays within 0..10', () => {
  for (const p of [0, 0.1, 0.5, 0.95, 1]) {
    const n = E.riskBarSegments(p);
    assert.ok(n >= 0 && n <= 10, 'bar segments bounded: ' + n);
  }
});

test('save round-trip is lossless', () => {
  const s = E.createFreshGame({ playerId: 'p', runId: 'r' });
  const blob = Save.exportJSON(s);
  const s2 = Save.importJSON(blob);
  assert.deepEqual(s2, s);
});

test('save schema mismatch throws', () => {
  assert.throws(() => Save.importJSON('{"schema":"v01"}'));
});

test('scoped RNG is deterministic', () => {
  const g1 = Rng.scoped('seed', 'scope');
  const g2 = Rng.scoped('seed', 'scope');
  for (let i = 0; i < 5; i++) assert.equal(g1(), g2());
});

test('Executive Override cost: 2 CP primary, 10 infamy fallback', () => {
  const base = E.createFreshGame({ playerId:'p', runId:'r' });
  assert.equal(E.canExecutiveOverride(base).ok, true);
  const low = { ...base, cp: 1, infamy: 12 };
  const chk = E.canExecutiveOverride(low);
  assert.equal(chk.ok, true);
  assert.ok(chk.cost.infamy === 10);
  const broke = { ...base, cp: 0, infamy: 5 };
  assert.equal(E.canExecutiveOverride(broke).ok, false);
});

test('Boris stress stays 0, rage accrues', () => {
  const s = E.createFreshGame({ playerId:'p', runId:'r' });
  const started = E.startMission(s, 'moon', { henchmen:['boris','mal'], equipment:['hammer'] });
  assert.ok(!started.error, started.error);
  const r = E.resolveScout(started.state, 'moon', { henchman:'boris', equipment:'hammer' });
  assert.equal(r.state.henchmen.boris.stress, 0);
  assert.ok(r.state.henchmen.boris.rage > 0);
});

test('Seeded replay: identical seed + action sequence → identical final state', () => {
  function play(playerId, runId) {
    let s = E.createFreshGame({ playerId, runId });
    s = E.startMission(s, 'moon', { henchmen:['mal','boris'], equipment:['tractor','hammer'] }).state;
    s = E.resolveScout(s, 'moon', { henchman:'mal', equipment:'tractor' }).state;
    s = E.resolveApproach(s, 'moon', { route:'rooftop', henchmen:['mal','boris'] }).state;
    s = E.resolveBreach(s, 'moon', null).state;
    if (s.missions.moon.stage === 'escape')
      s = E.resolveEscape(s, 'moon', 'clever').state;
    return s;
  }
  const a = play('player-X', 'run-Y');
  const b = play('player-X', 'run-Y');
  assert.deepEqual(a, b, 'identical inputs must yield identical state');
});

test('Escape stage uses no setTimeout', async () => {
  // sanity: engine file does not reference setTimeout/setInterval.
  const fs = await import('node:fs');
  const code = fs.readFileSync(new URL('../game/v2/engine.js', import.meta.url), 'utf8');
  assert.ok(!/setTimeout|setInterval/.test(code), 'engine must not use timers for escape');
});

test('dawn tick advances day and refills CP', () => {
  const s = E.createFreshGame({ playerId:'p', runId:'r' });
  const after = E.dawnTick(s);
  assert.equal(after.state.day, 2);
  assert.equal(after.state.cp, 2);
  // Kevin +30, CHAOS upkeep -35 absent server_room = net -5 (post-repair rebalance).
  assert.equal(after.state.money, s.money - 5);
});

test('describeStageRisk returns bucket + reasons', () => {
  const s = E.createFreshGame({ playerId:'p', runId:'r' });
  const started = E.startMission(s, 'moon', { henchmen:['mal','boris'], equipment:['tractor'] });
  const d = E.describeStageRisk(started.state, 'moon', 'scout', { henchmen:['mal'], equipment:['tractor'], skill:'science' });
  assert.ok(d.probability > 0 && d.probability <= 1);
  assert.ok(['HIGH','RISKY','FAVORABLE','STRONG'].includes(d.bucket));
  assert.ok(Array.isArray(d.reasons));
});

test('crisis rolls use scoped RNG and are stable', () => {
  const s = E.createFreshGame({ playerId:'p', runId:'r' });
  const a = Crises.rollDawnCrises(s, []);
  const b = Crises.rollDawnCrises(s, []);
  assert.deepEqual(a, b);
});

test('checkOutcome: fresh is running', () => {
  const s = E.createFreshGame({ playerId:'p', runId:'r' });
  assert.equal(E.checkOutcome(s), 'running');
});

test('Victory requires moon success + infamy >= 25', () => {
  const s = E.createFreshGame({ playerId:'p', runId:'r' });
  s.missions.moon.status = 'success';
  s.infamy = 24;
  assert.equal(E.checkOutcome(s), 'partial_victory');
  s.infamy = 25;
  assert.equal(E.checkOutcome(s), 'victory');
});
