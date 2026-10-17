// 4-stage mission dialog. State is driven by a {missionId, stage, loadout} machine.
(function(root){
  const U = root.EvilGeniusV2UI;
  const C = root.EvilGeniusV2Content;
  const E = root.EvilGeniusV2Engine;

  function headerFor(state, missionId, stage) {
    const m = C.MISSIONS_BY_ID[missionId];
    return `<div class="eyebrow">MISSION // ${U.esc(m.name)} · ${stage.toUpperCase()}</div>`;
  }

  // Shared nav controls for mid-mission dialogs. All three buttons are reachable
  // via Tab/Shift-Tab in render order; Enter activates. "Back to HQ" is non-
  // destructive: HQ shows a Resume button that reopens this very dialog. Forfeit
  // is irreversible: it ends the mission but keeps all already-resolved stage
  // effects (Scout fail, heat, stress) — only future stages are skipped.
  function navControls({ backLabel = '← Back to HQ', forfeitLabel = 'Forfeit mission' } = {}) {
    return `
      <button type="button" class="secondary" id="navBack" title="Return to HQ. The mission stays in progress; use Resume to come back.">${backLabel}</button>
      <button type="button" class="danger" id="navForfeit" title="Abandon this mission. Prior stage results stay in the log.">${forfeitLabel}</button>`;
  }
  function wireNav(modal, host, missionId, bus) {
    const back = modal.querySelector('#navBack');
    if (back) back.onclick = () => { U.closeDialog(host); bus.emit('mission:closed'); };
    const forf = modal.querySelector('#navForfeit');
    if (forf) forf.onclick = () => {
      if (!window.confirm('Forfeit this mission? Prior stage results are kept; the mission ends in failure.')) return;
      bus.emit('mission:abort', { missionId });
    };
  }

  function openLoadout(state, missionId, bus) {
    const host = U.$('dialogHost');
    const mdef = C.MISSIONS_BY_ID[missionId];
    const minH = mdef.minHenchmen ?? 2;
    const maxH = mdef.maxHenchmen ?? 4;
    const maxE = mdef.maxEquipment ?? 2;
    const henchIds = C.HENCH_IDS;
    const equipOwned = state.equipment.filter(e => !state.equipmentBroken.includes(e));
    const selectedH = new Set();
    const selectedE = new Set();
    const render = () => {
      const html = `
        ${headerFor(state, missionId, 'loadout')}
        <h2 id="dlgTitle">🎯 Loadout for ${U.esc(mdef.name)}</h2>
        <p class="sub">Pick ${minH}-${maxH} henchmen and up to ${maxE} piece${maxE===1?'':'s'} of equipment. Select a card to add it; select it again to remove it. Match each henchman's skill with useful gear.</p>
        <div class="loadout-section">
          <div class="loadout-head">HENCHMEN (${selectedH.size}/${maxH} — need at least ${minH})</div>
          <div class="loadout-grid">
            ${henchIds.map(h => {
              const def = C.HENCHMEN_BY_ID[h], hs = state.henchmen[h];
              const sel = selectedH.has(h);
              const stressDisplay = def.stressImmune ? `rage ${hs.rage}` : `stress ${hs.stress}`;
              return `<button class="pick ${sel?'sel':''}" data-h="${h}" aria-pressed="${sel}">
                <img class="pick-portrait" src="/art/${def.id}.webp" alt="" width="64" height="64">
                <div class="pick-name">${U.esc(def.name)}</div>
                <div class="pick-meta">${def.skill} · comp ${hs.competence} · ${stressDisplay}</div>
              </button>`;
            }).join('')}
          </div>
        </div>
        <div class="loadout-section">
          <div class="loadout-head">EQUIPMENT (${selectedE.size}/${maxE})</div>
          <div class="loadout-grid">
            ${equipOwned.map(e => {
              const def = C.EQUIPMENT_BY_ID[e];
              const sel = selectedE.has(e);
              return `<button class="pick ${sel?'sel':''}" data-e="${e}" aria-pressed="${sel}">
                <img class="gear-pick-icon" src="/art/gear-${def.id}.webp" alt="" width="48" height="48"><div class="pick-name">${U.esc(def.name)}</div>
                <div class="pick-meta">${def.synergy ? '+'+def.bonus+' '+def.synergy : (def.special||'utility')}</div>
              </button>`;
            }).join('')}
          </div>
        </div>
        <div class="controls">
          <button class="secondary" id="dlgCancel">Cancel</button>
          <button type="button" class="action" id="dlgLaunch" ${selectedH.size<minH?'disabled':''}>Launch →</button>
        </div>`;
      const modal = U.openDialog(host, html);
      modal.querySelectorAll('[data-h]').forEach(b => b.onclick = () => {
        const h = b.dataset.h;
        if (selectedH.has(h)) selectedH.delete(h);
        else if (selectedH.size < maxH) selectedH.add(h);
        render();
      });
      modal.querySelectorAll('[data-e]').forEach(b => b.onclick = () => {
        const e = b.dataset.e;
        if (selectedE.has(e)) selectedE.delete(e);
        else if (selectedE.size < maxE) selectedE.add(e);
        render();
      });
      modal.querySelector('#dlgCancel').onclick = () => U.closeDialog(host);
      modal.querySelector('#dlgLaunch').onclick = () => {
        bus.emit('mission:start', { missionId,
          loadout: { henchmen: [...selectedH], equipment: [...selectedE] } });
      };
    };
    render();
  }

  function openScout(state, missionId, bus) {
    const m = state.missions[missionId];
    const host = U.$('dialogHost');
    let picked = { henchman: m.assigned[0], equipment: E.workingEquipment(state, m.loadout)[0] || null };
    const render = () => {
      const risk = E.describeStageRisk(state, missionId, 'scout',
        { henchmen:[picked.henchman], equipment: picked.equipment?[picked.equipment]:[],
          skill: C.HENCHMEN_BY_ID[picked.henchman]?.skill });
      const bar = U.riskBar(E.riskBarSegments(risk.probability), risk.bucket);
      const html = `
        ${headerFor(state, missionId, 'scout')}
        <h2 id="dlgTitle">👁 Stage 1 · Scout</h2>
        <p class="sub">Send one henchman to scout ${U.esc(C.MISSIONS_BY_ID[missionId].name)}. Pass → intel bonus into Approach and Breach. Fail → heat +15 and an Approach penalty.</p>
        <div class="loadout-head">PICK ONE</div>
        <div class="loadout-grid">${m.assigned.map(h => {
          const def = C.HENCHMEN_BY_ID[h];
          return `<button class="pick ${picked.henchman===h?'sel':''}" data-h="${h}">
            <img class="pick-portrait" src="/art/${def.id}.webp" alt="" width="64" height="64"><div class="pick-name">${U.esc(def.name)}</div>
            <div class="pick-meta">${def.skill}</div></button>`;
        }).join('')}</div>
        <div class="loadout-head">EQUIPMENT (optional)</div>
        <div class="loadout-grid">
          <button class="pick ${picked.equipment===null?'sel':''}" data-e="">None</button>
          ${E.workingEquipment(state, m.loadout).map(e => {
            const def = C.EQUIPMENT_BY_ID[e];
            return `<button class="pick ${picked.equipment===e?'sel':''}" data-e="${e}"><img class="gear-pick-icon" src="/art/gear-${e}.webp" alt="" width="48" height="48"><div class="pick-name">${U.esc(def.name)}</div></button>`;
          }).join('')}
        </div>
        <div class="risk-row">${U.riskLabel(risk.bucket)} ${bar}</div>
        <ul class="reasons">${risk.reasons.map(r=>`<li>${U.esc(r)}</li>`).join('')}</ul>
        <div class="controls">
          ${navControls()}
          <button type="button" class="action" id="dlgRun">Run Scout →</button>
        </div>`;
      const modal = U.openDialog(host, html, { locked:true });
      modal.querySelectorAll('[data-h]').forEach(b => b.onclick = () => { picked.henchman = b.dataset.h; render(); });
      modal.querySelectorAll('[data-e]').forEach(b => b.onclick = () => { picked.equipment = b.dataset.e || null; render(); });
      wireNav(modal, host, missionId, bus);
      modal.querySelector('#dlgRun').onclick = (ev) => {
        ev.currentTarget.disabled = true;        // B1 fix: no double-submit.
        bus.emit('mission:stage', { missionId, stage:'scout', payload: picked });
      };
    };
    render();
  }

  function openApproach(state, missionId, bus) {
    const m = state.missions[missionId];
    const host = U.$('dialogHost');
    let route = 'rooftop';
    // The player must actively pick two henchmen out of the mission roster.
    // (Pre-selecting hid the fact that a second pick was required.)
    let pair = [];
    const render = () => {
      const risk = pair.length === 2 ? E.describeStageRisk(state, missionId, 'approach',
        { henchmen: pair, routeId: route, skill: C.ROUTES_BY_ID[route].skill })
        : { probability: 0, bucket: 'HIGH', reasons: ['Pick two henchmen to see the honest risk.'] };
      const bar = U.riskBar(E.riskBarSegments(risk.probability), risk.bucket);
      const roster = m.assigned;
      const pairNames = pair.map(h => C.HENCHMEN_BY_ID[h]?.name || h);
      const confirmLabel = pair.length === 2
        ? `Run Approach: ${U.esc(pairNames.join(' + '))} →`
        : `Pick ${2 - pair.length} more henchman${pair.length === 1 ? '' : ''}`;
      const html = `
        ${headerFor(state, missionId, 'approach')}
        <h2 id="dlgTitle">🚪 Stage 2 · Approach</h2>
        <p class="sub">Pick a route and <strong>exactly two henchmen</strong>. The route's skill drives the roll; the pair's relationship adds or subtracts.</p>
        <div class="loadout-head">ROUTE</div>
        <div class="loadout-grid">${C.ROUTES.map(r => `<button type="button" class="pick ${route===r.id?'sel':''}" data-r="${r.id}" aria-pressed="${route===r.id}">
          <div class="pick-name">${U.esc(r.name)}</div>
          <div class="pick-meta">${r.skill} · ${U.esc(r.desc)}</div></button>`).join('')}</div>
        <div class="loadout-head">PAIR (${pair.length}/2) — click to toggle</div>
        <div class="loadout-grid">${roster.map(h => {
          const def = C.HENCHMEN_BY_ID[h];
          const sel = pair.includes(h);
          const order = sel ? ` · #${pair.indexOf(h)+1}` : '';
          return `<button type="button" class="pick ${sel?'sel':''}" data-h="${h}" aria-pressed="${sel}" aria-label="${sel?'Deselect ':'Select '}${U.esc(def.name)}">
            <img class="pick-portrait" src="/art/${def.id}.webp" alt="" width="64" height="64"><div class="pick-name">${U.esc(def.name)}${order}</div>
            <div class="pick-meta">${def.skill}</div></button>`;
        }).join('')}</div>
        ${pair.length === 2
          ? `<div class="specialist-preview">TEAM: <strong>${U.esc(pairNames.join(' + '))}</strong></div>`
          : `<div class="specialist-preview" aria-live="polite">Selected: <strong>${pair.length === 0 ? 'nobody yet' : U.esc(pairNames.join(', '))}</strong></div>`}
        <div class="risk-row">${U.riskLabel(risk.bucket)} ${bar}</div>
        <ul class="reasons">${risk.reasons.map(r=>`<li>${U.esc(r)}</li>`).join('')}</ul>
        <div class="controls">
          ${navControls()}
          <button type="button" class="action" id="dlgRun" ${pair.length!==2?'disabled':''} aria-disabled="${pair.length!==2}">${confirmLabel}</button>
        </div>`;
      const modal = U.openDialog(host, html, { locked:true });
      modal.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { route = b.dataset.r; render(); });
      modal.querySelectorAll('[data-h]').forEach(b => b.onclick = () => {
        const h = b.dataset.h;
        if (pair.includes(h)) { pair = pair.filter(x => x !== h); render(); return; }
        if (pair.length >= 2) {
          // Already have two — tell the player to deselect first instead of silently failing.
          const live = modal.querySelector('[aria-live="polite"]');
          if (live) live.textContent = 'Two already picked — deselect one before choosing a third.';
          return;
        }
        pair.push(h);
        render();
      });
      wireNav(modal, host, missionId, bus);
      modal.querySelector('#dlgRun').onclick = (ev) => {
        if (pair.length !== 2) return;
        ev.target.disabled = true;
        bus.emit('mission:stage', { missionId, stage:'approach',
          payload: { route, henchmen: pair } });
      };
    };
    render();
  }

  function openBreach(state, missionId, bus, aiStatus) {
    const m = state.missions[missionId];
    const host = U.$('dialogHost');
    const override = E.canExecutiveOverride(state);
    let overridePick = null;
    const render = () => {
      // Honest Breach preview: use the specialist actually selected by Decider/local pick,
      // or the overridePick if the player is about to override.
      const preview = overridePick
        ? { specialist: overridePick, provider: 'override' }
        : E.previewBreachSpecialist(state, missionId, null);
      const specDef = C.HENCHMEN_BY_ID[preview.specialist];
      const risk = E.describeStageRisk(state, missionId, 'breach',
        { henchmen:[preview.specialist], skill: specDef?.skill, equipment: m.loadout });
      const bar = U.riskBar(E.riskBarSegments(risk.probability), risk.bucket);
      const html = `
        ${headerFor(state, missionId, 'breach')}
        <h2 id="dlgTitle">💥 Stage 3 · Breach</h2>
        <p class="sub">${overridePick ? 'OVERRIDING' : 'Decider ('+U.esc(aiStatus)+') is requested; deterministic fallback is used if the service is unavailable.'} Risk below reflects the previewed specialist.</p>
        <div class="specialist-preview">LEAD: <strong>${U.esc(specDef?.name || preview.specialist)}</strong> <span class="pill">${U.esc(specDef?.skill || '')}</span> (${preview.provider})</div>
        <div class="risk-row">${U.riskLabel(risk.bucket)} ${bar}</div>
        <ul class="reasons">${risk.reasons.map(r=>`<li>${U.esc(r)}</li>`).join('')}</ul>
        <div class="loadout-head">EXECUTIVE OVERRIDE (${U.esc(override.desc || override.reason)}) — +20 stress to target</div>
        <div class="loadout-grid">${m.assigned.map(h => {
          const def = C.HENCHMEN_BY_ID[h];
          return `<button class="pick ${overridePick===h?'sel':''}" data-h="${h}" ${override.ok?'':'disabled'}>
            <img class="pick-portrait" src="/art/${def.id}.webp" alt="" width="64" height="64"><div class="pick-name">${U.esc(def.name)}</div>
            <div class="pick-meta">${def.skill}</div></button>`;
        }).join('')}</div>
        <div class="controls">
          ${navControls()}
          <button type="button" class="action" id="dlgRun">Breach ${overridePick ? '(override)' : '(Decider)'} →</button>
          ${overridePick ? `<button type="button" class="secondary" id="dlgClearOverride">Clear override</button>` : ''}
        </div>`;
      const modal = U.openDialog(host, html, { locked:true });
      modal.querySelectorAll('[data-h]').forEach(b => b.onclick = () => {
        overridePick = (overridePick === b.dataset.h) ? null : b.dataset.h;
        render();
      });
      wireNav(modal, host, missionId, bus);
      modal.querySelector('#dlgRun').onclick = (ev) => {
        ev.target.disabled = true;
        ev.target.textContent = 'Consulting Evil Council (first visit can take 90 seconds)...';
        bus.emit('mission:stage', { missionId, stage:'breach', payload: { override: overridePick ? { henchman: overridePick } : null } });
      };
      const clearBtn = modal.querySelector('#dlgClearOverride');
      if (clearBtn) clearBtn.onclick = () => { overridePick = null; render(); };
    };
    render();
  }

  function openEscape(state, missionId, bus) {
    const host = U.$('dialogHost');
    const avail = E.escapePlanAvailability(state, missionId);
    // B3: default to the first allowed plan.
    let plan = ['fast','clever','loud'].find(p => avail[p]?.ok) || 'loud';
    const render = () => {
      const options = ['fast','clever','loud'].map(p => {
        const risk = E.describeStageRisk(state, missionId, 'escape', { plan:p });
        return { plan:p, ...risk, segs: E.riskBarSegments(risk.probability), gate: avail[p] || {ok:true} };
      });
      const html = `
        ${headerFor(state, missionId, 'escape')}
        <h2 id="dlgTitle">🏃 Stage 4 · Escape</h2>
        <p class="sub">No timer. Pick an escape plan. Risks reflect what you did in the prior stages. A botched Approach can lock some exits.${state.campaign ? ' Fast uses science for a technical getaway; clever uses deception; loud uses force. Each plan relies on its best available specialist and matching gear. Everyone still takes escape stress.' : ''}</p>
        <div class="escape-list">${options.map(o => `
          <button class="escape-opt ${plan===o.plan?'sel':''}" data-p="${o.plan}" ${o.gate.ok?'':'disabled aria-disabled="true"'} title="${U.esc(o.gate.reason || o.gate.warn || '')}">
            <div class="escape-head">
              <strong>${o.plan.toUpperCase()}</strong>
              ${U.riskLabel(o.bucket)}
              ${o.gate.ok ? '' : '<span class="pill danger">LOCKED</span>'}
              ${o.gate.ok && o.gate.warn ? '<span class="pill">WARN</span>' : ''}
            </div>
            ${U.riskBar(o.segs, o.bucket)}
            ${o.gate.reason ? `<div class="reason-note">${U.esc(o.gate.reason)}</div>` : ''}
            ${o.gate.warn ? `<div class="reason-note warn">${U.esc(o.gate.warn)}</div>` : ''}
            <ul class="reasons">${o.reasons.map(r=>`<li>${U.esc(r)}</li>`).join('')}</ul>
          </button>`).join('')}</div>
        <div class="controls">
          ${navControls({ forfeitLabel: 'Forfeit (abandon loot)' })}
          <button type="button" class="action" id="dlgRun">Escape (${plan})</button>
        </div>`;
      const modal = U.openDialog(host, html, { locked:true });
      modal.querySelectorAll('[data-p]').forEach(b => b.onclick = () => {
        const p = b.dataset.p;
        if (!(avail[p]?.ok)) return;        // B3: can't select a locked plan.
        plan = p; render();
      });
      wireNav(modal, host, missionId, bus);
      modal.querySelector('#dlgRun').onclick = (ev) => {
        if (!(avail[plan]?.ok)) return;
        ev.currentTarget.disabled = true;   // B1 fix: no double-submit.
        bus.emit('mission:stage', { missionId, stage:'escape', payload: { plan } });
      };
    };
    render();
  }

  function openResult(state, missionId, result, bus) {
    const host = U.$('dialogHost');
    const m = C.MISSIONS_BY_ID[missionId];
    const outcome = state.outcome;
    const headline = result.pass ? '✓ Stage passed' : '✗ Stage failed';
    let next = 'close';
    if (state.missions[missionId].stage === 'approach') next = 'approach';
    else if (state.missions[missionId].stage === 'breach') next = 'breach';
    else if (state.missions[missionId].stage === 'escape') next = 'escape';
    else next = 'close';
    const victory = state.missions[missionId].status === 'success';
    const partial = state.missions[missionId].status === 'partial';
    const failed = state.missions[missionId].status === 'failed' || state.missions[missionId].status === 'failed_escape';
    const html = `
      <div class="eyebrow">${U.esc(m.name)} · ${result.stage.toUpperCase()}</div>
      <h2 id="dlgTitle">${headline}</h2>
      <div class="result-roll">roll ${result.roll} vs DC ${result.dc} (${result.provider})</div>
      ${result.stage === 'breach' && missionId !== 'prep' ? `<section class="decision-report" aria-label="Specialist decision">
        <div class="report-label">${result.decision ? 'STRANDS DECIDER 2B' : result.provider === 'override' ? 'EXECUTIVE OVERRIDE' : 'DETERMINISTIC FALLBACK'}</div>
        <h3>${U.esc(C.HENCHMEN_BY_ID[result.narratorHenchman]?.name || 'Local specialist')} · ${U.esc(result.decision?.choice || C.HENCHMEN_BY_ID[result.narratorHenchman]?.skill || '')}</h3>
        ${result.decision && typeof result.decision.confidence === 'number' && Number.isFinite(result.decision.confidence) ? `<p>Model confidence: <strong>${(result.decision.confidence * 100).toFixed(1)}%</strong></p><small>Confidence in the specialist choice, not the chance of winning the mission.</small>` : '<p>The game selected the specialist without a live Decider recommendation.</p>'}
      </section>` : ''}
      <p class="outcome">${U.esc(result.story)}</p>
      ${result.narration ? `<section class="narration-report" aria-label="Amazon Bedrock narration"><div class="report-label">AMAZON BEDROCK · NOVA LITE</div><p class="outcome">${U.esc(result.narration)}</p><small>Flavor dialogue only. The game roll and rewards are already fixed.</small></section>` : ''}
      <ul class="reasons">${result.events.map(e=>`<li>${U.esc(e)}</li>`).join('')}</ul>
      ${victory ? `<div class="verdict good">🏆 ${outcome==='victory'?'VICTORY':'MISSION SUCCESS'}</div>`:''}
      ${partial ? `<div class="verdict ok">🥈 Partial — moon acquired, press coverage disappointing.</div>`:''}
      ${failed ? `<div class="verdict bad">💥 Mission failed.</div>`:''}
      <div class="controls">
        ${next==='close' ? `<button class="action" id="dlgRun">Back to HQ</button>` :
          `<button class="action" id="dlgRun">Continue → ${next}</button>`}
      </div>`;
    const modal = U.openDialog(host, html, { locked:true });
    modal.querySelector('#dlgRun').onclick = () => {
      U.closeDialog(host);
      if (next !== 'close') bus.emit('mission:advance', { missionId, nextStage: next });
      else bus.emit('mission:closed');
    };
  }

  function openPrepScout(state, bus) {
    const m = state.missions.prep;
    const host = U.$('dialogHost');
    // Side ops allow one selected loadout item; it is used automatically here.
    const picked = { henchman: m.assigned[0], equipment: E.workingEquipment(state, m.loadout)[0] || null };
    const render = () => {
      const risk = E.describeStageRisk(state, 'prep', 'scout', {
        henchmen:[picked.henchman], skill: C.HENCHMEN_BY_ID[picked.henchman]?.skill,
        equipment: picked.equipment ? [picked.equipment] : []
      });
      const bar = U.riskBar(E.riskBarSegments(risk.probability), risk.bucket);
      const html = `
        <h2 id="dlgTitle">🎯 Side Op · Prep Scout</h2>
        <p class="sub">Quick case-the-joint for the Moon run. Pick a scout.</p>
        <div class="loadout-head">SCOUT</div>
        <div class="loadout-grid">${m.assigned.map(h => {
          const def = C.HENCHMEN_BY_ID[h];
          return `<button class="pick ${picked.henchman===h?'sel':''}" data-h="${h}">
            <img class="pick-portrait" src="/art/${def.id}.webp" alt="" width="64" height="64"><div class="pick-name">${U.esc(def.name)}</div>
            <div class="pick-meta">${def.skill}</div></button>`;
        }).join('')}</div>
        <div class="risk-row">${U.riskLabel(risk.bucket)} ${bar}</div>
        <ul class="reasons">${risk.reasons.map(r=>`<li>${U.esc(r)}</li>`).join('')}</ul>
        <div class="controls">
          <button type="button" class="secondary" id="dlgForfeit">Forfeit prep op</button>
          <button type="button" class="action" id="dlgRun">Run Scout →</button>
        </div>`;
      const modal = U.openDialog(host, html, { locked:true });
      modal.querySelectorAll('[data-h]').forEach(b => b.onclick = () => { picked.henchman = b.dataset.h; render(); });
      modal.querySelector('#dlgForfeit').onclick = () => bus.emit('mission:abort', { missionId:'prep' });
      modal.querySelector('#dlgRun').onclick = (ev) => {
        ev.currentTarget.disabled = true;
        bus.emit('mission:stage', { missionId:'prep', stage:'scout', payload: picked });
      };
    };
    render();
  }

  function openPrepPayoff(state, bus) {
    const host = U.$('dialogHost');
    const m = state.missions.prep;
    let kind = 'surveillance';
    const KINDS = [
      { id:'surveillance', name:'Surveillance', meta:'Science check · Moon Scout +15', skill:'science' },
      { id:'bribery',      name:'Bribery',      meta:'Deception check · Moon Approach +15', skill:'deception' },
      { id:'sabotage',     name:'Sabotage',     meta:'Force check · Moon Breach +15', skill:'force' },
    ];
    const render = () => {
      const selected = KINDS.find(k => k.id === kind);
      const risk = E.describeStageRisk(state, 'prep', 'breach', {
        henchmen:m.assigned, skill:selected.skill, equipment:m.loadout, sideOpKind:kind
      });
      const bar = U.riskBar(E.riskBarSegments(risk.probability), risk.bucket);
      const html = `
        <h2 id="dlgTitle">🎯 Side Op · Payoff</h2>
        <p class="sub">Pick one. Successful intel helps the matching Moon stage for 3 days. Fail = +12 heat, no bonus.</p>
        <div class="loadout-grid">${KINDS.map(k => `
          <button class="pick ${kind===k.id?'sel':''}" data-k="${k.id}">
            <div class="pick-name">${U.esc(k.name)}</div>
            <div class="pick-meta">${U.esc(k.meta)}</div></button>`).join('')}</div>
        <div class="risk-row">${U.riskLabel(risk.bucket)} ${bar}</div>
        <ul class="reasons">${risk.reasons.map(r=>`<li>${U.esc(r)}</li>`).join('')}</ul>
        <div class="controls">
          <button type="button" class="secondary" id="dlgForfeit">Forfeit payoff</button>
          <button type="button" class="action" id="dlgRun">Run Payoff →</button>
        </div>`;
      const modal = U.openDialog(host, html, { locked:true });
      modal.querySelectorAll('[data-k]').forEach(b => b.onclick = () => { kind = b.dataset.k; render(); });
      modal.querySelector('#dlgForfeit').onclick = () => bus.emit('mission:abort', { missionId:'prep' });
      modal.querySelector('#dlgRun').onclick = (ev) => {
        ev.currentTarget.disabled = true;
        bus.emit('mission:stage', { missionId:'prep', stage:'breach', payload: { sideOpKind: kind } });
      };
    };
    render();
  }

  root.EvilGeniusV2UIMission = { openLoadout, openScout, openApproach, openBreach, openEscape, openResult, openPrepScout, openPrepPayoff };
})(typeof window !== 'undefined' ? window : globalThis);
