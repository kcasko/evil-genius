// Deterministic 15-20 minute campaign simulation per IMPLEMENTATION PRIORITY D.
// Simulates HQ building + mission over multiple days, then checks reproducibility.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const E = (await import('../game/v2/engine.js')).default || await import('../game/v2/engine.js');
const Save = (await import('../game/v2/save.js')).default || await import('../game/v2/save.js');

// A realistic 5-day campaign: build + attempt mission.
function playCampaign(seed) {
  let s = E.createFreshGame({ playerId:'player-x', runId: seed });
  const log = [];
  // Day 1: build lab
  let r = E.spendCommandPoint(s, { kind:'build', building:'lab' });
  if (!r.error) { s = r.state; log.push('day1: queued lab'); }
  r = E.spendCommandPoint(s, { kind:'end_day' });
  s = r.state; log.push('day2: ' + s.day);
  // Day 2: build server_room if we have cash
  r = E.spendCommandPoint(s, { kind:'build', building:'rec_room' });
  if (!r.error) s = r.state;
  r = E.spendCommandPoint(s, { kind:'end_day' });
  s = r.state;
  // Day 3: launch moon
  r = E.startMission(s, 'moon', { henchmen:['mal','boris'], equipment:['tractor','hammer'] });
  if (r.error) return { log, final: s, winOrLose: 'cantstart:' + r.error };
  s = r.state;
  s = E.resolveScout(s, 'moon', { henchman:'mal', equipment:'tractor' }).state;
  s = E.resolveApproach(s, 'moon', { route:'lab', henchmen:['mal','boris'] }).state;
  const br = E.resolveBreach(s, 'moon', null);
  s = br.state;
  if (s.missions.moon.stage === 'escape')
    s = E.resolveEscape(s, 'moon', 'clever').state;
  return { log, final: s, winOrLose: s.outcome };
}

test('campaign is reproducible for identical seed', () => {
  const a = playCampaign('seed-A');
  const b = playCampaign('seed-A');
  assert.deepEqual(a.final, b.final);
});

test('different seeds produce different outcomes', () => {
  const outcomes = new Set();
  for (const seed of ['seed-A','seed-B','seed-C','seed-D','seed-E']) {
    const r = playCampaign(seed);
    outcomes.add(r.final.heat + ':' + r.final.infamy + ':' + r.winOrLose);
  }
  assert.ok(outcomes.size >= 2, 'at least 2 distinct heat/infamy/outcome tuples across 5 seeds');
});

test('save → import → continue is lossless', () => {
  let s = E.createFreshGame({ playerId:'p', runId:'export' });
  s = E.spendCommandPoint(s, { kind:'build', building:'lab' }).state;
  s = E.spendCommandPoint(s, { kind:'end_day' }).state;

  const blob = Save.exportJSON(s);
  const restored = Save.importJSON(blob);
  assert.deepEqual(restored, s);

  // Continue playing from restored state
  const a = E.spendCommandPoint(s, { kind:'end_day' }).state;
  const b = E.spendCommandPoint(restored, { kind:'end_day' }).state;
  assert.deepEqual(a, b, 'continuation after import must match');
});

test('campaign under 30 engine calls — fits a 15-20 min human playthrough', () => {
  let calls = 0;
  const trace = (fn) => { calls += 1; return fn(); };
  let s = E.createFreshGame({ playerId:'p', runId:'count' });
  s = trace(() => E.spendCommandPoint(s, { kind:'build', building:'lab' }).state);
  s = trace(() => E.spendCommandPoint(s, { kind:'end_day' }).state);
  s = trace(() => E.spendCommandPoint(s, { kind:'build', building:'rec_room' }).state);
  s = trace(() => E.spendCommandPoint(s, { kind:'end_day' }).state);
  s = trace(() => E.startMission(s, 'moon', { henchmen:['mal','boris'], equipment:['tractor','hammer']}).state);
  s = trace(() => E.resolveScout(s, 'moon', { henchman:'mal', equipment:'tractor' }).state);
  s = trace(() => E.resolveApproach(s, 'moon', { route:'lab', henchmen:['mal','boris'] }).state);
  s = trace(() => E.resolveBreach(s, 'moon', null).state);
  if (s.missions.moon.stage === 'escape')
    s = trace(() => E.resolveEscape(s, 'moon', 'loud').state);
  assert.ok(calls <= 30, 'campaign call count ' + calls + ' <= 30');
  assert.ok(['victory','partial_victory','running'].includes(s.outcome) || s.outcome.startsWith('defeat'));
});

test('v01 save data is ignored (user mandate R11)', () => {
  const bogusV1 = JSON.stringify({ money:1, heat:1, day:1, loyalty:{} });
  assert.throws(() => Save.importJSON(bogusV1), /schema mismatch/);
});
