# EVIL GENIUS — AWS Deployment Plan V2 (Cost-first, scale-to-zero)

Status: proposed revision for approval. Supersedes `AWS_DEPLOYMENT_PLAN.md`.
No AWS resources have been provisioned. The deployment freeze until
**2026-10-16** remains in force, and 2026-10-16 is not automatic
authorization — the next billable action still requires explicit human
approval of this document.

Snapshot date: 2026-10-14. All prices are current `us-east-1` on-demand,
drawn from pages footnoted inline; re-verify immediately before any
deploy.

## 1. Why V1 is rejected

The approved-and-committed V1 architecture (one stopped-by-default
`g4dn.xlarge` + S3/CloudFront) hits roughly $20.63/month at the 20 h/mo
demo profile, but the full stack if it were ever left running tops out
near $400/month (`g4dn.xlarge` at $0.526/h × 730 h ≈ $383.98 plus EBS,
EIP, and CloudFront). It also keeps **~$10/month baseline cost** when
stopped (EBS gp3 80 GB ≈ $6.40 + public IPv4 ≈ $3.65). With roughly
$200–$230 in remaining AWS credits, that envelope is unacceptable.

New targets (hard):

- Under $10/month with light traffic
- Review required before any plan expected to exceed $20/month
- $5 initial private testing target; further approval required for anomalies or expansion
- Near-zero idle compute cost
- No recurring GPU EC2 at any time

## 2. The reference implementation we are adopting

Vivek Raja (AWS Hero), 2026-10-07, measured deployment in `us-east-1`:
**"Serving Strands Decider on Amazon Bedrock AgentCore Runtime: a 2B
Decision Model in a 2 vCPU, 8 GB MicroVM with the AgentCore CLI."**

- Builder Center article: `https://builder.aws.com/content/3KNqrNkiEtf7wTUzTufirwAVL7O/`
- Open-source repo (MIT-0): `https://github.com/Vivek0712/strands-decider-agentcore`

Published facts we treat as the measured ground truth (every number is
quoted or computed from the article or `README.md`):

| Property | Value | Source |
|---|---|---|
| Container image size | 1.56 GB (no weights baked) | README §Measured performance |
| Cold start (first call → ready) | 45–90 s | README table |
| &nbsp;&nbsp;↳ breakdown | HF download 18 s, load 3 s, LoRA merge 10 s, int8 quantize 14 s, warm-up 16 s | Builder Center article |
| Resident memory, ready | 4.24 GB | README |
| Peak memory while loading | 6.6 GB | README |
| Warm single-question latency | ~7.6 s | README |
| Warm 3-question decision | 20–23 s | README |
| Precision parity | 30/30 agreement to local int8; **28/30** to bf16 reference | README |
| License | MIT-0 (code); Apache-2.0 (model weights) | repo |
| Hardware | 2 vCPU AWS Graviton2 microVM, 8 GB RAM | README |

AgentCore Runtime bills per-second: no pre-allocation, no fixed instance
cost, no idle CPU charge, memory billed on peak-up-to-this-second.
Session-isolated per `runtimeSessionId`; idle timeout configurable 60 s
to 8 h (default 30 min).

## 3. Scale-to-zero options compared

