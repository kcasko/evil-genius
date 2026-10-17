# V2 Spec Resolutions — Addendum to EVIL_GENIUS_V2_DESIGN.md

Authoritative resolutions to inconsistencies and user-mandated rebalances.
Any divergence between this file and EVIL_GENIUS_V2_DESIGN.md: **this file wins**.

Status: APPROVED by user 2026-10-15. Locked for v2 vertical slice.

---

## R1. Boris's stress-immunity vs C1 Boris Punched Something

**Conflict:** §4 says Boris is "immune to stress"; §8 C1 triggers on `boris.stress >= 50`.

**Resolution:** Boris has a **separate `rage` meter** (0–100) that behaves like
stress for crisis-trigger purposes but does NOT penalize his rolls.
- Boris's `stress` is always clamped to 0 (immunity preserved).
- Boris's `rage` ticks up by the same amounts stress would (base +10 per mission,
  +15 off-trait).
- C1 trigger reads `boris.rage >= 50`.
- Rec Room / First Aid / Day Off reduce `rage` the same as stress.
- Rolls: Boris never gets a stress-fumble penalty (`-stress/4`).

Henchman shape adds `rage?: number` (only populated for Boris; `undefined` elsewhere).

---

## R2. Executive Override must be viable at Breach

**Conflict:** Override costs 2 CP; player might reach Breach with 0 CP.

**Resolution:** Executive Override at Breach is **payable in Infamy if CP < 2**.
- Primary cost: 2 CP.
- Fallback cost (only if CP < 2 at Breach): **−10 Infamy + 1 CP (any CP available, min 0)**.
- Still applies +20 stress to the overridden henchman.
- Still logs `provider:"override"`.
- Override is always offered as a choice at Breach; UI greys out and shows the
  active cost tag ("2 CP" or "−10 Infamy, 0 CP").

---

## R3. Deterministic RNG stream — one stream, scoped sub-streams

**Resolution:**
```
masterSeed = hash32(playerId + ":" + runId)
rng(scope) = mulberry32(masterSeed XOR hash32(scope))
```

Scopes used:
- `day:${N}:dawn`         → crisis roll, resource tick
- `day:${N}:crisis:${id}` → crisis resolution rolls
- `mission:${missionId}:stage:${stageName}:${attempt}` → stage dice (attempt lets
  Smoke Grenade reroll produce a distinct roll)
- `mission:${missionId}:breach:override` → override specialist selection
- `equipment:${equipId}:break:${day}` → breakage roll

Each scope mints a **fresh generator**; generators are not persisted. State
persists only `masterSeed` + `attemptCounters` map. Same `(masterSeed, scope)`
always yields the same first roll → replay is total.

Decider output never touches RNG; it only steers specialist selection at Breach.

---

## R4. Finance & bankruptcy accounting

**Resolution:**
- Money is an integer (cents not used; whole dollars).
- Money CAN go negative (e.g. forced crisis spend).
- `defeat_bankrupt` triggers when `money < 0` is TRUE at dawn tick on two
  consecutive days. One recovery day resets the counter.
- Vault upgrade: splits money into `cash` (volatile) and `vault` (safe). Only
  `cash` is checked for bankruptcy. Vault capacity: unlimited but transfer costs
  1 CP per transaction. (Simplification: for v2 slice, Vault just means Theft
  crisis targets 0 money loss instead of equipment loss.)
- Kevin's +$30/day passive: added at dawn tick BEFORE bankruptcy check.
- Server Room auto-pays CHAOS's $50/day BEFORE bankruptcy check; if money would
  go negative to pay it, upkeep is skipped and CHAOS loses 1 competence.

---

## R5. Crisis chains

**Resolution:** A chain is a `{parent, child, delayDays}` record. When parent
resolves (either option), child is pushed into `crises` at `day + delayDays`.

