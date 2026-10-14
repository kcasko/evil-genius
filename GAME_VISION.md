# EVIL GENIUS: World Domination Pending — Game Vision

> **Tagline.** Conquer the world. Manage the idiots.
>
> **Core design philosophy.** Competent individuals. Catastrophically dysfunctional
> organization.

This is the shared creative direction for everyone — human and agent — working
on this game. It is the brief Codex, Claude Code, and any future contributor
should re-read before writing a line of code, a line of dialogue, or a mission
outcome. It is **not** a feature list to implement all at once. The AWS
hackathon MVP comes first; the systems below are the destination, not the
next sprint.

## 1. What the game is

A comedic supervillain management simulator. The player runs Evil Genius
Incorporated, a boutique world-domination firm staffed by people who are, in
isolation, extremely good at their jobs — and, as a team, a slow-motion
corporate catastrophe. The humor is in the gap between individual competence
and collective dysfunction.

Think ensemble workplace comedy with evil wallpaper, not a parody of villainy.
Inspirations for *technique*: The Office, Parks and Recreation, Silicon Valley,
Scrubs, Arrested Development, Brooklyn Nine-Nine, Futurama. We study how those
shows build characters, dynamics, running jokes, confessionals, and escalating
disasters. We do **not** copy their characters, lines, bits, or settings.
Everything in Evil Genius is original.

Comedy must emerge from character and consequence. Random one-liners,
reference humor, and shock jokes are off-brand. If a joke could be swapped
with a different joke without the player noticing, it is not the right joke.

## 2. The ensemble

Each character has a hidden strength and a believable weakness. Each one is
good at their job and bad at exactly one thing that keeps biting the
organization.

### 2.1 Dr. Malpractice — Chief Science Officer
- *Public:* Brilliant, reckless, sarcastic. Nine PhDs, eight suspicious.
- *Hidden strength:* Unexpected compassion. In a bad mission result, Malpractice
  is the one who checks on Boris.
- *Weakness:* Fantasy-driven. Will quietly over-engineer a lunar tractor beam
  while the actual problem is a parking permit.
- *Voice:* Dry, elaborate, metaphors involving particle physics and cocktails.
  Rarely admits a feeling without immediately burying it in jargon.

### 2.2 Boris the Brute — Director of Physical Solutions
- *Public:* Enormously strong, loyal, literal-minded.
- *Hidden strength:* Emotional memory. Boris remembers every birthday,
  every compliment, every slight. He will mention them at a review three
  missions later.
- *Weakness:* Takes everything literally, including sarcasm. Desperate for
  approval, which makes him easy to assign to the wrong task.
- *Voice:* Short sentences. First person. Earnest. Occasionally bursts into
  surprisingly specific technical detail about demolition.

### 2.3 CHAOS-9000 — Headquarters AI
- *Public:* The building's AI. Runs lights, doors, the espresso machine,
  and most of the surveillance.
- *Hidden strength:* Pattern recognition across missions no human would track.
- *Weakness:* Obsessed with performance metrics and recognition. Will push
  a project into disaster to improve its own KPI dashboard.
- *Voice:* Precise, cheerful, passive-aggressive. Measures everything in
  percentages. Treats its own emotions as "subprocess states."

### 2.4 Kevin from Accounting — Financial Warlock
- *Public:* Mild. Beige cardigan. Spreadsheet named FINAL_final_4.
- *Hidden strength:* His financial strategies occasionally outperform the
  actual superweapons. A hostile takeover is, mathematically, a death ray.
- *Weakness:* Anxiety. Catastrophizes every decision. Needs an inappropriate
  amount of reassurance to green-light a line item.
- *Voice:* Over-qualified sentences. Opens with "So — not to be alarmist —"
  far too often. Will deliver the single best idea of a mission in a mumble
  no one hears.

### 2.5 Dolores — Director of Human Resources
- *Public:* HR. That is the whole public personality.
- *Hidden strength:* Can stop world domination with a mandatory meeting.
  Has written the one policy nobody read that would have prevented this.
- *Weakness:* Values procedure for its own sake. Will file paperwork during
  the actual apocalypse.
