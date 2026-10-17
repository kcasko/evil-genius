# infra/agentcore — deploy-day commands (not run; freeze until 2026-10-16)

Everything in this file is **preparation only**. Nothing here has been
executed. All of it is a control-plane read, a local file write, or is
explicitly gated behind the human `+approve` step in
`AWS_DEPLOYMENT_PLAN_V2.md` §9 step 8.

## Provenance (verified 2026-10-14)

- Upstream: `https://github.com/Vivek0712/strands-decider-agentcore` (MIT-0).
- `main` resolves to commit `f9691ee9b2891ecb72308377947e4d655f07bde5`
  (confirmed via `gh api repos/Vivek0712/strands-decider-agentcore/commits/main`),
  matching `AWS_DEPLOYMENT_PLAN_V2.md`'s "f9691ee9" abbreviated SHA exactly.
- `Dockerfile` and `requirements.txt` in this directory mirror the pinned
  commit's `runtime/Dockerfile` and `runtime/requirements.txt` verbatim
  (fetched and diffed against this directory's copies on 2026-10-14).
- `agentcore.json` in this directory is the pristine upstream project
  manifest (`agentcore/agentcore.json` at the pinned commit) with
  `name`/`tags` renamed to `EvilGenius`, plus one `runtimes[]` entry
  pre-populated with the exact output `deciderctl add` would produce --
  see "Model pin" below.

## Model pin: approved Hobson v19

`agentcore.json` pins the already-validated
`StrandsAgents/strands-decider-2B-hobson-v19` revision
`bb282d786bc251fd4e3068de3ada9ddbb38127cd`. Neither Hobson v21 nor the
newer `strands-decider-2B-qwen3.5-v1-2610` may replace it merely because a
new model exists. A replacement requires the separate int8 parity, memory,
latency, confidence-calibration, and game-contract tests described in
`DECIDER_V1_QWEN35_REVIEW.md`; this offline task did not download weights or
invoke either model.

## Exact deploy-day command sequence

1. **Fork the upstream repo to a private mirror**, pinned at
   `f9691ee9b2891ecb72308377947e4d655f07bde5`. Audit `runtime/`,
   `agentcore/`, `deciderctl.py`, `client/decider_client.py` for secret
   leakage and prompt-injection surface before anything else
   (`AWS_DEPLOYMENT_PLAN_V2.md` §9 step 1, §11 risk 7). Not done here.
   ```bash
   git clone https://github.com/Vivek0712/strands-decider-agentcore.git
   cd strands-decider-agentcore
   git checkout f9691ee9b2891ecb72308377947e4d655f07bde5
   # push to a private mirror under the org's control; keep the NOTICE
   # file (MIT-0 attribution) intact.
   ```
2. **Reconcile `runtime/Dockerfile` and `runtime/requirements.txt`** in
   the mirror against this directory's copies (as of 2026-10-14 they are
   identical in substance; diff them again at fork time in case upstream
   moved).
3. **Copy this directory's `agentcore.json`** over the mirror's
   `agentcore/agentcore.json` (or re-run `python deciderctl.py add
   evilgenius --model v19 --idle-timeout 300` against the pristine
   manifest and diff the result against this committed file as a
   regression check -- they should be byte-identical).
4. **Resolve the AWS target** (control-plane read only, `sts:GetCallerIdentity`,
   not billable):
   ```bash
   python deciderctl.py target --region us-east-1
   ```
5. **Stop. Produce the deploy-day report and wait for the explicit
   `+approve`** (`AWS_DEPLOYMENT_PLAN_V2.md` §9 step 8). Only after that:
   ```bash
   agentcore deploy -y
   ```
6. **Post-deploy idle-timeout verification -- the single most important
   check in this entire deploy** (`AWS_DEPLOYMENT_PLAN_V2.md` §9 step 5,
   §11 risk 3: missing this turns ~$100/mo into ~$360/mo at 10k
   decisions/mo). The plan and this runbook consistently use the
   `bedrock-agentcore-control` control-plane service and the nested
   `lifecycleConfiguration.idleRuntimeSessionTimeout` field, as verified
   against the installed botocore service model (boto3 1.42.89,
   2026-10-14):
   ```bash
   aws bedrock-agentcore-control get-agent-runtime \
     --agent-runtime-id <id> \
     --query 'lifecycleConfiguration.idleRuntimeSessionTimeout'
   ```
   Expected output: `300`. If it returns `1800` (the `deciderctl add`
   default -- confirmed in `deciderctl.py`'s argparse default for
   `--idle-timeout`), stop and re-apply before serving traffic.
7. **Teardown** (after the hackathon demo, or on kill-switch escalation):
   ```bash
   python deciderctl.py remove evilgenius
   agentcore deploy -y
   ```
   Then disable CloudWatch Transaction Search at the account level
   (console toggle; it auto-enables on the first AgentCore deploy in an
   account -- `AWS_DEPLOYMENT_PLAN_V2.md` §11 risk 5,
   `OPENCODE_V2_COST_REVIEW.md` finding #7).

## What this directory does NOT include

`runtime/main.py`, `runtime/decider_runtime/`, and `client/decider_client.py`
are not duplicated into this game repo -- they live in the forked mirror
from step 1 above. `infra/agentcore/Dockerfile` is written to replace the
mirror's own `runtime/Dockerfile` 1:1.
