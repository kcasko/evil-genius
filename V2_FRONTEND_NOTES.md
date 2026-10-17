# V2 Frontend Notes

## Summary

Implemented the V2 frontend reliability layer without backend, AWS, deployment, or non-localhost network changes. The UI now probes and caches AI availability, reports live/offline/daily-limit status through an accessible HUD badge, explains cold and warm decision latency, permits an in-flight switch to deterministic resolution, and automatically falls back on 503, 429, timeout, network, and malformed-response failures. Deterministic gameplay remains the resolver underneath both modes, and deterministic narration is identified in the dossier footer.

## Files changed

- `game/aiStatus.js` (new): state-only health probe, 60-second cache, synchronous getter, explicit state transition, and forced refresh.
- `game/aiClient.js` (new): decide/narrate transport, deadlines, typed fallback results, and PII-free structured debug events.
- `game/coldStartUx.js` (new): pure, clock-driven 90-second progress calculation.
- `game/engine.js`: additive `resolveMissionWithDecision` hook; existing deterministic resolver logic was not changed.
- `index.html`: status badge/panel, keyboard handling, responsive reliability UI, cold/warm/fallback messaging, AI client wiring, and deterministic dossier chip.
- `tests/aiStatus.test.mjs` (new): probe caching, forced refresh, and mode transitions.
- `tests/aiClient.test.mjs` (new): 200, 503, 429, timeout, non-JSON, and network-error behavior.
- `tests/coldStartUx.test.mjs` (new): 10/45/90/180-second progress values and clamping.
- `tests/fallbackIntegration.test.mjs` (new): fallback through the deterministic mission resolver and dossier-chip contract.
- No changes were made under `backend/`, to deployment/cost/design contracts, or to existing test files.

## Verification

- `node --test tests/*.test.mjs` - PASS: 36 tests passed, including all 22 pre-existing JavaScript tests and 14 new tests.
- `python -m unittest discover -s tests` - PASS: 4 tests.
- `python -m unittest discover -s backend/tests` - PASS: 53 tests.
- `node --check game/aiStatus.js`, `node --check game/aiClient.js`, and `node --check game/coldStartUx.js` - PASS.
- Compiled the final inline `index.html` script with `new Function(...)` without executing it - PASS.
- `git diff --check` - PASS.
- The original Codex sandbox lacked the installed `strands` package. Hermes reran every required suite in the real local environment, where they passed, before committing the branch.
- Every POST now includes the exact SHA-256 body hash required by CloudFront OAC for a Lambda function URL origin; the hash value is covered by a known-vector test.

## Acceptance scenarios walked

1. **First cold start, then warm, then rate limited:** a successful health probe moves the badge to `AI // LIVE`; the first mission displays the 90-second lair warm-up copy and moving progress; the first successful decision marks the page session warm, so the next mission shows the approximately 10-second council message; a later 429 changes the badge to pulsing `OFFLINE // DAILY LIMIT`, displays the UTC reset when supplied, shows the offline-council notice, and resolves deterministically with the dossier chip.
2. **AI disabled at boot:** a health response with `ai_enabled: false` or a 503 moves the badge to steady `OFFLINE // DETERMINISTIC`; the probe allows 2.5 seconds for mobile latency and does not cache transport failures, so the next probe can recover immediately. Launching a mission while AI is unavailable resolves through the existing deterministic path with the dossier chip.
3. **AI drops mid-game:** a live decide/narrate request that returns 503, times out, fails on the network, or returns non-JSON changes the badge to offline, shows `AI unavailable — using offline council`, and continues without a player click. A failed decide uses the selected plan's deterministic specialist; failed narration retains the engine's deterministic flavor text.

## AGY review corrections

The first AGY pass requested changes. The amended branch now makes external cancellation win over concurrent AI completion; preserves the intentional offline reason without an error banner; uses a 2.5-second probe without caching transport failures; starts in a neutral connecting state; restores focus and supports click-outside dismissal; announces progress only at 10% milestones; uses 90-second cold and 10-second warm progress targets; keeps narration abortable; and consumes the bridge's `until` epoch-millisecond contract for 429 responses.
