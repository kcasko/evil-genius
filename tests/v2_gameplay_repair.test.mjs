import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const E = require('../game/v2/engine.js');
const C = require('../game/v2/content.js');
const Crises = require('../game/v2/crises.js');
const Save = require('../game/v2/save.js');

function fresh(seed='repair-regression') {
  return E.createFreshGame({ playerId:'qa', runId:'repair', seed });
}

function launchMoon(s, henchmen=['kevin','mal'], equipment=[]) {
  const r = E.startMission(s, 'moon', { henchmen, equipment });
  assert.ifError(r.error);
  return r.state;
}

test('resolved Breach cannot be replayed once the mission has advanced to Escape', () => {
  let s = fresh('breach-immutable');
  s = E.startMission(s, 'moon', {henchmen:['mal','boris'], equipment:[]}).state;
  s.missions.moon.stage = 'escape';
  s.missions.moon.stageResults = [{stage:'breach', pass:true, roll:90, dc:50}];
  s.missions.moon.carriedBonuses.rewardBonus = 38;
  const before = JSON.stringify(s);
  const r = E.resolveBreach(s, 'moon', null, false);
  assert.equal(r.alreadyResolved, true);
  assert.equal(JSON.stringify(r.state), before);
  const overridden = E.resolveBreach(s, 'moon', null, {henchman:'mal'});
  assert.equal(overridden.alreadyResolved, true);
  assert.equal(JSON.stringify(overridden.state), before, 'override must not charge CP or stress on resolved Breach');
});

test('engine rejects an Escape plan locked by a failed Approach', () => {
  let s = fresh('escape-lock-engine');
  s = E.startMission(s, 'moon', {henchmen:['mal','boris'], equipment:[]}).state;
  s.missions.moon.stage = 'escape';
  s.missions.moon.stageResults = [
    {stage:'scout', pass:true},
    {stage:'approach', pass:false},
    {stage:'breach', pass:true},
  ];
  const before = JSON.stringify(s);
  const r = E.resolveEscape(s, 'moon', 'fast');
  assert.match(r.error, /locked/i);
  assert.equal(JSON.stringify(r.state), before);
});

test('prep payoff skill follows operation type, not assigned-order accident', () => {
  let a = fresh('prep-order');
  a = E.startMission(a, 'prep', {henchmen:['mal','boris'], equipment:[]}).state;
  a.missions.prep.stage = 'breach';
  const b = JSON.parse(JSON.stringify(a));
  b.missions.prep.assigned = ['boris','mal'];
  const pa = E.stageProbability(a, 'prep', 'breach', {henchmen:a.missions.prep.assigned, skill:'force', sideOpKind:'sabotage'});
  const pb = E.stageProbability(b, 'prep', 'breach', {henchmen:b.missions.prep.assigned, skill:'force', sideOpKind:'sabotage'});
  assert.equal(pa.effectiveDC, pb.effectiveDC);
  const ra = E.resolvePrepPayoff(a, {sideOpKind:'sabotage'});
  const rb = E.resolvePrepPayoff(b, {sideOpKind:'sabotage'});
  assert.equal(ra.dc, rb.dc);
  assert.equal(ra.roll, rb.roll);
});

test('prep Scout automatically uses the selected side-op equipment', () => {
  let s = fresh('prep-gear');
  s = E.startMission(s, 'prep', {henchmen:['mal'], equipment:['tractor']}).state;
  const withGear = E.stageProbability(s, 'prep', 'scout', {henchmen:['mal'], skill:'science', equipment:['tractor']});
  const without = E.stageProbability(s, 'prep', 'scout', {henchmen:['mal'], skill:'science', equipment:[]});
  assert.ok(withGear.effectiveDC < without.effectiveDC);
  const r = E.resolvePrepScout(s, {henchman:'mal'});
  assert.equal(r.dc, withGear.effectiveDC);
});

test('mission-ending Smoke bailout and manual abort honor First Aid and consume next-DC', () => {
  let smoke = null;
  for (let i=0; i<1000 && !smoke; i++) {
    let s = fresh('smoke-aid-'+i);
    s.equipment.push('smokescreen','aid');
    s.equipmentUnlocked.push('smokescreen','aid');
    s.henchmen.mal.stress = 40;
    s.debuffs.next_dc = 10;
    s = E.startMission(s, 'moon', {henchmen:['mal','kevin'], equipment:['smokescreen','aid']}).state;
    const r = E.resolveScout(s, 'moon', {henchman:'mal'});
    if (r.state.missions.moon.status === 'aborted') smoke = r.state;
  }
  assert.ok(smoke, 'find deterministic smoke bailout');
  assert.equal(smoke.henchmen.mal.stress, 20);
  assert.equal(smoke.debuffs.next_dc, 0);
  assert.equal(smoke.missions.moon.carriedBonuses.aidUsed, true);

  let s = fresh('manual-abort-aid');
  s.equipment.push('aid');
  s.equipmentUnlocked.push('aid');
  s.henchmen.mal.stress = 40;
  s.debuffs.next_dc = 10;
  s = E.startMission(s, 'moon', {henchmen:['mal','kevin'], equipment:['aid']}).state;
  s = E.abortMission(s, 'moon').state;
  assert.equal(s.henchmen.mal.stress, 20);
  assert.equal(s.debuffs.next_dc, 0);
});

