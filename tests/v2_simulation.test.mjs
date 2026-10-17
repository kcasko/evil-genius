// Monte-Carlo win rate simulation per R8 (updated after repair phase).
// Design intent after the repair phase: prep is a meaningful lift, not a cakewalk.
// - Un-prepped: ~10-30% (unchanged — still a desperate stab).
// - Mid-prep:   ~45-70% (lab + rabbit + 1 gear).
// - Full-prep:  ~55-85% (lab + server + rec + 2 gear). Below the old 74-85% band because
//   DC floor + harsher Approach-fail penalty mean the four-stage structure now matters
//   (no more 1-of-4 trivial wins).
import { test } from 'node:test';
import assert from 'node:assert/strict';

const E = (await import('../game/v2/engine.js')).default || await import('../game/v2/engine.js');
const C = (await import('../game/v2/content.js')).default || await import('../game/v2/content.js');

function playOne(playerId, runId, prep) {
  let s = E.createFreshGame({ playerId, runId });
  if (prep === 'mid' || prep === 'full') {
    s.buildings = ['lab'];
    s.equipment = [...s.equipment, 'rabbit'];
  }
  if (prep === 'full') {
    s.buildings = ['lab','server_room','rec_room'];
    s.equipment = [...s.equipment, 'rabbit', 'aid'];
  }
  const roster = prep === 'none' ? ['mal','boris'] : ['mal','boris'];
  const loadout = prep === 'none' ? [] : (prep === 'mid' ? ['tractor'] : ['tractor','hammer']);
  const started = E.startMission(s, 'moon', { henchmen: roster, equipment: loadout });
  if (started.error) return 'fail';
  s = started.state;
  s = E.resolveScout(s, 'moon', { henchman:'mal', equipment: loadout[0] }).state;
  s = E.resolveApproach(s, 'moon', { route:'lab', henchmen: roster }).state;
  const br = E.resolveBreach(s, 'moon', null);
  s = br.state;
  if (s.missions.moon.stage !== 'escape') return 'fail';
  s = E.resolveEscape(s, 'moon', prep === 'full' ? 'loud' : 'clever').state;
  if (s.missions.moon.status === 'success') return 'win';
  return 'fail';
}

function winRate(prep, N = 500) {
  let wins = 0;
  for (let i = 0; i < N; i++) {
    const r = playOne('p', 'run-' + i, prep);
    if (r === 'win') wins++;
  }
  return wins / N;
}

test('un-prepped win rate 10-30%', () => {
  const r = winRate('none');
  console.log('un-prepped:', r);
  assert.ok(r >= 0.08 && r <= 0.32, 'got ' + r);
});

test('mid-prep win rate 45-70%', () => {
  const r = winRate('mid');
  console.log('mid-prep:', r);
  assert.ok(r >= 0.42 && r <= 0.75, 'got ' + r);
});

test('full-prep win rate 55-85%', () => {
  const r = winRate('full');
  console.log('full-prep:', r);
  assert.ok(r >= 0.52 && r <= 0.88, 'got ' + r);
});

test('prep is a meaningful lift (full > un-prepped by >= 25 points)', () => {
  const u = winRate('none');
  const f = winRate('full');
  console.log('lift:', (f - u).toFixed(2));
  assert.ok(f - u >= 0.25, `expected >=0.25 lift, got ${(f-u).toFixed(2)}`);
});
