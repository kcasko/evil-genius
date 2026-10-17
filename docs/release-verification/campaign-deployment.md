# Public campaign deployment

Game: https://d2gk454hfl6odl.cloudfront.net/

Deployed the tested static campaign from local commit `ed7a037e86639c0e36f7994eda5e898c9028849f` to the existing Evil Genius site bucket. Ten files changed. CloudFront invalidation completed. All 41 checked public HTML, script, and artwork files matched the local release byte-for-byte.

Previous S3 object versions were recorded in `campaign-rollback.json`; bucket versioning is enabled. No objects were deleted. The API, runtime, daily quotas, kill-switch deadline, and cost watchdog were not reconfigured. No new AWS resources were created.

The public browser recognized an existing short-run save and preserved its legacy mode. Starting New Game initialized the campaign and displayed AI LIVE. Public Scout and Approach stages passed through visible controls. One real public Breach attempt was reserved for deployment verification, with no automatic retries.

The release had 101 passing automated tests, prior local browser playthroughs, pacing simulations, and three real contract decision/narration integration fixture pairs. Public source repository, article, and demo were not changed by this deployment. Their alignment remains separate release work. No push or merge performed.

## Completed public browser check
The fresh public campaign completed Raid Rival Payroll through visible controls. Breach used provider decider and selected Kevin/finance; the page displayed Nova Lite dialogue and an explicit cosmetic-only label. Escape succeeded. Reload preserved the payroll milestone, recovery advice, and AI LIVE. No browser console errors were observed. This was one full public operation, not a full public campaign playthrough. Deployment verification used one additional Decider call and one narration, with no automatic retries.
