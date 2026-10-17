# Evil Genius V2 — Gameplay Repair Acceptance Report

Date: 2026-10-16
Branch: `v2/integration`
Recovery tag: `v2-slice-abef904`
Original independent score: **3/10**
Repaired score: **6/10** (Hermes), **6.5/10** (AGY)
Verdict: **Genuinely more interesting; now a functioning vertical-slice game, not yet a full campaign.**

## Scope

This phase changed local gameplay only. It did not deploy AWS resources, add paid inference, download models, push, merge, or alter the Strands Decider service.

## What changed

### Confirmed bug repairs

- Scout and Escape disable their submit button before emitting a stage action.
- Repeated stage resolution returns `alreadyResolved` without mutating mission state.
- Breach now guards the stage before Executive Override can spend CP or add stress.
- Escape-plan lockouts are enforced in the engine, not only the UI.
- Mission retry RNG scopes include `relaunchCount`, so retries vary reproducibly.
- Bankruptcy is now two consecutive dawns of unpaid CHAOS upkeep and is reachable.
- Laboratory applies Mal's +25% competence on every stage while the Lab is online; copy matches the calculation.
- Day off is disabled/rejected when it would be a no-op.
- Old `v02` saves are forward-filled with new mission, crisis, retry, and intel fields.

### Mission repair

- Scout pass: Approach +10 and Breach +5.
- Scout fail: Approach -10 and +15 heat.
- Approach pass: Breach +10.
- Approach fail: Breach -25, +10 heat, Fast/Clever Escape locked, remaining Escape receives -15, and final infamy is reduced.
- Effective DC is clamped to 15, capping a single stage at about 86% rather than allowing DC 8 formality rolls.
- Failed Breach ends the mission with a partial payout; it no longer permits one lucky later roll to erase every consequence.
- First Aid, Smoke bailout, Rabbit reroll, and other mission-end effects work consistently on failure and abort paths.

### Headquarters repair

- CHAOS upkeep reduced from $50/day to $35/day, changing baseline cash flow from -$20/day to -$5/day.
- Persistent Lair Status shows owned buildings, build queue, equipment/broken state, and derived income/upkeep.
- Four low-intensity events cover morale/gossip, equipment rust, Boris boredom, and Kevin's cost-cutting memo.
- After two quiet dawns, an eligible crisis is forced deterministically.
- A two-event cooldown reduces repeated crisis selection.
- Equipment rust breaks owned gear instead of deleting ownership.
- Research equipment now has distinct behavior:
  - Rabbit's Foot rerolls the first failed stage once per mission and can break.
  - Smoke Grenade has a deterministic 50% safe-bailout chance for $100.
  - EMP is consumed to cancel the next crisis.
  - First Aid recovers assigned crew stress/rage when a mission ends.

### Supporting operation

`Prep Op: Lunar Recon` is a two-stage playable operation:

- Launch cost: 1 CP + $60.
- Loadout: 1–2 henchmen and at most one equipment item.
- Operation choices map to real skills:
  - Surveillance: Science check, Moon Scout +15.
  - Bribery: Deception check, Moon Approach +15.
  - Sabotage: Force check, Moon Breach +15.
- Success refunds $60 and grants the selected targeted bonus for three days.
- Failure adds heat and grants no intel.
- It can be repeated after intel expires but cannot farm cash or infamy.

## Automated verification

### JavaScript / gameplay

Command: `node --test tests/*.mjs`

Result: **66 passed, 0 failed**.

Deterministic simulation results:

| Strategy | Win rate |
|---|---:|
| Weak / unprepared | 13.0% |
| Average preparation | 48.6% |
| Optimized preparation | 63.2% |
| Optimized lift over weak | +50.2 points |

The repaired curve makes preparation valuable without making optimized play automatic.

### Python / backend regression

Command: `D:/AI/evil-genius-venv/Scripts/python.exe -m pytest -q`

