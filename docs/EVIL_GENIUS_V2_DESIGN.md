# EVIL GENIUS v2 — Gameplay Systems Design

Vertical-slice spec for the overhauled Evil Genius: World Domination Pending.
Target: 15–20 min playthrough of Steal the Moon with HQ management, four
interacting henchmen, crisis chains, equipment, and persistent consequences.

Status: **draft for approval**. No code written against this yet.

---

## 1. Scope decisions (please confirm or override)

| Decision | Default | Why |
|---|---|---|
| Replace existing gameplay (not add alongside) | **Replace** | Brief says "rework the underlying gameplay loop." |
| Preserve existing save data | **No; new schema `evil-genius-v02`, old `v01` ignored** | v01 state can't express v02 mechanics. |
| UI framework | **Keep vanilla DOM, zero deps** | Current app is one HTML file; keep that. |
| Vertical slice missions | **Steal the Moon only; Mondays & Coffee stubbed** | Brief scope. |
| Decider role | **Per-stage specialist routing (unchanged pattern)** | Preserve the real inference win from Phase 3. |
| AWS / Bedrock | **Untouched** | Cost restriction holds. |

---

## 2. Core loop

```
┌─────────── Day N ───────────────────────────────────────────────┐
│  Dawn tick:  resources accrue, stress ticks, crisis roll         │
│  HQ phase:   spend Command Points on build/research/HR           │
│  Plan phase: optional — pick mission, assign henchmen + equipment│
│  Execute:    4-stage interactive mission (if planned)            │
│  Fallout:    outcomes land, log entries, next crisis seeded      │
└──────────────────────────────────────────────────────────────────┘
```

Every phase feeds the next. HQ decisions change available henchmen/equipment.
Mission outcomes change money/heat/stress/relationships which seed tomorrow's
crisis. Crises consume Command Points, cutting next-day HQ options.

---

## 3. Resources & action economy

| Resource | Range | Source | Sink |
|---|---|---|---|
| Command Points (CP) | 0–2/day, resets dawn | — | Build (1-2), Research (1), Resolve crisis (1), Executive Override (2) |
| Money ($) | 0–∞ | Mission reward, Finance henchman passive | Build, upgrade, equipment, crisis bribes |
| Heat (%) | 0–100 | Loud missions, failed cover-ups | Vault upgrade, Finance passive, Deception missions |
| Infamy | 0–∞ | Successful missions, celebrity events | — (score) |
| Morale | 0–100 | Rec Room, light missions | Overwork, firing henchmen |
| Research Points (RP) | 0–∞ | Lab (+1/day), Server Room (+2/day) | Unlock equipment & upgrades |
| Stress (per henchman) | 0–100 | Mission difficulty, trait mismatch | Rec Room, First Aid, days off |

Hard caps: Heat >= 100 → lair raided (defeat). Money < 0 for 2 consecutive
days → bankrupt (defeat). Any henchman stress = 100 → forced crisis.

---

## 4. Henchmen (4) — traits, stats, relationships

Each henchman: `competence 1–10`, `loyalty 0–100`, `stress 0–100`, fixed `trait`.
Trait = one strong bonus + one systemic cost that creates emergent play.

| ID | Name | Core skill | Trait |
|---|---|---|---|
| mal | Dr. Malpractice | science | **Mad Scientist** — ×1.4 on science rolls; +15 stress per non-science assignment; unlocks Lab tech faster. |
| boris | Boris the Brute | force | **Blunt Instrument** — ×1.4 on force rolls; immune to stress; ×0.6 on deception; breaks one random equipment per 5 missions. |
| chaos | CHAOS-9000 | deception | **Logical Fault** — ×1.4 on deception; needs $50/day in server upkeep or competence drops 1/day (recoverable). |
| kevin | Kevin from Accounting | finance | **Spreadsheet Zealot** — ×1.4 on finance; passive +$30/day; files one HR complaint per week (consumes 1 CP of Dolores time). |

**Relationships** (pairwise, −2 … +2): modifier applied when two henchmen are
on the same mission. Starts:

```
mal↔boris: -1 (muscle disrespects science)
mal↔chaos: +2 (fellow nerds)
mal↔kevin:  0
boris↔chaos: -2 (Boris mistrusts the robot)
boris↔kevin: +1 (both practical)
chaos↔kevin: 0
```

Relationships shift ±1 after shared missions (success +, failure −).
Multi-henchman missions add `+5*rel` to roll modifier.

