# Campaign live integration check

Used the existing public AWS API with prepared Breach fixtures from the local campaign engine. This was a real paid-service integration test, not a fresh browser campaign or campaign deployment.

## Results

| Contract | Real Decider choice | HTTP elapsed | Narration elapsed |
| --- | --- | ---: | ---: |
| Raid Rival Payroll | deception | 73.078 s | 1.609 s |
| Hijack the Uplink | science | 20.969 s | 1.171 s |
| Field-test the Shrink Ray | science | 22.079 s | 1.203 s |

All six requests returned HTTP 200. Decisions matched available specialist skills, had valid confidence values, and were accepted by the local engine with provider `decider`. Narration came from provider `bedrock`. Engine rolls and outcomes remained controlled by the deterministic engine.

The first narration invented a "97% success rate." The local AI client now suppresses numeric/percentage/currency narration and keeps the engine's result visible. The character name CHAOS-9000 remains allowed. Tests reproduce the observed output and verify ordinary flavor remains available. This check does not detect every possible narrative contradiction or a statistic written entirely in words. The frontend also now sends the narrator the actual mission name and objective instead of a generic Breach description. These changes are local and have not been deployed.

All 101 source tests passed after these fixes. No additional model calls were made to test the display filter; captured output was used instead.

## Controls verified

- Account 227755136653, region us-east-1.
- Existing pinned Hobson v19 revision bb282d786bc251fd4e3068de3ada9ddbb38127cd, int8, CPU.
- Runtime idle timeout 300 seconds, maximum lifetime 600 seconds.
- Bridge origin uses AWS_IAM authentication.
- Server limits remain 10 requests per player and 50 globally per UTC day.
- DynamoDB global counter read back 6 after this test, matching three decisions and three narrations.
- Kill-switch flag and its deadline were read before/after; no toggle was performed during this test so the public judging service stayed available.
- Existing watchdog cost threshold reads $180. No cost-control configuration was changed.

No resources were created, no campaign was deployed, and no source was pushed. Existing judging infrastructure remains running with its existing controls.

## Cost limits

Calls were reserved in a separate local ledger before sending, with at most three decisions and three narrations and no automatic retries. The allowance is exhausted and the runner refuses to repeat when its ledger exists.

Cost Explorer returned estimated data without the new inference charges. Exact incremental test cost and current remaining promotional credit are not verified. A zero entry is not evidence this test was free. No new runtime session was intentionally kept alive after the final request; configured idle expiry remains responsible for releasing it.

Remaining release work: deploy the reviewed candidate, test its browser flow against the live API, then align public source, article, and approved-host video. This report does not claim those steps are complete.
