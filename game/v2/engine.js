// V2 engine — pure state transitions per V2_INTERFACE_CONTRACT.md §2.
// Node + browser dual-mode.
(function(root, factory){
  const Rng = (typeof require === 'function' && typeof module !== 'undefined')
    ? require('./rng.js') : root.EvilGeniusV2Rng;
  const C = (typeof require === 'function' && typeof module !== 'undefined')
    ? require('./content.js') : root.EvilGeniusV2Content;
  const Crises = (typeof require === 'function' && typeof module !== 'undefined')
    ? require('./crises.js') : root.EvilGeniusV2Crises;
  const api = factory(Rng, C, Crises);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.EvilGeniusV2Engine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(Rng, C, Crises){

  const clone = s => JSON.parse(JSON.stringify(s));
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // Repair-phase design constants — documented in V2_PLAYTEST_REPORT.md §8 fixes.
  const DC_FLOOR = 15;              // Effective DC clamp (B5). STRONG caps at ~86%.
  const CHAOS_UPKEEP = 35;          // $/day Chaos server upkeep (was 50 — economy rebalance).
  const BANKRUPT_UNPAID_DAYS = 2;   // Consecutive unpaid upkeep days -> defeat_bankrupt (B8).
  const SIDE_OP_INTEL_BONUS = 15;   // Moon stage bonus from a successful side op (P4).
  const SIDE_OP_INTEL_DAYS = 3;     // How many days the intel lasts.

  // --- freshly initialized state ---
  function createFreshGame(opts) {
    opts = opts || {};
    const playerId = opts.playerId || ('player-' + Math.random().toString(36).slice(2, 10));
    const runId = opts.runId || ('run-' + Math.random().toString(36).slice(2, 10));
    const seed = opts.seed || (playerId + ':' + runId);

    const henchmen = {};
    for (const h of C.HENCHMEN) {
      const base = {
        competence: h.startCompetence,
        stress: 0,
        loyalty: h.startLoyalty,
      };
      if (h.id === 'boris') base.rage = 0;
      if (h.id === 'chaos') base.upkeepPaid = true;
      henchmen[h.id] = base;
    }

    const state = {
      schema: 'v02',
      seed,
      playerId,
      runId,
      day: 1,
      cp: 2,
      money: 600,
      heat: 8,
      infamy: 5,
      morale: 70,
      research: 0,
      henchmen,
      relationships: Object.assign({}, C.START_RELATIONSHIPS),
      equipment: C.EQUIPMENT.filter(e=>e.startOwned).map(e=>e.id),
      equipmentBroken: [],
      equipmentUnlocked: [],
      buildings: [],
      buildQueue: [],
      crises: [],
      pendingChains: [],
      missions: {
        moon: { stage:'idle', status:'pending', assigned:[], loadout:[],
                stageResults:[], carriedBonuses:{}, attemptCounters:{}, relaunchCount:0 },
        prep: { stage:'idle', status:'pending', assigned:[], loadout:[],
                stageResults:[], carriedBonuses:{}, attemptCounters:{}, relaunchCount:0 },
      },
      debuffs: {
        chaos_debuff_days:0, lab_offline_days:0, chaos_offline_days:0, next_dc:0,
        unpaid_upkeep_streak: 0,
        moon_intel_days: 0,
        moon_intel_source: null,
      },
      bankruptcyCounter: 0,
      quietDays: 0,
      recentCrises: [],
      log: ['Day 1: Evil Genius Incorporated established. No refunds.'],
      outcome: 'running',
    };
    if (opts.campaign) {
      state.campaign = { version:1, lastOperationDay:0 };
      for (const id of ['funding','satellite','prototype']) state.missions[id] = {
        stage:'idle', status:'pending', assigned:[], loadout:[], stageResults:[],
        carriedBonuses:{}, attemptCounters:{}, relaunchCount:0,
      };
      state.log.unshift('Campaign: earn the payroll, satellite link, and shrink ray before the Moon heist.');
    }
    return state;
  }

  // Existing saves keep their original rules. New browser games opt into this campaign.
  function missionAvailability(state, missionId) {
    const def = C.MISSIONS_BY_ID[missionId];
    const no = reason => ({ok:false, reason});
    if (!def?.unlocked || (def.campaignOnly && !state.campaign)) return no('Mission not available');
    if (state.outcome !== 'running') return no('This run has ended. Start a new game.');
    if (!state.campaign) return {ok:true, reason:''};
    const done = id => state.missions[id]?.status === 'success' || state.missions[id]?.carriedBonuses?.milestoneSecured === true || (id === 'prototype' && state.missions[id]?.carriedBonuses?.prototypeTested === true);
    if (Object.values(state.missions).some(m => !['idle','done'].includes(m.stage))) return no('Finish or forfeit your active operation first.');
    if (state.campaign.lastOperationDay === state.day) return no('The crew has used today’s operation slot. Prepare the lair and launch tomorrow.');
    if (['satellite','prototype','moon'].includes(missionId) && !done('funding')) return no('Complete Raid Rival Payroll first.');
    if (['satellite','prototype','moon'].includes(missionId) && !state.buildings.includes('server_room')) return no('Build a Server Room and let construction finish.');
    if (['prototype','moon'].includes(missionId) && !done('satellite')) return no('Complete Hijack the Uplink first.');
    if (['prototype','moon'].includes(missionId) && (!state.buildings.includes('lab') || state.debuffs.lab_offline_days > 0)) return no('Build an online Laboratory.');
    if (missionId === 'moon' && !done('prototype')) return no('Complete Field-test the Shrink Ray first.');
    if (missionId === 'moon' && !state.campaign.researchCompleted && !state.equipmentUnlocked.length) return no('Research at least one piece of equipment.');
    const cp = missionId === 'moon' ? 2 : def.launchCp || 0;
    const cost = missionId === 'moon' ? 150 : def.launchCost || 0;
    if (state.cp < cp) return no(`Need ${cp} Command Points to launch.`);
    if (state.money < cost) return no(`Need $${cost} to launch.`);
    return {ok:true, reason:''};
  }

  // --- dawn tick ---
  function dawnTick(state) {
    const s = clone(state);
    const events = [];

    s.day += 1;
    s.cp = 2;

    // Kevin passive income
    s.money += 30;

    // Server room / lab RP, Vault heat reduction, Rec Room stress ebb
    let rp = 0;
    if (s.buildings.includes('server_room')) rp += 2;
    if (s.buildings.includes('lab')) rp += 1;
    s.research += rp;

    if (s.buildings.includes('vault')) s.heat = Math.max(0, s.heat - 3);
    if (s.buildings.includes('rec_room')) {
      for (const id of Object.keys(s.henchmen)) {
        s.henchmen[id].stress = Math.max(0, (s.henchmen[id].stress || 0) - 5);
        if (id === 'boris') s.henchmen.boris.rage = Math.max(0, (s.henchmen.boris.rage || 0) - 5);
      }
    }

    // CHAOS upkeep — tracked for honest bankruptcy (B8).
    let upkeepUnpaidToday = false;
    if (!s.buildings.includes('server_room')) {
      if (s.money >= CHAOS_UPKEEP) {
        s.money -= CHAOS_UPKEEP;
        s.henchmen.chaos.upkeepPaid = true;
      } else {
        s.henchmen.chaos.upkeepPaid = false;
        s.henchmen.chaos.competence = Math.max(1, s.henchmen.chaos.competence - 1);
        upkeepUnpaidToday = true;
        events.push('CHAOS server upkeep unpaid; competence -1.');
      }
    } else {
      s.henchmen.chaos.upkeepPaid = true;
    }

    // Debuff decays
    if (s.debuffs.chaos_debuff_days > 0) s.debuffs.chaos_debuff_days -= 1;
    if (s.debuffs.lab_offline_days > 0) s.debuffs.lab_offline_days -= 1;
    if (s.debuffs.chaos_offline_days > 0) s.debuffs.chaos_offline_days -= 1;
    if (s.debuffs.moon_intel_days > 0) {
      s.debuffs.moon_intel_days -= 1;
      if (s.debuffs.moon_intel_days === 0) {
        s.debuffs.moon_intel_source = null;
        events.push('Side-op intel on the Moon mission has gone stale.');
      }
    }

    // Build queue
    const stillBuilding = [];
    for (const b of s.buildQueue) {
      const n = b.daysLeft - 1;
      if (n <= 0) {
        if (!s.buildings.includes(b.id)) s.buildings.push(b.id);
        events.push('Building complete: ' + C.BUILDINGS_BY_ID[b.id].name + '.');
      } else {
        stillBuilding.push({ id:b.id, daysLeft:n });
      }
    }
    s.buildQueue = stillBuilding;

    // Pending crisis chains that come due today
    const stillPending = [];
    const dueChildren = [];
    for (const p of s.pendingChains) {
      if (p.dueDay <= s.day) dueChildren.push(p.child);
      else stillPending.push(p);
    }
    s.pendingChains = stillPending;

    // Roll a new crisis via Crises module (uses scoped RNG)
    const expired = Crises.expireOverdue(s);
    Object.assign(s, expired.state);
    events.push(...expired.events);
    let newCrises = Crises.rollDawnCrises(s, dueChildren, expired.expiredIds);
    let empCancelled = false;
    // EMP Pulse is a strategic one-shot: cancel and consume the next crisis.
    if (newCrises.length > 0 && workingEquipment(s, s.equipment).includes('emp')) {
      const cancelled = newCrises.shift();
      empCancelled = true;
      s.equipment = s.equipment.filter(id => id !== 'emp');
      s.equipmentUnlocked = s.equipmentUnlocked.filter(id => id !== 'emp');
      s.recentCrises = [...(s.recentCrises || []), cancelled.id].slice(-2);
      events.push('EMP Pulse cancelled crisis: ' + C.CRISES_BY_ID[cancelled.id].title + '.');
    }
    for (const c of newCrises) {
      if (!s.crises.find(x => x.id === c.id)) {
        s.crises.push({ id: c.id, appearedDay: s.day });
        s.recentCrises = [...(s.recentCrises || []), c.id].slice(-2);
        events.push('Crisis: ' + C.CRISES_BY_ID[c.id].title + '.');
        // Chain children queue on APPEARANCE (R5)
        const def = C.CRISES_BY_ID[c.id];
        if (def.chain) {
          s.pendingChains.push({ child: def.chain.child, dueDay: s.day + def.chain.delay });
        }
      }
    }
    s.quietDays = (newCrises.length > 0 || empCancelled) ? 0 : (s.quietDays || 0) + 1;

    // Honest bankruptcy counter (B8): consecutive dawns where CHAOS upkeep went unpaid.
    if (upkeepUnpaidToday) {
      s.debuffs.unpaid_upkeep_streak = (s.debuffs.unpaid_upkeep_streak || 0) + 1;
      if (s.debuffs.unpaid_upkeep_streak >= BANKRUPT_UNPAID_DAYS) {
        s.outcome = 'defeat_bankrupt';
      }
    } else {
      s.debuffs.unpaid_upkeep_streak = 0;
    }
    s.bankruptcyCounter = s.debuffs.unpaid_upkeep_streak;

    s.outcome = checkOutcome(s);
    s.log = [...(events.length ? events : ['quiet morning.']).map(event => 'Day ' + s.day + ' dawn: ' + event), ...(s.log || [])].slice(0, 120);
    return { state: s, events, newCrises };
  }

  // --- spendCommandPoint (HQ actions) ---
  function spendCommandPoint(state, action) {
    if (state.campaign && state.outcome !== 'running') return {state, error:'This run has ended.'};
    const s = clone(state);
    const events = [];
    switch (action.kind) {
      case 'build': {
        const def = C.BUILDINGS_BY_ID[action.building];
        if (!def) return { state, error: 'Unknown building' };
        if (s.buildings.includes(def.id) || s.buildQueue.find(b=>b.id===def.id))
          return { state, error: 'Already built or in progress' };
        if (s.cp < def.cp) return { state, error: 'Not enough CP' };
        if (s.money < def.cost) return { state, error: 'Not enough money' };
        s.cp -= def.cp; s.money -= def.cost;
        s.buildQueue.push({ id: def.id, daysLeft: def.days });
        events.push('Started building ' + def.name + '.');
        break;
      }
      case 'research': {
        const def = C.EQUIPMENT_BY_ID[action.equipment];
        if (!def || !def.unlockRP) return { state, error: 'Not researchable' };
        if (s.equipmentUnlocked.includes(def.id) || s.equipment.includes(def.id))
          return { state, error: 'Already unlocked' };
        if (def.requiresBuilding && !s.buildings.includes(def.requiresBuilding))
          return { state, error: 'Requires ' + def.requiresBuilding };
        if (s.cp < 1) return { state, error: 'Not enough CP' };
        if (s.research < def.unlockRP) return { state, error: 'Not enough RP' };
        s.cp -= 1; s.research -= def.unlockRP;
        s.equipmentUnlocked.push(def.id);
        s.equipment.push(def.id);
        if (s.campaign) s.campaign.researchCompleted = true;
        events.push('Researched: ' + def.name + '.');
        break;
      }
      case 'repair': {
        if (!s.equipmentBroken.includes(action.equipment)) return { state, error: 'Not broken' };
        if (!s.buildings.includes('lab')) return { state, error: 'Requires Laboratory' };
        if (s.cp < 1) return { state, error: 'Not enough CP' };
        if (s.money < 75) return { state, error: 'Need $75' };
        s.cp -= 1; s.money -= 75;
        s.equipmentBroken = s.equipmentBroken.filter(x => x !== action.equipment);
        events.push('Repaired: ' + C.EQUIPMENT_BY_ID[action.equipment].name + '.');
        break;
      }
      case 'dayoff': {
        const h = s.henchmen[action.henchman];
        if (!h) return { state, error: 'Unknown henchman' };
        if (s.cp < 1) return { state, error: 'Not enough CP' };
        // B6: reject a no-op day off instead of silently charging the CP.
        const def = C.HENCHMEN_BY_ID[action.henchman];
        const current = def.stressImmune ? (h.rage || 0) : (h.stress || 0);
        if (current <= 0) return { state, error: def.name + ' has nothing to decompress from.' };
        s.cp -= 1;
        h.stress = Math.max(0, (h.stress || 0) - 30);
        if (action.henchman === 'boris') s.henchmen.boris.rage = Math.max(0, s.henchmen.boris.rage - 30);
        events.push(action.henchman + ' took a day off.');
        break;
      }
      case 'dismiss_crisis': {
        const resolution = Crises.resolveCrisisChoice(s, action.crisisId, action.choiceId);
        if (resolution.error) return { state, error: resolution.error };
        Object.assign(s, resolution.state);
        for (const e of resolution.events) events.push(e);
        break;
      }
      case 'laylow': {
        if (!s.campaign || s.heat <= 8) return {state, error:'No need to lay low yet.'};
        if (s.cp < 1 || s.money < 25) return {state, error:'Laying low needs $25 and 1 CP.'};
        s.cp -= 1; s.money -= 25; s.heat = Math.max(0, s.heat - 15);
        events.push('Laying low: -15 heat, -$25, -1 CP.');
        break;
      }
      case 'end_day': {
        if (s.campaign && Object.values(s.missions).some(m => !['idle','done'].includes(m.stage))) return {state, error:'Finish or forfeit the active operation before ending the day.'};
        const dawn = dawnTick(s);
        return { state: dawn.state, events: [...events, ...dawn.events] };
      }
      default:
        return { state, error: 'Unknown action kind' };
    }
    s.outcome = checkOutcome(s);
    s.log = events.length ? [...events.map(e => 'Day ' + s.day + ': ' + e), ...s.log].slice(0,120) : s.log;
    return { state: s, events };
  }

  // --- start mission ---
  function startMission(state, missionId, loadout) {
    const availability = missionAvailability(state, missionId);
    if (!availability.ok) return {state, error:availability.reason};
    const s = clone(state);
    const mdef = C.MISSIONS_BY_ID[missionId];
    if (!mdef || !mdef.unlocked) return { state, error: 'Mission not available' };
    const m = s.missions[missionId];
    if (!m) return { state, error: 'No mission record' };
    if (m.stage !== 'idle' && m.stage !== 'done') return { state, error: 'Mission in progress' };
    if (m.status === 'success' && missionId !== 'prep') return { state, error: 'Mission already succeeded' };
    const hens = (loadout && loadout.henchmen) || [];
    const eq = (loadout && loadout.equipment) || [];
    const minH = mdef.minHenchmen ?? 2;
    const maxH = mdef.maxHenchmen ?? 4;
    const maxE = mdef.maxEquipment ?? 2;
    if (hens.length < minH || hens.length > maxH)
      return { state, error: `Need ${minH}-${maxH} henchmen` };
    if (eq.length > maxE) return { state, error: 'Max ' + maxE + ' equipment' };
    for (const h of hens) if (!s.henchmen[h]) return { state, error: 'Unknown henchman ' + h };
    if (new Set(hens).size !== hens.length) return { state, error: 'No duplicate henchmen' };
    for (const e of eq) {
      if (!s.equipment.includes(e)) return { state, error: 'Equipment not owned: ' + e };
      if (s.equipmentBroken.includes(e)) return { state, error: 'Equipment broken: ' + e };
    }
    const launchCp = s.campaign && missionId === 'moon' ? 2 : mdef.launchCp || 0;
    const launchCost = s.campaign && missionId === 'moon' ? 150 : mdef.launchCost || 0;
    if (s.cp < launchCp) return { state, error: `Need ${launchCp} CP to launch` };
    if (s.money < launchCost) return { state, error: `Need $${launchCost} to launch` };
    s.cp -= launchCp;
    s.money -= launchCost;
    if (s.campaign) s.campaign.lastOperationDay = s.day;
    m.stage = (mdef.stages && mdef.stages[0]) || 'scout';
    m.status = 'in_progress';
    m.assigned = hens;
    m.loadout = eq;
    m.stageResults = [];
    m.carriedBonuses = {...(m.carriedBonuses?.prototypeTested ? {prototypeTested:true} : {}), ...(m.carriedBonuses?.milestoneSecured ? {milestoneSecured:true} : {})};
    m.attemptCounters = {};
    // B2 fix: bump relaunchCount so retries roll differently under the same seed.
    m.relaunchCount = (m.relaunchCount || 0) + 1;
    return { state: s };
  }

  // Campaign exits use one specialist, not the combined strength of the whole crew.
  // Loud keeps Boris/Hammer's established force identity; fast is a technical getaway.
  function campaignEscapeSupport(state, missionId, plan) {
    const m = state.missions[missionId];
    const skill = {fast:'science', clever:'deception', loud:'force'}[plan];
    const ranked = (m.assigned || []).map(id => {
      const h = state.henchmen[id], def = C.HENCHMEN_BY_ID[id];
      let comp = h.competence;
      if (id === 'mal' && state.buildings.includes('lab') && !(state.debuffs?.lab_offline_days > 0)) comp = Math.round(comp * 1.25);
      const mult = def.skill === skill ? def.traitBonus || 1 : def.traitPenalty?.[skill] || def.traitPenalty?.off || 1;
      let score = Math.round(comp * mult * 1.3) - (def.stressImmune ? 0 : Math.floor(h.stress / 4));
      if (id === 'chaos') score -= (state.debuffs?.chaos_offline_days > 0 ? 10 : 0) + (state.debuffs?.chaos_debuff_days > 0 ? 4 : 0);
      return {id, score};
    }).sort((a,b) => b.score-a.score);
    return {skill, henchmen:ranked.length ? [ranked[0].id] : [],
      equipment:workingEquipment(state,m.loadout).filter(id => !C.EQUIPMENT_BY_ID[id].synergy || C.EQUIPMENT_BY_ID[id].synergy === skill)};
  }

  function failedMissionPayout(state, missionId) {
    const def = C.MISSIONS_BY_ID[missionId];
    return state.campaign ? (missionId === 'moon' ? 150 : def.launchCost || 0) : Math.round(def.reward * 0.5);
  }

  // --- utility: compute stage probability (0..1) given state + inputs ---
  function stageProbability(state, missionId, stage, inputs) {
    if (state.campaign && stage === 'escape') inputs = {...inputs, ...campaignEscapeSupport(state,missionId,inputs.plan)};
    const dcCfg = C.STAGE_DCS[stage];
    const m = state.missions[missionId];
    let dc = (stage === 'escape') ? dcCfg[inputs.plan] : dcCfg.base;
    const heatOverflow = Math.max(0, state.heat - 50);
    dc += Math.floor(heatOverflow / 10) * (dcCfg.heatPer10 || 0);
    let modifier = 0;
    const reasons = [];
    const roster = inputs.henchmen || m.assigned;

    if (state.campaign) {
      const def = C.MISSIONS_BY_ID[missionId];
      dc += def.difficulty || 0;
      if (def.difficulty) reasons.push(`Operation difficulty: ${def.difficulty} DC`);
      if (def.favoredSkills?.includes(inputs.skill)) { modifier += 10; reasons.push(`Useful specialty (${inputs.skill}): +10`); }
      if (missionId === 'moon' && (state.missions.satellite?.status === 'success' || state.missions.satellite?.carriedBonuses?.milestoneSecured)) { modifier += 5; reasons.push('Satellite uplink: +5'); }
      if (missionId === 'moon' && stage === 'breach' && (state.missions.prototype?.status === 'success' || state.missions.prototype?.carriedBonuses?.prototypeTested)) { modifier += 5; reasons.push('Tested shrink ray: +5'); }
    }

    // One-shot DC bump from C8 (R5 debuff). Consumed when this stage ends.
    const nextDc = state.debuffs?.next_dc || 0;
    dc += nextDc;
    if (nextDc) reasons.push(`Rival boast: +${nextDc} DC`);

    for (const hid of roster) {
      const h = state.henchmen[hid];
      const def = C.HENCHMEN_BY_ID[hid];
      if (!h || !def) continue;
      const useSkill = inputs.skill || def.skill;
      let comp = h.competence;
      // B9 fix: Lab's "Mal +25% competence" now applies on every stage Mal participates in
      // (not just Breach), matching the content.js effect text.
      if (hid === 'mal' && state.buildings.includes('lab')
          && !(state.debuffs?.lab_offline_days > 0)) {
        comp = Math.round(comp * 1.25);
      }
      // trait bonus/penalty
      let traitMult = 1.0;
      if (def.skill === useSkill) traitMult = def.traitBonus || 1.0;
      else if (def.traitPenalty && def.traitPenalty[useSkill]) traitMult = def.traitPenalty[useSkill];
      else if (def.traitPenalty && def.traitPenalty.off) traitMult = def.traitPenalty.off;
      const contrib = Math.round(comp * traitMult * 1.3);
      modifier += contrib;
      reasons.push(`${def.name} (${useSkill}): +${contrib}`);
      // stress fumble (Boris immune)
      if (!def.stressImmune && h.stress > 0) {
        const fumble = Math.floor(h.stress / 4);
        modifier -= fumble;
        if (fumble > 0) reasons.push(`${def.name} stressed: -${fumble}`);
      }
    }

    if (state.campaign && m.retryBonus > 0) { modifier += m.retryBonus; reasons.push(`Lessons learned: +${m.retryBonus}`); }

    // Equipment synergy
    for (const eid of workingEquipment(state, inputs.equipment || m.loadout || [])) {
      const def = C.EQUIPMENT_BY_ID[eid];
      if (!def) continue;
      if (def.synergy && def.synergy === (inputs.skill || def.synergy)) {
        modifier += def.bonus || 0;
        reasons.push(`${def.name} synergy: +${def.bonus || 0}`);
      }
    }

    // Approach relationship bonus (2 henchmen) — content keys use HENCH_IDS declaration order,
    // not alphabetical sort. Use the exact order from HENCHMEN array.
    if (stage === 'approach' && roster.length === 2) {
      const idOrder = C.HENCH_IDS;
      const a = roster[0], b = roster[1];
      const key = idOrder.indexOf(a) < idOrder.indexOf(b) ? `${a}:${b}` : `${b}:${a}`;
      const rel = state.relationships[key] || 0;
      modifier += rel * 5;
      if (rel) reasons.push(`Relationship ${key}: ${rel>0?'+':''}${rel*5}`);
    }

    // Scout success bonus to Approach/Breach
    if (stage === 'approach' && (m.carriedBonuses.approach || 0)) {
      modifier += m.carriedBonuses.approach;
      reasons.push(`Scout intel: ${m.carriedBonuses.approach>0?'+':''}${m.carriedBonuses.approach}`);
    }
    if (stage === 'breach' && (m.carriedBonuses.breach || 0)) {
      modifier += m.carriedBonuses.breach;
      reasons.push(`Prior stages: ${m.carriedBonuses.breach>0?'+':''}${m.carriedBonuses.breach}`);
    }

    // Side-op intel bonus (P4): a successful prep operation gives one of three
    // targeted bonuses to Moon stages for a limited number of days.
    if (missionId === 'moon' && (state.debuffs?.moon_intel_days > 0)) {
      const src = state.debuffs.moon_intel_source;
      if (src === 'surveillance' && stage === 'scout')    { modifier += SIDE_OP_INTEL_BONUS; reasons.push(`Side-op surveillance: +${SIDE_OP_INTEL_BONUS}`); }
      if (src === 'bribery'      && stage === 'approach') { modifier += SIDE_OP_INTEL_BONUS; reasons.push(`Side-op bribery: +${SIDE_OP_INTEL_BONUS}`); }
      if (src === 'sabotage'     && stage === 'breach')   { modifier += SIDE_OP_INTEL_BONUS; reasons.push(`Side-op sabotage: +${SIDE_OP_INTEL_BONUS}`); }
    }

    // Escape risk-shape modifiers (R6)
    if (stage === 'escape') {
      if (inputs.plan === 'fast') {
        if (m.stageResults.find(r => r.stage === 'scout' && r.pass)) { modifier += 10; reasons.push('Scouted exits: +10'); }
        if (m.stageResults.find(r => r.stage === 'approach' && r.pass && r.routeId === 'sewer')) { modifier -= 10; reasons.push('Sewer slow extract: -10'); }
      }
      if (inputs.plan === 'clever') {
        const deceptionHench = (m.assigned || []).find(h => C.HENCHMEN_BY_ID[h]?.skill === 'deception');
        if (deceptionHench && (state.henchmen[deceptionHench]?.stress || 0) < 50) { modifier += 10; reasons.push('Deception support ready: +10'); }
        if (m.stageResults.find(r => r.stage === 'breach' && r.provider === 'override')) { modifier -= 10; reasons.push('Breach improvised: -10'); }
      }
      if (inputs.plan === 'loud') {
        if ((m.assigned || []).includes('boris') && workingEquipment(state, m.loadout).includes('hammer')) { modifier += 15; reasons.push('Boris + Hammer: +15'); }
      }
      // B3: a botched approach makes every exit harder.
      if (m.stageResults.find(r => r.stage === 'approach' && !r.pass)) {
        modifier -= 15; reasons.push('Approach botched: -15 Escape');
      }
    }

    // Lab-offline debuff gates Lab's +5 modifier
    if (state.buildings.includes('lab') && !(state.debuffs?.lab_offline_days > 0)) { modifier += 5; reasons.push('Lab support: +5'); }
    if (state.buildings.includes('server_room') && stage === 'breach') { modifier += 5; reasons.push('Server intel: +5'); }
    if (state.buildings.includes('rec_room') && stage === 'escape') { modifier += 3; reasons.push('Rested crew: +3'); }
    // CHAOS-offline debuff removes CHAOS from the roster contribution
    if (state.debuffs?.chaos_offline_days > 0) {
      for (const hid of roster) if (hid === 'chaos') { modifier -= 10; reasons.push('CHAOS offline: -10'); }
    }
    // Chaos competence debuff
    if (state.debuffs?.chaos_debuff_days > 0) {
      for (const hid of roster) if (hid === 'chaos') { modifier -= 4; reasons.push('CHAOS firmware lag: -4'); }
    }

    const rawEffective = dc - modifier;
    // B5 fix: clamp effective DC to a floor so "STRONG" never means ~99%+.
    const effectiveDC = clamp(rawEffective, DC_FLOOR, 95);
    if (rawEffective < DC_FLOOR) reasons.push(`DC floor (${DC_FLOOR}): further prep cosmetic`);
    // 1d100 vs effectiveDC → pass if roll >= effectiveDC (higher = better).
    // Convert to probability.
    const probability = clamp((100 - effectiveDC + 1) / 100, 0.05, 0.95);
    return { probability, dc, modifier, effectiveDC, reasons };
  }

  function riskBucket(p) {
    if (p < 0.35) return 'HIGH';
    if (p < 0.55) return 'RISKY';
    if (p < 0.75) return 'FAVORABLE';
    return 'STRONG';
  }
  function riskBarSegments(p) { return clamp(Math.round(p * 10), 0, 10); }

  function describeStageRisk(state, missionId, stage, inputs) {
    const r = stageProbability(state, missionId, stage, inputs || {});
    return { probability: r.probability, bucket: riskBucket(r.probability), reasons: r.reasons };
  }

  // Which Escape plans are gated and why — B3. UI uses this to disable options with a reason.
  function escapePlanAvailability(state, missionId) {
    const m = state.missions[missionId];
    const approachFailed = m?.stageResults?.some(r => r.stage === 'approach' && !r.pass);
    const scoutFailed = m?.stageResults?.some(r => r.stage === 'scout' && !r.pass);
    const base = { fast: {ok:true}, clever: {ok:true}, loud: {ok:true} };
    if (approachFailed) {
      base.fast = { ok:false, reason:'Fast exits are compromised after the Approach was botched.' };
      base.clever = { ok:false, reason:'Clever cover is burnt — guards saw you fumble the Approach.' };
    }
    if (scoutFailed && approachFailed) {
      base.loud = { ok:true, warn:'Scout AND Approach failed. LOUD is your only exit, and it is going to hurt.' };
    }
    return base;
  }

  function applyMissionEndRecovery(s, m, events) {
    if (!workingEquipment(s, m.loadout).includes('aid') || m.carriedBonuses.aidUsed) return;
    m.carriedBonuses.aidUsed = true;
    for (const hid of m.assigned || []) {
      const def = C.HENCHMEN_BY_ID[hid];
      if (def?.stressImmune) s.henchmen[hid].rage = Math.max(0, (s.henchmen[hid].rage || 0) - 20);
      else s.henchmen[hid].stress = Math.max(0, (s.henchmen[hid].stress || 0) - 20);
    }
    events.push('First Aid Kit: assigned crew recovered 20 stress/rage.');
  }

  // --- Mission stage resolvers ---
  function _resolveStage(state, missionId, stage, inputs, provider) {
    const s = clone(state);
    const m = s.missions[missionId];
    if (!m) return { state, error: 'No mission' };
    if (m.stage !== stage) {
      // B1 side guard: with UI disabling buttons on first click this is defensive —
      // a replayed stage emit cannot corrupt state. Mark the result so UI can ignore it.
      return { state, pass:false, stage, roll:0, dc:0, modifiers:[],
               story:'stage already resolved', events:[], provider, alreadyResolved:true };
    }
    const prob = stageProbability(s, missionId, stage, inputs);
    // B2 fix: scope key includes relaunchCount so retries differ (deterministically).
    const scope = `mission:${missionId}:relaunch:${m.relaunchCount || 0}:stage:${stage}:${m.attemptCounters[stage] || 0}`;
    m.attemptCounters[stage] = (m.attemptCounters[stage] || 0) + 1;
    const gen = Rng.scoped(s.seed, scope);
    let roll = Rng.rollPercent(gen);
    let pass = roll >= prob.effectiveDC;
    const equipped = new Set(workingEquipment(s, m.loadout));
    const specialEvents = [];

    // Lucky Rabbit's Foot: deterministic one-time reroll on the first failed stage.
    if (!pass && equipped.has('rabbit') && !m.carriedBonuses.rabbitUsed) {
      const firstRoll = roll;
      m.carriedBonuses.rabbitUsed = true;
      const rerollGen = Rng.scoped(s.seed, scope + ':rabbit');
      roll = Rng.rollPercent(rerollGen);
      pass = roll >= prob.effectiveDC;
      specialEvents.push(`Rabbit's Foot reroll: ${firstRoll} → ${roll}.`);
      const breakGen = Rng.scoped(s.seed, `equipment:rabbit:break:${s.day}:${stage}:${m.relaunchCount||0}`);
      if (breakGen() < 0.2 && !s.equipmentBroken.includes('rabbit')) {
        s.equipmentBroken.push('rabbit');
        specialEvents.push("Lucky Rabbit's Foot broke.");
      }
    }

    const result = {
      pass, stage, roll, dc: prob.effectiveDC,
      modifiers: prob.reasons.map(r => ({ label:r.split(':')[0], value: parseInt(r.split(':').pop(), 10) || 0 })),
      story: '',
      events: [...specialEvents],
      carriedBonuses: {},
      provider,
    };
    if (inputs.routeId) result.routeId = inputs.routeId;

    // Smoke Grenade: 50% deterministic chance to bail out of a failed stage safely.
    // It costs $100 and ends the mission without applying the failed stage's penalties.
    if (!pass && equipped.has('smokescreen') && !m.carriedBonuses.smokeUsed && s.money >= 100) {
      const smokeGen = Rng.scoped(s.seed, scope + ':smokescreen');
      m.carriedBonuses.smokeUsed = true;
      if (smokeGen() < 0.5) {
        s.money -= 100;
        m.status = 'aborted';
        m.stage = 'done';
        result.story = 'Smoke Grenade bailout. Mission aborted before the failure consequences landed.';
        result.events.push('Smoke Grenade bailout: -$100, mission safely aborted.');
        applyMissionEndRecovery(s, m, result.events);
        if (s.debuffs.next_dc) s.debuffs.next_dc = 0;
        m.stageResults.push({ pass:false, stage, roll, dc:prob.effectiveDC, provider,
          story:result.story, events:[...result.events], routeId:result.routeId });
        result.state = s;
        s.outcome = checkOutcome(s);
        s.log = [...result.events.map(e => `Day ${s.day} ${stage}: ${e}`), ...s.log].slice(0, 120);
        return result;
      }
      result.events.push('Smoke Grenade failed to deploy.');
    }

    // Apply stage outcomes
    const roster = inputs.henchmen || m.assigned;
    const stressRise = pass ? 10 : 15;
    for (const hid of roster) {
      if (!s.henchmen[hid]) continue;
      const def = C.HENCHMEN_BY_ID[hid];
      if (def.stressImmune) {
        s.henchmen[hid].rage = Math.min(100, (s.henchmen[hid].rage || 0) + stressRise);
      } else {
        s.henchmen[hid].stress = Math.min(100, s.henchmen[hid].stress + stressRise);
      }
    }

    if (missionId === 'prep') {
      // Prep (side op, P4): short 2-stage loop — scout then payoff. No Approach or Escape.
      const mdef = C.MISSIONS_BY_ID.prep;
      if (stage === 'scout') {
        if (pass) {
          m.carriedBonuses.breach = 10;
          result.story = 'Prep scout clean. The payoff stage opens up.';
          result.events.push('Scout: pass. Payoff +10.');
        } else {
          s.heat = Math.min(100, s.heat + 8);
          m.carriedBonuses.breach = -10;
          result.story = 'Prep scout botched. Guards tightened up.';
          result.events.push('Scout: fail. +8 heat. Payoff -10.');
        }
      } else if (stage === 'breach') {
        if (pass) {
          const kind = inputs.sideOpKind || 'surveillance';
          s.debuffs.moon_intel_days = SIDE_OP_INTEL_DAYS;
          s.debuffs.moon_intel_source = kind;
          const bonus = Math.round(mdef.reward * 0.5);
          s.money += bonus;
          m.status = 'success';
          m.stage = 'done';
          const niceName = kind === 'surveillance' ? 'Scout +15'
                         : kind === 'bribery'      ? 'Approach +15'
                                                   : 'Breach +15';
          result.story = `Prep op complete. Moon gets ${niceName} for ${SIDE_OP_INTEL_DAYS} days.`;
          result.events.push(`Payoff: pass. +$${bonus}. Moon ${niceName} for ${SIDE_OP_INTEL_DAYS}d.`);
        } else {
          s.heat = Math.min(100, s.heat + 12);
          if (s.campaign) s.money += failedMissionPayout(s, missionId);
          m.status = 'failed';
          m.stage = 'done';
          result.story = 'Prep op blown. Heat spiked.';
          result.events.push('Payoff: fail. +12 heat. No intel bonus.' + (s.campaign ? ` Launch fee refunded: $${failedMissionPayout(s, missionId)}.` : ''));
        }
      }
    } else if (stage === 'scout') {
      if (pass) {
        m.carriedBonuses.approach = 10;
        m.carriedBonuses.breach = 5;
        result.story = 'Scout succeeded. Intel captured.';
        result.events.push('Scout: pass. Intel +10 to Approach, +5 to Breach.');
      } else {
        m.carriedBonuses.approach = -10;
        s.heat = Math.min(100, s.heat + 15);
        result.story = 'Scout tripped a silent alarm.';
        result.events.push('Scout: fail. +15 heat. Approach -10.');
      }
    } else if (stage === 'approach') {
      m.carriedBonuses._lastRoute = inputs.routeId;
      if (pass) {
        m.carriedBonuses.breach = (m.carriedBonuses.breach || 0) + 10;
        result.story = `Approach via ${inputs.routeId} succeeded.`;
        result.events.push('Approach: pass. Breach +10.');
      } else {
        const victim = roster[0];
        if (victim && s.henchmen[victim]) {
          if (C.HENCHMEN_BY_ID[victim].stressImmune) s.henchmen[victim].rage = Math.min(100, (s.henchmen[victim].rage||0) + 25);
          else s.henchmen[victim].stress = Math.min(100, s.henchmen[victim].stress + 25);
        }
        // B3: Approach fail now bites — Breach -25 (was -15), +10 heat, Escape plans restricted.
        m.carriedBonuses.breach = (m.carriedBonuses.breach || 0) - 25;
        s.heat = Math.min(100, s.heat + 10);
        result.story = 'Approach botched. Alarms up, cover burnt.';
        result.events.push('Approach: fail. +10 heat. Breach -25. Escape plans restricted.');
      }
    } else if (stage === 'breach') {
      if (pass) {
        const mdef = C.MISSIONS_BY_ID[missionId];
        const bonus = Math.round(mdef.reward * 0.1);
        m.carriedBonuses.rewardBonus = bonus;
        if (s.campaign && ['funding','satellite','prototype'].includes(missionId)) {
          m.carriedBonuses.milestoneSecured = true;
          result.events.push('Campaign milestone secured. A failed escape will not erase this progress.');
        }
        result.story = 'Breach clean. Payout bonus unlocked.';
        result.events.push(`Breach: pass. +${bonus} bonus reward on success.`);
        if (s.campaign && missionId === 'prototype') {
          m.carriedBonuses.prototypeTested = true;
          result.events.push('Shrink ray tested successfully. The Moon preparation milestone is secured even if escape fails.');
        }
        // Hammer bonus infamy
        if (equipped.has('hammer')) {
          s.infamy += 3;
          result.events.push('Hammer success: +3 infamy.');
        }
      } else {
        s.heat = Math.min(100, s.heat + 20);
        m.status = 'failed';
        m.stage = 'done';
        const mdef = C.MISSIONS_BY_ID[missionId];
        const partial = failedMissionPayout(s, missionId);
        s.money += partial;
        result.story = s.campaign ? 'Breach failed. Mission aborted; launch fee recovered from pre-sold intel.' : 'Breach failed. Mission aborted; partial payout from pre-sold intel.';
        result.events.push(`Breach: fail. +20 heat. Mission aborts. +$${partial}.`);
      }
    } else if (stage === 'escape') {
      const mdef = C.MISSIONS_BY_ID[missionId];
      const priorPasses = m.stageResults.filter(r => r.pass).length;
      const approachFailed = m.stageResults.some(r => r.stage === 'approach' && !r.pass);
      if (pass) {
        const reward = mdef.reward + (m.carriedBonuses.rewardBonus || 0);
        s.money += reward;
        // B3: infamy scales with how many prior stages passed. Approach fail drops it.
        let infamyGain = s.campaign && mdef.campaignOnly ? 8 + 2 * priorPasses : 8 * priorPasses + 8;
        if (approachFailed) infamyGain = Math.max(4, infamyGain - 8);
        s.infamy += infamyGain;
        if (inputs.plan === 'loud') {
          s.infamy += 5;
          s.heat = Math.min(100, s.heat + (approachFailed ? 15 : 10));
          for (const hid of (m.assigned || [])) {
            const def = C.HENCHMEN_BY_ID[hid];
            if (!def || !s.henchmen[hid]) continue;
            if (def.stressImmune) s.henchmen[hid].rage = Math.min(100, (s.henchmen[hid].rage||0) + 15);
            else s.henchmen[hid].stress = Math.min(100, s.henchmen[hid].stress + 15);
          }
        }
        s.heat = Math.min(100, s.heat + mdef.heat);
        m.status = 'success';
        m.stage = 'done';
        result.story = approachFailed
          ? `Escape (${inputs.plan}) scraped by after a botched approach. +$${reward}, +${infamyGain} infamy.`
          : `Escape (${inputs.plan}) clean. +$${reward}.`;
        result.events.push(`Escape: pass. +$${reward}. +${infamyGain} infamy. Mission success.`);
      } else {
        const mdef2 = C.MISSIONS_BY_ID[missionId];
        const partial = failedMissionPayout(s, missionId);
        s.money += partial;
        s.heat = Math.min(100, s.heat + 25);
        for (const hid of (m.assigned || [])) {
          const def = C.HENCHMEN_BY_ID[hid];
          if (!def || !s.henchmen[hid]) continue;
          if (def.stressImmune) s.henchmen[hid].rage = Math.min(100, (s.henchmen[hid].rage||0) + 10);
          else s.henchmen[hid].stress = Math.min(100, s.henchmen[hid].stress + 10);
        }
        m.status = 'failed_escape';
        m.stage = 'done';
        result.story = `Escape failed (${inputs.plan}). ${s.campaign ? 'Launch fee recovered.' : 'Partial payout.'}`;
        result.events.push(`Escape: fail. +25 heat. Partial +$${partial}.`);
      }
    }

    // Equipment heat / morale / breakage
    for (const eid of workingEquipment(s, inputs.equipment || m.loadout || [])) {
      const def = C.EQUIPMENT_BY_ID[eid];
      if (!def) continue;
      if (def.heatOnUse) s.heat = Math.min(100, s.heat + def.heatOnUse);
      if (def.moraleOnUse) s.morale = clamp(s.morale + def.moraleOnUse, 0, 100);
      if (pass && def.heatOnSuccess) s.heat = clamp(s.heat + def.heatOnSuccess, 0, 100);
      // Special breakage (Rabbit is handled only when its reroll is actually used).
      if (def.breakChance && eid !== 'rabbit') {
        const g = Rng.scoped(s.seed, `equipment:${eid}:break:${s.day}:${stage}:${m.relaunchCount||0}`);
        if (g() < def.breakChance) {
          if (!s.equipmentBroken.includes(eid)) s.equipmentBroken.push(eid);
          result.events.push(`${def.name} broke.`);
        }
      }
    }
    // Boris random break (1 in 10)
    if ((inputs.henchmen || m.assigned).includes('boris')) {
      const g = Rng.scoped(s.seed, `equipment:boris_break:${s.day}:${stage}:${m.relaunchCount||0}`);
      const intact = workingEquipment(s, inputs.equipment || m.loadout);
      if (g() < 0.1 && intact.length > 0) {
        const victim = intact[Math.floor(g() * intact.length)];
        if (victim && !s.equipmentBroken.includes(victim)) {
          s.equipmentBroken.push(victim);
          result.events.push('Boris broke ' + C.EQUIPMENT_BY_ID[victim].name + '.');
        }
      }
    }

    // Advance stage pointer
    if (!['done'].includes(m.stage)) {
      if (missionId === 'prep') {
        if (stage === 'scout') m.stage = 'breach';
      } else {
        if (stage === 'scout') m.stage = pass ? 'approach' : 'approach';
        else if (stage === 'approach') m.stage = 'breach';
        else if (stage === 'breach' && pass) m.stage = 'escape';
      }
    }

    // First Aid Kit: one-time mission-end recovery for the entire assigned crew.
    if (s.campaign && m.stage === 'done' && ['failed','failed_escape'].includes(m.status)) {
      m.retryBonus = Math.min(15, (m.retryBonus || 0) + 5);
      result.events.push(`Lessons learned: future attempts get +${m.retryBonus} (maximum +15).`);
    }
    if (m.stage === 'done') applyMissionEndRecovery(s, m, result.events);

    // Consume one-shot DC bump
    if (s.debuffs && s.debuffs.next_dc) s.debuffs.next_dc = 0;

    // Push a lean copy into stageResults (no circular .state field)
    const stored = { pass, stage, roll, dc: prob.effectiveDC, provider,
      story: result.story, events: [...result.events], routeId: result.routeId };
    m.stageResults.push(stored);
    result.state = s;
    s.outcome = checkOutcome(s);
    s.log = [...result.events.map(e => `Day ${s.day} ${stage}: ${e}`), ...s.log].slice(0, 120);
    return result;
  }

  function resolveScout(state, missionId, choice) {
    return _resolveStage(state, missionId, 'scout',
      { henchmen: [choice.henchman], equipment: [choice.equipment].filter(Boolean),
        skill: C.HENCHMEN_BY_ID[choice.henchman]?.skill }, 'deterministic');
  }
  function resolveApproach(state, missionId, choice) {
    const route = C.ROUTES_BY_ID[choice.route];
    return _resolveStage(state, missionId, 'approach',
      { henchmen: choice.henchmen, routeId: choice.route, skill: route?.skill }, 'deterministic');
  }
  // Pre-compute Breach specialist for honest risk display + override preview.
  function previewBreachSpecialist(state, missionId, override) {
    const m = state.missions[missionId];
    if (!m) return null;
    if (override && override.henchman && m.assigned.includes(override.henchman))
      return { specialist: override.henchman, provider: 'override' };
    return { specialist: _bestLocalPick(state, m.assigned, m.loadout), provider: 'deterministic' };
  }

  function resolveBreach(state, missionId, deciderResponse, override) {
    const m = state.missions[missionId];
    // Guard before Executive Override can charge CP or add stress.
    if (!m || m.stage !== 'breach') {
      return { state, pass:false, stage:'breach', roll:0, dc:0, modifiers:[],
               story:'stage already resolved', events:[], provider:'deterministic', alreadyResolved:true };
    }
    const assigned = m.assigned;
    let specialist, provider;
    let working = state;
    if (override && override.henchman) {
      if (!assigned.includes(override.henchman))
        return { state, pass:false, stage:'breach', roll:0, dc:0, modifiers:[],
                 story:'Override henchman not on roster', events:[], provider:'override' };
      // Charge override cost + apply +20 stress to the picked henchman (R2)
      const paid = payExecutiveOverride(state);
      if (paid.error)
        return { state, pass:false, stage:'breach', roll:0, dc:0, modifiers:[],
                 story:'Override denied: ' + paid.error, events:['Override denied: '+paid.error], provider:'override' };
      working = paid.state;
      const h = working.henchmen[override.henchman];
      const def = C.HENCHMEN_BY_ID[override.henchman];
      if (def.stressImmune) h.rage = Math.min(100, (h.rage || 0) + 20);
      else h.stress = Math.min(100, h.stress + 20);
      specialist = override.henchman;
      provider = 'override';
    } else if (deciderResponse && !deciderResponse.fallback && deciderResponse.choice) {
      const match = assigned.find(h => C.HENCHMEN_BY_ID[h]?.skill === deciderResponse.choice);
      specialist = match || _bestLocalPick(state, assigned, m.loadout);
      provider = match ? 'decider' : 'deterministic';
    } else {
      specialist = _bestLocalPick(state, assigned, m.loadout);
      provider = 'deterministic';
    }
    const skill = C.HENCHMEN_BY_ID[specialist]?.skill;
    return _resolveStage(working, missionId, 'breach',
      { henchmen: [specialist], skill, equipment: m.loadout }, provider);
  }
  function _bestLocalPick(state, assigned, loadout) {
    let best = assigned[0], bestScore = -1;
    for (const h of assigned) {
      const def = C.HENCHMEN_BY_ID[h];
      const hs = state.henchmen[h];
      if (!def || !hs) continue;
      let score = hs.competence * (def.traitBonus || 1.0);
      for (const e of workingEquipment(state, loadout)) {
        const edef = C.EQUIPMENT_BY_ID[e];
        if (edef && edef.synergy === def.skill) score *= 1.3;
      }
      if (score > bestScore) { bestScore = score; best = h; }
    }
    return best;
  }
  // --- forfeit an in-progress mission (R12: committed stage results stay in log) ---
  function abortMission(state, missionId) {
    const s = clone(state);
    const m = s.missions[missionId];
    if (!m) return { state, error: 'No mission' };
    if (m.stage === 'idle' || m.stage === 'done') return { state, error: 'Mission not in progress' };
    if (m.status === 'success') return { state, error: 'Mission already succeeded' };
    const prevStage = m.stage;
    m.stage = 'done';
    m.status = 'aborted';
    const events = [`Mission ${missionId} forfeited at ${prevStage}. Prior stage effects stand.`];
    applyMissionEndRecovery(s, m, events);
    if (s.debuffs.next_dc) s.debuffs.next_dc = 0;
    s.log = [...events.map(e => 'Day ' + s.day + ': ' + e), ...s.log].slice(0, 120);
    return { state: s, events };
  }

  function resolveEscape(state, missionId, plan) {
    const availability = escapePlanAvailability(state, missionId);
    if (!availability[plan]) return { state, error: 'Unknown Escape plan' };
    if (!availability[plan].ok) return { state, error: 'Escape plan is locked: ' + availability[plan].reason };
    const support = state.campaign ? campaignEscapeSupport(state,missionId,plan) : null;
    // Everyone still faces the escape's stress costs; only relevant gear is used.
    return _resolveStage(state, missionId, 'escape', support ? {plan, skill:support.skill, equipment:support.equipment} : { plan }, 'deterministic');
  }

  // Side-op resolvers (P4).
  function resolvePrepScout(state, choice) {
    const m = state.missions.prep;
    const selectedEquipment = choice?.equipment || m.loadout?.[0] || null;
    return _resolveStage(state, 'prep', 'scout',
      { henchmen: [choice.henchman], skill: C.HENCHMEN_BY_ID[choice.henchman]?.skill,
        equipment: selectedEquipment ? [selectedEquipment] : [] },
      'deterministic');
  }
  function resolvePrepPayoff(state, choice) {
    const m = state.missions.prep;
    const kind = choice.sideOpKind;
    const skillByKind = { surveillance:'science', bribery:'deception', sabotage:'force' };
    return _resolveStage(state, 'prep', 'breach',
      { henchmen: m.assigned, skill: skillByKind[kind] || 'science',
        equipment: m.loadout, sideOpKind: kind },
      'deterministic');
  }

  // --- Executive Override cost check per R2 ---
  function canExecutiveOverride(state) {
    if (state.cp >= 2) return { ok:true, cost:{ cp:2 }, desc:'2 CP' };
    if (state.infamy >= 10) return { ok:true, cost:{ cp: state.cp, infamy:10 }, desc:`-10 infamy, ${state.cp} CP` };
    return { ok:false, reason:'Need 2 CP OR 10 infamy' };
  }
  function payExecutiveOverride(state) {
    const chk = canExecutiveOverride(state);
    if (!chk.ok) return { state, error: chk.reason };
    const s = clone(state);
    if ('cp' in chk.cost) s.cp -= chk.cost.cp;
    if ('infamy' in chk.cost) s.infamy -= chk.cost.infamy;
    return { state: s };
  }

  function checkOutcome(state) {
    // Terminal outcomes are sticky.
    if (state.outcome === 'victory' || state.outcome === 'partial_victory'
        || (typeof state.outcome === 'string' && state.outcome.startsWith('defeat'))) {
      return state.outcome;
    }
    if (state.heat >= 100) return 'defeat_heat';
    if ((state.debuffs?.unpaid_upkeep_streak || 0) >= BANKRUPT_UNPAID_DAYS
        || (state.bankruptcyCounter || 0) >= BANKRUPT_UNPAID_DAYS) return 'defeat_bankrupt';
    const quit = Object.values(state.henchmen).filter(h => h.loyalty <= 0 || h.stress >= 100).length;
    if (quit >= 4) return 'defeat_abandoned';
    const moon = state.missions.moon;
    if (moon && moon.status === 'success') {
      if (state.infamy >= 25) return 'victory';
      return 'partial_victory';
    }
    return 'running';
  }

  // Thin wrapper exported per V2_INTERFACE_CONTRACT §2.
  function resolveCrisis(state, crisisId, choiceId) {
    return spendCommandPoint(state, { kind: 'dismiss_crisis', crisisId, choiceId });
  }

  function workingEquipment(state, ids = []) {
    return ids.filter(id => C.EQUIPMENT_BY_ID[id] && state.equipment.includes(id) && !state.equipmentBroken.includes(id));
  }

  return {
    workingEquipment, createFreshGame, dawnTick, spendCommandPoint, startMission, abortMission, missionAvailability,
    resolveScout, resolveApproach, resolveBreach, resolveEscape, resolveCrisis,
    resolvePrepScout, resolvePrepPayoff,
    canExecutiveOverride, payExecutiveOverride, previewBreachSpecialist,
    riskBucket, riskBarSegments, describeStageRisk, stageProbability,
    escapePlanAvailability,
    checkOutcome,
    constants: { DC_FLOOR, CHAOS_UPKEEP, BANKRUPT_UNPAID_DAYS, SIDE_OP_INTEL_BONUS, SIDE_OP_INTEL_DAYS },
  };
});