test('B1: repeated stage resolution is refused without mutating resolved state', () => {
  let s = launchMoon(fresh('duplicate-stage'));
  const first = E.resolveScout(s, 'moon', { henchman:'kevin', equipment:null });
  const snapshot = structuredClone(first.state);
  const duplicate = E.resolveScout(first.state, 'moon', { henchman:'kevin', equipment:null });
  assert.equal(duplicate.alreadyResolved, true);
  assert.deepEqual(duplicate.state, snapshot);
});

test('B1: Scout and Escape UI disable the submit button before emitting', () => {
  const src = fs.readFileSync(new URL('../game/v2/ui/mission.js', import.meta.url), 'utf8');
  const scout = src.slice(src.indexOf('function openScout'), src.indexOf('function openApproach'));
  const escape = src.slice(src.indexOf('function openEscape'), src.indexOf('function openResult'));
  assert.match(scout, /currentTarget\.disabled\s*=\s*true/);
  assert.match(escape, /currentTarget\.disabled\s*=\s*true/);
});

test('B2: retries vary reproducibly by mission relaunch number', () => {
  const attempt = (seed) => {
    let s = launchMoon(fresh(seed));
    const first = E.resolveScout(s, 'moon', { henchman:'kevin', equipment:null });
    s = E.abortMission(first.state, 'moon').state;
    s = launchMoon(s);
    const second = E.resolveScout(s, 'moon', { henchman:'kevin', equipment:null });
    return [first.roll, second.roll, second.state.missions.moon.relaunchCount];
  };
  const a = attempt('retry-seed');
  const b = attempt('retry-seed');
  assert.deepEqual(a, b);
  assert.equal(a[2], 2);
  assert.notEqual(a[0], a[1]);
});

test('B3: failed Approach creates heat, a severe Breach penalty, and locks quiet exits', () => {
  let s = launchMoon(fresh('approach-consequence'));
  s.missions.moon.stage = 'approach';
  // Search a deterministic seed whose Approach fails; behavior under failure is what matters.
  let out;
  for (let i=0; i<500; i++) {
    const candidate = launchMoon(fresh('approach-consequence-'+i));
    candidate.missions.moon.stage = 'approach';
    out = E.resolveApproach(candidate, 'moon', { route:'front', henchmen:['kevin','mal'] });
    if (!out.pass) break;
  }
  assert.equal(out.pass, false);
  assert.ok(out.state.heat >= 18);
  assert.ok(out.state.missions.moon.carriedBonuses.breach <= -25);
  const plans = E.escapePlanAvailability(out.state, 'moon');
  assert.equal(plans.fast.ok, false);
  assert.equal(plans.clever.ok, false);
  assert.equal(plans.loud.ok, true);
});

test('B5: effective DC is clamped and optimized prep is not automatic', () => {
  let s = launchMoon(fresh('dc-floor'), ['mal','chaos','boris','kevin'], ['tractor','hammer']);
  s.buildings = ['lab','server_room','rec_room'];
  s.missions.moon.carriedBonuses.approach = 100;
  const r = E.stageProbability(s, 'moon', 'approach', { routeId:'lab', skill:'science', henchmen:['mal','chaos'] });
  assert.equal(r.effectiveDC, E.constants.DC_FLOOR);
  assert.ok(r.probability < 0.9);
});

test('B8: two consecutive unpaid upkeep dawns cause honest bankruptcy defeat', () => {
  let s = fresh('bankruptcy');
  s.money = -100;
  s = E.dawnTick(s).state;
  assert.equal(s.outcome, 'running');
  assert.equal(s.debuffs.unpaid_upkeep_streak, 1);
  s = E.dawnTick(s).state;
  assert.equal(s.outcome, 'defeat_bankrupt');
  assert.equal(s.debuffs.unpaid_upkeep_streak, 2);
});

