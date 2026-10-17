// Crisis rolls + resolution per content.js definitions + R5 chains.
(function(root, factory){
  const Rng = (typeof require === 'function' && typeof module !== 'undefined')
    ? require('./rng.js') : root.EvilGeniusV2Rng;
  const C = (typeof require === 'function' && typeof module !== 'undefined')
    ? require('./content.js') : root.EvilGeniusV2Content;
  const api = factory(Rng, C);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.EvilGeniusV2Crises = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(Rng, C){

  const clone = s => JSON.parse(JSON.stringify(s));
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function eligible(state, def) {
    try { return !!def.trigger(state); } catch(e){ return false; }
  }

  function rollDawnCrises(state, forcedChildren, excludedIds = []) {
    const excluded = new Set(excludedIds);
    const result = [];
    const forced = new Set(forcedChildren || []);
    for (const id of forced) {
      const def = C.CRISES_BY_ID[id];
      if (def && !excluded.has(id) && !state.crises.find(x => x.id === id)) result.push({ id });
    }
    // Weighted pick among eligible defs, excluding already active + just-forced.
    const activeIds = new Set(state.crises.map(c => c.id));
    const allCandidates = C.CRISES.filter(d => !excluded.has(d.id) && !activeIds.has(d.id) && !forced.has(d.id) && eligible(state, d));
    const recent = new Set((state.recentCrises || []).slice(-2));
    let candidates = allCandidates.filter(d => !recent.has(d.id));
    // If cooldown filtering leaves no choice, allow an old crisis rather than dead air.
    if (candidates.length === 0) candidates = allCandidates;
    if (candidates.length === 0) return result;
    const gen = Rng.scoped(state.seed, `day:${state.day}:dawn`);
    // Anti-dead-air guarantee: after two quiet dawns, an eligible event fires.
    // The pick remains seeded and reproducible.
    if ((state.quietDays || 0) >= 2) {
      const pick = Rng.pickWeighted(gen, candidates.map(c=>c.id), candidates.map(c=>c.weight||1));
      result.push({ id: pick });
      return result;
    }
    // 60% chance to roll ONE crisis, 20% chance for a second
    if (gen() < 0.6) {
      const pick = Rng.pickWeighted(gen, candidates.map(c=>c.id), candidates.map(c=>c.weight||1));
      result.push({ id: pick });
      if (gen() < 0.2) {
        const rest = candidates.filter(c => c.id !== pick);
        if (rest.length) {
          const pick2 = Rng.pickWeighted(gen, rest.map(c=>c.id), rest.map(c=>c.weight||1));
          result.push({ id: pick2 });
        }
      }
    }
    return result;
  }

  function resolveCrisisChoice(state, crisisId, choiceId) {
    const def = C.CRISES_BY_ID[crisisId];
    if (!def) return { state, error: 'Unknown crisis', events:[] };
    const active = state.crises.find(c => c.id === crisisId);
    if (!active) return { state, error: 'Crisis not active', events:[] };
    const choice = def.options.find(o => o.id === choiceId);
    if (!choice) return { state, error: 'Unknown choice', events:[] };

    const s = clone(state);
    const events = [];
    const e = choice.effect || {};

    if ('money'   in e) s.money += e.money;
    if ('heat'    in e) s.heat = clamp(s.heat + e.heat, 0, 100);
    if ('morale'  in e) s.morale = clamp(s.morale + e.morale, 0, 100);
    if ('infamy'  in e) s.infamy = Math.max(0, s.infamy + e.infamy);
    if ('cp'      in e) {
      if (e.cp < 0 && s.cp + e.cp < 0) return { state, error: 'Not enough CP for this choice', events:[] };
      s.cp = Math.max(0, s.cp + e.cp);
    }
    if ('loyalty' in e) {
      for (const h of Object.values(s.henchmen)) h.loyalty = clamp(h.loyalty + e.loyalty, 0, 100);
    }
    if (e.chaos_debuff)   s.debuffs.chaos_debuff_days = Math.max(s.debuffs.chaos_debuff_days, e.chaos_debuff);
    if (e.lab_offline)    s.debuffs.lab_offline_days = Math.max(s.debuffs.lab_offline_days, e.lab_offline);
    if (e.chaos_offline)  s.debuffs.chaos_offline_days = Math.max(s.debuffs.chaos_offline_days, e.chaos_offline);
    if (e.next_dc)        s.debuffs.next_dc = (s.debuffs.next_dc || 0) + e.next_dc;
    if (e.steal_equipment && s.buildings.includes('vault')) events.push('Vault security prevented the theft.');
    if (e.steal_equipment && !s.buildings.includes('vault')) {
      const idx = s.equipment.findIndex(eid => !C.EQUIPMENT_BY_ID[eid].startOwned);
      const picked = idx >= 0 ? s.equipment.splice(idx, 1)[0] : s.equipment.pop();
      if (picked) {
        s.equipmentBroken = s.equipmentBroken.filter(id => id !== picked);
        s.equipmentUnlocked = s.equipmentUnlocked.filter(id => id !== picked);
      }
      if (picked) events.push('Stole: ' + C.EQUIPMENT_BY_ID[picked].name + '.');
    }
    if (e.break_equipment) {
      const picked = s.equipment.find(eid => !s.equipmentBroken.includes(eid));
      if (picked) {
        s.equipmentBroken.push(picked);
        events.push('Rust damage: ' + C.EQUIPMENT_BY_ID[picked].name + ' broke.');
      }
    }
    if (e.deception_roll) {
      const gen = Rng.scoped(s.seed, `day:${s.day}:crisis:${crisisId}`);
      const roll = Rng.rollPercent(gen);
      if (roll >= 50) { s.heat = Math.max(0, s.heat - 15); events.push('Deepfake succeeded. -15 heat.'); }
      else { s.heat = Math.min(100, s.heat + 10); events.push('Deepfake flopped. +10 heat.'); }
    }
    if (e.henchday_lost) events.push('Lost 1 henchman-day of productivity.');
    if ('boris_rage' in e) {
      if (s.henchmen.boris) s.henchmen.boris.rage = clamp((s.henchmen.boris.rage || 0) + e.boris_rage, 0, 100);
    }
    if ('team_destress' in e) {
      for (const [hid, h] of Object.entries(s.henchmen)) {
        if (C.HENCHMEN_BY_ID[hid]?.stressImmune) continue;
        h.stress = Math.max(0, (h.stress || 0) - e.team_destress);
      }
    }

    events.push(`Resolved ${def.title}: ${choice.label}.`);
    s.crises = s.crises.filter(c => c.id !== crisisId);
    return { state: s, events };
  }


  // Campaign crises allow two decision days before one automatic consequence.
  const defaults = {
    C1_boris_punched:['ignore','-5 morale'], C2_chaos_rollback:['delay','CHAOS competence reduced for 2 days'],
    C3_audit_letter:['ignore','-$100'], C4_mal_explodes:['offline','Laboratory offline for 3 days'],
    C5_hr_meeting:['skip','-10 loyalty for every henchman'], C6_journalist:['ignore','+15 heat'],
    C7_union:[null,'-5 morale'], C8_rival_taunt:['ignore','-5 infamy'],
    C9_equip_theft:['lose','one piece of equipment stolen'], C10_celebrity:['expel','-5 morale'],
    C11_server_melt:['reboot','CHAOS offline for 1 day'], C12_media_love:['deflect','-3 infamy, +5 loyalty'],
    C13_dolores_gossip:['ignore','-5 morale'], C14_equip_rust:['ignore','one piece of equipment breaks'],
    C15_boris_bored:[null,'+15 Boris rage'], C16_kevin_pitch:[null,'-$40 wasted supplies']
  };
  function expirationInfo(active) {
    const rule = defaults[active?.id];
    return rule ? {dueDay:(active.appearedDay || 1)+2, label:rule[1]} : null;
  }
  function expireOverdue(state) {
    let s = clone(state); const events = [], expiredIds = [];
    if (!s.campaign) return {state:s, events, expiredIds};
    for (const active of [...s.crises]) {
      const info = expirationInfo(active);
      if (!info || s.day < info.dueDay) continue;
      const choice = defaults[active.id][0];
      if (choice) {
        const result = resolveCrisisChoice(s, active.id, choice);
        s = result.state; events.push(...result.events);
      } else {
        if (active.id === 'C7_union') s.morale = clamp(s.morale-5,0,100);
        if (active.id === 'C15_boris_bored' && s.henchmen.boris) s.henchmen.boris.rage = clamp((s.henchmen.boris.rage||0)+15,0,100);
        if (active.id === 'C16_kevin_pitch') s.money -= 40;
        s.crises = s.crises.filter(c => c.id !== active.id);
      }
      events.push(`Deadline missed: ${C.CRISES_BY_ID[active.id].title}. ${info.label}.`);
      expiredIds.push(active.id);
    }
    return {state:s, events, expiredIds};
  }

  return { rollDawnCrises, resolveCrisisChoice, eligible, expirationInfo, expireOverdue };
});
