// HQ view render: stats, henchmen, crises, build queue, missions, log.
(function(root){
  const U = root.EvilGeniusV2UI;
  const C = root.EvilGeniusV2Content;
  const E = root.EvilGeniusV2Engine;

  function render(state, bus) {
    const esc = U.esc;
    // Resources
    U.$('stats').innerHTML = [
      ['💰 WAR CHEST', '$' + state.money, 'Bank balance'],
      ['⚠ HEAT', state.heat + '%', 'Investigation level'],
      ['☠ INFAMY', state.infamy, 'Win needs ≥25'],
      ['💙 MORALE', state.morale + '%', 'Crew wellbeing'],
      ['🧪 RESEARCH', state.research, 'RP banked'],
      ['◆ COMMAND POINTS', state.cp + '/2', 'Spend to build / research / resolve'],
    ].map(([a,b,c]) => `<div class="stat"><label>${a}</label><strong>${esc(b)}</strong><small>${esc(c)}</small></div>`).join('');

    // Day banner
    U.$('dayBanner').innerHTML = `<div class="eyebrow">DAY ${state.day}</div>
      <h2>${headlineFor(state)}</h2>
      <p class="sub">${subFor(state)}</p>`;

    // Henchmen cards
    U.$('crewCards').innerHTML = C.HENCHMEN.map(def => {
      const h = state.henchmen[def.id];
      const stressVal = def.stressImmune ? (h.rage||0) : h.stress;
      const stressLbl = def.stressImmune ? 'rage' : 'stress';
      return `<article class="card">
        <img class="crew-portrait" src="/art/${def.id}.webp" alt="${esc(def.name)} portrait" width="384" height="384" loading="lazy">
        <strong>${esc(def.name)}</strong>
        <div class="pill">${esc(def.skill)} · comp ${h.competence}</div>
        <p>${esc(def.bio)}</p>
        <div class="mini">LOYALTY ${h.loyalty}%</div>
        <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${h.loyalty}" aria-valuetext="loyalty ${h.loyalty}%"><div style="width:${h.loyalty}%"></div></div>
        <div class="mini">${stressLbl.toUpperCase()} ${stressVal}%</div>
        <div class="bar bar-stress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${stressVal}" aria-valuetext="${stressLbl} ${stressVal}%"><div style="width:${stressVal}%"></div></div>
        <button class="secondary small" data-dayoff="${def.id}" ${(state.cp<1 || stressVal<=0)?'disabled':''} title="${stressVal<=0?'No stress or rage to reduce.':'Reduce '+stressLbl+' by 30 for 1 CP.'}">Day off (1 CP)</button>
      </article>`;
    }).join('');

    // Crisis cards
    U.$('crisisArea').innerHTML = state.crises.length ? state.crises.map(c => {
      const def = C.CRISES_BY_ID[c.id];
      return `<article class="crisis-card">
        <div class="crisis-identity"><img class="crisis-icon" src="/art/${U.crisisArt(c.id)}.webp" alt="" width="48" height="48"><div class="crisis-head">⚠ ${esc(def.title)}</div></div>
        <button class="action small" data-crisis="${c.id}">Resolve…</button>
      </article>`;
    }).join('') : `<p class="sub">${state.quietDays >= 2 ? 'The lull is over. Expect trouble at dawn.' : 'No active crises. Use the breathing room.'}</p>`;

    // Persistent lair status: owned buildings, queue, equipment, and daily cash flow.
    const ownedNames = state.buildings.map(id => C.BUILDINGS_BY_ID[id]?.name || id);
    const queueLines = state.buildQueue.map(q => `${C.BUILDINGS_BY_ID[q.id]?.name || q.id} (${q.daysLeft}d)`);
    const equipmentNames = state.equipment.map(id => `${C.EQUIPMENT_BY_ID[id]?.name || id}${state.equipmentBroken.includes(id) ? ' [BROKEN]' : ''}`);
    const upkeep = state.buildings.includes('server_room') ? 0 : E.constants.CHAOS_UPKEEP;
    const dailyIncome = C.HENCHMEN_BY_ID.kevin.dailyIncome || 0;
    const dailyNet = dailyIncome - upkeep;
    U.$('lairStatus').innerHTML = `
      <article class="card build-card"><div class="lair-status-heading"><strong>Cash flow</strong><img src="/art/status-cashflow.webp" alt="" width="48" height="48" loading="lazy"></div><div class="pill">+$${dailyIncome} income · -$${upkeep} upkeep · net ${dailyNet>=0?'+$':'-$'}${Math.abs(dailyNet)}/day</div><p>${state.buildings.includes('server_room')?'Server Room covers CHAOS.':'Miss upkeep twice in a row and the operation collapses.'}</p></article>
      <article class="card build-card"><div class="lair-status-heading"><strong>Owned buildings</strong><img src="/art/status-buildings.webp" alt="" width="48" height="48" loading="lazy"></div><p>${ownedNames.length ? esc(ownedNames.join(' · ')) : 'None yet.'}</p></article>
      <article class="card build-card"><div class="lair-status-heading"><strong>Build queue</strong><img src="/art/status-queue.webp" alt="" width="48" height="48" loading="lazy"></div><p>${queueLines.length ? esc(queueLines.join(' · ')) : 'Empty.'}</p></article>
      <article class="card build-card"><div class="lair-status-heading"><strong>Equipment</strong></div><ul class="inventory-list">${state.equipment.map(id => `<li><img src="/art/gear-${id}.webp" alt="" width="32" height="32" loading="lazy"><span>${esc(C.EQUIPMENT_BY_ID[id]?.name || id)}${state.equipmentBroken.includes(id) ? ' [BROKEN]' : ''}</span></li>`).join('')}</ul></article>`;

    // Buildings + build queue
    const built = new Set(state.buildings);
    const queued = new Set(state.buildQueue.map(b=>b.id));
    U.$('buildArea').innerHTML = C.BUILDINGS.map(b => {
      const state1 = built.has(b.id) ? 'BUILT' : queued.has(b.id) ? `QUEUED (${state.buildQueue.find(q=>q.id===b.id).daysLeft}d left)` : '';
      const canBuild = !built.has(b.id) && !queued.has(b.id) && state.cp >= b.cp && state.money >= b.cost;
      return `<article class="card build-card">
        <img class="building-art" src="/art/building-${b.id}.webp" alt="${esc(b.name)} illustration" width="320" height="320" loading="lazy"><strong>${esc(b.name)}</strong>
        <div class="pill">$${b.cost} · ${b.cp} CP · ${b.days}d</div>
        <p>${esc(b.effect)}</p>
        ${state1 ? `<div class="mini">${state1}</div>` :
          `<button class="action small" data-build="${b.id}" ${canBuild?'':'disabled'}>Build</button>`}
      </article>`;
    }).join('');

    // Research
    U.$('researchArea').innerHTML = C.EQUIPMENT.filter(e => e.unlockRP).map(e => {
      const owned = state.equipment.includes(e.id);
      const blocked = e.requiresBuilding && !state.buildings.includes(e.requiresBuilding);
      const canR = !owned && !blocked && state.cp >= 1 && state.research >= e.unlockRP;
      return `<article class="card build-card">
        <img class="gear-card-icon" src="/art/gear-${e.id}.webp" alt="" width="64" height="64" loading="lazy"><strong>${esc(e.name)}</strong>
        <div class="pill">${e.unlockRP} RP · 1 CP${blocked?' · needs '+e.requiresBuilding:''}</div>
        <p>${esc(e.special || '')}</p>
        ${owned?'<div class="mini">OWNED</div>':`<button class="action small" data-research="${e.id}" ${canR?'':'disabled'}>Research</button>`}
      </article>`;
    }).join('');

    // Equipment broken list
    const brokenHtml = state.equipmentBroken.length ? state.equipmentBroken.map(e=>{
      const canFix = state.buildings.includes('lab') && state.cp>=1 && state.money>=75;
      return `<li>${esc(C.EQUIPMENT_BY_ID[e].name) || e} <button class="secondary small" data-repair="${e}" ${canFix?'':'disabled'}>Repair ($75, 1 CP)</button></li>`;
    }).join('') : '<li class="sub">Nothing broken. For now.</li>';
    U.$('brokenArea').innerHTML = `<ul class="broken-list">${brokenHtml}</ul>`;

    const campaignPanel = U.$('campaignPanel');
    if (campaignPanel) {
      campaignPanel.hidden = !state.campaign;
      if (state.campaign) {
        const goals = [['funding','Raid Rival Payroll'],['satellite','Hijack the Uplink'],['prototype','Field-test the Shrink Ray']];
        campaignPanel.innerHTML = `<h3>Your road to the Moon</h3><p>Secure the payroll and satellite, successfully test the shrink ray, build the Server Room and Laboratory, and research gear. One launch per day, including retries. Use the remaining time to manage the crew.</p><ol>${goals.map(([id,name]) => `<li>${(state.missions[id]?.status === 'success' || (id === 'prototype' && state.missions[id]?.carriedBonuses?.prototypeTested)) ? '✓' : '○'} ${esc(name)}</li>`).join('')}<li>${(state.campaign.researchCompleted || state.equipmentUnlocked.length) ? '✓' : '○'} Research equipment</li><li>Finale: Steal the Moon ($150 + 2 CP)</li></ol><button class="secondary small" data-laylow ${state.cp < 1 || state.money < 25 || state.heat <= 8 ? 'disabled' : ''}>Lay low: -15 Heat ($25, 1 CP)</button>`;
        campaignPanel.querySelector('[data-laylow]').onclick = () => bus.emit('action', {kind:'laylow'});
      }
    }

    // Mission panel — every unlocked mission tracks its own stage.
    U.$('missionArea').innerHTML = C.MISSIONS.map(m => {
      if (!m.unlocked || (m.campaignOnly && !state.campaign)) return '';
      const ms = state.missions[m.id];
      const inProgress = ms.stage !== 'idle' && ms.stage !== 'done';
      let btn = (ms.status === 'success' && m.id === 'prep') ? '<div class="mini verdict good">INTEL ACQUIRED</div><button class="action" data-launch="prep">Run again</button>' :
                  ms.status === 'success' ? '<div class="mini verdict good">COMPLETE</div>' :
                  ms.status === 'aborted' ? `<div class="mini verdict bad">FORFEITED — try again?</div><button class="action" data-launch="${m.id}">Launch again</button>` :
                  ms.status === 'failed' || ms.status === 'failed_escape' ? `<div class="mini verdict bad">FAILED — try again?</div><button class="action" data-launch="${m.id}">Launch again</button>` :
                  inProgress ? `<button class="action" data-resume="${m.id}">Resume (${ms.stage})</button>` :
                  `<button class="action" data-launch="${m.id}">Launch Operation ↗</button>`;
      const availability = E.missionAvailability(state, m.id);
      if (state.campaign && !inProgress && ms.status !== 'success' && !availability.ok) btn = `<p class="mission-lock">${esc(availability.reason)}</p><button class="secondary" disabled>Not ready yet</button>`;
      if (state.campaign && m.id === 'prep' && !inProgress && !availability.ok) btn = `<p class="mission-lock">${esc(availability.reason)}</p><button class="secondary" disabled>Not ready yet</button>`;
      if (state.campaign && m.id === 'prototype' && ms.carriedBonuses?.prototypeTested) btn = '<div class="mini verdict good">SHRINK RAY TESTED · MOON MILESTONE SECURED</div>' + (inProgress ? btn : '<p>Preparation secured. Escape determines how much loot you bring home.</p>');
      // Side-op intel pill on the Moon card.
      const intelPill = (m.id === 'moon' && state.debuffs?.moon_intel_days > 0)
        ? `<div class="pill good">Side-op intel: ${state.debuffs.moon_intel_source} +15 (${state.debuffs.moon_intel_days}d)</div>` : '';
      return `<article class="card"><img class="mission-art ${m.campaignOnly ? 'contract-art' : ''}" src="/art/${m.art || m.id}.webp" alt="${esc(m.name)} illustration" width="768" height="512" loading="lazy"><h3>${esc(m.name)}</h3>
        <div class="pill">reward $${m.reward} · +${m.heat}% heat</div>${intelPill}
        <p>${esc(state.campaign && m.id === 'moon' ? 'The finale. Spend $150 and 2 CP to attempt the lunar heist. Your uplink and tested shrink ray improve the odds.' : m.desc)}</p>${btn}</article>`;
    }).join('');

    // End-day button
    const endBtn = U.$('endDayBtn');
    if (endBtn) {
      endBtn.disabled = state.outcome !== 'running' || (state.campaign && Object.values(state.missions).some(m => !['idle','done'].includes(m.stage)));
      endBtn.textContent = state.outcome === 'running' ? `End day ${state.day} →` : state.outcome.replace(/_/g,' ').toUpperCase();
    }

    // Log
    U.$('recent').innerHTML = state.log.slice(0, 6).map(x => `<div>${esc(x)}</div>`).join('');
    const full = U.$('fullLog');
    if (full) full.innerHTML = state.log.map(x => `<div>${esc(x)}</div>`).join('');

    // Victory/defeat overlay
    if (state.outcome !== 'running') {
      renderEndscreen(state, bus);
    }

    // Wire buttons
    document.querySelectorAll('[data-launch]').forEach(b => b.onclick = () => bus.emit('mission:launch', { missionId: b.dataset.launch }));
    document.querySelectorAll('[data-resume]').forEach(b => b.onclick = () => bus.emit('mission:resume', { missionId: b.dataset.resume }));
    document.querySelectorAll('[data-build]').forEach(b => b.onclick = () => bus.emit('action', { kind:'build', building: b.dataset.build }));
    document.querySelectorAll('[data-research]').forEach(b => b.onclick = () => bus.emit('action', { kind:'research', equipment: b.dataset.research }));
    document.querySelectorAll('[data-repair]').forEach(b => b.onclick = () => bus.emit('action', { kind:'repair', equipment: b.dataset.repair }));
    document.querySelectorAll('[data-dayoff]').forEach(b => b.onclick = () => bus.emit('action', { kind:'dayoff', henchman: b.dataset.dayoff }));
    document.querySelectorAll('[data-crisis]').forEach(b => b.onclick = () => bus.emit('crisis:open', { crisisId: b.dataset.crisis }));
  }

  function headlineFor(state) {
    if (state.outcome === 'victory') return '🏆 WORLD DOMINATION ACHIEVED';
    if (state.outcome === 'partial_victory') return '🥈 PARTIAL VICTORY';
    if (state.outcome.startsWith('defeat')) return '💀 DEFEAT';
    return 'Your Evil Headquarters';
  }
  function subFor(state) {
    if (state.outcome !== 'running') return 'Export your save blob below to share this seed. New Game resets.';
    const active = Object.entries(state.missions).find(([,m]) => m.stage !== 'idle' && m.stage !== 'done');
    if (active) return `${C.MISSIONS_BY_ID[active[0]]?.name || active[0]} in progress — stage: ${active[1].stage.toUpperCase()}.`;
    return `Day ${state.day}. ${state.cp} Command Points available.${state.campaign ? ' Build your road to the Moon.' : ' Legacy short run preserved. New Game starts the full campaign.'}`;
  }

  function renderEndscreen(state, bus) {
    const host = U.$('endscreen');
    if (!host) return;
    const blob = root.EvilGeniusV2Save.exportJSON(state);
    host.innerHTML = `<div class="endscreen-inner">
      <h2>${headlineFor(state)}</h2>
      <p>Seed: <code>${U.esc(state.seed)}</code></p>
      <p>Day ${state.day} · Infamy ${state.infamy} · Heat ${state.heat} · Money $${state.money}</p>
      <textarea readonly rows="4" aria-label="save blob">${U.esc(blob)}</textarea>
      <div class="controls">
        <button class="action" id="newGameBtn">New Game</button>
      </div>
    </div>`;
    host.style.display = 'block';
    U.$('newGameBtn').onclick = () => bus.emit('new-game');
  }

  root.EvilGeniusV2UIHQ = { render };
})(typeof window !== 'undefined' ? window : globalThis);