test('B9: Lab applies Mal 25% competence on non-Breach stages and copy says so', () => {
  let s = launchMoon(fresh('lab-mal'), ['mal','kevin']);
  const base = E.stageProbability(s, 'moon', 'scout', { henchmen:['mal'], skill:'science' });
  s.buildings = ['lab'];
  const lab = E.stageProbability(s, 'moon', 'scout', { henchmen:['mal'], skill:'science' });
  assert.ok(lab.modifier - base.modifier >= 8); // +3 from 25% Mal, plus +5 Lab support
  assert.match(C.BUILDINGS_BY_ID.lab.effect, /Mal \+25% competence \(all stages/);
});

test('B6: day off at zero stress is rejected without spending CP', () => {
  const s = fresh('dayoff');
  const out = E.spendCommandPoint(s, { kind:'dayoff', henchman:'mal' });
  assert.match(out.error, /nothing to decompress/);
  assert.equal(out.state.cp, 2);
});

test('P3: low-intensity crises are eligible at low heat after a failed mission', () => {
  const s = fresh('low-crisis');
  s.day = 4;
  s.heat = 28;
  s.money = 300;
  s.missions.moon.status = 'failed';
  s.missions.moon.stage = 'done';
  const ids = C.CRISES.filter(c => Crises.eligible(s, c)).map(c => c.id);
  assert.ok(ids.some(id => ['C13_dolores_gossip','C14_equip_rust','C15_boris_bored','C16_kevin_pitch'].includes(id)), ids.join(','));
});

test('low-intensity equipment crisis breaks gear instead of deleting ownership', () => {
  let s = fresh('rust-crisis');
  s.day = 4;
  s.crises = [{id:'C14_equip_rust', appearedDay:4}];
  const before = [...s.equipment];
  const out = E.resolveCrisis(s, 'C14_equip_rust', 'ignore');
  assert.ifError(out.error);
  assert.deepEqual(out.state.equipment, before);
  assert.equal(out.state.equipmentBroken.length, 1);
});

test('low-intensity crises rotate instead of repeating the same event every dawn', () => {
  let s = fresh('crisis-rotation');
  s.day = 3;
  s.heat = 28;
  s.money = 300;
  s.missions.moon.status = 'failed';
  s.missions.moon.stage = 'done';
  const seen = [];
  for (let i=0; i<16; i++) {
    const d = E.dawnTick(s);
    s = d.state;
    for (const c of d.newCrises) {
      assert.equal(seen.slice(-2).includes(c.id), false, `${c.id} repeated inside 2-event cooldown`);
      seen.push(c.id);
    }
    for (const c of [...s.crises]) {
      const def = C.CRISES_BY_ID[c.id];
      const r = E.resolveCrisis(s, c.id, def.options[def.options.length-1].id);
      if (!r.error) s = r.state;
    }
  }
  assert.ok(new Set(seen).size >= 3, `only saw ${[...new Set(seen)].join(',')}`);
});

test('P3: no campaign can exceed two consecutive quiet dawns when a low event is eligible', () => {
  let worst = 0;
  for (let run=0; run<200; run++) {
    let s = fresh('quiet-day-guarantee-'+run);
    s.day = 3;
    s.heat = 28;
    s.money = 300;
    s.missions.moon.status = 'failed';
    s.missions.moon.stage = 'done';
    let quiet = 0;
    for (let i=0; i<12; i++) {
      const d = E.dawnTick(s);
      s = d.state;
      if (d.newCrises.length === 0) quiet += 1;
      else {
        quiet = 0;
        // Resolve all active events so the next dawn can produce another one.
        for (const c of [...s.crises]) {
          const def = C.CRISES_BY_ID[c.id];
          const r = E.resolveCrisis(s, c.id, def.options[0].id);
          if (!r.error) s = r.state;
        }
      }
      worst = Math.max(worst, quiet);
    }
  }
  assert.ok(worst <= 2, `observed ${worst} consecutive quiet dawns`);
});

test('P4: supporting operation is short and grants targeted, expiring Moon intel', () => {
  let completed = null;
  for (let i=0; i<500 && !completed; i++) {
    let s = fresh('prep-op-'+i);
    const start = E.startMission(s, 'prep', { henchmen:['mal'], equipment:['tractor'] });
    assert.ifError(start.error);
    const scout = E.resolvePrepScout(start.state, { henchman:'mal', equipment:'tractor' });
    const payoff = E.resolvePrepPayoff(scout.state, { sideOpKind:'sabotage' });
    if (payoff.pass) completed = payoff.state;
  }
  assert.ok(completed, 'expected at least one successful seeded prep operation');
  assert.equal(completed.missions.prep.stageResults.length, 2);
  assert.equal(completed.missions.prep.status, 'success');
  assert.equal(completed.debuffs.moon_intel_source, 'sabotage');
  assert.equal(completed.debuffs.moon_intel_days, E.constants.SIDE_OP_INTEL_DAYS);
  const moon = launchMoon(completed);
  const risk = E.stageProbability(moon, 'moon', 'breach', { henchmen:['mal'], skill:'science' });
  assert.ok(risk.reasons.some(x => x.includes('Side-op sabotage')));
});

test('P4: supporting operation charges a real preparation cost', () => {
  const s = fresh('prep-cost');
  const start = E.startMission(s, 'prep', { henchmen:['mal'], equipment:[] });
  assert.ifError(start.error);
  assert.equal(start.state.cp, s.cp - 1);
  assert.equal(start.state.money, s.money - 60);
  const broke = fresh('prep-broke');
  broke.money = 40;
  const rejected = E.startMission(broke, 'prep', { henchmen:['mal'], equipment:[] });
  assert.match(rejected.error, /Need \$60/);
});

test('P4: supporting operation can be repeated after its intel expires', () => {
  const s = fresh('repeat-prep');
  s.missions.prep.stage = 'done';
  s.missions.prep.status = 'success';
  s.debuffs.moon_intel_days = 0;
  const again = E.startMission(s, 'prep', { henchmen:['kevin'], equipment:[] });
  assert.ifError(again.error);
  assert.equal(again.state.missions.prep.stage, 'scout');
  assert.equal(again.state.missions.prep.relaunchCount, 1);
});

test('equipment specials create distinct strategic advantages', () => {
  // Rabbit: the first failed stage is rerolled once per mission.
  let rabbitResult = null;
  for (let i=0; i<500 && !rabbitResult; i++) {
    let s = fresh('rabbit-'+i);
    s.equipment.push('rabbit');
    s = E.startMission(s, 'moon', { henchmen:['kevin','mal'], equipment:['rabbit'] }).state;
    const r = E.resolveScout(s, 'moon', { henchman:'kevin', equipment:'rabbit' });
    if (r.events.some(e => e.includes("Rabbit's Foot reroll"))) rabbitResult = r;
  }
  assert.ok(rabbitResult, 'rabbit should reroll a seeded failure');
  assert.equal(rabbitResult.state.missions.moon.carriedBonuses.rabbitUsed, true);

  // Smoke: a successful 50% bailout aborts safely before failure penalties, for $100.
  let smokeResult = null;
  for (let i=0; i<1000 && !smokeResult; i++) {
    let s = fresh('smoke-'+i);
    s.equipment.push('smokescreen');
    s = E.startMission(s, 'moon', { henchmen:['kevin','mal'], equipment:['smokescreen'] }).state;
    const before = s.money;
    const r = E.resolveScout(s, 'moon', { henchman:'kevin', equipment:'smokescreen' });
    if (r.events.some(e => e.includes('Smoke Grenade bailout'))) {
      smokeResult = {r,before};
    }
  }
  assert.ok(smokeResult, 'smoke should produce a seeded bailout');
  assert.equal(smokeResult.r.state.missions.moon.status, 'aborted');
  assert.equal(smokeResult.r.state.heat, 8);
  assert.equal(smokeResult.r.state.money, smokeResult.before - 100);

  // First Aid: reduce every assigned non-Boris crew member by 20 on mission end.
  let aidResult = null;
  for (let i=0; i<500 && !aidResult; i++) {
    let s = fresh('aid-'+i);
    s.equipment.push('aid');
    s = E.startMission(s, 'moon', { henchmen:['kevin','mal'], equipment:['aid'] }).state;
    s.missions.moon.stage = 'breach';
    const r = E.resolveBreach(s, 'moon', null, null);
    if (!r.pass) aidResult = r;
  }
  assert.ok(aidResult);
  assert.equal(aidResult.state.missions.moon.carriedBonuses.aidUsed, true);
  assert.equal(aidResult.state.henchmen.kevin.stress, 0);
  assert.equal(aidResult.state.henchmen.mal.stress, 0);

  // EMP: cancels and consumes the next dawn crisis.
  let emp = fresh('emp-cancel');
  emp.equipment.push('emp');
  emp.day = 3;
  emp.quietDays = 2;
  emp.money = 300;
  emp.missions.moon.status = 'failed';
  emp.missions.moon.stage = 'done';
  const dawn = E.dawnTick(emp);
  assert.equal(dawn.newCrises.length, 0);
  assert.equal(dawn.state.crises.length, 0);
  assert.equal(dawn.state.equipment.includes('emp'), false);
  assert.ok(dawn.events.some(e => e.includes('EMP Pulse cancelled')));
});

test('save migration forward-fills repair fields in old v02 saves', () => {
  const old = fresh('old-save');
  delete old.missions.prep;
  delete old.missions.moon.relaunchCount;
  delete old.debuffs.unpaid_upkeep_streak;
  const loaded = Save.importJSON(JSON.stringify(old));
  assert.ok(loaded.missions.prep);
  assert.equal(loaded.missions.moon.relaunchCount, 0);
  assert.equal(loaded.debuffs.unpaid_upkeep_streak, 0);
});
