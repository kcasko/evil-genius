// Regression tests for the Approach soft-lock bug.
//
// Root cause: openApproach iterated m.assigned when building the pair picker,
// and startMission allowed hens.length === 1, so a player who picked a single
// henchman at loadout saw a one-button picker and a permanently-disabled
// Confirm. There was also no Cancel/Back/Forfeit, so the only escape was New
// Game.
//
// The fix bumps the loadout minimum to 2 and adds engine.abortMission() for
// Forfeit; the UI changes are covered by the browser playthrough and the
// static assertion below.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const E = (await import('../game/v2/engine.js')).default || await import('../game/v2/engine.js');
const C = (await import('../game/v2/content.js')).default || await import('../game/v2/content.js');

test('startMission rejects a single-henchman loadout (Approach needs a pair)', () => {
  const s = E.createFreshGame({ playerId:'p', runId:'r' });
  const r = E.startMission(s, 'moon', { henchmen:['mal'], equipment:['tractor'] });
  assert.ok(r.error, 'expected error but got state back');
  assert.match(r.error, /2-4|pair/i, 'error should explain the minimum');
  // State is unchanged — no soft-lock from a half-started mission.
  assert.equal(s.missions.moon.stage, 'idle');
});

test('startMission accepts 2, 3, and 4 henchmen', () => {
  for (const roster of [['mal','boris'], ['mal','boris','chaos'], ['mal','boris','chaos','kevin']]) {
    const s = E.createFreshGame({ playerId:'p', runId:'r' });
    const r = E.startMission(s, 'moon', { henchmen: roster, equipment:['tractor'] });
    assert.ok(!r.error, `roster of ${roster.length} should start, got: ${r.error}`);
    assert.equal(r.state.missions.moon.assigned.length, roster.length);
  }
});

test('startMission still rejects duplicate henchmen', () => {
  const s = E.createFreshGame({ playerId:'p', runId:'r' });
  const r = E.startMission(s, 'moon', { henchmen:['mal','mal'], equipment:['tractor'] });
  assert.ok(r.error, 'duplicate henchmen must be rejected');
});

test('abortMission ends an in-progress mission with status "aborted"', () => {
  let s = E.createFreshGame({ playerId:'p', runId:'r' });
  s = E.startMission(s, 'moon', { henchmen:['mal','boris'], equipment:['tractor'] }).state;
  assert.equal(s.missions.moon.stage, 'scout');
  const r = E.abortMission(s, 'moon');
  assert.ok(!r.error);
  assert.equal(r.state.missions.moon.stage, 'done');
  assert.equal(r.state.missions.moon.status, 'aborted');
  // Resumable path blocked; retry path open.
  assert.ok(r.state.log.some(e => /forfeited/i.test(e)));
});

test('abortMission preserves already-resolved stage effects (irreversible)', () => {
  let s = E.createFreshGame({ playerId:'p', runId:'r' });
  s = E.startMission(s, 'moon', { henchmen:['mal','boris'], equipment:['tractor'] }).state;
  const heatBefore = s.heat;
  s = E.resolveScout(s, 'moon', { henchman:'mal', equipment:'tractor' }).state;
  const heatAfterScout = s.heat;
  const stressAfterScout = s.henchmen.mal.stress;
  const r = E.abortMission(s, 'moon');
  // Scout's heat/stress bump stays — forfeit does not rewind resolved stages.
  assert.equal(r.state.heat, heatAfterScout);
  assert.equal(r.state.henchmen.mal.stress, stressAfterScout);
  assert.notEqual(heatBefore, heatAfterScout, 'sanity: Scout actually changed heat');
});

test('abortMission is idempotent and refuses when nothing to abort', () => {
  const s = E.createFreshGame({ playerId:'p', runId:'r' });
  const r1 = E.abortMission(s, 'moon');
  assert.ok(r1.error, 'cannot abort an idle mission');
  let s2 = E.startMission(s, 'moon', { henchmen:['mal','boris'], equipment:[] }).state;
  s2 = E.abortMission(s2, 'moon').state;
  const r2 = E.abortMission(s2, 'moon');
  assert.ok(r2.error, 'double abort should error');
});

test('after abort, the same mission can be relaunched fresh', () => {
  let s = E.createFreshGame({ playerId:'p', runId:'r' });
  s = E.startMission(s, 'moon', { henchmen:['mal','boris'], equipment:['tractor'] }).state;
  s = E.abortMission(s, 'moon').state;
  const r = E.startMission(s, 'moon', { henchmen:['mal','boris','chaos'], equipment:['tractor','hammer'] });
  assert.ok(!r.error, 'retry should succeed, got: ' + r.error);
  assert.equal(r.state.missions.moon.stage, 'scout');
  assert.equal(r.state.missions.moon.status, 'in_progress');
  assert.deepEqual(r.state.missions.moon.assigned, ['mal','boris','chaos']);
});

// Static UI checks — the engine can't observe DOM state, so we grep the UI
// source for the invariants the bug report requires. These catch future
// regressions where someone accidentally reverts the fix.
test('UI: openApproach shows a live n/2 selection counter', () => {
  const code = fs.readFileSync(new URL('../game/v2/ui/mission.js', import.meta.url), 'utf8');
  assert.match(code, /PAIR \(\$\{pair\.length\}\/2\)/,
    'Approach dialog must show pair.length/2 counter');
});

test('UI: openApproach starts with an EMPTY pair (no auto-select)', () => {
  const code = fs.readFileSync(new URL('../game/v2/ui/mission.js', import.meta.url), 'utf8');
  // The bug was `let pair = m.assigned.slice(0, 2)` — auto-selecting hid the
  // "need two" requirement from the player.
  assert.doesNotMatch(code, /let pair = m\.assigned\.slice/,
    'Approach must not auto-select from assigned');
  assert.match(code, /let pair = \[\]/, 'Approach pair should start empty');
});

test('UI: every stage dialog ships Back-to-HQ and Forfeit controls', () => {
  const code = fs.readFileSync(new URL('../game/v2/ui/mission.js', import.meta.url), 'utf8');
  // The shared helpers must appear in each stage dialog.
  const stages = ['openScout', 'openApproach', 'openBreach', 'openEscape'];
  for (const fn of stages) {
    const idx = code.indexOf('function ' + fn);
    assert.ok(idx >= 0, `expected ${fn} in mission.js`);
    const body = code.slice(idx, idx + 4000);
    assert.ok(body.includes('navControls('), `${fn} must call navControls()`);
    assert.ok(body.includes('wireNav('),    `${fn} must call wireNav()`);
  }
});

test('UI: mission module still has no setTimeout/setInterval (no stealth timer)', () => {
  const code = fs.readFileSync(new URL('../game/v2/ui/mission.js', import.meta.url), 'utf8');
  assert.ok(!/setTimeout|setInterval/.test(code),
    'UI mission module must stay timer-free');
});
