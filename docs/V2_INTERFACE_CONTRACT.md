# V2 Engine ↔ UI ↔ AI Interface Contract

Authoritative module boundaries for the v2 vertical slice. All agents MUST
code to this contract. Any deviation requires updating this file first.

Owners:
- **Engine / content / crises / state / save** (`game/v2/*.js`, except UI) — Claude Code
- **UI / HQ view / mission dialog / crisis cards / a11y** (`index.html`,
  `game/v2/ui/*.js`) — Codex
- **Tests + review** (`tests/v2_*.test.mjs`, regression pass) — OpenCode
- **Visual/UX/a11y pass** (post-functional) — AGY
- **Contract, integration, playtest, final report** — Hermes (orchestrator)

Rule: nobody edits another owner's files without a contract update. Shared
file (`index.html`) is Codex-owned; engine agents MUST NOT touch it.

---

## 1. File layout (new)

```
game/v2/
  content.js      # static data: henchmen, equipment, buildings, missions, crisis defs, STAGE_DCS
  rng.js          # mulberry32 + hash32 + scoped generators (R3)
  engine.js       # state transitions: dawn tick, HQ actions, mission stages, crisis resolution
  crises.js       # crisis rolls, chain graph, resolve helpers
  save.js         # localStorage v02 key, export/import, migration (ignore v01)
  ui/
    hq.js         # HQ view render + handlers
    mission.js    # 4-stage mission dialog
    crisis.js     # crisis card modal
    common.js     # shared DOM helpers (esc, dialog shell, focus trap)
index.html        # UI shell (Codex owns, loads game/v2/*.js in order)
backend/agent.py  # payload bump (optional stage, assigned_henchmen fields; back-compat)
tests/v2_engine.test.mjs
tests/v2_mission_moon.test.mjs
tests/v2_crises.test.mjs
tests/v2_save.test.mjs
tests/v2_simulation.test.mjs   # 1000-seed Monte-Carlo for R8 win rate targets
tests/v2_ui_smoke.test.mjs     # jsdom smoke test on HQ + mission flow
```

Load order in `index.html`:
```html
<script src="/game/v2/rng.js"></script>
<script src="/game/v2/content.js"></script>
<script src="/game/v2/crises.js"></script>
<script src="/game/v2/engine.js"></script>
<script src="/game/v2/save.js"></script>
<script src="/game/aiClient.js"></script>   <!-- reused from v1 -->
<script src="/game/aiStatus.js"></script>   <!-- reused from v1 -->
<script src="/game/coldStartUx.js"></script>
<script src="/game/v2/ui/common.js"></script>
<script src="/game/v2/ui/crisis.js"></script>
<script src="/game/v2/ui/mission.js"></script>
<script src="/game/v2/ui/hq.js"></script>
```

v1 `game/engine.js` is NOT loaded. Left in tree until end of slice for git recovery.

---

## 2. Public engine API (`game/v2/engine.js`)

Every function is **pure** on `state`: takes a state, returns a NEW state +
events. UI never mutates state directly. All exposed on
`window.EvilGeniusV2Engine` and `module.exports`.

```ts
// Fresh game
createFreshGame(opts?: { seed?: string, playerId?: string }): GameState

// Phase transitions
dawnTick(state): { state, events, newCrises }
spendCommandPoint(state, action: Action): { state, events, error? }
startMission(state, missionId: string, loadout: { henchmen: string[], equipment: string[] }): { state, error? }

// Mission stage machine. Each returns an updated state + outcome summary.
// Scout and Approach take a choice; Breach takes a specialist decision from
// aiClient (or null for deterministic); Escape takes a plan id.
resolveScout(state, missionId, choice: { henchman: string, equipment: string }): StageResult
resolveApproach(state, missionId, choice: { route: 'rooftop'|'sewer'|'front'|'lab', henchmen: [string,string] }): StageResult
resolveBreach(state, missionId, deciderResponse: DeciderResponse | null, override?: { henchman: string }): StageResult
resolveEscape(state, missionId, plan: 'fast'|'clever'|'loud'): StageResult

// Crisis resolution (choice id comes from crisis definition in content.js)
resolveCrisis(state, crisisId: string, choiceId: string): { state, events, error? }

// Risk display helpers (never surface raw % to UI — give the bucket + bar segments)
riskBucket(probability: number): 'HIGH'|'RISKY'|'FAVORABLE'|'STRONG'
riskBarSegments(probability: number): number  // 0-10

// Carried-bonus accessors (used by UI to show reasoning strings for Escape risk)
describeStageRisk(state, missionId, stage): { probability: number, bucket: string, reasons: string[] }

// Victory/defeat check — called after each state mutation
checkOutcome(state): 'running'|'victory'|'partial_victory'|'defeat_heat'|'defeat_bankrupt'|'defeat_abandoned'
```