| Option | Model fits? | Cold start | Max exec | Billing model | Verdict |
|---|---|---|---|---|---|
| **Bedrock AgentCore Runtime microVM** | ✅ 2B int8 in 8 GB (6.6 GB peak, 4.2 GB resident), measured | 45–90 s | 8 h session max; idle 60 s–8 h | per-second active vCPU + peak GB | **Recommended.** Only option with a published 2B-fit measurement. |
| Fargate ARM 2 vCPU / 8 GB, scale-to-zero via scheduler | ✅ fits | ~45 s image pull + 90 s load (~135 s) | unlimited | per-second task time | Task rate is unverified against our pre-staged sources (back-computed as ~$0.0932/task-h). ALB can be replaced by an API Gateway HTTP API or a Lambda Function URL to drop the +$18/mo ALB line. Still rejected vs AgentCore: ~2× longer cold start and requires an external scale-to-zero scheduler (not truly serverless). |
| Fargate always-on | ✅ fits | n/a | n/a | always-on | $68/mo task + $18 ALB = **~$86/mo. Rejected.** |
| **Lambda container (ARM) 10 GB RAM** | ⚠️ tight — allocated memory (10 GB) bills for the full invocation duration, including idle | 60–90 s model warm-up per cold container (fits well inside the 15-min hard cap) | 15 min hard cap | per GB-second, allocated-memory billing | ~$0.001 warm/decision vs AgentCore ~$0.00046 (~2.2× warm cost); no graceful "loading" state; 15-min idle teardown forces frequent re-cold-starts. **Fallback, not primary.** |
| Small CPU EC2 (`c7g.xlarge`, 4 vCPU / 8 GB) stop-start | ✅ fits | ~2–4 min full boot + model load | n/a | per-hour EC2 + EBS/EIP | 1 h/day: $14.34/mo baseline floor. **Loses to AgentCore for low traffic.** |
| GPU EC2 (`g4dn.xlarge`) stop-start | ✅ overkill | ~3–7 min | n/a | per-hour | $20.63/mo at 20 h/mo demo profile. **V1. Rejected per new mandate.** |
| GPU EC2 for benchmarking | ✅ technically | n/a | one shot | hourly | **Not authorized.** Any GPU EC2 test requires a new policy and explicit resource-creation approval. |
| SageMaker Serverless Inference | ❌ 6 GB RAM max | ~60 s | 60 min | per request + duration | **Rejected** — doesn't fit the 2B int8 workload. |
| Bedrock Custom Model Import | ❌ not a supported path for Strands Decider's LoRA-on-Qwen3.5 | — | — | — | **Not applicable.** |

## 4. Measured cost model

Rates (us-east-1, retrieved 2026-10-14 from
`https://aws.amazon.com/bedrock/agentcore/pricing/`):

- AgentCore Runtime v1 microVM: **$0.0895 / vCPU-hour**, **$0.00945 / GB-hour**, per-second billing, 128 MB memory floor (not binding for this workload).
- AgentCore Runtime v2 (consumption): **$0.1276 / vCPU-hour**, **$0.0169 / GB-hour** — CPU is 1.43× v1, memory is 1.79× v1; chosen only if v2-only features are required.
- Amazon Nova Lite on-demand (narration): **$0.06 / 1M input tok**, **$0.24 / 1M output tok**
- ECR storage: $0.10 / GB-month → 1.56 GB image = **$0.16/mo**
- CloudFront OAC + IAM authentication for the Lambda function URL: **$0**. This replaces the earlier Secrets Manager origin-header design and its $0.40/month secret.

**Memory billing shape.** Per the AgentCore pricing page, "memory is charged for the peak memory consumed up to that second," and peak is held for the session lifetime. The workload peaks at **6.6 GB during the int8 quantization step** of the cold start (Vivek README §Measured performance) and settles to 4.2 GB resident afterward — but the full session is billed at the 6.6 GB peak. The 4.2 GB resident figure is useful for capacity planning (fits in 8 GB), not for cost.

**CPU billing shape.** CPU scales to zero during I/O wait. Of the 90 s wall-clock cold start, ~18 s is Hugging Face download (network I/O, CPU idle), so active CPU during cold start is ~52 s. Warm single-question decisions bill ~7.6 s of 2 vCPU each (`backend/agent.py:call_decider` sends one `choice` question per decision; if we ever map a "decision" to a 3-question sequence, the warm CPU term rises ~2.7×).