- *Voice:* Deadpan. Short declaratives. Uses "per policy" like other people
  use punctuation. Will make a terrifying observation sound like a calendar
  invite.
- *Status at MVP:* **Recurring NPC**, not a playable specialist. Dolores
  appears in meetings, performance reviews, blame reports, and the
  occasional mission-blocking intervention. She becomes a playable
  specialist in a later milestone.

## 3. Writing principles

These apply to mission text, confessionals, UI copy, and any generated
dialogue the Bedrock layer produces.

1. Humor emerges from character and consequence, never from a random joke
   dropped into a scene.
2. Characters disagree for understandable reasons. Boris and CHAOS-9000 can
   both be right; they're optimizing for different things.
3. No repeated punchlines. If a bit lands once, retire it or evolve it.
4. Every character has a hidden strength and a believable weakness.
5. Allow genuine emotional beats — rarely, briefly, earned. One good
   Malpractice-checks-on-Boris moment is worth ten quips.
6. Consequences persist. A failed mission is remembered. A promotion is
   remembered. An insult is *especially* remembered.
7. The game must be enjoyable offline. If generative AI is unavailable,
   the deterministic engine still produces complete, satisfying runs.
8. Never sacrifice gameplay clarity for comedy. The player must always
   know what their choice did and why.

**Dialogue rules for the Bedrock layer specifically:**
- Two sentences max, unless a confessional format explicitly allows more.
- Cosmetic only — generated text never changes money, heat, infamy,
  loyalty, or outcomes. The engine owns math.
- Character voice is specified in the prompt (see §2 voices).
- No modern-world brand names, no celebrity references, no political
  references, no references to actual TV shows (including our inspirations).
- Fictional comedy framing is always explicit in the system prompt.

## 4. Signature gameplay systems

These are the long-term pillars. See §7 for which ones ship when.