Chains for v2 slice:
- C1 → C7 at delay 1 (Boris's rage lowers morale → Union)
- C9 → C3 at delay 2 (theft creates audit trail)
- C4 → C11 at delay 1 (lab explosion stresses servers)
- C6 → C5 at delay 1 (journalist → forced HR meeting)

Chains fire only on parent **appearance**, not on parent resolution choice,
so player can't dodge the chain by picking "ignore".

---

## R6. Escape stage — no real-time timer (user mandate)

**Conflict:** §7 Stage 4 has a 10 s auto-worst-pick timer.

**Resolution:** Escape is **turn-based with persistent setup**.
- Three escape plans visible: Fast / Clever / Loud. Each shows a seeded risk tag
  (LOW / MED / HIGH) that depends on prior stage outcomes:
  - **Fast**: baseline risk MED. LOW if Scout succeeded (knew exits). HIGH if
    Approach was Sewer (slow extract route).
  - **Clever**: baseline MED. LOW if Deception henchman assigned and non-stressed.
    HIGH if Breach used Executive Override (improvised, no misdirection ready).
  - **Loud**: baseline HIGH. LOW if Boris on roster AND Hammer equipped. Always
    adds +infamy on success, +heat regardless.
- No timer. Player picks when ready; UI shows the three risks and the
  computed-from-state reasoning strings.
- Each plan has an explicit success % (clamped 25–90) shown AS a bar + verbal
  tag ("LOW RISK / HIGH RISK"), not a bare number.
- One Escape attempt only. Failing Escape = mission partial failure (50%
  reward, +25 heat, mission marked `done:failed_escape`).

---

## R7. Steal the Moon win condition rebalance (user mandate)

**Conflict:** §13 requires Infamy ≥ 50 AND all 4 stages pass, but a 20-min
playthrough rarely accumulates 50 Infamy.

**Resolution:**
- **Primary victory:** All four Moon stages pass. Infamy ≥ 25.
- **Infamy sources rebalanced:**
  - Mission success (Moon stage pass): +8 per stage passed (max +32 for clean run)
  - C10 Celebrity accept: +5
  - C12 Media Love Letter accept: +8
  - Boris's Hammer success: +3 bonus
  - Loud escape: +5
  - Starting Infamy: 5 (you have a reputation)
- A clean Moon run with 1 Hammer use + Loud escape = 5 + 32 + 3 + 5 = **45 Infamy**,
  comfortably above 25. A sloppy run can still win by picking C10/C12.
- Secondary victory message tag if `Infamy >= 50`: "Legendary" (cosmetic only).
- If stages pass but Infamy < 25, outcome = `partial_victory` (counted as a win
  in log, but end screen says "the moon is yours, but no one noticed").

---

## R8. Stage DC/probability tuning — targets

Simulations (see `tests/v2_simulation.test.mjs`) must verify:

- **Un-prepped run** (zero upgrades, no equipment unlocks, random henchmen):
  win rate **15–30%** over 1000 seeds.
- **Mid-prep run** (1 upgrade, 1 equipment unlock, trait-matched assignments):
  win rate **55–70%**.
- **Fully-prepped run** (Lab + Server Room, 2 unlocks, optimal assignments):
  win rate **80–92%**.

Base DCs (from §7) are tentative; `game/v2/content.js` constants `STAGE_DCS` are
the single source of truth. Tests may trigger a rebalance pass by failing.

Risk display never shows raw %. Instead:
- < 35% → "HIGH RISK"
- 35–55% → "RISKY"
- 55–75% → "FAVORABLE"
- > 75% → "STRONG"
Plus a 10-segment bar so the player sees relative change when they swap gear.

---

## R9. Stage mechanical distinctness (user mandate)

Each stage must create downstream consequences, not be a static card.

- **Scout** (pre-mission intel):
  - 1 henchman + 1 equipment.
  - Pass → reveals ONE random hidden modifier for stages 2/3 (e.g. "Guard
    rotation known: Approach gets +10"). Fail → the modifier applies against you.
  - Pass also unlocks LOW-risk Fast Escape.
- **Approach** (route choice):
  - 2 henchmen on a route (force/deception/finance/science).
  - Route choice persists into Escape risk calc (see R6).
  - Relationship bonus between the pair matters here (±5 per rel point).
  - Pass → one unused henchman stays off the roster for Breach but gets −15 stress.
- **Breach** (specialist moment):
  - Decider picks lead; Executive Override available.
  - Equipment synergy matters: tractor+science, hammer+force, etc, each +10 to DC.
  - Pass → unlocks mission reward multiplier bonus (+10% if Breach was clean).
  - Fail → mission aborts; stages 1-2 rewards still partial-pay (50%).
- **Escape** (R6).

Downstream state tracked in `MissionState.stageResults` + a new
`MissionState.carriedBonuses` dict (used by later stages to pull their modifiers).

---

## R10. Decider contract (unchanged routing, documented payload)

The payload shape in §11 is **final**. Backend `/api/decide` accepts
`stage: "breach"` and the extended fields. Non-breach stages do NOT call the
Decider — they use seeded dice only. This keeps live/offline parity honest:

- `provider:"decider"` → live Breach specialist pick
- `provider:"deterministic"` → offline Breach pick (highest `comp × trait × gear`)
- `provider:"override"` → player used Executive Override

Numerical outcomes are deterministic in all three cases given a fixed seed and
roster. Only which specialist leads differs.

---

## R11. v01 save data

User-approved: **ignore + hard-reset.** On first v2 load, `localStorage.evil-genius-v01`
is left alone (recoverable via git) but not read. v02 uses
`evil-genius-v02` and `evil-genius-player-v02`. Export/import blobs are
schema-tagged `"schema": "v02"`.