Session shape assumption: a game session runs ~10 game decisions, followed by a 300 s idle hold — **short enough to kill memory cost, long enough to absorb a player re-engaging mid-match**. 300 s is **not the default** (default is 15–30 min / 1,800 s). It is committed in `infra/agentcore/agentcore.json` as `lifecycleConfiguration.idleRuntimeSessionTimeout: 300`; the deploy command consumes that manifest. §9 locks the manifest-generation and post-deploy verification commands.

Formula per session (peak memory, active CPU):
`cost = (52 + N·7.6)/3600 · 2 · $0.0895 + (90 + N·7.6 + idle_s)/3600 · 6.6 · $0.00945`

### Published rate-card table (AgentCore Runtime v1, 10 decisions/session, 300 s idle, peak-memory billing)

| Decisions / month | Decider CPU | Decider memory | Decider total | Nova Lite narration | ECR | OAC auth | **Total** |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 100 | $0.06 | $0.08 | $0.14 | $0.008 | $0.16 | $0 | **$0.31** |
| 1,000 | $0.64 | $0.81 | $1.44 | $0.079 | $0.16 | $0 | **$1.68** |
| 10,000 | $6.36 | $8.07 | $14.44 | $0.792 | $0.16 | $0 | **$15.39** |

### Worst-case shape (every decision = its own session, 300 s idle)

| Decisions / month | Decider total | Nova Lite | ECR + OAC auth | **Total** |
|---:|---:|---:|---:|---:|
| 100 | $0.99 | $0.008 | $0.16 | **$1.15** |
| 1,000 | $9.85 | $0.079 | $0.16 | **$10.09** |
| 10,000 | $98.52 | $0.792 | $0.16 | **$99.47** |

### Danger case (idle-timeout flag missed; AgentCore default 1,800 s applies)

| Decisions / month | Idle=300 s (enforced) | Idle=1,800 s (default) | Delta |
|---:|---:|---:|---:|
| 100 | $1.15 | $3.75 | +$2.60 |
| 1,000 | $10.09 | $36.07 | +$25.98 |
| 10,000 | $99.47 | **$359.34** | **+$259.87** |

**The idle-timeout flag is the single largest cost risk in this plan.** If step 5 of the §9 deploy runbook is skipped, 10k decisions/mo at 1 decision/session climbs from ~$100 to ~$360. §9 includes a post-deploy verification of the flag.

### CloudWatch, network, and auth additions

- **CloudWatch Transaction Search is auto-enabled by the first AgentCore deploy in an account** and bills per transaction indexed. Current AWS pricing pages do not expose a per-event rate retrievable from our pre-staged sources; we budget it as an **explicit unknown** and the §9 teardown playbook disables it after launch. AgentCore Observability (spans/logs/metrics passed through to CloudWatch) is similarly unpriced in current sources.
- CloudWatch Logs ingestion: free tier is 5 GB. One decision ≈ 2 KB of structured log → 10k decisions ≈ 20 MB. **~$0.00 within free tier.**
- Data transfer out of AWS: a decision response is ~2 KB. 10k decisions = 20 MB. First 100 GB/mo of CloudFront egress is free under the free flat-rate plan. **$0.**
- AgentCore Gateway, Memory, Policy: **unused — $0.**
- AgentCore Identity: $0 when invoked through AgentCore Runtime (bundled).
- S3 request charges: fewer than 1M PUT/GET per month at this scale → **free tier.**
- DynamoDB on-demand (kill-switch + rate-limit table): ~2 writes + 2 reads per decision at $1.25/M writes and $0.25/M reads → ~**$0.03/10k decisions**.
- AWS Lambda bridge: ARM 256 MB, waiting synchronously for AgentCore/Nova Lite. At 10k decisions/month the 400,000 GB-second free tier still covers even the one-cold-start-per-decision shape (roughly 230k GB-seconds at a 90-second Decider cold start, before narration). Above 10k, measure real bridge duration before projecting cost.
- Cost Explorer `GetCostAndUsage` (daily watchdog): $0.01/request × ~2–3 pages/day ≈ **$0.90/mo** (immaterial but priced for completeness).
- IAM, CloudFront OAC, and AWS-owned DynamoDB encryption: $0.