### Action type (for spendCommandPoint)
```ts
type Action =
  | { kind: 'build',    building: string }
  | { kind: 'research', equipment: string }
  | { kind: 'repair',   equipment: string }
  | { kind: 'dayoff',   henchman: string }
  | { kind: 'dismiss_crisis', crisisId: string, choiceId: string }
  | { kind: 'end_day' }   // consumes remaining CP, triggers dawn-tick next
```

### StageResult
```ts
{
  state: GameState,
  pass: boolean,
  stage: 'scout'|'approach'|'breach'|'escape',
  roll: number,         // raw 1-100
  dc: number,           // threshold
  modifiers: Array<{ label: string, value: number }>,
  story: string,        // deterministic flavor
  events: string[],     // log entries to show
  carriedBonuses?: Record<string,number>,   // for next-stage display
  provider?: 'decider'|'deterministic'|'override'   // breach only
}
```

### DeciderResponse (from aiClient.decide)
```ts
{ provider: 'decider', choice: 'science'|'force'|'deception'|'finance', confidence: number } |
{ fallback: true, reason: string }
```

---

## 3. GameState schema (final)

```ts
type GameState = {
  schema: 'v02',
  seed: string,
  playerId: string,
  runId: string,
  day: number,
  cp: number,
  money: number,
  heat: number,
  infamy: number,
  morale: number,
  research: number,
  henchmen: {
    mal:   { competence: number, stress: number, loyalty: number },
    boris: { competence: number, stress: number, rage: number, loyalty: number },
    chaos: { competence: number, stress: number, loyalty: number, upkeepPaid: boolean },
    kevin: { competence: number, stress: number, loyalty: number },
  },
  relationships: {
    'mal:boris': number,  'mal:chaos': number,  'mal:kevin': number,
    'boris:chaos': number, 'boris:kevin': number, 'chaos:kevin': number,
  },
  equipment: string[],              // owned
  equipmentBroken: string[],
  equipmentUnlocked: string[],      // researched but not yet in loadouts
  buildings: string[],              // built
  buildQueue: Array<{ id: string, daysLeft: number }>,
  crises: Array<{ id: string, appearedDay: number, pendingChoice?: string }>,
  pendingChains: Array<{ child: string, dueDay: number }>,
  missions: {
    moon: {
      stage: 'idle'|'scout'|'approach'|'breach'|'escape'|'done',
      status: 'pending'|'in_progress'|'success'|'partial'|'failed'|'failed_escape',
      assigned: string[],
      loadout: string[],
      stageResults: StageResult[],
      carriedBonuses: Record<string, number>,
      attemptCounters: Record<string, number>,  // for RNG scope distinctness
    },
  },
  bankruptcyCounter: number,        // consecutive days money<0
  log: string[],
  outcome: 'running'|'victory'|'partial_victory'|'defeat_heat'|'defeat_bankrupt'|'defeat_abandoned',
}
```

Starting values (`createFreshGame`): day=1, cp=2, money=600, heat=8, infamy=5,
morale=70, research=0, competence (mal=7, boris=8, chaos=7, kevin=6),
all stress 0, boris.rage 0, loyalty from v1 (`mal:66, boris:83, chaos:52, kevin:94`),
no equipment, no buildings.

---

## 4. UI API (`game/v2/ui/*.js`)

UI calls engine functions, re-renders. UI does NOT mutate state. UI persists
by calling `EvilGeniusV2Save.save(state)` after each engine call that returned
a new state.

Exposed globals:
- `EvilGeniusV2UIHQ.render(state, bus)` — HQ tab (resources, henchmen stress
  bars, crisis cards, build queue, mission panel, day-advance button).
- `EvilGeniusV2UIMission.open(state, missionId, bus)` — opens 4-stage modal.
- `EvilGeniusV2UICrisis.open(state, crisisId, bus)` — opens a crisis card modal.

`bus` is an event-emitter the UI pushes commands onto, and the shell listens:
- `bus.emit('action', Action)` → shell calls `engine.spendCommandPoint`, saves, re-renders.
- `bus.emit('mission:start', { missionId, loadout })` → shell calls `startMission`.
- `bus.emit('mission:stage', { missionId, stage, payload })` → shell calls
  `resolve<Stage>`, saves, pushes next stage.
