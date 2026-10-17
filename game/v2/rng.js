// Deterministic scoped RNG per V2_SPEC_RESOLUTIONS.md R3.
// mulberry32 seeded from hash32(masterSeed XOR scope). No shared state.
(function(root, factory){
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.EvilGeniusV2Rng = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){

  function hash32(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  function mulberry32(a) {
    return function() {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Return a generator for a given scope string, deterministic given masterSeed.
  function scoped(masterSeed, scope) {
    const master = typeof masterSeed === 'number' ? masterSeed : hash32(String(masterSeed));
    const salt = hash32(String(scope));
    return mulberry32((master ^ salt) >>> 0);
  }

  // Common helpers all bound to a scoped generator.
  function rollD20(gen) { return 1 + Math.floor(gen() * 20); }
  function rollPercent(gen) { return 1 + Math.floor(gen() * 100); }
  function pickWeighted(gen, items, weights) {
    const total = weights.reduce((a,b)=>a+b, 0);
    if (total <= 0) return items[0];
    let r = gen() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r < 0) return items[i];
    }
    return items[items.length - 1];
  }

  function masterSeedOf(playerId, runId) {
    return hash32(String(playerId) + ':' + String(runId));
  }

  return { hash32, mulberry32, scoped, rollD20, rollPercent, pickWeighted, masterSeedOf };
});