Full stack rolls up (10 decisions/session, 300 s idle enforced):

- 100 decisions/mo: **~$0.31/mo**
- 1,000 decisions/mo: **~$1.68/mo**
- 10,000 decisions/mo: **~$15.39/mo**

Credit runway at $200/mo cap: **~130,000 decisions/month**.

## 5. Architecture — V2 (recommended)

```
Player browser
   |
   | HTTPS GET /game/*
   v
CloudFront (Free flat-rate plan, OAC)  <-- unchanged from V1
   |
   |  default behavior: S3 private origin (static site)
   `--/api/*: Function URL on a thin AWS Lambda bridge
                |
                | signed_request + rate_limit_check
                v
            Lambda bridge (ARM, 256 MB, <1 s)
                |
                | bedrock-agentcore:InvokeAgentRuntime (SigV4)
                | runtimeSessionId = sha256(player_id+day)
                v
          AgentCore Runtime
             (Vivek 2 vCPU/8 GB container,
              int8 strands-decider-2B-hobson-v19,
              idle timeout = 300 s)
                |
                | optional, after decision
                v
          Bedrock Nova Lite (narration)
```

What this changes from V1:

1. **No EC2.** No EBS. No Elastic IP. No stopped-instance baseline cost.
2. **CloudFront + S3** unchanged — the free flat-rate plan still covers
   the static game.
3. **Lambda bridge** replaces the nginx + Python bridge that lived on
   the EC2 host. It carries three jobs: rate-limiting / kill-switch,
   preserving the CloudFront OAC + IAM origin boundary, and SigV4 signing
   of the AgentCore invocation. ARM 256 MB, average duration <400 ms →
   within Lambda free tier.
4. **AgentCore Runtime** does all the decider inference, billed per
   second, scales to zero between sessions.
5. **Bedrock Nova Lite** stays as the narration layer (already live in
   `backend/agent.py`), unchanged.

Capacity reality check: AgentCore caps a single runtime at 100
concurrent sessions by default (soft quota, documented). Hackathon demo
and the open public game are both well under this.

## 6. Application-level kill switch and spend caps (do not rely on AWS Budgets)

Enforced in the Lambda bridge, three stacked limits:

1. **Per-player per-day cap.** Default 20 paid AI requests / player / UTC day,
   keyed by a best-effort anonymous UUID generated once in browser local
   storage. Both `/api/decide` and `/api/narrate` consume the same quota.
   The UUID is not authentication and can be reset, so the global cap remains
   authoritative. Enforced via a DynamoDB transaction with the global counter;
   over-cap requests get a 429 and the browser falls back to the deterministic
   offline engine.
2. **Global per-day cap.** Default **500 paid AI requests / UTC day
   account-wide** across both endpoints. The player and global counters advance
   in one conditional `TransactWriteItems` operation before AgentCore or Nova
   Lite is called. If either condition fails, neither counter advances. A
   downstream failure still consumes the successful reservation by design, so
   retries cannot bypass the cost ceiling.
3. **Monthly hard shutoff.** A single DynamoDB item `ai_enabled: bool`.
   The bridge reads it on every request, caches 60 s. When tripped the
   bridge returns 503 for all `/api/decide` and `/api/narrate` calls
   and the browser falls through to offline mode. A separate scheduled
   Lambda runs daily, calls Cost Explorer `GetCostAndUsage` for
   month-to-date on `service IN (AgentCore, Bedrock)`, and sets
   `ai_enabled=false` if MTD ≥ $18 (buffer below the $20 target).

### Emergency kill switch — three independent paths

- **A: operator script with read-back verification.**
  `scripts/kill_switch.sh [table-name] [region]` writes the composite-key
  `ai_enabled=false` item and immediately reads it back. The bridge observes
  the change within the configured 60-second cache window.
- **B: automatic $18 month-to-date watchdog.** The daily scheduled Lambda in
  `infra/cfn/30-ops.yaml` calls Cost Explorer and writes the same disabled
  item when the threshold is reached.
- **C: control-plane isolation.** Remove the CloudFront Function URL invoke
  permissions or detach the bridge role's
  `bedrock-agentcore:InvokeAgentRuntime` permission. Both are reversible;
  the static deterministic game remains available.

Restoration uses `scripts/kill_switch_restore.sh`, requires an interactive
confirmation unless `--yes` is explicitly supplied, and performs a successful
read-back before reporting success.

AWS Budgets alerts at $5 / $15 / $18 / $30 remain notifications only.
The $18 watchdog is the application-level brake; the $30 budget is a final
alert, not permission to spend $30.

## 7. Offline gameplay is first-class, always

The deterministic engine (`game/engine.js`, `backend/agent.py` fallback
path) remains the primary gameplay surface. All AI-enabled features are
decorations on top:

- Boot-time probe: browser requests `GET /api/health`. If the response
  is not a 200 within 2.5 seconds, or `ai_enabled` is false, the UI flips
  to offline mode (badge: `OFFLINE // DETERMINISTIC`).
- Mission resolution path when AI is off: existing `resolveMission()`
  logic. No external calls, no UI blocking.
- Mission resolution path when AI is on: `/api/decide` (AgentCore) may
  select the specialist before the existing deterministic engine resolves the
  mission. `/api/narrate` (Nova Lite) receives the already-resolved outcome and
  returns an allowlisted `{provider, narration}` cosmetic payload only. Bedrock
  output is never passed to `resolveMissionWithDecision()` and cannot alter
  win/loss, money, heat, infamy, loyalty, reward, cost, or assigned specialist.
  Any error from either path downgrades to deterministic without blocking the
  player.
- The confidence / probability panels degrade gracefully: offline mode
  shows a static `[DETERMINISTIC]` chip in the dossier instead of the
  AI confidence meter.
- All **145** offline tests pass across Python unittest, pytest, and Node
  suites. Live AgentCore and Bedrock response schemas remain deployment-day
  gates and are not represented as measured here.

## 8. Scheduled / limited public AI sessions

Yes — straightforward to layer on top of §6:

- **Daily AI window.** Set `ai_enabled` by a scheduled Lambda to true
  during a published window (e.g. 18:00–22:00 UTC) and false otherwise.
  Players outside the window see offline mode plus a `[AI MODE RESUMES
  AT 18:00 UTC]` banner.
- **Hackathon demo window.** The scheduled Lambda can also honor a
  one-shot `demo_until: <epoch>` row for the three-minute presentation.
- **Per-session burst.** The per-player cap already gives each player
  20 decisions/day. For a lightly played public game that is at least
  one full campaign per player per day on the AI path, which is more
  than enough to showcase the Decider. Beyond that the player hits
  offline mode, which is still a complete game.
- **No "warming" cost.** AgentCore sessions only exist while players
  are actively playing — scheduled windows do not pre-warm sessions,
  so they do not add idle cost. The 45–90 s first-call warm-up applies
  to the first player in a window; subsequent players reuse their own
  session or spin up fresh microVMs.

## 9. Deployment implementation checklist (preparation only, nothing deployed)

Order of operations when the human approves and the freeze lifts:

1. Fork `Vivek0712/strands-decider-agentcore` to a private mirror
   pinned at the current `main` commit `f9691ee9…` or a reviewed
   predecessor. Audit for secret leakage and prompt-injection surface
   before deploy. (License is MIT-0; attribution preserved in a NOTICE
   file.)
2. Create a new AgentCore CLI project in `infra/agentcore/` on this
   repo. Generate the reviewed manifest with `python deciderctl.py add evilgenius --model v19 --idle-timeout 300`, then byte-compare it with the committed
   `infra/agentcore/agentcore.json`. That actual deployment configuration pins
   `StrandsAgents/strands-decider-2B-hobson-v19` at
   `bb282d786bc251fd4e3068de3ada9ddbb38127cd`, int8 quantization, and
   `lifecycleConfiguration.idleRuntimeSessionTimeout: 300`. Do not replace this
   verified identifier with v21 or `strands-decider-2B-qwen3.5-v1-2610` until
   its separate parity, memory, latency, and game-contract gate passes.
3. Package the Lambda bridge under `backend/bridge/`, keep the DynamoDB
   schema at `infra/dynamodb/schema.yaml`, and retain the verified disable and
   restore procedures at `scripts/kill_switch.sh` and
   `scripts/kill_switch_restore.sh`. All are offline-testable with moto.
4. Write a CFN stack (`infra/cfn/00-core.yaml`, `10-storage-edge.yaml`,
   `20-bridge.yaml`, `30-ops.yaml`) that creates: S3 + CloudFront + OAC
   + WAF (unchanged from V1), Lambda bridge + Function URL, DynamoDB
   table, scheduled cost-watchdog Lambda, SNS budget topic. **No
   `aws cloudformation deploy` is run.** `cfn-lint` and
   `aws cloudformation validate-template` only.
5. **Idle-timeout enforcement.** The committed
   `infra/agentcore/agentcore.json` MUST contain
   `lifecycleConfiguration.idleRuntimeSessionTimeout: 300`, generated by the
   step 2 `deciderctl.py add ... --idle-timeout 300` command. The deployment
   command is `agentcore deploy -y`; it consumes that manifest and
   does not receive a second, potentially divergent timeout flag. After an
   authorized deploy, verify the control-plane value:
   `aws bedrock-agentcore-control get-agent-runtime --agent-runtime-id <id>
   --query 'lifecycleConfiguration.idleRuntimeSessionTimeout'`. It must return
   `300`. If it does not, fail the deploy and re-apply before serving traffic.
   **This setting is the difference between ~$100/mo and ~$360/mo at 10k
   decisions.**
6. IAM:
   - Lambda bridge role: `bedrock-agentcore:InvokeAgentRuntime` scoped
     to the single runtime ARN; `dynamodb:GetItem` and
     `dynamodb:UpdateItem` scoped to the one table (AWS authorizes each nested
     operation in `TransactWriteItems`; this transaction contains only
     `Update` entries);
     `bedrock:InvokeModel` scoped to the Nova Lite inference profile ARN.
   - Cost-watchdog role: `ce:GetCostAndUsage` plus `dynamodb:GetItem`,
     `dynamodb:PutItem`, and `dynamodb:UpdateItem`, restricted to the
     kill-switch leading key.
7. Dry runs: `aws cloudformation validate-template` on every file,
   `cfn-lint`, Python unit tests for the bridge's rate-limit logic,
   `aws bedrock-agentcore-control list-agent-runtimes` (read-only).
8. **Stop. Produce the deploy-day report and wait for the explicit
   `+approve` from the human.** Only then run the reviewed
   `agentcore deploy -y` command against the committed manifest,
   followed by the CFN stack creation in the ordered sequence above and the
   post-deploy verification in step 5.
9. **Teardown playbook.** After the hackathon demo (or on kill-switch
   escalation): `python deciderctl.py remove evilgenius`, then
   `agentcore deploy -y`; delete the four CFN stacks in reverse order;
   disable CloudWatch Transaction Search at the account level using the
   current AgentCore/CloudWatch console procedure. Verify all retained ECR,
   S3, CloudWatch, and log resources before declaring near-zero idle cost.

Nothing in steps 1–7 is billable. Step 8 is the authorization gate.

## 10. Initial private smoke-test budget

Exact planning target: **US$5.00 incremental AWS spend** for one private
deployment and smoke-test window, beginning no earlier than October 16, 2026.
This is neither a guaranteed cap nor permission to create resources. Before any
billable resource, present the exact resource list, expected charges, idle
billing, and teardown plan, then obtain explicit resource-creation approval.

Known-meter forecast for the bounded 10-decision / 5-narration procedure is
**$0.36**:

- One CodeBuild deployment build allowance: **$0.25**.
- At most ten isolated cold `/api/decide` sessions at the published v1 rates,
  6.6 GB peak memory, and enforced 300-second idle timeout: **$0.0985**.
- At most five Nova Lite narrations: **$0.0004**.
- One day of 1.56 GB ECR storage: **$0.0052**.
- One Cost Explorer request: **$0.01**.

The remaining **$4.6359** is contingency to the $5 target for one rebuild,
CloudWatch observability/Transaction Search meters that cannot be priced exactly
before account-level inspection, log ingestion, rounding, and tax. Stop and ask
for further approval if unexpected charges or resource configurations appear.
Public traffic, GPU EC2, provisioned throughput, and substantial idle charges
require separate approval.

## 11. Open risks the human must weigh

1. **Decision latency is 7–20 s warm.** This is the entire point of the
   measured microVM result — Graviton2 has no int8 matrix instructions,
   so compute is CPU-bound. The game's existing async UX (`Consulting
   Evil Council…` button state) covers this cleanly, but it is not
   sub-second.
2. **int8 agrees with bf16 on 28/30 published test questions.** The two
   differences were calibration-adjacent (`medium` vs `high`,
   `mixed` vs `negative`). Acceptable for a satirical game; call
   this out in the demo narration if asked.
3. **AgentCore idle-timeout default is 15–30 minutes** and resident
   memory is billed on the full session at **6.6 GB peak** (not 4.2 GB
   resident), per the pricing page's "peak memory consumed up to that
   second." A session that opens, decides once, and holds idle for
   30 min with no further calls burns **$0.02 (4.2 GB) to $0.03
   (6.6 GB peak)** in memory alone. The §6 session policy (idle = 300 s,
   keep multi-decision sessions grouped) is therefore not optional — and
   §9 includes a post-deploy check that `--idle-timeout=300` actually
   took effect. If this check is skipped and the 30 min default applies,
   10k single-decision sessions/mo cost ~$360 instead of ~$100.
4. **AgentCore v2 is CPU 1.43× / memory 1.79× more expensive** than v1
   and launches general availability later in 2026. If v1 is retired
   we either accept new rates (~$28/mo at 10k decisions) or revise.
5. **CloudWatch Transaction Search auto-enables on first AgentCore
   deploy in an account.** This is an account-level setting that costs
   per transaction indexed. The teardown playbook in Vivek's README
   leaves it on; our teardown script will turn it off.
6. **Cold start remains 45–90 s on every brand-new session.** For a
   player opening a fresh game page the first mission response takes
   ~95 s. The UI must display "Spinning up the lair… (first mission
   warms the engine)" instead of looking frozen.
7. **The reference repo is one maintainer, 1 star, 10 commits.** Code
   is MIT-0 and we would fork+pin. A full security review of
   `runtime/`, `agentcore/`, `deciderctl.py`, `client/decider_client.py`
   is part of the forking step above.

## 12. Recommendation

Approve V2 architecture: AgentCore Runtime microVM + Lambda bridge +
DynamoDB rate limits + CloudFront/S3 static site, all behind the
2026-10-16 freeze. Request an initial launch-testing budget of **$5**;
anticipate steady-state operating cost under **$2/month** at hackathon
traffic and under **$20/month** at 10k decisions. Keep the deterministic
offline engine as the always-available fallback.

Explicitly reject the always-on g4dn.xlarge path.

Nothing in this document authorizes provisioning. Approve or request
changes; provisioning requires a separate `+approve` after 2026-10-16.