- `bus.emit('crisis:resolve', { crisisId, choiceId })` → shell calls `resolveCrisis`.

### A11y requirements (hard):
- Every dialog has `role=dialog aria-modal=true`, focus traps, Escape closes
  (except final mission result which requires an acknowledge click).
- Risk bars have `role=progressbar` + `aria-valuetext="HIGH RISK"` etc.
- Henchman stress bars + resource meters: `aria-valuenow/valuemin/valuemax`.
- Mobile ≤650 px: single-column; mission modal fills viewport.
- Keyboard: all actions reachable via Tab + Enter + arrow keys where lists exist.
- `prefers-reduced-motion`: no pulse animations.

---

## 5. Save API (`game/v2/save.js`)

```ts
EvilGeniusV2Save = {
  KEY: 'evil-genius-v02',
  PLAYER_KEY: 'evil-genius-player-v02',
  load(): GameState | null,
  save(state: GameState): void,
  exportJSON(state): string,
  importJSON(blob: string): GameState,   // throws on schema mismatch
  reset(playerId?: string): GameState,
}
```

On schema mismatch: throw `new Error('Save schema mismatch: expected v02, got <X>')`.

---

## 6. AI client — unchanged module, extended payload at Breach only

`aiClient.decide({...})` continues to post to `/api/decide`. Breach payload adds:
`stage: "breach"`, `assigned_henchmen: [...]`, `equipment: [...]`,
`heat`, `morale`, `recent_events`. Backend ignores unknown fields.
`aiClient.narrate({...})` unchanged. Narration remains cosmetic.

---

## 7. Contract tests (OpenCode must implement + run)

File: `tests/v2_contract.test.mjs`. Must verify:

1. `createFreshGame()` returns a valid `GameState` matching schema shape.
2. All 4 `resolve<Stage>` functions return a `StageResult` with `pass:boolean, roll, dc, modifiers, story, events`.
3. `riskBucket(0.2)==='HIGH'`, `riskBucket(0.5)==='RISKY'`, `riskBucket(0.65)==='FAVORABLE'`, `riskBucket(0.8)==='STRONG'`.
4. `checkOutcome` for a fresh state returns `'running'`.
5. Save round-trip: `importJSON(exportJSON(s))` deep-equals `s`.
6. Seeded replay: two games created with the same seed+playerId, driven by the
   same action sequence, produce identical final `GameState` (compared via JSON).
7. Executive Override at Breach with cp<2 and infamy>=10 succeeds and deducts
   infamy 10 (per R2); with cp<2 and infamy<10 fails with a clear error.
8. Boris's rage not stress: after a mission `boris.stress===0 && boris.rage>0`.
9. R6: Escape has no setTimeout anywhere in engine or UI mission module.
10. All UI event-bus actions map to a defined engine function (no orphans).

---

## 8. Ownership boundaries — what each agent MUST NOT touch

- Claude Code (engine): must not touch `index.html`, `game/v2/ui/*`, `tests/*`,
  `backend/*` except the single `agent.py` payload bump (optional fields only).
- Codex (UI): must not touch `game/v2/engine.js|crises.js|content.js|rng.js|save.js`,
  `tests/*`, `backend/*`. Codex only reads engine API as described here.
- OpenCode (tests): writes `tests/v2_*.test.mjs` only. Does not modify engine
  or UI code. If a test fails, OpenCode files a clear bug in `V2_QA_FINDINGS.md`
  for the owner to fix.
- AGY (visual review): read-only. Produces `V2_AGY_REPORT.md`.
- Hermes: owns `docs/V2_SPEC_RESOLUTIONS.md`, `docs/V2_INTERFACE_CONTRACT.md`,
  integration branch merges, playtest, final report.

---

## 9. Local dev loop

Backend serves `game/v2/*.js` at `/game/v2/*`. Start:
```
cd backend && python server.py --port 8787
```
Browser: `http://127.0.0.1:8787/`.

Node test suite:
```
node --test tests/
```

A11y + mobile layout: Chromium DevTools device toolbar (user runs this manually
via AGY review).

---

## 10. Non-goals (v2 slice)

- Mondays and Coffee missions remain stubbed (data in content.js, UI shows
  "COMING SOON" card, no launch button).
- No bundler, no framework, no new runtime deps.
- No AWS resource creation, deployment, Bedrock paid calls, GPU EC2, or model
  weight downloads. All AI stays through the existing `/api/*` proxy, which
  can go offline → deterministic path kicks in.
- No save migration from v01 (user approved).
