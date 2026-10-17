// Static content: henchmen, equipment, buildings, missions, crises, DCs.
// Single source of truth per V2_INTERFACE_CONTRACT.md.
(function(root, factory){
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.EvilGeniusV2Content = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){

  // --- Henchmen ---
  const HENCHMEN = [
    { id:'mal',   name:'Dr. Malpractice',     icon:'🧪', skill:'science',   trait:'mad_scientist',
      traitBonus:1.4, traitPenalty:{ off:0.6 }, bio:'Has nine PhDs. Eight are suspicious.',
      startCompetence:7, startLoyalty:66 },
    { id:'boris', name:'Boris the Brute',     icon:'💪', skill:'force',     trait:'blunt_instrument',
      traitBonus:1.4, traitPenalty:{ deception:0.6 }, bio:'Believes every problem can be punched.',
      startCompetence:8, startLoyalty:83, stressImmune:true },
    { id:'chaos', name:'CHAOS-9000',          icon:'🤖', skill:'deception', trait:'logical_fault',
      traitBonus:1.4, upkeep:35, bio:'Can hack minds. Cannot use a printer.',
      startCompetence:7, startLoyalty:52 },
    { id:'kevin', name:'Kevin from Accounting', icon:'📊', skill:'finance',  trait:'spreadsheet_zealot',
      traitBonus:1.4, dailyIncome:30, bio:'Expense reports are his weapon.',
      startCompetence:6, startLoyalty:94 },
  ];
  const HENCH_IDS = HENCHMEN.map(h=>h.id);
  const SKILLS = ['science','force','deception','finance'];

  // --- Equipment ---
  const EQUIPMENT = [
    { id:'tractor',    name:'Tractor Prototype',   synergy:'science',   bonus:22, heatOnUse:10, startOwned:true },
    { id:'hammer',     name:"Boris's Big Hammer",  synergy:'force',     bonus:22, infamyOnSuccess:3, startOwned:true },
    { id:'deepfake',   name:'Deepfake Rig',        synergy:'deception', bonus:22, moraleOnUse:-5, startOwned:true },
    { id:'ledger',     name:'Shell Company Ledger',synergy:'finance',   bonus:22, heatOnSuccess:-3, startOwned:true },
    { id:'smokescreen',name:'Smoke Grenade',       bonus:0, unlockRP:3, special:'50% safe bailout on a failed stage ($100)' },
    { id:'rabbit',     name:"Lucky Rabbit's Foot", bonus:0, unlockRP:2, special:'Rerolls the first failed stage; 20% break chance', breakChance:0.2 },
    { id:'emp',        name:'EMP Pulse',           bonus:0, unlockRP:4, requiresBuilding:'server_room', special:'Cancels and is consumed by the next crisis' },
    { id:'aid',        name:'First Aid Kit',       bonus:0, unlockRP:2, special:'Assigned crew recover 20 stress/rage when mission ends' },
  ];

  // --- Buildings ---
  const BUILDINGS = [
    { id:'server_room', name:'Server Room',    cost:250, cp:1, days:1, effect:'+2 RP/day, covers CHAOS $35/day upkeep, enables EMP' },
    { id:'rec_room',    name:'Rec Room',       cost:150, cp:1, days:1, effect:'-5 stress/day to all henchmen' },
    { id:'vault',       name:'Vault',          cost:300, cp:2, days:2, effect:'Theft crisis fails harmlessly, -3 heat/day' },
    { id:'lab',         name:'Laboratory',     cost:200, cp:1, days:2, effect:'+1 RP/day, repair gear, Mal +25% competence (all stages while Lab online)' },
    { id:'hr_desk',     name:'HR Desk',        cost:100, cp:1, days:1, effect:'Dolores auto-handles Kevin complaints' },
  ];

  // --- Missions ---
  const MISSIONS = [
    { id:'funding', name:'Raid Rival Payroll', icon:'💼', reward:200, heat:5, unlocked:true, campaignOnly:true,
      art:'gear-ledger', difficulty:-10, favoredSkills:['finance','deception'], launchCp:1, launchCost:40,
      stages:['scout','approach','breach','escape'], minHenchmen:2, maxHenchmen:3, maxEquipment:2,
      desc:'Steal a rival villain’s payroll. Finance or deception gets +10. Earn cash to expand your lair. Costs $40 + 1 CP.' },
    { id:'satellite', name:'Hijack the Uplink', icon:'📡', reward:220, heat:7, unlocked:true, campaignOnly:true,
      art:'building-server_room', difficulty:0, favoredSkills:['science','deception'], launchCp:1, launchCost:60,
      stages:['scout','approach','breach','escape'], minHenchmen:2, maxHenchmen:3, maxEquipment:2,
      desc:'Borrow a weather satellite. Permanently gives Moon stages +5. Science or deception gets +10. Costs $60 + 1 CP.' },
    { id:'prototype', name:'Field-test the Shrink Ray', icon:'🧪', reward:260, heat:9, unlocked:true, campaignOnly:true,
      art:'gear-tractor', difficulty:5, favoredSkills:['science','force'], launchCp:1, launchCost:80,
      stages:['scout','approach','breach','escape'], minHenchmen:2, maxHenchmen:3, maxEquipment:2,
      desc:'Test the invention on a rival’s warehouse. A successful Breach secures the Moon milestone (+5 Breach), even if escape fails. Science or force gets +10. Costs $80 + 1 CP.' },
    { id:'moon',    name:'Steal the Moon',    icon:'🌕', reward:380, heat:18, unlocked:true,
      stages:['scout','approach','breach','escape'], minHenchmen:2, maxHenchmen:4, maxEquipment:2,
      desc:'A modest first step. One small theft for a villain, one enormous insurance claim for mankind.' },
    { id:'prep',    name:'Prep Op: Lunar Recon', icon:'🎯', reward:120, heat:5, unlocked:true,
      stages:['scout','breach'], minHenchmen:1, maxHenchmen:2, maxEquipment:1, launchCp:1, launchCost:60,
      desc:'A quick 2-stage side op. Costs 1 CP + $60. Pick surveillance / bribery / sabotage — Moon gets +15 to the matching stage for 3 days.' },
    { id:'mondays', name:'Outlaw Mondays',    icon:'📅', reward:280, heat:12, unlocked:false,
      desc:'[COMING SOON] Eliminate the most universally disliked day.' },
    { id:'coffee',  name:'Control All Coffee',icon:'☕', reward:320, heat:15, unlocked:false,
      desc:'[COMING SOON] Own the bean. Control the world.' },
  ];

  // --- Routes for Approach ---
  const ROUTES = [
    { id:'rooftop', name:'Rooftop',     skill:'force',     desc:'Fast, loud, requires muscle.' },
    { id:'sewer',   name:'Sewer',       skill:'deception', desc:'Slow, concealed, slows Escape.' },
    { id:'front',   name:'Front Door',  skill:'finance',   desc:'Bribe your way through security.' },
    { id:'lab',     name:'Lab Infiltration', skill:'science', desc:'Tech bypass. Elegant.' },
  ];

  // --- Stage DCs ---
  // These are intentionally generous. Risk display always goes through riskBucket.
  const STAGE_DCS = {
    scout:    { base:60, heatPer10:1 },
    approach: { base:75, heatPer10:2 },
    breach:   { base:80, heatPer10:2 },
    escape:   { fast:60, clever:60, loud:70, heatPer10:1 },
  };

  // --- Crisis definitions ---
  // Trigger evaluated at dawn; see crises.js. "weight" biases weighted pick when
  // multiple crises are eligible on same day.
  const CRISES = [
    { id:'C1_boris_punched',   title:'Boris Punched Something',
      trigger: s => (s.henchmen.boris?.rage ?? 0) >= 50, weight:3,
      chain:{ child:'C7_union', delay:1 },
      options:[ { id:'pay', label:'Pay repair $75', effect:{ money:-75 } },
                { id:'ignore', label:'Ignore (-5 morale)', effect:{ morale:-5 } } ] },
    { id:'C2_chaos_rollback',  title:'CHAOS Firmware Rollback',
      trigger: s => !(s.henchmen.chaos?.upkeepPaid), weight:2,
      options:[ { id:'patch', label:'Patch (1 CP)', effect:{ cp:-1 } },
                { id:'delay', label:'Delay (-2 chaos competence 2 days)', effect:{ chaos_debuff:2 } } ] },
    { id:'C3_audit_letter',    title:"Kevin's Audit Letter",
      trigger: s => s.heat >= 40, weight:2,
      options:[ { id:'finance', label:'Spend finance CP (1 CP, -5 heat)', effect:{ cp:-1, heat:-5 } },
                { id:'ignore',  label:'Ignore (-$100)', effect:{ money:-100 } } ] },
    { id:'C4_mal_explodes',    title:"Mal's Experiment Explodes",
      trigger: s => (s.henchmen.mal?.stress ?? 0) >= 60, weight:2,
      chain:{ child:'C11_server_melt', delay:1 },
      options:[ { id:'rebuild', label:'Rebuild Lab ($100)', effect:{ money:-100 } },
                { id:'offline', label:'Lose Lab 3 days', effect:{ lab_offline:3 } } ] },
    { id:'C5_hr_meeting',      title:'Mandatory HR Meeting',
      trigger: s => s.heat >= 70, weight:3,
      options:[ { id:'attend', label:'Attend (1 CP, -10 heat)', effect:{ cp:-1, heat:-10 } },
                { id:'skip',   label:'Skip (henchman quits risk)', effect:{ loyalty:-10 } } ] },
    { id:'C6_journalist',      title:'Journalist Snooping',
      trigger: s => s.heat >= 50, weight:3,
      chain:{ child:'C5_hr_meeting', delay:1 },
      options:[ { id:'bribe',    label:'Bribe $100 (-10 heat)', effect:{ money:-100, heat:-10 } },
                { id:'ignore',   label:'Ignore (+15 heat)', effect:{ heat:15 } },
                { id:'deepfake', label:'Deepfake (deception roll)', effect:{ deception_roll:true } } ] },
    { id:'C7_union',           title:'Henchman Union Grievance',
      trigger: s => s.morale <= 40, weight:2,
      options:[ { id:'resolve', label:'Resolve 1 CP', effect:{ cp:-1, morale:10 } },
                { id:'ignore',  label:'Lose 1 henchman-day', effect:{ henchday_lost:1 } } ] },
    { id:'C8_rival_taunt',     title:'Rival Villain Taunt',
      trigger: s => s.day >= 4 && (s.missions.moon?.status === 'pending' || !s.missions.moon),
      weight:1,
      options:[ { id:'respond', label:'Respond (next mission +5 DC)', effect:{ next_dc:5 } },
                { id:'ignore',  label:'Ignore (-5 infamy)', effect:{ infamy:-5 } } ] },
    { id:'C9_equip_theft',     title:'Equipment Theft',
      trigger: s => s.heat >= 60 && !s.buildings.includes('vault'), weight:2,
      chain:{ child:'C3_audit_letter', delay:2 },
      options:[ { id:'lose',    label:'Lose 1 equipment', effect:{ steal_equipment:true } },
                { id:'recover', label:'Spend $150 to recover', effect:{ money:-150 } } ] },
    { id:'C10_celebrity',      title:'Celebrity Visits Lair',
      trigger: s => s.infamy >= 20, weight:1,
      options:[ { id:'welcome', label:'Welcome (+5 infamy, +10 heat)', effect:{ infamy:5, heat:10 } },
                { id:'expel',   label:'Expel (-5 morale)',             effect:{ morale:-5 } } ] },
    { id:'C11_server_melt',    title:'Server Melt',
      trigger: s => s.buildings.includes('server_room') && (s.henchmen.chaos?.stress ?? 0) >= 40,
      weight:2,
      options:[ { id:'reboot',  label:'Reboot (CHAOS offline 1 day)', effect:{ chaos_offline:1 } },
                { id:'replace', label:'Replace $200', effect:{ money:-200 } } ] },
    { id:'C12_media_love',     title:'Media Love Letter',
      trigger: s => (s.henchmen && Object.values(s.missions || {}).some(m => m.status === 'success')),
      weight:1,
      options:[ { id:'accept',  label:'Accept (+5 morale, +8 infamy)', effect:{ morale:5, infamy:8 } },
                { id:'deflect', label:'Deflect (-3 infamy, +loyalty)', effect:{ infamy:-3, loyalty:5 } } ] },
    // --- Low-heat / low-infamy filler crises (added in repair phase to close B4 dead-air gap).
    { id:'C13_dolores_gossip', title:'Dolores Overheard Something',
      trigger: s => s.day >= 2 && s.heat < 50 && s.morale >= 40 && s.morale < 75,
      weight:2,
      options:[ { id:'listen', label:'Listen (1 CP, +5 morale)', effect:{ cp:-1, morale:5 } },
                { id:'ignore', label:'Ignore (-5 morale)',       effect:{ morale:-5 } } ] },
    { id:'C14_equip_rust',     title:'Rust in the Equipment Lockers',
      trigger: s => s.day >= 3 && s.equipment.length >= 3 && !s.buildings.includes('lab'),
      weight:1,
      options:[ { id:'oil',    label:'Oil everything ($50)', effect:{ money:-50 } },
                { id:'ignore', label:'Ignore (one piece breaks)', effect:{ break_equipment:true } } ] },
    { id:'C15_boris_bored',    title:'Boris is Bored',
      trigger: s => s.day >= 2 && (s.henchmen.boris?.rage || 0) < 20 && s.heat < 60
                   && !Object.values(s.missions || {}).some(m => m.stage !== 'idle' && m.stage !== 'done'),
      weight:2,
      options:[ { id:'spar',  label:'Let him spar (+10 rage, -5 stress team)', effect:{ boris_rage:10, team_destress:5 } },
                { id:'book',  label:'Buy him a book ($40, -10 rage)',          effect:{ money:-40, boris_rage:-10 } } ] },
    { id:'C16_kevin_pitch',    title:"Kevin Pitches a Cost-Cutting Memo",
      trigger: s => s.day >= 2 && s.money < 400 && s.heat < 50,
      weight:2,
      options:[ { id:'adopt',  label:'Adopt plan (+$80, -5 morale)', effect:{ money:80, morale:-5 } },
                { id:'shred',  label:'Shred it (+5 morale)',         effect:{ morale:5 } } ] },
  ];

  // --- Starting relationships (pairwise, −2..+2) ---
  const START_RELATIONSHIPS = {
    'mal:boris': -1, 'mal:chaos': 2, 'mal:kevin': 0,
    'boris:chaos': -2, 'boris:kevin': 1, 'chaos:kevin': 0,
  };

  // --- Lookups ---
  const byId = arr => Object.fromEntries(arr.map(x => [x.id, x]));
  const HENCHMEN_BY_ID = byId(HENCHMEN);
  const EQUIPMENT_BY_ID = byId(EQUIPMENT);
  const BUILDINGS_BY_ID = byId(BUILDINGS);
  const MISSIONS_BY_ID = byId(MISSIONS);
  const ROUTES_BY_ID = byId(ROUTES);
  const CRISES_BY_ID = byId(CRISES);

  return {
    HENCHMEN, HENCH_IDS, SKILLS,
    EQUIPMENT, BUILDINGS, MISSIONS, ROUTES, CRISES,
    START_RELATIONSHIPS, STAGE_DCS,
    HENCHMEN_BY_ID, EQUIPMENT_BY_ID, BUILDINGS_BY_ID, MISSIONS_BY_ID, ROUTES_BY_ID, CRISES_BY_ID,
  };
});