**Stress** rises per mission (+10 base, +15 off-trait); falls in Rec Room
(−5/day present), with First Aid (−20), or with a Day Off action (consumes 1
CP, −30 stress for one henchman but no money earned).

---

## 5. Equipment (8 total; 3 unlockable)

Each mission loadout = **up to 2 equipment**. Slots are limited; choices tradeoff.

| ID | Name | Effect | Unlock |
|---|---|---|---|
| tractor | Tractor Prototype | +30% on science, +10 heat on use | Start |
| hammer | Boris's Big Hammer | +30% on force, +3 infamy on success | Start |
| deepfake | Deepfake Rig | +30% on deception, −5 morale/use | Start |
| ledger | Shell Company Ledger | +30% on finance, −3 heat on success | Start |
| smokescreen | Smoke Grenade | 50% chance to abort a failing stage (costs $100) | 3 RP |
| rabbit | Lucky Rabbit's Foot | reroll one die/mission; 20% breaks per use | 2 RP |
| emp | EMP Pulse | cancels next crisis | 4 RP |
| aid | First Aid Kit | all assigned henchmen −20 stress on mission end | 2 RP |

Breakage: a broken Hammer is useless until Lab repairs it (1 CP + $75).

---

## 6. Headquarters (base + 5 upgrades)

Lair exists day 1. Upgrades cost money + CP + build time. Build time blocks
further construction in that slot.

| ID | Cost | CP | Days | Effect |
|---|---|---|---|---|
| server_room | $250 | 1 | 1 | +2 RP/day; CHAOS upkeep auto-paid; enables emp |
| rec_room | $150 | 1 | 1 | −5 stress/day to all henchmen |
| vault | $300 | 2 | 2 | holds surplus money (immune to Theft crisis); −3 heat/day |
| lab | $200 | 1 | 2 | +1 RP/day; repairs broken equipment; +25% Mal competence |
| hr_desk | $100 | 1 | 1 | Dolores NPC active: handles Kevin's HR complaints automatically |

---

## 7. Steal the Moon — four stages

Progress is explicit. Each stage shows **current risk estimate**, chosen
henchmen, chosen equipment, and (if Decider is live) the AI's recommended
specialist with confidence.

| Stage | Mechanic | Choice | Fail state |
|---|---|---|---|
| **1. Scout** | Pick 1 henchman + 1 equipment. Hidden roll vs DC 40. | which henchman / which gear | if fail: +15 heat, stage 2 enters at +10 difficulty |
| **2. Approach** | Pick route: **Rooftop (force), Sewer (deception), Front Door (finance), Lab Infiltration (science).** 2 henchmen assigned. | route + pair of henchmen | if fail: 1 henchman +25 stress, stage 3 risk +15 |
| **3. Breach** | Decider or deterministic picks the lead specialist from the assigned pair + their equipment. Roll vs DC = 60 − modifiers. | **Executive Override available (2 CP, lock a specific henchman, +20 stress)** | if fail: mission aborts; moon unstolen; heat +20 |
| **4. Escape** | Time-pressure: pick 1 of 3 escape plans in 10 s or auto-pick worst. | Fast / Clever / Loud | success → reward paid; loud → +infamy +5, +heat +10 |

Stage DCs scale with Heat (+1 DC per 10 heat over 50). Stage modifiers:
- +henchman competence × trait × equipment synergy
- +relationship bonus if 2 henchmen on stage 2
- −stress/4 (burned-out henchmen fumble)
- +1d20 seeded die

Mission success: all four stages passed. Partial: stages 1-2 pass, stage 3
fails → 50% reward, 50% heat. Any stage can be exited with Smoke Grenade.

---

## 8. Crisis events (12 — brief wants ≥10)

Rolled at dawn. Weighted by current state (high heat → investigator chains;
low morale → HR chains). Resolution options always visible with risk tags.

