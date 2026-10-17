// Regression tests for OpenCode P1 findings.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const E = (await import('../game/v2/engine.js')).default || await import('../game/v2/engine.js');
const Crises = (await import('../game/v2/crises.js')).default || await import('../game/v2/crises.js');
const C = (await import('../game/v2/content.js')).default || await import('../game/v2/content.js');

// P1 3.2: relationship modifier is live
test('P1-3.2: relationship bonus applies to Approach', () => {
  const s = E.createFreshGame({ playerId:'p', runId:'r' });
  const started = E.startMission(s, 'moon', { henchmen:['mal','boris','chaos'], equipment:['tractor'] });
  // mal:boris = -1 should subtract 5
  const d = E.describeStageRisk(started.state, 'moon', 'approach',
    { henchmen:['mal','boris'], routeId:'rooftop', skill:'force' });
  assert.ok(d.reasons.some(r => /Relationship mal:boris: -5/.test(r)),
    'expected mal:boris -5 reason, got: ' + JSON.stringify(d.reasons));
});

// P1 4.1: CP-cost crisis cannot be paid at 0 CP
test('P1-4.1: crisis CP cost rejected when cp=0', () => {
  let s = E.createFreshGame({ playerId:'p', runId:'r' });
  s.cp = 0;
  // Force an active crisis with CP-cost option
  s.crises = [{ id:'C7_union', appearedDay: s.day }];
  const r = Crises.resolveCrisisChoice(s, 'C7_union', 'resolve');
  assert.ok(r.error, 'expected error when cp=0, got state: ' + JSON.stringify(r));
});

// P1 4.2: C8 next_dc applies to the next stage then clears
test('P1-4.2: C8 next_dc applies once then consumes', () => {
  let s = E.createFreshGame({ playerId:'p', runId:'r' });
  s.debuffs.next_dc = 5;
  s = E.startMission(s, 'moon', { henchmen:['mal','boris'], equipment:['tractor'] }).state;
  const d1 = E.describeStageRisk(s, 'moon', 'scout', { henchmen:['mal'], equipment:['tractor'], skill:'science' });
  assert.ok(d1.reasons.some(r => /Rival boast: \+5 DC/.test(r)), 'first stage should see +5 DC');
  const r = E.resolveScout(s, 'moon', { henchman:'mal', equipment:'tractor' });
  assert.equal(r.state.debuffs.next_dc, 0, 'next_dc should clear after one stage');
});

// P1 5.1: Executive Override deducts cost and raises stress
test('P1-5.1: Executive Override at Breach charges 2 CP + 20 stress', () => {
  let s = E.createFreshGame({ playerId:'p', runId:'r' });
  s = E.startMission(s, 'moon', { henchmen:['mal','boris'], equipment:['tractor'] }).state;
  s = E.resolveScout(s, 'moon', { henchman:'mal', equipment:'tractor' }).state;
  s = E.resolveApproach(s, 'moon', { route:'lab', henchmen:['mal','boris'] }).state;
  const cpBefore = s.cp;
  const malStressBefore = s.henchmen.mal.stress;
  const r = E.resolveBreach(s, 'moon', null, { henchman:'mal' });
  assert.equal(r.provider, 'override');
  assert.equal(r.state.cp, cpBefore - 2, 'override should deduct 2 CP');
  // +20 override stress on top of +10 or +15 regular stress rise
  const stressGain = r.state.henchmen.mal.stress - malStressBefore;
  assert.ok(stressGain >= 20, 'override should add >=20 stress; got ' + stressGain);
});

// P1 5.1 fallback: Override with cp<2, infamy>=10 deducts 10 infamy
test('P1-5.1: Override infamy fallback when cp<2', () => {
  let s = E.createFreshGame({ playerId:'p', runId:'r' });
  s.cp = 1; s.infamy = 15;
  s = E.startMission(s, 'moon', { henchmen:['mal','boris'], equipment:['tractor'] }).state;
  // Fast-forward past Scout + Approach to arrive at Breach
  s = E.resolveScout(s, 'moon', { henchman:'mal', equipment:'tractor' }).state;
  s = E.resolveApproach(s, 'moon', { route:'lab', henchmen:['mal','boris'] }).state;
  const infamyBefore = s.infamy;
  const r = E.resolveBreach(s, 'moon', null, { henchman:'mal' });
  assert.equal(r.provider, 'override');
  assert.equal(r.state.infamy, infamyBefore - 10, 'infamy fallback should deduct 10');
});

// P1 3.1: previewBreachSpecialist returns single henchman matching the roll
test('P1-3.1: previewBreachSpecialist drives honest risk display', () => {
  let s = E.createFreshGame({ playerId:'p', runId:'r' });
  s = E.startMission(s, 'moon', { henchmen:['mal','boris'], equipment:['tractor','hammer'] }).state;
  const preview = E.previewBreachSpecialist(s, 'moon', null);
  assert.ok(['mal','boris'].includes(preview.specialist));
  const risk = E.describeStageRisk(s, 'moon', 'breach',
    { henchmen:[preview.specialist], skill: C.HENCHMEN_BY_ID[preview.specialist].skill, equipment: s.missions.moon.loadout });
  const otherName = { mal:'Boris', boris:'Dr. Malpractice' }[preview.specialist];
  assert.ok(!risk.reasons.some(r => r.includes(otherName)),
    'honest risk should not include the OTHER henchman: ' + JSON.stringify(risk.reasons));
});

// P2 3.4: duplicate henchmen rejected at startMission
test('P2-3.4: startMission rejects duplicate henchmen', () => {
  const s = E.createFreshGame({ playerId:'p', runId:'r' });
  const r = E.startMission(s, 'moon', { henchmen:['mal','mal'], equipment:['tractor'] });
  assert.ok(r.error);
});

// Contract gap 8.2 §7.9: no setTimeout in UI mission module
test('Contract §7.9: no setTimeout in UI mission module either', async () => {
  const fs = await import('node:fs');
  const code = fs.readFileSync(new URL('../game/v2/ui/mission.js', import.meta.url), 'utf8');
  assert.ok(!/setTimeout|setInterval/.test(code), 'UI mission module must not use timers');
});

// Contract gap 8.2 §7.10: resolveCrisis is a top-level engine export (contract §2)
test('Contract §2: engine exports resolveCrisis', () => {
  assert.equal(typeof E.resolveCrisis, 'function');
});
