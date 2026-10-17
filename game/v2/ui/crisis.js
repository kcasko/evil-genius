// Crisis card modal.
(function(root){
  const U = root.EvilGeniusV2UI;
  const C = root.EvilGeniusV2Content;
  function open(state, crisisId, bus) {
    const def = C.CRISES_BY_ID[crisisId];
    if (!def) return;
    const deadline = state.campaign && root.EvilGeniusV2Crises.expirationInfo(state.crises.find(c => c.id === crisisId));
    const html = `
      <div class="eyebrow">CRISIS // DAY ${state.day}</div>
      <div class="crisis-modal-heading"><img class="crisis-icon" src="/art/${U.crisisArt(crisisId)}.webp" alt="" width="64" height="64"><h2 id="dlgTitle">⚠ ${U.esc(def.title)}</h2></div>
      <p class="sub">Your options cost CP, money, morale, or ignore-it-and-regret.</p>
      ${deadline ? `<p class="sub">Resolve before dawn day ${deadline.dueDay}. If ignored: ${U.esc(deadline.label)}.</p>` : ''}
      <div class="options">
        ${def.options.map(o => `<button class="option" data-choice="${U.esc(o.id)}">${U.esc(o.label)}</button>`).join('')}
      </div>
      <div class="controls"><button class="secondary" id="dlgClose">Later</button></div>`;
    const host = U.$('dialogHost');
    const modal = U.openDialog(host, html);
    modal.querySelectorAll('[data-choice]').forEach(b => b.onclick = () => {
      bus.emit('crisis:resolve', { crisisId, choiceId: b.dataset.choice });
      U.closeDialog(host);
    });
    modal.querySelector('#dlgClose').onclick = () => U.closeDialog(host);
  }
  root.EvilGeniusV2UICrisis = { open };
})(typeof window !== 'undefined' ? window : globalThis);