| ID | Trigger | Options |
|---|---|---|
| C1 Boris Punched Something | boris stress ≥50 | Pay repair $75 / Ignore (−5 morale) |
| C2 CHAOS Firmware Rollback | server upkeep missed | Patch (1 CP) / Delay (−2 chaos competence 2 days) |
| C3 Kevin's Audit Letter | heat ≥40 | Finance CP spend / Ignore (−$100) |
| C4 Mal's Experiment Explodes | mal stress ≥60 | Rebuild Lab ($100) / Lose Lab 3 days |
| C5 Mandatory HR Meeting | heat ≥70 | Attend (1 CP, −10 heat) / Skip (henchman quits risk) |
| C6 Journalist Snooping | heat ≥50 | Bribe $100 / Ignore (+15 heat) / Deepfake (deception roll) |
| C7 Henchman Union Grievance | morale ≤40 | Resolve 1 CP / Lose 1 henchman-day |
| C8 Rival Villain Taunt | infamy stall (3 days no mission) | Respond (next mission +5 DC) / Ignore (infamy −5) |
| C9 Equipment Theft | heat ≥60 and no Vault | Lose 1 equipment / Spend $150 to recover |
| C10 Celebrity Visits Lair | infamy ≥25 | Welcome (+infamy +5, +heat +10) / Expel (−5 morale) |
| C11 Server Melt | server room queue overloaded | Reboot (CHAOS offline 1 day) / Replace $200 |
| C12 Media Love Letter | mission success streak ≥2 | Accept (+morale, +infamy) / Deflect (−infamy, +loyalty) |

Each crisis takes a card slot in the HQ view; dismissing one costs 1 CP OR
the "ignore" penalty. Crisis chains: C1→C7 (Boris's rage lowers morale which
triggers Union), C9→C3 (theft creates audit paper trail). Chains documented
in `game/v2/crises.js`.

---

## 9. Deterministic seeded RNG

```
rng = mulberry32(hash(player_id + day + mission_id + stage))
```

Same inputs always produce the same outcomes → every playthrough replayable
from a seed string, every test deterministic. The engine exposes `rollD20()`,
`rollPercent()`, `pickWeighted(items, weights)` — all backed by `rng`.

Decider output is **not** fed into RNG; it only steers specialist selection.
Narration (Bedrock) is purely cosmetic (as current).

---

## 10. Save / load / replay

`localStorage['evil-genius-v02']` stores the whole state tree. Evil Records tab
grows two buttons:
- **Export** → JSON blob to clipboard
- **Import** → paste blob, replace state

Seed is part of state → importing a save lets another machine reproduce the
exact same crisis rolls. Debug-only: `?seed=XYZ` URL param forces initial seed.

---

## 11. Decider integration (unchanged pattern, new payload shape)

Per Stage 3 Breach, the client POSTs:

```json
{
  "mission": "moon",
  "stage": "breach",
  "available_tools": ["science","force","deception","finance"],
  "assigned_henchmen": [{"id":"mal","competence":7,"stress":30,"trait":"mad_scientist"}, ...],
  "equipment": ["tractor","smokescreen"],
  "heat": 42, "morale": 65,
  "recent_events": ["day2:scout_pass","day3:approach_fail"],
  "player_id": "..."
}
```

Backend already forwards to `/v1/systemone`. Decider picks a tool; the engine
picks the assigned henchman whose core skill matches, OR applies a
coordination penalty if the Decider pick doesn't match any assigned henchman.
Executive Override bypasses Decider entirely and logs `provider:"override"`.

Deterministic fallback: pick the assigned henchman with the highest
(competence × trait bonus × equipment synergy). Game remains fully playable.

---

## 12. Game-state schema (TypeScript-ish for clarity)

```ts
type GameState = {
  schema: "v02",
  seed: string,         // player id + run id
  day: number,
  cp: number,           // Command Points remaining today
  money: number,
  heat: number,
  infamy: number,
  morale: number,
  research: number,
  henchmen: Record<HenchId, Henchman>,
  relationships: Record<`${HenchId}:${HenchId}`, number>, // -2..+2
  equipment: EquipId[],         // owned
  equipmentBroken: EquipId[],
  buildings: BuildId[],         // built
  buildQueue: {id:BuildId, daysLeft:number}[],
  crises: Crisis[],             // active cards
  missions: Record<MissionId, MissionState>,
  log: string[],
  outcome: "running"|"victory"|"defeat_heat"|"defeat_bankrupt"|"defeat_abandoned",
};
type Henchman = { id, competence, stress, loyalty };
type MissionState = {
  id, stage: "idle"|"scout"|"approach"|"breach"|"escape"|"done",
  assigned: HenchId[],
  loadout: EquipId[],
  deciderPick?: {tool, confidence, provider},
  stageResults: Array<{stage,outcome,roll,dc,modifiers}>,
};
```

---

## 13. Victory / defeat

- **Victory:** Steal the Moon stages 1-4 all pass **and** Infamy ≥ 50.
- **Defeats:**
  - Heat 100 → "Lair raided."
  - Money < 0 for 2 consecutive days → "Bankrupt. Kevin filed personally."
  - All henchmen quit (loyalty 0 or stress 100 twice) → "Nobody left to menace."

