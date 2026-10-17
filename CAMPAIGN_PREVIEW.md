# Campaign preview

This branch is a local gameplay candidate. It has not replaced the public game or contest source. No new AWS infrastructure or paid inference was used to test it.

Run `python -m http.server 8766 --bind 127.0.0.1` from this directory, then open http://127.0.0.1:8766/. New Game starts a campaign. Existing v02 saves retain their original short-run rules and are labeled as legacy saves. This plain local server has no AI endpoints, so testing uses the existing deterministic fallback.

## Progression

1. Raid Rival Payroll earns money and opens satellite preparation.
2. A completed Server Room enables Hijack the Uplink. Success permanently gives Moon stages +5.
3. An online Laboratory enables Field-test the Shrink Ray. A successful Breach secures the test milestone and +5 Moon Breach, even if escape fails. Losing the loot does not erase a successful equipment test.
4. Research at least one item. Consuming it later does not erase research progress.
5. Launch the Moon finale for $150 and 2 CP after these milestones are secured.

Operations use one launch slot per game day, including failed/forfeited attempts and optional recon. Smaller jobs cost 1 CP plus their listed cash fee. Construction, research, crew recovery, crisis handling, and laying low compete for the remaining points. Lay low costs $25 and 1 CP for -15 Heat. There is no real-time day timer or artificial waiting period.

The same specialist-selection and cosmetic-narration path handles the new jobs. Mission objectives are included in the model context. Backend quotas and cloud resources are unchanged. No real model response for a new mission was tested in this offline preview.

## Verification and limits

Run `node scripts/verify-contest.mjs` for the existing gameplay/save/availability checks and new progression checks. Run `node scripts/playtest-campaign.cjs` for 30 deterministic campaign simulations. These simulations demonstrate reachable wins with a resource-management strategy; they do not measure human enjoyment or playtime.

A separate browser walkthrough from a fresh save reached victory on day seven, including construction, research, recovery, and two failed prototype escapes. The milestone rule was refined during that playthrough to avoid repeating a proven shrink-ray test. Final balance was additionally checked with the seeded simulations. A human playtest is still needed before calling this a 10–15 minute game.

## Balance follow-up

Campaign failures now recover the launch fee without generating profit. Success rewards remain unchanged. Escape plans rely on one relevant specialist and matching equipment: fast uses science, clever uses deception, and loud uses force. Every assigned crew member still takes escape stress. Legacy short runs retain their previous rules.

Independent strategy tests found recovery and repairs meaningful, while failures previously generated cash. A fresh browser campaign reached a heat defeat on day four after a failed prototype escape, despite retaining $652. This is a completed loss playthrough, not evidence of a victory or a human playtime benchmark.

A fresh revised-balance browser run subsequently reached victory on day six with $801, 64% heat, and 74 infamy. Victory persisted after reload. All 97 tests passed. Long retry loops remain possible in deliberately poor-choice simulations.

## Contest follow-up

The full Rules tab specifies YouTube, Vimeo, Facebook Video, or Youku for the public demo. The existing CloudFront-hosted video alone does not meet that hosting requirement. The rules give an October 23, 2026, 11:59 PM Pacific deadline and evaluation after close, but do not explicitly state a policy for revisions. Existing articles/projects expose edit controls. Leave the current entry available while reviewing this candidate; align the eventual approved source, game, article, and supported-platform video before the deadline.

## Pacing revision
Contract Breach success now secures its campaign milestone even if Escape fails. Completed failures add +5 retry help, capped at +15; forfeiting adds none. Headquarters shows recovery advice with existing actions. All 99 automated tests passed. First-available simulated choices average 11.38 game days, longest 26 versus the earlier 70. Deliberately poor choices can still take 47 days. No new full browser campaign was played after this pacing revision; browser inspection confirmed the recovery panel and milestone labels.
