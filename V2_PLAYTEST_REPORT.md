# EVIL GENIUS V2 — Playtest Report

**Playtester:** Claude (QA / design critic persona)
**Repo:** `D:\Repos\evil-genius-v2`
**Branch:** `v2/integration` · HEAD at playtest start: `abef904`
**Build URL:** `http://127.0.0.1:8791/`
**Date:** 2026-10-16
**Methodology:** Real-browser play via Chrome DevTools MCP against the live server. All stat/state values quoted were read from the DOM or localStorage at the time of play. Engine-layer simulations are called out explicitly and used only to isolate root causes after bugs were observed in the UI.

> **Screenshots:** the chrome-devtools MCP screenshot sink rejected every save path I tried (`workspace root` restriction). I captured DOM text snapshots at every stage instead; they appear inline. Every quoted value is from `document.body.innerText` or `localStorage.getItem('evil-genius-v02')` at that moment. Nothing is reconstructed from memory.

---

## 1. Campaigns played

| # | Seed | Strategy | Outcome | Days | Session | Final heat / infamy / money |
|---|------|----------|---------|------|---------|-----------------------------|
| 1 | `playtest-c1-firsttime` | "Natural" first-timer: build Lab + Rec Room, launch mid-prepped, 3 henchmen | **DEFEAT** (heat=100) | 5 | ~6 min | heat 100 / infamy 5 / $450 |
| 2 | `playtest-c2-poordecisions` | Day 1 launch, Kevin+Mal, zero gear, zero prep | **VICTORY** (!) | 1 | ~2 min | heat 26 / infamy 29 / $1018 |
| 3 | `playtest-c3-optimized` | Lab + Rec Room, 4-henchman roster, both relevant gear | **VICTORY** | 4 | ~4 min | heat 66 / infamy 40 / $608 |
| 4 | `playtest-p3-interaction` | Interaction stress tests | n/a | n/a | ~5 min | — |
| 5 | `playtest-crisis` | Force crisis cadence after a failed mission | **stuck in dead air** | 11 w/o incident | ~3 min | heat 28 / infamy 5 / $590 |
| 6 | `playtest-offline` | Simulated Decider outage mid-breach | fallback OK | 1 | ~2 min | — |

Totals: 6 fresh games, 22 min of actual playtime, 2 wins, 1 loss, 3 QA/stress runs. The task asked for three campaigns; the extras are the stress runs required by Phase 3/5.

**Important context:** only **one** mission (`Steal the Moon`) is actually playable. "Outlaw Mondays" and "Control All Coffee" are hard-coded `COMING SOON`. All three "campaigns" are therefore the same single mission attempted with different strategies, dressed up as a short management loop with crises. Any claim of "15–20 minute campaign" (per `V2_BUILD_REPORT.md` §3) is only reachable by **losing** repeatedly. A win finishes in 2–4 minutes.

---

## 2. Phase 1 — First-time player experience

### What a new player sees on Day 1 (observed)

```
DAY 1 · $600 · HEAT 8% · INFAMY 5 (Win needs ≥25) · MORALE 70% · RESEARCH 0
COMMAND POINTS 2/2 — Spend to build / research / resolve
Active crises: No active crises. Enjoy it.
3 mission cards:  🌕 Steal the Moon [Launch Operation ↗]
                  📅 Outlaw Mondays [COMING SOON]
                  ☕ Control All Coffee [COMING SOON]
5 build cards + 4 research cards + 4 henchman cards (each with "Day off (1 CP)")
```

### What's clear
- Resource bar is labeled and legible.
- "Launch Operation ↗" is prominent.
- Henchmen have personality (Boris "believes every problem can be punched"); this landed.
- Risk display is clean: `STRONG / FAVORABLE / RISKY / HIGH` with a 10-segment bar and a bullet list of modifiers. Honestly good.