Final result: **107 passed, 0 failed**.

One earlier full-suite run hit the pre-existing concurrent rate-limit test intermittently (9 accepted vs expected 7). The exact failing test passed immediately on an isolated rerun, and the subsequent full rerun passed 107/107. No gameplay-repair file touches that backend rate-limit implementation.

### Static verification

- JavaScript syntax checks passed for the changed engine/content/crisis/save/UI modules.
- `git diff --check` passed.
- No AWS deployment or external write occurred.

## Six final Chrome campaigns

All campaigns used fresh isolated Chrome contexts, real UI button actions, fresh URL seeds, and the local V2 server. State was read from the saved browser state only after actions; engine state was not injected to produce outcomes.

Evidence: `playtest/repair_acceptance.jsonl`, rows marked `candidate: final3`.

| Campaign | Strategy | Result | Important observation |
|---|---|---|---|
| C1 | Weak Day-1, Kevin + Mal, no gear | Mission failed at Breach | Scout double-click created exactly one Scout result; no phantom fail. |
| C2 | Average, Lab + Rec Room, Day 3 | Victory | All four stages passed; preparation produced a credible but not guaranteed win. |
| C3 | Optimized, Server Room + Lab + Rabbit | Victory | Rabbit visibly rerolled Escape from 3 to 75; optimized play still faced real failure risk. |
| C4 | Failed Lunar Recon, then Moon | `defeat_heat` despite Moon success | Side-op failure and early Scout failure created consequences that a later lucky Breach could not erase. |
| C5 | 12-day HQ/economy loop | Still running | Maximum quiet streak was two dawns; four crisis types appeared; gear broke; money moved from $600 to $460. |
| C6 | Same weak loadout retried under one seed | Two recoverable failures | Roll vectors changed reproducibly from `[2,23,14]` to `[21,63,49]`. |

Aggregate: two victories, one campaign defeat, two recoverable failed missions, one management-loop campaign.

The real Decider path showed `AI // LIVE` and Breach results reported provider `decider` during mission campaigns. Deterministic fallback remains in place.

## Independent reviews

### OpenCode

OpenCode examined the exact uncommitted engine/balance diff and initially returned **PASS WITH CONCERNS**. It identified six latent consistency defects (Breach re-resolution, engine-side Escape gating, side-op skill/order scoring, side-op gear not contributing to Scout, mission-end First Aid consistency, and hardcoded HQ income). All six were fixed with regressions.

A focused re-review then found one remaining edge case: Executive Override charged CP/stress before the stage guard on a repeated Breach call. That was reproduced, fixed by moving the guard before override payment, and covered by the final regression test. Final Node and Python suites remain green.

### AGY

AGY's final player-experience evaluation scored the repair **6.5/10**, up from 3/10, and called it **genuinely more interesting**. Its strongest points were inter-stage causality, tactical recovery equipment, and HQ pacing. Its main reservations were content scarcity, a possibly punitive 63% optimized ceiling, and a somewhat forced early Server Room priority.

## Honest assessment

The game is materially better:

- Early decisions carry forward.
- A bad run explains itself through heat, locked exits, penalties, and recovery options.
- HQ days create events and financial choices instead of pure dead air.
- Retrying has a reproducible reason to produce a new outcome.
- The support operation adds a short preparation decision rather than another decorative card.

It is not an 8/10 game. One main mission and one support operation still limit replay value, and the optimized curve may be too volatile for players expecting preparation to produce a safer campaign. Those are content/balance limitations, not failures of this repair phase.

## Final verdict

**Acceptance goal met, with an honest 6/10.** Evil Genius V2 now creates meaningful strategic choices, understandable consequences, and a reason to replay a failed seed. It remains a vertical slice rather than a complete campaign.

No changes were pushed or merged. The working build remains local on `v2/integration`; recovery tag `v2-slice-abef904` preserves the pre-repair state.