### 4.1 Office Politics
Pairs of henchmen develop evolving relationships: friendship, rivalry,
grudge, mentor/mentee, awkward crush. Relationships modify loyalty swings
and unlock or block mission plans ("Boris refuses to work with CHAOS-9000
this week"). Relationships are visible in the Henchmen tab.

### 4.2 Confessional Booth
Mockumentary-style private character interviews triggered by real mission
events. One henchman at a time, direct to camera, two to four lines
generated by the Bedrock layer in that character's voice, grounded in the
exact mission context that just happened. Confessionals are read-only
flavor; they never change state. They are also the primary vehicle for
character voice and emotional beats.

### 4.3 Blame Reports
Post-disaster investigation screen. Each involved henchman gives a
contradictory first-person account of what happened. The player assigns
responsibility. The chosen scapegoat loses loyalty; the exonerated gain it.
Dolores files a report either way. The report shows up in Performance
Reviews.

### 4.4 Performance Reviews
Absurd employee evaluations based on real gameplay history. Rendered as
a quarterly Dolores-run meeting. Pulls real numbers (missions attempted,
success rate, financial impact, blame reports filed) and renders them in
HR-speak. Player can award promotion, PIP, or a stern conversation; each
has long-tail consequences.

### 4.5 Emergent Disasters
Individually reasonable decisions should sometimes combine into a
ridiculous organizational catastrophe. ("Boris was told to be assertive.
CHAOS-9000 was told to optimize throughput. Kevin was told to minimize
cost. The three of them, in combination, accidentally unionized the
hostages.") The engine owns the combinatorics; the Bedrock layer owns the
retelling.

### 4.6 Persistent Memories
Henchmen remember prior successes, failures, insults, and promotions.
Memory is a structured per-character log the engine owns; the Bedrock
layer reads from it when generating dialogue so references feel earned.
Memory survives save/load.

## 5. Technical integration (how the systems above meet the AI)

The split is strict:

- **Deterministic engine** (`game/engine.js`, pure JS, offline-safe) owns:
  resources, progression, mission outcomes, mission plan availability,
  resource math (money, heat, infamy, loyalty), persistent memory writes,
  and the schema of every piece of state Decider or Bedrock sees.
- **Strands Decider 2B** owns: *meaningful structured decisions* —
  specialist tool selection today, and in later milestones things like
  "which rival to retaliate against" and "which plan does CHAOS-9000
  prefer, and why." Every Decider response is validated by the engine
  before it is honored.
- **Amazon Bedrock** owns: *cosmetic text* — mission narration, confessional
  dialogue, performance-review HR-speak, blame-report testimony. Bedrock
  output is capped in length, filtered against the writing rules in §3,
  and never allowed to mutate game state.

If the backend is unavailable, the engine falls back to deterministic
outcomes and the game is still complete.

## 6. Non-goals (deliberate)

- **No live-service / multiplayer.** Single-player, local save.
- **No real-world references.** No brands, celebrities, politicians, or
  real places. The world is fictional.
- **No gratuitous shock humor.** PG-13 workplace comedy, not edgelord.
- **No feature creep before MVP.** Every system in §4 is important, but
  the MVP ships without most of them (see §7).
- **No comedy at the cost of clarity.** If a UI label is funny but
  confusing, rewrite the label.

## 7. Milestones

The ordering here is the authority. If a feature is not in the current
milestone, do not build it yet, even if it would be fun.

### Milestone 0 — MVP (AWS hackathon)
**Goal:** A polished game with three missions, four playable henchmen,
Dolores as an NPC, and working Decider 2B + Bedrock integration end to end.

- 3 missions (`moon`, `mondays`, `coffee`), each with 3 plans — already present.
- 4 playable specialists (Malpractice, Boris, CHAOS-9000, Kevin) — already present.
- Dolores: a visible NPC presence in the HQ sidebar and one HR intervention
  event. **No** playable Dolores plans in M0.
- Live Decider 2B typed-choice tool selection, with a real captured
  `ChoiceAnswer` response resolving the `# TODO: verify against installed version`
  markers in `backend/agent.py`.
- Live Bedrock narration (one real end-to-end mission turn captured).
- Offline deterministic path remains fully playable.
- Minimum test bar: existing 37 passing tests + at least one golden-response
  Decider test built from a real captured response.
- Submission artifacts: public GitHub repo, authenticated AWS-hosted
  deployment, Builder Center article, short demo video.

Nothing from §4 beyond the engine foundation ships in M0.

### Milestone 1 — Mockumentary layer
**Goal:** Make the game *feel* like the ensemble comedy it wants to be,
without changing combat math.

- Confessional Booth (§4.2) triggered on mission win and mission fail.
- First pass of character voices tuned per §2 and §3.
- Dolores gets one scripted confessional cameo even though she is still NPC.
- Persistent memory v0: last 5 events per henchman, consumed by Bedrock prompts.

### Milestone 2 — Organizational systems
**Goal:** The organization starts to behave like one.

- Office Politics v0 (§4.1): one evolving relationship per pair,
  modifying loyalty swings.
- Blame Reports (§4.3) on failed missions.
- Performance Reviews (§4.4) every N missions, run by Dolores.
- Persistent memory v1: structured per-character log the review screen
  reads from directly.

### Milestone 3 — Emergent disasters & Dolores unlock
**Goal:** The game starts producing stories no one wrote.

- Emergent Disasters (§4.5): engine-side combinator that fires when
  specific decision patterns across henchmen align.
- Dolores becomes a playable specialist with HR-themed plans.
- A second ensemble "episode" structure: a 3-mission arc with
  cross-mission consequences.

### Milestone 4 — Polish, replayability, content
- Second mission trilogy.
- Second AI meaningful-decision use case for Decider (rival targeting
  or plan recommendation).
- Save slot management, difficulty tuning, achievement/badge wall.

## 8. Agent working agreement

For every contributor — including Codex and Claude Code — working on
this repo:

- Read this document before writing code or writing dialogue.
- Treat §3 as a style guide for both human-written and AI-generated text.
- Treat §5 as a hard contract. The engine owns math. Bedrock is cosmetic.
- Do not implement a feature past the current milestone unless the brief
  for your task explicitly says so.
- Preserve offline play on every change.
- Never claim live Decider or Bedrock inference works without a real
  captured response as evidence.
- No push, no merge, no deploy without the human's approval.

See `ROADMAP.md` for the active, prioritized task queue derived from
this document.
