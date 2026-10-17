# Campaign pacing fix

Implemented locally following the approved design. Public game, contest entry, and AWS configuration unchanged.

- A successful funding, satellite, or prototype Breach secures its campaign milestone even if Escape fails. Lost escapes still cost rewards, heat, and crew condition. The Moon still requires a successful Escape to win.
- Completed failed attempts earn +5 to future stage modifiers, capped at +15. Forfeiting or bailing out does not grant learning. The bonus persists across retries and save/load.
- Headquarters now explains high heat, stressed crew, high Boris rage, and broken gear beside the campaign checklist. Heat and crew advice includes the existing recovery actions with normal costs and availability checks.
- Existing campaign saves infer secured milestones from recorded successful Breaches. Legacy short runs keep their previous progression rules.

## Verification

All 99 automated tests passed. New regressions cover saved milestones, unlocks after failed Escape, retry bonus persistence, forfeiting, and the bonus cap. Browser inspection verified the new recovery panel and milestone labels using an existing saved victory; this was not a new full browser campaign after the pacing changes.

900 scripted policy runs were compared with the previous version, then repeated with a longer cutoff to investigate unfinished runs. All extended runs finished; no permanent stalls were observed. Simulations are informed engine strategies, not human playtime measurements.

| Policy | Previous average days | New average days | Previous longest extended run | New longest extended run |
| --- | ---: | ---: | ---: | ---: |
| First available stage choices | 14.32 | 11.38 | 70 | 26 |
| Deliberately lowest stage odds | 20.13 | 16.27 | 82 | 47 |
| Favorable stage odds | 11.84 | 10.54 | Not compared | 20 |

Previous averages use the 35-day cutoff; new first-available and favorable runs all finished within that cutoff. The new worst-choice average above is from the extended run, so it includes its remaining long attempt. The comparison is directional, not a claim that every player's pacing is solved. Poor choices can still produce long runs, and human enjoyment remains unmeasured.
