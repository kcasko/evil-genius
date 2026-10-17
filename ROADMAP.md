# EVIL GENIUS — Prioritized Feature Roadmap

Derived from `GAME_VISION.md`. This file is the active task queue. If a
task is not here, do not build it yet. If a milestone is not current,
do not start it yet.

Legend: `[ ]` todo · `[~]` in progress · `[x]` done · `(C)` Codex-owned ·
`(K)` Claude Code-owned · `(H)` human-only (creds / deploy / recording).

---

## Milestone 0 — AWS hackathon MVP (CURRENT)

Hard gate: nothing from M1+ ships until every item here is done or
explicitly cut by the human.

### 0.1 Verification of what's already built
- [x] Three missions, four specialists, offline engine extracted and merged to `main`.
- [x] Strands Agent + Bedrock + Decider plumbing merged to `main`.
- [x] Full automated suite green on merged `main` (145 tests).

### 0.2 AWS-hosted live inference verification (BLOCKS submission)
Architecture and cost/security decisions are documented in `AWS_DEPLOYMENT_PLAN_V2.md`; the next execution gate is `AWS_PRIVATE_SMOKE_TEST.md`.
Planning is approved, but no quota change, paid inference, model download, deployment, or resource creation is authorized yet. Private V2 validation takes priority over 0.3 and 0.4.

- [x] (H) Approve `us-east-1` planning for the cost-optimized V2 path with a $5 initial testing target. This does not authorize resource creation; GPU EC2, always-on compute, and provisioned throughput are excluded.
- [x] (K) Verify the V2 offline candidate: 145 tests, `cfn-lint`, and read-only CloudFormation validation pass; Nova Lite profile and immutable model identifiers are documented.
- [ ] (H) At the next authorization gate, approve or reject the exact V2 resource list, expected charges, idle-billing behavior, and teardown plan.
- [x] (K) Add production configuration, strict API limits, health/readiness, visible Decider choice/confidence/probabilities, bounded fallback, and service-worker coverage without changing offline game arithmetic.
- [x] (K) Add reviewed infrastructure-as-code for AgentCore scale-to-zero, private S3 + CloudFront/OAC, least-privilege IAM, edge abuse controls, cost alerts/watchdog, and kill-switch procedures. Nothing has been deployed.
- [ ] (H + K) After separate resource-creation approval and no earlier than October 16, run a private test of 5 decisions, expanding to at most 10 only if configuration and meters remain expected; run at most 5 Nova Lite calls and capture raw schemas.
- [ ] (K) Record cold/warm latency, peak memory, 300-second idle transition, actual incremental cost, and unexpected billable resources. Stop and seek approval on anomalies; no GPU fallback is authorized.
- [ ] (K) Use the captured `ChoiceAnswer` JSON to resolve every `# TODO: verify against installed version` marker in `backend/agent.py`; strip the "UNVERIFIED" hedge from `README.md`.
- [ ] (K) Add one golden-response unit test under `backend/tests/` built from the real captured Decider response (so a schema regression breaks CI).

### 0.3 Dolores as NPC (minimum viable presence)
- [ ] (C) Add Dolores to `game/engine.js` as a non-selectable `NPC` entry (name, icon, title, voice tag), separate from the playable `CHARACTERS` array.
- [ ] (C) HQ sidebar renders Dolores under a `STAFF (NPC)` subheading beneath the four specialists; she has no "Assign to plan" button.
- [ ] (C) Add one HR intervention event: on any mission where `heat >= 85` at start, Dolores pre-empts with "mandatory meeting" — mission is delayed one day, heat drops by 10, no money cost, logged.
- [ ] (C) Add tests for the intervention: fires at threshold, does not fire below threshold, does not consume budget, advances the day exactly once.

### 0.4 Writing-principles alignment on existing text
- [ ] (C) Pass over existing mission `win` / `lose` strings in `game/engine.js` against §3 of `GAME_VISION.md`; rewrite any line that is a random joke rather than a character-and-consequence joke. Do not alter mission math.
- [ ] (K) Pass over the Bedrock narration system prompt in `backend/agent.py` so it enforces: two sentences, no modern-world brand/celeb/politics/TV-show references, fictional comedy framing explicit, character voice tag honored.

### 0.5 Submission artifacts
- [x] (H) Push merged `main` to `kcasko/evil-genius` on GitHub (public).
- [ ] (H + K) After explicit resource-creation approval, execute the private AgentCore V2 smoke test documented in `AWS_PRIVATE_SMOKE_TEST.md`; do not deploy GPU EC2.
- [~] (H) Finalize the prepared Builder Center article after measured private results replace every `[NOT MEASURED]` field.
- [ ] (H) Record a short demo showing one authorized AWS-hosted mission turn, Bedrock narration, and offline fallback without implying public launch.
- [ ] (H) Execute and verify the documented shutdown procedure, then submit.

### 0.6 Exit criteria for M0
All of 0.1 – 0.5 complete. Live inference proven by captured responses, not by claims. Offline play still works. Tests still green.

