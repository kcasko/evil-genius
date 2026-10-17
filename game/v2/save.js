// Save / load / export / import — v02 only, ignores v01.
(function(root, factory){
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.EvilGeniusV2Save = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){

  const KEY = 'evil-genius-v02';
  const PLAYER_KEY = 'evil-genius-player-v02';

  function _ls() { return (typeof localStorage !== 'undefined') ? localStorage : null; }

  function validate(s) {
    const C = typeof module !== 'undefined' && module.exports
      ? require('./content.js') : globalThis.EvilGeniusV2Content;
    const fail = () => { throw new Error('Incomplete or invalid save. Your current game was kept.'); };
    const object = x => x && typeof x === 'object' && !Array.isArray(x);
    const number = x => typeof x === 'number' && Number.isFinite(x);
    const strings = x => Array.isArray(x) && x.every(v => typeof v === 'string');
    const ids = (xs, definitions) => strings(xs) && xs.every(id => Object.hasOwn(definitions, id));
    if (!object(s)) fail();
    for (const key of ['seed', 'playerId', 'runId', 'outcome']) if (typeof s[key] !== 'string' || !s[key]) fail();
    for (const key of ['day','cp','money','heat','infamy','morale','research','bankruptcyCounter','quietDays']) if (!number(s[key])) fail();
    if (!Number.isInteger(s.day) || s.day < 1 || !Number.isInteger(s.cp) || s.cp < 0 || s.cp > 2) fail();
    if (!['running','victory','partial_victory','defeat_heat','defeat_bankrupt','defeat_abandoned'].includes(s.outcome)) fail();
    if (!object(s.henchmen) || !object(s.relationships) || !object(s.missions) || !object(s.debuffs)) fail();
    for (const id of C.HENCH_IDS) {
      const h = s.henchmen[id];
      if (!object(h) || !['competence','stress','loyalty'].every(k => number(h[k]))) fail();
    }
    if (!number(s.henchmen.boris.rage) || typeof s.henchmen.chaos.upkeepPaid !== 'boolean') fail();
    if (!Object.values(s.relationships).every(number)) fail();
    for (const key of ['equipment','equipmentBroken','equipmentUnlocked']) if (!ids(s[key], C.EQUIPMENT_BY_ID)) fail();
    if (!ids(s.buildings, C.BUILDINGS_BY_ID) || !strings(s.log) || !ids(s.recentCrises, C.CRISES_BY_ID)) fail();
    if (!Array.isArray(s.buildQueue) || !s.buildQueue.every(q => object(q) && Object.hasOwn(C.BUILDINGS_BY_ID,q.id) && number(q.daysLeft))) fail();
    if (!Array.isArray(s.crises) || !s.crises.every(c => object(c) && Object.hasOwn(C.CRISES_BY_ID,c.id) && number(c.appearedDay))) fail();
    if (!Array.isArray(s.pendingChains) || !s.pendingChains.every(p => object(p) && Object.hasOwn(C.CRISES_BY_ID,p.child) && number(p.dueDay))) fail();
    if (s.campaign && (!object(s.campaign) || s.campaign.version !== 1 || !Number.isInteger(s.campaign.lastOperationDay) || s.campaign.lastOperationDay < 0 || s.campaign.lastOperationDay > s.day)) fail();
    if (s.campaign?.researchCompleted != null && typeof s.campaign.researchCompleted !== 'boolean') fail();
    for (const id of (s.campaign ? ['moon','prep','funding','satellite','prototype'] : ['moon','prep'])) {
      const m = s.missions[id];
      if (!object(m) || !['idle','scout','approach','breach','escape','done'].includes(m.stage)
          || !['pending','in_progress','success','partial','aborted','failed','failed_escape'].includes(m.status)
          || !ids(m.assigned,C.HENCHMEN_BY_ID) || !ids(m.loadout,C.EQUIPMENT_BY_ID)
          || !object(m.carriedBonuses) || !object(m.attemptCounters) || !number(m.relaunchCount)
          || !Array.isArray(m.stageResults) || !m.stageResults.every(r => object(r) && typeof r.pass === 'boolean' && typeof r.stage === 'string')) fail();
      if (!['idle','done'].includes(m.stage) && !m.assigned.length) fail();
    }
    for (const key of ['chaos_debuff_days','lab_offline_days','chaos_offline_days','next_dc','unpaid_upkeep_streak','moon_intel_days']) if (!number(s.debuffs[key])) fail();
    return s;
  }

  function normalize(s) {
    // Forward-fill repair-phase fields for pre-repair v02 saves.
    s.missions = s.missions || {};
    if (!s.missions.prep) {
      s.missions.prep = { stage:'idle', status:'pending', assigned:[], loadout:[],
        stageResults:[], carriedBonuses:{}, attemptCounters:{}, relaunchCount:0 };
    }
    for (const m of Object.values(s.missions)) {
      if (m.relaunchCount == null) m.relaunchCount = 0;
      if (!m.attemptCounters) m.attemptCounters = {};
      if (!m.carriedBonuses) m.carriedBonuses = {};
      if (!m.stageResults) m.stageResults = [];
    }
    if (s.campaign && Array.isArray(s.missions.prototype?.stageResults) && s.missions.prototype.stageResults.some(r => r?.stage === 'breach' && r.pass)) s.missions.prototype.carriedBonuses.prototypeTested = true;
    s.debuffs = s.debuffs || {};
    if (s.debuffs.unpaid_upkeep_streak == null) s.debuffs.unpaid_upkeep_streak = 0;
    if (s.debuffs.moon_intel_days == null) s.debuffs.moon_intel_days = 0;
    if (s.debuffs.moon_intel_source == null) s.debuffs.moon_intel_source = null;
    if (s.quietDays == null) s.quietDays = 0;
    if (!Array.isArray(s.recentCrises)) s.recentCrises = [];
    return s;
  }

  function load() {
    const ls = _ls();
    if (!ls) return null;
    const raw = ls.getItem(KEY);
    if (!raw) return null;
    try {
      const s = JSON.parse(raw);
      if (!s || s.schema !== 'v02') return null;
      return validate(normalize(s));
    } catch { return null; }
  }

  function save(state) {
    const ls = _ls();
    if (!ls || !state) return;
    ls.setItem(KEY, JSON.stringify(state));
    if (state.playerId) ls.setItem(PLAYER_KEY, state.playerId);
  }

  function exportJSON(state) { return JSON.stringify(state); }

  function importJSON(blob) {
    const s = JSON.parse(blob);
    if (!s || s.schema !== 'v02')
      throw new Error('Save schema mismatch: expected v02, got ' + (s && s.schema));
    return validate(normalize(s));
  }

  function reset(playerId) {
    const ls = _ls();
    if (ls) {
      ls.removeItem(KEY);
      if (playerId) ls.setItem(PLAYER_KEY, playerId);
    }
  }

  function readPlayerId() {
    const ls = _ls();
    return ls ? ls.getItem(PLAYER_KEY) : null;
  }

  return { KEY, PLAYER_KEY, load, save, exportJSON, importJSON, reset, readPlayerId };
});