End-screen shows seed + final state blob for replay sharing.

---

## 14. Vertical slice checklist (first milestone)

- [x] HQ view with CP, resources, stress bars, crisis cards, build queue
- [x] Day advance button (consumes remaining CP or ends day cleanly)
- [x] 4 henchmen with traits/stress/loyalty/relationships
- [x] 6 equipment items (3 unlockable via RP)
- [x] 3 HQ upgrades (Server Room, Rec Room, Vault) + Lab + HR Desk
- [x] 10+ crisis events (12 above)
- [x] Steal the Moon playable with 4 stages
- [x] Save/load, export/import, URL seed
- [x] Decider per Breach stage; deterministic fallback kept
- [x] Executive Override (2 CP, logged separately)
- [x] Victory/defeat screens
- [x] Keyboard a11y preserved (dialog Escape, focus on open)
- [x] Mobile ≤650 px layout preserved

---

## 15. Files touched (plan)

New:
- `game/v2/engine.js` — state machine, resolvers, RNG, mission steps
- `game/v2/crises.js` — crisis definitions + chain graph
- `game/v2/content.js` — henchmen, equipment, buildings, missions static data
- `game/v2/save.js` — v01 → v02 reset, export/import
- `tests/v2_engine.test.mjs` — deterministic playthrough + crisis + save round-trip
- `tests/v2_mission_moon.test.mjs` — full 4-stage replay from seed

Changed:
- `index.html` — rebuilt UI shell (keep existing CSS tokens + a11y patterns)
- `game/aiClient.js` — payload shape bumped (`stage`, `assigned_henchmen`)
- `backend/agent.py` — accept new payload (fields optional for back-compat)

Untouched:
- `backend/server.py` (bridge mechanics)
- `backend/scripts/verify_live.py`
- `game/engine.js` (kept for v01 compat, deleted at end of slice)

---

## 16. Honest implementation estimate

Working alone in this session:
- Engine + content + crises: **~500–700 LoC JS**, 2–3 h focused coding
- UI rebuild (HQ view, mission multi-stage dialog, crisis cards): **~800–1200 LoC**, 3–5 h
- Tests (node):**~300 LoC**, 1 h
- Playtest + polish: **1–2 h**

Total: **7–11 hours of focused work**. One agent context will not fit this
plus every regression test unchanged — I'll either need to:

A. Burn through it in this context, accept the risk of running out mid-build.
B. Delegate non-overlapping chunks per the brief's workflow step 3:
   - **Codex** → UI rebuild (`index.html` + HQ view + mission multi-stage dialog)
   - **Claude Code** → `game/v2/engine.js` + `crises.js` + `content.js`
   - **OpenCode** → tests (`tests/v2_*.test.mjs`) + regression pass on existing suite
   - **AGY** → visual/usability pass once the HTML is up
   - **Hermes (me)** → spec gatekeeping, integration merge, final playtest

Option B is riskier (merge conflicts) but delivers the slice faster and tracks the brief literally. Option A is safer but slower (and more likely to run out of context).

My recommendation: **Option B with isolated git worktrees per child.** Each child
works in its own worktree branch (`v2-engine`, `v2-ui`, `v2-tests`), merges to
`v2-integration` in sequence, I verify the final build and open a local PR
against `main`.

---

## 17. Risks / open questions

- Vanilla DOM with ~1200 lines of UI logic will push the single-file HTML past
  readability. Proposal: split `game/v2/ui/*.js` modules loaded via classic
  `<script>` tags (same pattern as existing codebase). No bundler.
- Decider payload bump is a backward-compatible superset; backend already
  ignores unknown fields. Confirming with a unit test before shipping.
- 10 s escape timer is a UX gamble — if it feels unfair, replace with "pick
  before CP tick."
- Equipment breakage might feel punishing in a 20-min slice. Will dial 
  Boris's break rate down to 1-in-10 if playtest shows it.

---

## 18. What I need from you before writing code

Just a yes/no on:

1. **Scope decisions in §1** — accept, or want changes?
2. **Option A (I build it inline) vs Option B (delegate to Codex + Claude Code + OpenCode in worktrees, I integrate)?**
3. **Any mechanic in §4-§8 to cut, add, or swap?** (This is the design surface — easier to change now than mid-build.)

Nothing lands on disk until you say go.