---

## Milestone 1 — Mockumentary layer (NEXT, do not start before M0 exits)

### 1.1 Confessional Booth v0
- [ ] (C) Engine-side trigger: on mission resolve (win or fail), pick the involved specialist, build a `confessional_context` object (mission, plan, outcome, henchman memory tail).
- [ ] (K) New Bedrock tool `confessional(henchman, context)` returning 2–4 sentences in that character's voice, under the §3 rules. Length-capped, filtered.
- [ ] (C) Frontend modal: direct-to-camera framing, name card, two to four generated lines, "next" / "skip" controls. Confessionals never mutate state.
- [ ] (K) Tests: mocked Bedrock returns valid shapes, oversize responses are truncated, voice tag is passed into the prompt.

### 1.2 Character voice tuning
- [ ] (K) Add per-character `voice_prompt` strings matching §2 (Malpractice: dry/elaborate; Boris: short/literal; CHAOS-9000: metric-obsessed; Kevin: anxious/over-qualified; Dolores: deadpan/HR-speak).
- [ ] (K) Golden tests on prompts (not outputs): assert each voice tag is included when the corresponding henchman is involved.

### 1.3 Dolores scripted cameo
- [ ] (C) Dolores gets exactly one scripted (non-Bedrock) confessional line that fires after her HR intervention event lands. Still NPC-only.

### 1.4 Persistent memory v0
- [ ] (C) Per-henchman event log: last 5 structured events (`{day, mission, plan, outcome, delta_loyalty}`), persisted to `localStorage`.
- [ ] (K) Bedrock confessional prompt is fed the current henchman's memory tail.
- [ ] (C) Tests: memory ring truncates to 5, survives serialize/deserialize, is not mutated by read.

---

## Milestone 2 — Organizational systems

### 2.1 Office Politics v0
- [ ] (C) `relationships[a][b] = {kind, strength}` where kind ∈ {friend, rival, grudge, mentor, mentee, awkward}. Deterministic rules change kind/strength on mission events (e.g. coordination penalty → +grudge).
- [ ] (C) Relationship modifies loyalty swings during resolution.
- [ ] (C) Henchmen tab renders the relationship graph.
- [ ] (C) Tests: specific event sequences produce specific relationship transitions.

### 2.2 Blame Reports
- [ ] (C) On mission failure, generate a `blame_report` object: involved henchmen, each with a stance ("not me", "it was X", "I warned them").
- [ ] (K) Bedrock renders each stance as one in-character testimony sentence.
- [ ] (C) Player picks the scapegoat; engine applies loyalty consequences; Dolores files it to a persistent `hr_file` log.
- [ ] (C) Tests: picking scapegoat mutates loyalty correctly, exoneration bonus applied, hr_file grows.

### 2.3 Performance Reviews
- [ ] (C) Trigger every 5 missions. Pulls real per-henchman stats (attempts, success rate, financial impact, blame count).
- [ ] (K) Bedrock renders Dolores's HR-speak summary per employee.
- [ ] (C) Player chooses promote / PIP / no-action per employee; each has a persistent loyalty + relationship effect.

### 2.4 Persistent memory v1
- [ ] (C) Expand memory from a 5-event ring to a structured log with event types (`mission_success`, `mission_fail`, `blame_assigned`, `promotion`, `pip`, `insult`). Used by both Performance Reviews and future Emergent Disasters.

---

## Milestone 3 — Emergent disasters & Dolores unlock

- [ ] (C) Decision-pattern combinator: engine inspects recent decisions across henchmen and triggers a named emergent disaster when a specific pattern aligns (e.g. "Boris=assertive AND CHAOS=throughput AND Kevin=minimize-cost → `accidental_unionization`").
- [ ] (K) Bedrock narrates each named emergent disaster from a prompt scoped to the specific pattern.
- [ ] (C) Dolores becomes a playable specialist. Add her plans: "Mandatory Training", "Policy Memo", "Reorganization".
- [ ] (C) Three-mission arc structure with cross-mission consequences (one failure in M3 arc shapes a modifier in M3+1 and M3+2).

---

## Milestone 4 — Polish, replayability, content

- [ ] (C) Second mission trilogy (three new missions, three plans each, same quality bar as the original trilogy).
- [ ] (K) Second meaningful-decision Decider use case (rival targeting or plan recommendation).
- [ ] (C) Save slot management + difficulty tuning.
- [ ] (C) Achievement wall grounded in real play history.

---

## Working agreement

- Pick tasks only from the **current milestone**. Do not open an M2 task
  while M0 is unfinished.
- Each task has a single owner tag (C / K / H). An agent should refuse
  to touch another owner's tasks; the orchestrator reassigns if needed.
- Every code task MUST include its tests in the same commit.
- Every task completion message MUST include the real test output, not
  "all green" claims.
- No `git push`, no `git merge`, no deploy without the human's approval.
