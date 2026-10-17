# AGY Design Report — Phase 2 Visual Identity & Interface Audit

**Target Worktree:** `D:\Repos\evil-genius-agy`  
**Branch:** `agy/design` (Read-only review cycle; no commit, no push, no merge)  
**Specialist:** UI/UX & Creative Presentation Specialist  
**Designated Implementer for Follow-Up:** Codex (Gameplay & `index.html` owner)  
**Authoring Context:** Milestone 0 (AWS Hackathon MVP Polish & Video Readiness)

---

## 1. Current-State Audit

This audit evaluates the current monolithic interface in [`index.html`](file:///D:/Repos/evil-genius-agy/index.html) against the creative mandate established in [`GAME_VISION.md:§1`](file:///D:/Repos/evil-genius-agy/GAME_VISION.md#L15-L33): *"An ensemble workplace comedy with evil wallpaper... Competent individuals. Catastrophically dysfunctional organization."*

### 1.1 Palette and Typography
* **Current State:** Defined in [`index.html:3`](file:///D:/Repos/evil-genius-agy/index.html#L3) via CSS root variables:
  ```css
  :root { --bg:#0c0b16; --panel:#191727; --panel2:#242032; --line:#383448; --text:#f2f0f6; --muted:#a9a3bb; --lime:#c5f271; --pink:#ff7199; --gold:#ffcb73; }
  ```
  The font stack is imported in [`index.html:2`](file:///D:/Repos/evil-genius-agy/index.html#L2) with `'Space Grotesk'` (body, display) and `'Space Mono'` (labels, buttons, code).
* **Where It Works:** The pairing of `'Space Grotesk'` with `'Space Mono'` provides crisp, modern legibility. The lime accent (`#c5f271`) gives strong contrast for primary call-to-actions, and the dark purple canvas creates an immediate nighttime mood.
* **Where It Falls Short:** The colorway reads as a generic Web3 / crypto DeFi trading dashboard or synthwave hacker portfolio rather than a boutique world-domination enterprise. Hot neon pink (`#ff7199`) and deep grape purple (`#423054`, `#191727`) suggest a cyberpunk night club. It lacks the deadpan, tactile mundanity of an underfunded bureaucratic corporation (the fluorescent tubes, carbon-paper off-whites, manila folders, and institutional grey-slates that give life to Dolores and Kevin from Accounting).

### 1.2 The HQ Scene Art (Moon, Tower, Windows Hero Area)
* **Current State:** Styled in [`index.html:3`](file:///D:/Repos/evil-genius-agy/index.html#L3) (`.scene`, `.moon`, `.tower`, `.windows`) and instantiated in [`index.html:4`](file:///D:/Repos/evil-genius-agy/index.html#L4):
  ```html
  <section class="scene"><div class="moon"></div><div class="tower"></div><div class="windows">▪ ▪ ▪</div><div class="sceneText"><div class="eyebrow">TRANSMISSION FROM THE LAIR</div><h2>Great evil starts with terrible decisions.</h2><p>Your employees have arrived. Morale is already concerning.</p></div></section>
  ```
* **Where It Works:** The copy in `.sceneText` (*"Great evil starts with terrible decisions. Your employees have arrived. Morale is already concerning."*) immediately strikes the exact comedic tone defined in [`GAME_VISION.md:§1`](file:///D:/Repos/evil-genius-agy/GAME_VISION.md#L3-L6). The pure CSS silhouette approach keeps the file 100% dependency-free and lightweight.
* **Where It Falls Short:** The illustration itself feels like an isolated CodePen demo rather than an operational headquarters. The clip-path tower (`clip-path:polygon(...)`) and neon windows (`.windows { font-size:43px; letter-spacing:18px; color:var(--lime); }`) remain completely static throughout gameplay. They do not react to the lair's heat level (e.g., searchlights or police sirens when `heat >= 85`), do not reflect active operations, and provide no visual hint of the henchmen working inside.

### 1.3 The Stats Grid (War Chest / Public Suspicion / Infamy / Evil Ops)
* **Current State:** Rendered dynamically via [`index.html:8`](file:///D:/Repos/evil-genius-agy/index.html#L8):
  ```javascript
  $('stats').innerHTML=[['💰 WAR CHEST','$'+game.money,'Lair operating budget'],['⚠ PUBLIC SUSPICION',game.heat+'%','Keep this under 100%'],['☠ INFAMY',game.infamy,'Bad publicity is publicity'],['⚑ EVIL OPERATIONS',game.wins+'/'+(game.wins+game.losses),'Glorious partial victories']].map(([a,b,c])=>`<div class="stat"><label>${a}</label><strong>${b}</strong><small>${c}</small></div>`).join('');
  ```
* **Where It Works:** The 4-column layout (`grid-template-columns:repeat(4,1fr)`) is clean, scannable, and clearly labeled with helpful comedic subheadings (*"Lair operating budget"*, *"Keep this under 100%"*).
* **Where It Falls Short:** All four metric cards share identical visual weight, border, and background styling (`.stat { background:linear-gradient(160deg,#201c2d,#171523); border:1px solid var(--line); }` in [`index.html:3`](file:///D:/Repos/evil-genius-agy/index.html#L3)). There is no semantic alert styling: when Public Suspicion reaches 90% (teetering on the edge of the 100% government raid threshold in [`index.html:12`](file:///D:/Repos/evil-genius-agy/index.html#L12)), the card remains placidly slate-purple with standard white typography. The interface fails to communicate operational urgency.

### 1.4 The Mission Cards
* **Current State:** Structured in [`index.html:8`](file:///D:/Repos/evil-genius-agy/index.html#L8) (`render()`):
  ```javascript
  $('missions').innerHTML=missions.map(m=>`<article class="card"><div class="symbol">${m.icon}</div><h3>${esc(m.name)}</h3><div class="pill">REWARD UP TO $${m.reward} · +${m.heat}% HEAT</div><p>${esc(m.desc)}</p><button class="action" data-mission="${m.id}">Launch Operation ↗</button></article>`).join('');
  ```
* **Where It Works:** The narrative descriptions from [`index.html:6`](file:///D:/Repos/evil-genius-agy/index.html#L6) (*"A modest first step. One small theft for a villain, one enormous insurance claim for mankind."*) are sharp, witty, and grounded in consequence.
* **Where It Falls Short:** Visually, the cards resemble generic SaaS pricing tiers. The standalone oversized emojis (`.symbol { font-size:37px; }` displaying `🌕`, `📅`, `☕`) look like casual blog icons. The call-to-action button (`.action { background:var(--lime); color:#192018; }` with text `"Launch Operation ↗"`) reads like a generic software deployment CTA rather than a catastrophic, classified directive from an executive supervillain desk.

### 1.5 The Crew / Henchman Cards
* **Current State:** Rendered in [`index.html:8`](file:///D:/Repos/evil-genius-agy/index.html#L8) from `characters` defined in [`index.html:5`](file:///D:/Repos/evil-genius-agy/index.html#L5):
  ```javascript
  $('crewCards').innerHTML=characters.map(c=>`<article class="card"><div class="face">${c.icon}</div><strong>${c.name}</strong><div class="pill">${c.job}</div><p>${c.bio}</p><div class="mini">LOYALTY ${game.loyalty[c.id]}%</div><div class="bar"><div style="width:${game.loyalty[c.id]}%"></div></div></article>`).join('');
  ```
* **Where It Works:** The one-line bios (*"Has nine PhDs. Eight are suspicious."*, *"Can hack minds. Cannot use a printer."*) are memorable and quick to digest. The loyalty progress bar provides immediate feedback on employee retention.
* **Where It Falls Short:** The cards present raw emojis (`🧪`, `💪`, `🤖`, `📊`) without framing, looking like placeholder avatars. Crucially, they fail to express the dimensional character design mandated by [`GAME_VISION.md:§2`](file:///D:/Repos/evil-genius-agy/GAME_VISION.md#L34-L91): there is no indication of Boris's emotional loyalty, Malpractice's over-engineered tangents, Kevin's anxiety, or CHAOS-9000's obsession with KPI metrics. Furthermore, **Dolores is completely absent** from this view, directly lagging behind the [`ROADMAP.md:0.3`](file:///D:/Repos/evil-genius-agy/ROADMAP.md#L29-L34) mandate for an active NPC presence in the HQ.

### 1.6 The Log / Evil Records
* **Current State:** Rendered in [`index.html:8`](file:///D:/Repos/evil-genius-agy/index.html#L8) into `#recent` and `#fullLog`, styled in [`index.html:3`](file:///D:/Repos/evil-genius-agy/index.html#L3) (`.log { max-height:220px; overflow:auto; font:12px/1.8 'Space Mono'; color:#c8c0d8; }`).
* **Where It Works:** The headline copy in [`index.html:4`](file:///D:/Repos/evil-genius-agy/index.html#L4) (*"THE PAPER TRAIL"* / *"A comprehensive record of preventable mistakes."*) is pitch-perfect workplace satire. Reverse-chronological ordering via `unshift` in [`index.html:7`](file:///D:/Repos/evil-genius-agy/index.html#L7) makes recent events immediately visible.
* **Where It Falls Short:** The log is formatted as a continuous, unstyled terminal stdout dump. There are no character avatars, no speaker badges, and no visual differentiation between routine operating expenses and catastrophic mission failures. When the Bedrock layer generates two sentences of in-character dialogue ([`index.html:12`](file:///D:/Repos/evil-genius-agy/index.html#L12)), it gets smudged into an unbroken text wall without quotation styling, failing to feel like an evidentiary mockumentary archive.

### 1.7 The Mission Execution Modal (Plan Selection + Outcome)
* **Current State:** Implemented in [`index.html:9`](file:///D:/Repos/evil-genius-agy/index.html#L9) (`showDialog()`) and [`index.html:12`](file:///D:/Repos/evil-genius-agy/index.html#L12) (`execute()`).
* **Where It Works:** The selection state cleanly presents the trade-offs between henchman plans (`cost`, `loyalty`, `desc`). The outcome card highlights status using `.outcome { border-left:4px solid var(--pink); }`.
* **Where It Falls Short:** The moment of resolution lacks dramatic pacing and visual weight. When the user clicks `"Approve Horrible Idea"`, the button shows `"Consulting Evil Council…"` ([`index.html:12`](file:///D:/Repos/evil-genius-agy/index.html#L12)), but upon response, the dialog instantly swaps contents with zero transition. When Strands Decider intervenes to reassign the specialist ([`index.html:12`](file:///D:/Repos/evil-genius-agy/index.html#L12): `if(!match) story += ' ' + assigned.name + ' took over the mission instead...'`), this critical AI decision is buried inside the generic body text. There is no visual fanfare, no confidential stamp, and no mockumentary cutaway.

### 1.8 Mobile Breakpoints (Survival at 650px)
* **Current State:** Media queries in [`index.html:3`](file:///D:/Repos/evil-genius-agy/index.html#L3):
  ```css
  @media(max-width:1000px){.shell{grid-template-columns:1fr}.side{padding:16px;display:flex;align-items:center;justify-content:space-between;border-right:0;border-bottom:1px solid var(--line)}.tagline,.note{display:none}.menu{display:flex}.main{padding:20px}.crew{grid-template-columns:repeat(2,1fr)}}
  @media(max-width:650px){.stats{grid-template-columns:repeat(2,1fr)}.cards{grid-template-columns:1fr}.side{display:block}.nav{font-size:12px}.sceneText{max-width:82%}.moon{right:4%;height:75px;width:75px}.sceneText h2{font-size:25px}.top{align-items:start}.crew{grid-template-columns:1fr}}
  ```
* **Where It Works:** Collapsing `.cards` to a single column and `.stats` to two columns prevents massive horizontal scroll on tablets.
* **Where It Falls Short:** At 650px and below, several severe layout collisions occur:
  1. `.side { display:block; }` overrides the 1000px flex layout, but `.menu` remains `display:flex; gap:8px;` ([`index.html:3`](file:///D:/Repos/evil-genius-agy/index.html#L3)). On a 375px mobile screen, three horizontal nav buttons (`◈ Headquarters`, `♟ Henchmen`, `▤ Evil Records`) overflow horizontally or clip.
  2. In the hero scene, `.sceneText { max-width:82%; }` directly overlaps the CSS moon (`right:4%`) and the `.windows` element (`font-size:43px; letter-spacing:18px; right:6%; bottom:24px;`), rendering both the text and the silhouette illegible.
  3. The stats grid padding (`.stat { padding:17px; }`) on a 2-column mobile layout squeezes numbers like `$1240` and labels like `PUBLIC SUSPICION` into cramped, wrapping lines.

### 1.9 Accessibility Audit
* **Color Contrast:**
  - The `--muted` text color (`#a9a3bb` on `#191727`) yields a contrast ratio of ~4.9:1. While acceptable for normal body copy, it is used extensively on micro-typography: 10px in `.tagline` ([`index.html:3`](file:///D:/Repos/evil-genius-agy/index.html#L3)), 10px in `.badge`, and 11px in `.stat label`, `.mini`, and `.footer`. At 10px, WCAG 2.1 AA requires enhanced legibility that this faint purple-grey cannot sustain.
  - The `--gold` accent (`#ffcb73`) on card pills (`.pill { font:10px 'Space Mono'; color:var(--gold); }`) has sufficient theoretical luminance against deep panels, but at 10px monospaced, glyph strokes disappear on standard LCD displays.
* **Focus States & Keyboard Navigation:**
  - There are **zero** `:focus` or `:focus-visible` CSS rules in [`index.html:3`](file:///D:/Repos/evil-genius-agy/index.html#L3).
  - Reset styles (`button { cursor:pointer; font:inherit; } .action { border:0; }`) strip standard browser focus rings. Tabbing through mission options or navigation buttons leaves keyboard users completely blind.
* **Screen Reader Structure:**
  - The modal dialog at [`index.html:9`](file:///D:/Repos/evil-genius-agy/index.html#L9) defines `<div class="modal" role="dialog" aria-modal="true">`, which is a positive start. However, it lacks `aria-labelledby` linking to the dialog's `<h2>`, has no `aria-describedby`, and does not trap keyboard focus within the dialog, allowing background page elements to receive focus while the modal is open.
* **Alt Text on Art Assets:**
  - The CSS scene components (`.moon`, `.tower`, `.windows` in [`index.html:4`](file:///D:/Repos/evil-genius-agy/index.html#L4)) have no `aria-hidden="true"` attributes. Screen readers announce empty divs or punctuation characters (`▪ ▪ ▪`).
  - Standalone emojis (`<div class="symbol">${m.icon}</div>` and `<div class="face">${c.icon}</div>` in [`index.html:8`](file:///D:/Repos/evil-genius-agy/index.html#L8)) lack `role="img"` and `aria-label` descriptions.
* **Motion Reduction:**
  - There is zero handling for `@media (prefers-reduced-motion: reduce)` in [`index.html:3`](file:///D:/Repos/evil-genius-agy/index.html#L3).

---

## 2. Visual Identity Direction: "Deadpan Syndicate"

### Aesthetic Summary
**Deadpan Syndicate** reimagines world domination as a mid-century institutional corporation colliding with catastrophic bureaucratic incompetence. Instead of a futuristic neon-hacker fantasy, the interface adopts the aesthetic of an over-regulated, brutalist conglomerate: sterile institutional slate surfaces, carbon-copy memorandum off-whites, harsh fluorescent desk tones, and authoritative rubber stamps. It treats world-ending superweapons with the mundane gravity of a quarterly budget review, directly honoring the core design philosophy in [`GAME_VISION.md:§1`](file:///D:/Repos/evil-genius-agy/GAME_VISION.md#L5-L6): *"Competent individuals. Catastrophically dysfunctional organization."*

### Palette Architecture (6-Swatch Canon)
| Token Name | Hex Value | Semantic Role in UI | Contrast Ratio vs Background |
| :--- | :--- | :--- | :--- |
| **Lair Foundation** | `#0E0D15` | Global viewport canvas; cold brutalist concrete, replacing generic purple gradients. | Canvas base |
| **Bureaucracy Slate** | `#1B1926` | Card panels, modal bodies, and sidebar surfaces; crisp 1px borders in `#2F2C3F`. | 1.3:1 (Subtle hierarchy) |
| **Carbon Memo White** | `#F1EFEA` | Primary typography and active heading states; stark, uncoated document paper. | 16.2:1 (Exceeds WCAG AAA) |
| **Fluorescent Terminal Green** | `#52E58F` | Positive metrics, budget surplus, approved plans, and Decider AI confidence tags. | 11.4:1 (WCAG AAA) |
| **Red-Tape Crimson** | `#F24E5E` | Public Suspicion warnings, mission cost deductions, HR reprimands, and catastrophic outcomes. | 4.8:1 (WCAG AA Large/Bold) |
| **Manila Docket Muted** | `#9E98B3` | Secondary metadata, policy citations, disabled states, and classified headers. | 5.2:1 (WCAG AA Compliant) |

### Typography Pairing
1. **Primary Typeface (Interface & Headings): `Space Grotesk`** (Weights: 500, 700)
   - *Rationale:* Already linked in [`index.html:2`](file:///D:/Repos/evil-genius-agy/index.html#L2). Its brutalist geometric proportions and idiosyncratic ink-traps evoke mid-century corporate communications without requiring external network dependencies.
2. **Secondary Typeface (Data, Memos, Badges & Telemetry): `Space Mono`** (Weights: 400, 700)
   - *Rationale:* Already linked in [`index.html:2`](file:///D:/Repos/evil-genius-agy/index.html#L2). Conveys teletype cables, audit logs, carbon-copy invoice line items, and government surveillance transcripts.

### Signature Motif: "The Classified Docket Stamp & Memorandum Header"
Every operational container (mission card, crew dossier, and modal) is framed with a top-line bureaucratic docket identifier (e.g., `MEMO REF #EG-091`, `FORM 1099-EVIL`, `INTERNAL AUDIT // EYES ONLY`) paired with angular, monospaced rubber-stamp status chips (`[TECHNICALLY APPROVED]`, `[DOLORES INTERVENTION]`, `[BUDGET ANOMALY]`). This motif bridges the grandiose evil of supervillains with the crushing banality of corporate procedure.

### Three Concrete Brand "Do-Not's"
1. **DO NOT use cyberpunk neon blooms, sci-fi lens flares, or multi-color pastel gradients.** (This is an office complex that happens to harbor an unlicensed death ray, not a space-station nightclub. Maintain matte, institutional finishes).
2. **DO NOT render floating, unbordered emojis as character representations.** (Every henchman icon must be grounded in an ID badge or personnel file docket with credentials, title, and department).
3. **DO NOT use gamified RPG progress bars or mobile-game shiny buttons.** (Loyalty, suspicion, and budget must look like corporate telemetry meters, expense line items, or punch-card readouts).

---

## 3. Mockumentary Interface Elements (M1-Adjacent, Demo-Worthy)

Per [`AGY_BRIEF.md:§3`](file:///D:/Repos/evil-genius-agy/AGY_BRIEF.md#L80-L96) and [`ROADMAP.md:1.1`](file:///D:/Repos/evil-genius-agy/ROADMAP.md#L53-L58), Milestone 1 will introduce live Bedrock-powered Confessional Booths. For Milestone 0, we propose **purely visual UI hooks** that elevate the demo video without mutating engine state or altering gameplay math ([`GAME_VISION.md:§5`](file:///D:/Repos/evil-genius-agy/GAME_VISION.md#L167-L184)).

### 3.1 The Confessional Stub Card Component
A static visual placeholder positioned in the HQ sidebar beneath navigation or within the main dashboard:
* **Component Wireframe:**
  ```html
  <div class="confessional-stub" aria-hidden="true">
    <div class="stub-header">
      <span class="rec-dot">● REC</span>
      <span class="cam-id">CAM-02 // INTERVIEW RM B</span>
    </div>
    <div class="stub-monitor">
      <div class="scanlines"></div>
      <div class="test-bars"></div>
      <div class="silhouette-placeholder">♟</div>
      <div class="status-overlay">STANDBY FOR POST-MORTEM</div>
    </div>
    <div class="stub-caption">
      <strong>MANDATORY 1-ON-1 INTERVIEWS</strong>
      <p>Scheduled for Q2 roll-out per Dolores (HR Memo #88-B). Refusal to testify will be noted in permanent file.</p>
    </div>
  </div>
  ```
* **Visual Styling:** Framed like a closed-circuit CRT security monitor with 1px horizontal scanlines, a muted monochrome silhouette, a pulsing red recording dot, and a yellow warning tag (`[SCHEDULED FOR Q2]`). It costs zero API calls and plants the comedic seed directly in the demo walkthrough.

### 3.2 Mission Outcome Cinematic Treatment (The "Documentary Cutaway")
When resolving an operation in [`index.html:9`](file:///D:/Repos/evil-genius-agy/index.html#L9) (`showDialog()`):
* **Visual Letterboxing:** Frame the narrative result container with top and bottom 18px black letterbox bands to signal a shift from operational simulation to mockumentary interview mode.
* **Lower-Third Documentary Chyron:** Above the Bedrock narration text block, inject a documentary-style lower-third nameplate:
  ```html
  <div class="doc-chyron">
    <div class="chyron-title">DR. MALPRACTICE</div>
    <div class="chyron-subtitle">Chief Science Officer // 9 PhDs (8 Suspicious)</div>
    <div class="chyron-timestamp">TC 01:14:08:22 — LAIR SUB-LEVEL 4</div>
  </div>
  ```
* **AI Decision Spotlight:** Display a discrete telemetry stamp above the narration showing Decider 2B's contribution: `[STRANDS DECIDER: SPECIALIST OVERRIDE APPLIED (CONFIDENCE 89.2%)]`. This visually demonstrates the AI integration required for the hackathon criteria without breaking narrative immersion.

### 3.3 Log Evolution into Mockumentary Archive
* **One-Line Evolution Note:** Evolve the current flat stdout log into a stamped **"Corporate Incident Docket"**, where each entry is prefaced with a timestamped speaker avatar chip and categorized under bureaucratic stamps (`[FIELD DISASTER]`, `[ACCOUNTING IRREGULARITY]`, `[HR INTERVENTION]`).

---

## 4. Three Highest-Impact Improvements (Ranked)

### Rank 1: The Mission Outcome Dossier & AI Intervention Spotlight
* **One-Sentence Problem:** High-stakes AI decisions (Decider tool reassignments and Bedrock narrative dialogue) are currently dumped into an instantaneous, unstyled purple container ([`index.html:9`](file:///D:/Repos/evil-genius-agy/index.html#L9)) with zero dramatic hierarchy, obscuring the hackathon's core technical achievement.
* **One-Paragraph Fix:** Overhaul the outcome modal markup and styling in [`index.html:9`](file:///D:/Repos/evil-genius-agy/index.html#L9). Introduce a classified memo header (`MISSION DEBRIEF // LEVEL 4`), split the outcome card into two visual tiers: (1) a dedicated **"Executive Field Report"** featuring the Bedrock narrative with documentary letterbox styling, quotation marks, and assigned henchman chyron; and (2) a **"Strands Decider Action Telemetry"** badge that distinctly highlights when the AI selected an alternative specialist tool (`"Specialist Override: Boris reassigned to Force Plan (Coordination Penalty Applied)"`). Replace the generic `"Back to Headquarters"` button with a high-contrast `"File Report & Dismiss Henchmen"` button.
* **Target:** [`index.html:3`](file:///D:/Repos/evil-genius-agy/index.html#L3) (`.outcome`, `.modal`), [`index.html:9`](file:///D:/Repos/evil-genius-agy/index.html#L9) (`showDialog()`), and [`index.html:12`](file:///D:/Repos/evil-genius-agy/index.html#L12) (`execute()`).
* **Estimated Change Size:** Small (`S`, ~35 lines of CSS/markup adjustments).
* **Owner:** Codex (gameplay and `index.html` maintainer).
* **Why This Ranks Above Others:** This modal represents the climax of the entire gameplay loop and the exact surface where Decider 2B and Amazon Bedrock demonstrate their value. In a demo video and article screenshots, this is the hero moment that proves the AI integration works.

### Rank 2: Henchman Personnel Dossiers & Dolores NPC Sidebar Integration
* **One-Sentence Problem:** The henchmen cards are rendered as generic boxes with raw emojis and identical pink progress bars ([`index.html:8`](file:///D:/Repos/evil-genius-agy/index.html#L8)), failing to communicate the character voices from [`GAME_VISION.md:§2`](file:///D:/Repos/evil-genius-agy/GAME_VISION.md#L34-L91), while Dolores (the crucial M0 NPC required by [`ROADMAP.md:0.3`](file:///D:/Repos/evil-genius-agy/ROADMAP.md#L29-L34)) has zero visual presence.
* **One-Paragraph Fix:** Restyle `.crewCards` into corporate employee security badges. Wrap each icon in a bordered badge frame with employee serial numbers (`ID #004-MAL`, `ID #007-BORIS`). Add visual badges for their specialty (`SCIENCE`, `FORCE`, `DECEPTION`, `FINANCE`). Replace the generic pink bar with a segmented telemetry meter (`LOYALTY RETENTION INDEX`). Crucially, fulfill [`ROADMAP.md:0.3`](file:///D:/Repos/evil-genius-agy/ROADMAP.md#L29-L34) by injecting a distinct **"STAFF (NPC)"** card for **Dolores (Director of Human Resources)** into the sidebar or crew grid, styled with a greyed-out `"NON-FIELD PERSONNEL // HR MONITORING ACTIVE"` tag, establishing her presence ahead of the heat-triggered intervention.
* **Target:** [`index.html:3`](file:///D:/Repos/evil-genius-agy/index.html#L3) (`.crew`, `.face`, `.bar`), [`index.html:4`](file:///D:/Repos/evil-genius-agy/index.html#L4) (`<aside class="side">`), and [`index.html:8`](file:///D:/Repos/evil-genius-agy/index.html#L8) (`render() crewCards`).
* **Estimated Change Size:** Small (`S`, ~40 lines of CSS/markup).
* **Owner:** Codex.
* **Why This Ranks Above Others:** The game’s premise is *"Manage the idiots"* ([`GAME_VISION.md:§1`](file:///D:/Repos/evil-genius-agy/GAME_VISION.md#L3)). Visible, comedic character dynamics drive player investment in mission plans and make the lore memorable.

### Rank 3: Operations Command Telemetry & Heat-Reactive Hero Banner
* **One-Sentence Problem:** The top-level hero banner is an inert CSS illustration ([`index.html:3`](file:///D:/Repos/evil-genius-agy/index.html#L3)), and the four stat cards treat existential catastrophe (Public Suspicion reaching 100%) with the same visual passivity as positive bank balances.
* **One-Paragraph Fix:** Modernize the hero `.scene` container into an **"Operations Command War Room"** board. Layer a subtle CRT scanline overlay over the tower silhouette. Make the header banner dynamically react to `game.heat`: when `heat < 50%`, show green surveillance status (`"NORMAL SECRECY LEVELS"`); when `heat >= 80%`, shift the top border to pulsing Red-Tape Crimson (`#F24E5E`) with an urgent warning banner: `"SUBPOENA RISK IMMINENT // DOLORES HR AUDIT SCHEDULED"`. Apply semantic color accents to the stat cards: Fluorescent Terminal Green (`#52E58F`) on War Chest, and Red-Tape Crimson on Public Suspicion.
* **Target:** [`index.html:3`](file:///D:/Repos/evil-genius-agy/index.html#L3) (`.scene`, `.stats`, `.stat`), [`index.html:4`](file:///D:/Repos/evil-genius-agy/index.html#L4) (`#hqView .scene`), and [`index.html:8`](file:///D:/Repos/evil-genius-agy/index.html#L8) (`render() stats`).
* **Estimated Change Size:** Small-to-Medium (`S/M`, ~45 lines of CSS/JS).
* **Owner:** Codex.
* **Why This Ranks Above Others:** This area occupies the above-the-fold viewport upon page load. Establishing clear operational stakes and ambient life here sets the tone for the entire user experience.

---

## 5. Responsive + Accessibility Punch List

### Responsive Layout (Phone & Laptop Video Cutaways)
1. **Fix Navigation Overflow at Mobile Widths:**
   - *Problem:* In [`index.html:3`](file:///D:/Repos/evil-genius-agy/index.html#L3) (`@media(max-width:650px)`), `.side { display:block; }` but `.menu { display:flex; gap:8px; }` forces three text buttons into a horizontal row that overflows viewports below 400px.
   - *Fix:* In the 650px media query, set `.menu { display:grid; grid-template-columns:repeat(3, 1fr); gap:6px; }` and `.nav { text-align:center; padding:9px 4px; font-size:11px; white-space:nowrap; }`.
2. **Prevent Scene Text and Tower Collision:**
   - *Problem:* In [`index.html:3`](file:///D:/Repos/evil-genius-agy/index.html#L3), `.sceneText { max-width:82%; }` collides with `.windows { right:6%; bottom:24px; font-size:43px; }` and the `.moon` element on narrow viewports.
   - *Fix:* At 650px, hide the decorative `.windows` element (`.windows { display:none; }`), scale `.moon` to 55px, and set `.sceneText { max-width:100%; z-index:2; }`.
3. **Prevent Stat Card Clipping:**
   - *Problem:* `.stat { padding:17px; }` with large `strong { font-size:26px; }` text overflows or wraps numbers awkwardly when `.stats` splits into 2 columns on 360px–414px mobile screens.
   - *Fix:* At 650px, adjust `.stat { padding:10px 12px; }` and `.stat strong { font-size:20px; }`.
4. **Modal Viewport Centering & Scrolling:**
   - *Problem:* On mobile devices, `.modal { padding:26px; max-height:93vh; }` combined with plan options can push the action buttons off-screen without an obvious scroll affordance.
   - *Fix:* Set `.modal { padding:16px; max-height:90vh; display:flex; flex-direction:column; }` and place `.controls` in a sticky bottom container (`position:sticky; bottom:0; background:var(--panel); padding-top:12px;`).

### Accessibility (WCAG 2.1 AA Compliance)
5. **Universal Keyboard Focus Rings:**
   - *Problem:* [`index.html:3`](file:///D:/Repos/evil-genius-agy/index.html#L3) strips native outlines with zero replacement styles.
   - *Fix:* Add a global rule:
     ```css
     button:focus-visible, .option:focus-visible, input:focus-visible { outline: 2px solid var(--lime); outline-offset: 2px; }
     ```
6. **Legibility & Micro-Font Contrast:**
   - *Problem:* 10px and 11px monospaced text using `--muted` (`#a9a3bb`) fails contrast and minimum font-size readability guidelines.
   - *Fix:* Bump base label sizes from 10px/11px to 12px, and replace faint `#a9a3bb` with `#9E98B3` on dark backgrounds (yielding at least 5.2:1 contrast ratio).
7. **Screen Reader Dialog Structure:**
   - *Problem:* The modal in [`index.html:9`](file:///D:/Repos/evil-genius-agy/index.html#L9) lacks heading associations and focus management.
   - *Fix:* Give the modal heading an explicit ID (`<h2 id="dialogHeading">`) and attach `aria-labelledby="dialogHeading"` to `.modal`. On modal open, programmatically focus the first interactive element; return focus to the trigger button on close.
8. **Art & Emoji Accessible Attributes:**
   - *Problem:* Pure CSS art divs (`.moon`, `.tower`, `.windows`) and raw emojis (`.symbol`, `.face`) pollute screen reader accessibility trees.
   - *Fix:* Add `aria-hidden="true"` to `.moon`, `.tower`, `.windows`. Wrap emojis in `<span role="img" aria-label="Moon Icon">🌕</span>`.
9. **Prefers-Reduced-Motion Respect:**
   - *Problem:* No motion dampening for users with vestibular sensitivities.
   - *Fix:* Add an explicit rule:
     ```css
     @media (prefers-reduced-motion: reduce) { *, ::before, ::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; } }
     ```

---

## 6. Scope Guard

This design report was conducted in strict read-only mode on the `agy/design` branch of worktree `D:\Repos\evil-genius-agy`. The specialist did not modify any existing codebase file, did not create any file outside `AGY_DESIGN_REPORT.md` at the repository root, did not touch sibling worktrees, did not run `git commit`, `git push`, `git merge`, or `git rebase`, and did not issue any network calls to AWS services or remote inference endpoints. All recommendations in this document are strictly confined to the front-end presentation layer inside `index.html` (Codex's turf) and maintain complete compatibility with the deterministic offline engine and backend API contracts. These proposals are documented here for Codex to implement in a subsequent development cycle.