### What's not clear (observed confusion)
1. **No win condition panel.** The win number is a tiny subtitle under Infamy. On Day 1 the player has no sense of "where am I vs. victory".
2. **CP mechanics unexplained.** You find out CP refills at dawn only by ending the day and watching the number.
3. **Chaos's $50/day upkeep is invisible.** The HQ sidebar doesn't mention it. I pieced it together by reading `engine.js`. First-time players will quietly bleed money for 3–4 days before anything explains why.
4. **"Day off (1 CP)" is a trap.** No tooltip. I clicked it on Mal at 0% stress; CP went 2→1, stress stayed at 0. The game let me waste a CP on a no-op with no warning. (See Bug #B6.)
5. **No "Buildings I own" panel.** The build cards show *available* builds. The only way to confirm I own the Lab is to scroll to the activity log and read "Day 3 dawn: Building complete: Laboratory." For a management game, this is a serious omission.
6. **No build queue.** After clicking Build on the Lab (2-day build), nothing on the HQ view tells you a lab is coming. The log shows "Day 1: Started building Laboratory"; you have to count days yourself.
7. **Rage vs Stress is undocumented.** Boris shows "RAGE 0%" and the other three show "STRESS 0%". A new player has to guess what the difference means. (It drives C1 crisis trigger and Boris's immunity to Executive Override stress.)
8. **Equipment inventory invisible on HQ.** You see what you own only inside the mission launcher.
9. **Two of three mission cards are permanently "COMING SOON"** and still take two thirds of the "World Domination Plans" row. The slice makes itself feel 1/3-finished in the first screen.
10. **The AI badge "AI // LIVE" is a nice touch**, but when I force the Decider offline during a Breach, the Breach dialog *still* says "Decider (live) will pick the lead specialist" (see Bug #B7).

**Verdict (Phase 1):** The game is readable but not teachable. Nothing introduces concepts; you learn by misclicking.

---

## 3. Phase 2 — Three campaigns

### Campaign 1 — "Natural" play (DEFEAT, Day 5, heat=100)

| Day | Action | Result |
|---|---|---|
| 1 | Build Lab ($200, 1 CP, 2d) + Rec Room ($150, 1 CP, 1d) | money $600→$250, CP 2→0 |
| 2 | HR Desk ($100, 1 CP) + Mal day off | money $230→$130. Mal 0% → 0% stress — wasted 1 CP. |
| 3 | Lab finished. Launch mission: Mal+Boris+Chaos + Tractor+Hammer | Scout STRONG preview → **rolled 15 vs DC 20, FAIL**. Approach FAVORABLE → pass 75/29. Breach FAVORABLE → **rolled 16 vs DC 33, FAIL**. Mission aborts; partial $190; heat 8→73. |
| 4–5 | Try again with Boris+Mal+Chaos+Kevin + both gear | Scout 15 vs DC 29 FAIL (identical roll — same scope). Approach 75 vs 45 PASS. Breach 16 vs DC 38 FAIL again. **Heat hits 100 → DEFEAT.** |

Observations:
- **Determinism trap:** Re-launching the exact same loadout re-rolls the exact same roll. `startMission` resets `attemptCounters[]`, so the scoped RNG key is identical. The game never tells the player this.
- **Heat spiral is one-shot lethal.** 8% → 73% in a single failed mission, from +15 (scout fail) + +20 (breach fail) + +15 heat on the Tractor + unavoidable heat deltas. Three or four unlucky rolls = game over. No way to grind heat down (Vault takes $300+2 CP+2 days you don't have).
- **Lab's `+5 Lab support` showed up in every stage — flat +5, no "+25% Mal competence"** as the content.js effect string advertises (`'+1 RP/day, repair gear, Mal +25% competence'`). The description lies vs the implementation. Confirmed on inspection: `engine.js:343` adds a flat `+5` for any `science`-skill carrier when Lab is built; nothing scales Mal by 25%.

### Campaign 2 — "Poor decisions" (VICTORY on Day 1, 2 min)

Loadout: Kevin + Mal, **no equipment**, launched Day 1 with no prep.

| Stage | Preview | Roll | Outcome |
|---|---|---|---|
| Scout | RISKY (Kevin, finance) | 63 vs 49 | PASS (lucky) |
| Approach (Front Door / finance) | HIGH | 27 vs 51 | **FAIL** |
| Breach (deterministic → Mal) | HIGH | 90 vs 80 | PASS (very lucky) |
| Escape (fast) | FAVORABLE | pass | **VICTORY, infamy 29** |

**This is the headline finding of the playtest:**
> A player who makes four deliberately bad decisions in a row can WIN THE GAME on Day 1 if two coinflips go their way. "Full prep" C3 took 4 days and burned $500. "Poor decisions" C2 took one day, cost nothing, and ended at $1018 cash and 29 infamy.

The engine's `_resolveStage` does not abort the mission on an Approach fail — it just penalises Breach. So a single stage pass out of four is enough. Combined with a per-stage DC floor that drops to **8 or 20 at full prep** (see Bug #B5), "STRONG" is virtually a formality. The strategy layer that the game asks you to engage with is **optional**.

### Campaign 3 — "Optimized" play (VICTORY on Day 4)

Days 1–3 build Lab + Rec Room, wait for RP; Day 4 launch 4-man + 2 gear.
- Scout STRONG → 66 vs DC 20 PASS.
- Approach (Lab route, Mal+Chaos) STRONG → **65 vs DC 8** PASS. (DC 8 is cosmetic.)
- Breach FAVORABLE → 64 vs DC 49 PASS.
- Escape (clever) → PASS. Infamy jumped 5 → 40. VICTORY.

What was *supposed* to happen: full-prep sims in `tests/v2_simulation.test.mjs` claim **74% win rate**. In practice "full prep" means picking two henchmen with the right skills, both with +22 gear, Lab for +5, and running the Lab route. DCs collapse. It's a stroll.

The optimized run is also where the economy fails you: $600 start, Lab + Rec = $350, Kevin's +$30/day is swallowed by Chaos's $50/day upkeep for a net **-$20/day until the Server Room ($250) is built — which you can't afford until Day 6 or 7 without a mission win**. The only escape from the economy trap is to launch an under-prepped mission and hope. The player who tries to prepare is punished by the economy; the player who dive-bombs Day 1 is sometimes rewarded.

---

## 4. Phase 3 — Mission interaction testing

Approach soft-lock fix (from commit `abef904`): **verified working in-browser.**

| Scenario | Result |
|---|---|
| Select two henchmen, see `PAIR (2/2)` + confirm label with names | ✅ works |
| Attempt third pick | Silently ignored; aria-live reads "Two already picked — deselect one before choosing a third." ✅ |
| Deselect, replace | ✅ counter + confirm label update |
| Back to HQ from Scout, Resume via HQ card | ✅ dialog closes; HQ shows `Resume (scout)`; Resume reopens same dialog |
| Forfeit from Scout (confirm dialog) | ✅ marks mission `FORFEITED — try again?`; prior stage effects stay |
| Launch again after forfeit | ✅ loadout opens fresh |
| Keyboard: Tab moves focus into dialog; Enter toggles select | ✅ (verified via `press_key` CDP, not synthesized JS events) |
| Escape key closes Loadout dialog (not locked) | ✅ |
| Escape key during Scout/Approach/Breach/Escape (locked) | ✅ does NOT close — intended |
| Save/reload mid-Scout | ✅ reload shows "Resume (scout)" |
| Executive Override on Boris at Breach | ✅ CP charged, +rage applied, provider shows "override" |

**But two new UI bugs were found during interaction testing.**

---

## 5. Phase 4 — Gameplay quality scores (0–10)

| Category | Score | Note |
|---|---|---|
| **Fun** | 3 | 2–4 minutes of actual mission; the rest is reading menus. Winning doesn't feel earned (C2); losing doesn't feel instructive (C1). |
| **Player agency** | 3 | Decisions matter *to the preview percentage*, but a single unlucky roll usually dominates. Loadout choice weighs more than build order. |
| **Strategy** | 2 | There's one dominant strategy (match skill → equipment → route, use Lab), and the economy forces an all-in Day 3–4 mission. Nothing branches. |
| **Progression** | 2 | Only one mission exists. "COMING SOON" cards announce the hole. "Day 2" and "Day 10" feel identical in HQ. |
| **Replayability** | 2 | Seeds change rolls; nothing else changes. There is no "I'll try a Boris + CHAOS Front Door run" variety because the content is tiny. |
| **Clarity** | 4 | Risk preview is excellent; everything else requires reading the source. |
| **Pacing** | 2 | Days 1–3 are busywork, Day 4 is the game, Day 5+ is Groundhog Day of "End day → quiet morning" (see Bug #B4). |
| **Humor** | 6 | Bios land. "CHAOS-9000 can hack minds but cannot use a printer" is good. Narration is cosmetic + sparse. "COMING SOON" undercuts the comedy. |
| **UX** | 5 | Dialogs are clean post-fix; HQ is a wall of forms, not a lair. No sense of place or state ownership. |
| **Overall** | **3** | Would I voluntarily play another campaign? No. Would I keep working on this if I were a designer? Yes — the bones (risk display, honest previews, R-spec resolutions, Executive Override) are real. The content is a slice of a slice. |

**Does it still feel like a sequence of forms rather than a management game?** Yes. HQ is a static grid of build/research/henchman cards; nothing animates, nothing changes shape as the lair grows, there is no owned-buildings panel, no visible build queue, no map, no "today's hook". The management loop collapses to "spend both CPs → End day → wait for the mission that gates everything".

---

## 6. Bugs and defects — observed in play

Severities: **P0** game-breaking, **P1** major gameplay or logic defect, **P2** usability/balancing, **P3** cosmetic.

### B1 (P1) · Scout and Escape dialogs allow multi-click submission → phantom "stage already resolved" result
- **Repro:** Open Scout dialog. Click `Run Scout →` three times in rapid succession.
- **Observed:** First click runs the real Scout. The next click fires again *after* the engine has advanced to `approach`, hitting `_resolveStage`'s early-return branch at `engine.js:385`. The result modal is overwritten with "**SCOUT ✗ Stage failed · roll 0 vs DC 0 (deterministic) · stage already resolved**". The player believes Scout failed when it actually passed.
- **State impact:** Engine state is NOT corrupted (the early-return doesn't mutate `s`). But the player's mental model is.
- **Why Approach/Breach don't have this bug:** both do `ev.target.disabled = true` on first click (`mission.js:189, 211`). Scout (`mission.js:135`) and Escape (`mission.js:287`) do not.
- **Fix size:** 2 lines each; mirror the Approach/Breach pattern.

### B2 (P1) · Determinism trap: same roster → identical re-launch roll
- **Repro:** Lose Scout (seed `playtest-c1-firsttime`, Mal + Tractor rolled 15/DC 20). Re-launch with same roster+gear → re-rolled **the same 15**.
- **Root cause:** `startMission` resets `attemptCounters = {}` (`engine.js:257`), so the scope key is identical: `mission:moon:stage:scout:0`. Deterministic by design, catastrophic for discoverability.
- **Impact:** Players who find a losing seed/loadout think the game is broken.
- **Fix options:** (a) seed scope with a run-local nonce bumped on each `startMission`; (b) do not reset `attemptCounters` across re-launches; (c) tell the player "same roll if you re-run same loadout" in the forfeit confirmation.

### B3 (P1) · Approach failure does not meaningfully threaten the mission
- **Repro:** C2 — fail Approach (27 vs DC 51); mission continues; Breach rolls 90/80 PASS; VICTORY.
- **Root cause:** `_resolveStage` only aborts on Breach fail (`engine.js:460`). Approach fail applies `-25 stress to lead` and `-15 to Breach carried bonus`, but Breach's DC starts at 80, Hammer gives +22, Boris force gives +15 → a single lucky roll clears it.
- **Impact:** The 4-stage structure is theater. You need to pass 1-of-4, not 4-of-4.
- **Fix options:** (a) Approach fail should abort or force an immediate Escape stage; (b) Breach DC base should be tuned up when prior stages failed (currently only -15 to the net); (c) stage pass count should gate the win condition.

### B4 (P1) · Dead-air days when no crisis is eligible
- **Repro:** Seed `playtest-crisis`. Fail a mission (status=`failed`), end 10 days at heat=28.
- **Observed:** 0 crises fired across 10 dawns. "Active crises: No active crises. Enjoy it."
- **Root cause:** No crisis triggers below heat=40 (`content.js:88, 102, 117`) except C1 (Boris rage ≥50), C2 (Chaos upkeep unpaid), C4 (Mal stress ≥60), C7 (morale ≤40), C8 (needs mission status `pending`, not `failed`), C12 (needs mission success). After a failed mission at low heat with healthy henchmen, **no trigger is reachable**.
- **Impact:** The management game evaporates. Player ends days watching Kevin earn $30 and lose $50 and the UI say "Enjoy it".
- **Fix:** add low-heat / low-infamy filler crises; or make C8 trigger on `moon.status === 'failed'` too; or ensure at least one crisis fires every N quiet days.

### B5 (P1) · Full-prep DC floor is cosmetic (DC 8 observed)
- **Repro:** C3 Day 4, Lab route, Mal + Chaos, Tractor + Hammer. Approach preview showed `STRONG` with effective **DC 8**.
- **Observed modifiers at that moment:** `Mal science +13`, `Chaos science +9`, `Tractor synergy +22`, `Relationship mal:chaos +10`, `Scout intel +10`, `Lab support +5`. Net −47 from base 75.
- **Impact:** "STRONG" doesn't mean "90% chance", it means "unreachable". The strategy depth is "spend 4 days to make the mission trivial" vs "YOLO Day 1 and hope".
- **Fix:** clamp effective DC to a floor (≥25 or so), or cap stacked bonuses, or push base DCs up by 10–15.

### B6 (P2) · "Day off" wastes CP silently when the target is not stressed
- **Repro:** Mal shows `STRESS 0%`. Click Mal's `Day off (1 CP)` button. CP 2 → 1. Stress 0 → 0. No warning, no toast.
- **Fix:** disable the button when the target henchman is below some threshold (e.g. stress<10 and rage<10), or confirm before spending.

### B7 (P2) · Decider offline is not surfaced during a Breach
- **Repro:** Patch `window.fetch` to reject calls to `/api/*`. Open Breach. Dialog text still reads "Decider (live) will pick the lead specialist." Submit; result's provider chip reads `(deterministic)`.
- **Impact:** Dialog advertises a mechanic that isn't active. The player sees "live" promises everywhere but gets deterministic picks silently.
- **Fix:** have the Breach dialog re-probe `/api/health` (or the mode flag) on open, or display the mode chip from the live state rather than page-load state.

### B8 (P2) · Bankruptcy mechanism is unreachable
- **Repro:** Set `state.money = -5`, run `dawnTick`. money becomes +25 immediately (Kevin +30, Chaos -50 if no server room, lab +0). Counter never increments.
- **Root cause:** dawn tick credits income *before* the `money < 0` check. In normal play, buildings deduct up-front and the UI gates them behind `money >= cost`, so money cannot go negative in-session.
- **Impact:** Dead code; "defeat_bankrupt" never fires. One of the three documented win-/lose conditions doesn't exist in practice.

### B9 (P2) · "Lab support: Mal +25% competence" advertised but implemented as flat +5
- `content.js:44` effect text: `'+1 RP/day, repair gear, Mal +25% competence'`.
- `engine.js:343` applies `+5` for ANY science-skill carrier when Lab is built. Mal doesn't get a competence multiplier anywhere.
- Already documented as "scope divergence" in `V2_BUILD_REPORT.md` P2-3.3 but never corrected in the UI copy. Honest implementation + dishonest tooltip.

### B10 (P2) · No "Buildings I own" panel on HQ; no build queue
- The "Headquarters build" section only shows *buildable* items. Owned buildings disappear from the UI once built. The build queue is invisible — you learn "it's a 2-day build" by watching the log the next day.

### B11 (P2) · Mission card eats 2/3 of its row with permanent "COMING SOON" placeholders
- Hard-coded in `content.js:52-55`. First visual impression is "2 of the 3 features aren't here yet". Either hide them until implemented or combine them into a single "More operations coming soon" strip.

### B12 (P3) · `attemptCounters` reset leaks a deterministic re-attempt pattern
- Covered by B2.

### B13 (P3) · "Enjoy it" copy under crises is unintentionally snarky when the player is losing
- Same string whether at heat=8% or heat=73%. Context-sensitive copy ("Lull before the storm", "Something is coming") would help.

### B14 (P3) · Executive Override reasons list missing in Breach dialog
- Approach shows "Relationship mal:chaos: +10"; Breach shows the same preview but the override pane doesn't recompute reasons for the override target. Minor.

### B15 (P3) · `favicon.ico` 404 on every load (console error)
- Harmless, but every console-clean run reports one error.

---

## 7. The five biggest weaknesses

1. **The game is 60 seconds of play padded with 180 seconds of HQ clicking.** Only one mission exists; it ends on Breach + Escape; the UI loops you through a 4-stage dialog that's really 2 pass/fail gates.
2. **One lucky roll decides the campaign.** B3 + B5 together mean a single Breach pass wins the game. The strategy layer is cosmetic.
3. **The economy forces you to lose.** -$20/day without a Server Room ($250) means by Day 5 you launch under-prepped or go broke, but under-prepping Scout + Approach can soft-cost you the mission.
4. **The management game disappears when things are going OK.** B4: at heat=28 with a failed mission, zero crises fire. Days are empty.
5. **"Steal the Moon" IS the game.** With Mondays and Coffee stubbed, there is no campaign — just one short attempt wrapped in a loop that pretends to be more.

## 8. Five highest-impact improvements (prioritised)

1. **Make the 4-stage structure matter (addresses B3, B5):** gate the mission on cumulative stage passes (e.g. require ≥3 of 4 to succeed); clamp effective DC to a floor so "STRONG" means ~85% not 99.9%; make Approach fail trigger an Escape-only "steal and run" branch instead of continuing to Breach as if nothing happened.
2. **Fix the dead air (addresses B4):** add 2–3 low-heat crises (equipment broke in storage, Dolores HR gossip, Boris wrote a manifesto); make C8 fire on any mission state so day≥4 always has friction; and if no crisis is eligible 2 days in a row, auto-raise heat by 5.
3. **Teach the player (addresses Phase 1 confusion + B6, B10):** add a one-screen tutorial overlay on first boot (CP, Chaos upkeep, win condition, how buildings work); add a persistent "Lair status" panel on HQ showing owned buildings, build queue, and today's income/upkeep; disable or confirm trap actions like "Day off" when they're a no-op.
4. **Fix the Scout/Escape double-submit (B1):** 2-line patch. Low effort, high confidence impact — removes a bug that misleads about the real stage result.
5. **Deliver (even one of) the other two missions:** porting Mondays or Coffee with its own route/stage flavour triples the content surface and justifies the "campaign" framing.

## 9. Is the game genuinely fun?

**No, not yet.** It's an impressive engineering slice — the engine is contract-driven, the risk display is honest, the Executive Override system is clever, the Scout → Approach → Breach → Escape structure is memorable, and the Decider integration is a real differentiator. But as a game, it is a shell of a shell: one mission, four stages where only one really matters, a two-coinflip win condition, and dead-air days with nothing to react to. I played the mission three times and never once felt like I'd "played"; I'd read menus, picked an obvious loadout, and watched a roll.

The character writing is the single bright creative spot. Boris and CHAOS have voice; the game should lean into that during missions (narration beats on every stage, not just one cosmetic sentence).

## 10. Recommendation — GO / NO-GO

**GO for continued development — conditionally.**

The engine is solid, the UI post-fix is correct, the tests actually run. Keep investing. But **do not** present this as a reviewable product until at least:

- One of the stub missions is implemented (so there's an actual campaign).
- Approach failure has teeth (B3) and DC math is clamped (B5).
- The dead-air gap is closed (B4).
- The multi-click phantom fail (B1) is fixed.

Those four changes, I think, are the difference between "an impressive technical slice" and "a game someone would voluntarily finish once". Everything else on this list is polish.

---

## Appendix A — Observed vs claimed behaviour

| Build report claim | Observed |
|---|---|
| "15-20 min campaign simulations" | A win takes 2–4 minutes; losing can stretch to 5–8. |
| Full-prep win rate 74% | Reproduced in `v2_simulation.test.mjs`. In play, "full prep" visibly produces DC 8 trivialities, so the "75-95%" R8 band is honest but the game feels like 99%. |
| "Browser-verified end-to-end VICTORY path" | Yes — both via the previous `playtest-final` seed and this run's seed `playtest-c3-optimized`. |
| "No real-time Escape timer" | Confirmed — Escape is a turn-based plan picker. |
| "Honest Breach preview" (P1-3.1 fix) | Confirmed — preview specialist matches the Decider's eventual pick. Minor UX bug B7: offline state not surfaced. |

## Appendix B — Methodology notes

- Browser: Chrome via chrome-devtools MCP, viewport 1440×900.
- Server: `D:\AI\evil-genius-venv\Scripts\python.exe backend\server.py` on port 8791 (via `scripts\start-local.ps1`).
- Decider: localhost:8099 (reused, not re-started).
- Each campaign started with `localStorage.clear()` and a fresh seed in the URL.
- No engine state was manually edited during gameplay. Engine-layer `node -e` scripts were used **only after observing bugs in the UI** to isolate root cause (B4, B8).
- Screenshots omitted because the chrome-devtools MCP sandbox refused every path tried (user home, repo subdir, scratch dir). DOM text captures substitute throughout. If reviewers need pixel-level evidence, the start-local.ps1 launcher + the seeds in Table 1 reproduce every scenario in <10 min.
