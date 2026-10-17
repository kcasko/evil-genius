// Shared UI helpers.
(function(root){
  const esc = s => String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const $ = id => document.getElementById(id);

  let lastFocus = null;
  function openDialog(host, html, opts) {
    opts = opts || {};
    lastFocus = document.activeElement;
    host.innerHTML = `<div class="modalback"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="dlgTitle" tabindex="-1">${html}</div></div>`;
    const modal = host.querySelector('.modal');
    modal.focus();
    const onKey = e => {
      if (e.key === 'Escape' && !opts.locked) { closeDialog(host); e.preventDefault(); }
      if (e.key === 'Tab') {
        const focusable = modal.querySelectorAll('button:not([disabled]),[href],input,select,textarea,[tabindex="0"]');
        if (!focusable.length) return;
        const first = focusable[0], last = focusable[focusable.length-1];
        if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
        else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
      }
    };
    modal._onKey = onKey;
    modal.addEventListener('keydown', onKey);
    return modal;
  }
  function closeDialog(host) {
    host.innerHTML = '';
    if (lastFocus && typeof lastFocus.focus === 'function') try { lastFocus.focus(); } catch(_){}
  }

  function riskLabel(bucket) {
    return {
      HIGH:      '<span class="risk risk-high">HIGH RISK</span>',
      RISKY:     '<span class="risk risk-mid">RISKY</span>',
      FAVORABLE: '<span class="risk risk-ok">FAVORABLE</span>',
      STRONG:    '<span class="risk risk-strong">STRONG</span>',
    }[bucket] || bucket;
  }
  function riskBar(segments, bucket) {
    let out = '';
    for (let i = 0; i < 10; i++)
      out += `<span class="seg ${i < segments ? 'on seg-'+bucket.toLowerCase() : ''}"></span>`;
    return `<div class="riskbar" role="progressbar" aria-valuemin="0" aria-valuemax="10" aria-valuenow="${segments}" aria-valuetext="${bucket} RISK">${out}</div>`;
  }

  const crisisArt = id => ({
    C1_boris_punched:'crisis-damage', C2_chaos_rollback:'chaos', C3_audit_letter:'crisis-paperwork',
    C4_mal_explodes:'crisis-damage', C5_hr_meeting:'crisis-social', C6_journalist:'crisis-media',
    C7_union:'crisis-social', C8_rival_taunt:'crisis-social', C9_equip_theft:'crisis-theft',
    C10_celebrity:'crisis-media', C11_server_melt:'crisis-damage', C12_media_love:'crisis-media',
    C13_dolores_gossip:'crisis-social', C14_equip_rust:'crisis-damage', C15_boris_bored:'boris',
    C16_kevin_pitch:'crisis-paperwork'
  }[id] || 'crisis-damage');
  root.EvilGeniusV2UI = { esc, $, openDialog, closeDialog, riskLabel, riskBar, crisisArt };
})(typeof window !== 'undefined' ? window : globalThis);
