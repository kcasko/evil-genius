# V2 Implementation Notes — AgentCore infrastructure as code (offline only)

## Hermes completion addendum

Claude Code produced the initial files, then hit its session limit before it
could validate or commit them. Hermes preserved that work and corrected the
following issues before independent review:

- Lambda and CloudFront origin timeouts are now 120 seconds, not 10/30, to
  cover the measured 45–90 second AgentCore cold start. Deployment is blocked
  until the account's CloudFront response-timeout quota is verified at 120.
- The Lambda function URL uses `AWS_IAM` plus a CloudFront Lambda OAC. There is
  no public bootstrap window and no generated origin-header secret. Browser
  POSTs must supply `x-amz-content-sha256`; the Codex client implements and
  tests this contract.
- The customer-managed KMS key and Secrets Manager secret were removed. The
  DynamoDB table uses the AWS managed `aws/dynamodb` key. This removes about
  unbudgeted fixed cost and revises V2 totals to $0.31/$1.68/$15.39 for
  100/1,000/10,000 decisions in the 10-decisions-per-session shape.
- Player and global counters now advance together in one DynamoDB transaction;
  a rejected global count cannot consume a player's allowance.
- `scripts/package_bridge.py` builds the Lambda zip and checks the 250 MiB
  unpacked limit. It was syntax-checked but not run because dependency network
  access was outside this offline task.
- The approved Hobson v19 model pin remains unchanged. The newer
  `strands-decider-2B-qwen3.5-v1-2610` is research-only pending the separate
  evidence-and-test gate in `DECIDER_V1_QWEN35_REVIEW.md`.

## Offline integration blocker corrections

The follow-up correction commit closes the four requested offline integration
blockers without deploying or invoking AWS:

- Both bridge-role definitions grant the minimum permissions required by the
  transaction: `dynamodb:UpdateItem` for the two nested `Update` entries, plus
  `dynamodb:GetItem` for the kill-switch read, scoped to the existing
  single-table resource. The `TransactWriteItems` API operation has no
  same-named standalone IAM action; DynamoDB authorizes each nested operation.
  A static contract test keeps the JSON policy and CloudFormation mirror in
  sync with the bridge operation.
- `infra/agentcore/agentcore.json` remains the actual deployment source of
  truth and sets `lifecycleConfiguration.idleRuntimeSessionTimeout` to `300`.
  The manifest-generation command is `python deciderctl.py add evilgenius
  --model v19 --idle-timeout 300`; `agentcore deploy -y` consumes the
  committed manifest. The deploy-day readback uses
  `bedrock-agentcore-control get-agent-runtime` and queries
  `lifecycleConfiguration.idleRuntimeSessionTimeout`.
- The browser now sends one stable anonymous local-storage UUID to both paid
  endpoints. Both `/api/decide` and `/api/narrate` atomically reserve player and
  global request quota in one conditional DynamoDB transaction before invoking
  a provider. Conditional rejection and DynamoDB failure cannot partially
  advance either counter; concurrent tests assert the exact cap. A downstream
  provider failure intentionally consumes the reservation to prevent retry
  bypass.
- The narration bridge forwards only the five narration input fields to
  Bedrock and returns only `{provider, narration}`. Deterministic mission state
  is resolved before narration and Bedrock output cannot supply state, reward,
  success, or other gameplay fields.

The quota is an abuse and spend control, not authentication. A player can reset
its local UUID, so the server-side global counter remains authoritative.

AWS source for the OAC change:
`https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-lambda.html`.

The older KMS/Secrets/origin-header descriptions later in this document record
Claude's pre-correction draft and are superseded by this addendum and the
checked-in templates.


Built per `CLAUDE_V2_BRIEF.md` on branch `claude/prelaunch`, base `main @ 17dd3ea`.
Nothing in this work created, invoked, or billed a paid AWS resource; no
model weights were downloaded; nothing was pushed or merged. The
2026-10-16 deployment freeze remains in force and this work does not lift
it.

## Summary

This adds the complete V2 scale-to-zero AgentCore stack as infrastructure-as-code
and a tested Lambda bridge, without deploying any of it: a `backend/bridge/`
Lambda (`handler.py`, `ratelimit.py`, `killswitch.py`, `config.py`) that
fronts `/api/decide`, `/api/narrate`, and `/api/health` with DynamoDB-backed
per-player/global daily rate limits, a 60-second-cached kill switch, and a
SigV4 AgentCore Runtime invocation, all unit-tested against `moto` with no
real AWS calls; a `backend/bridge/watchdog/` Lambda that reads Cost
Explorer month-to-date spend and trips the kill switch at $18; four
CloudFormation templates (`infra/cfn/00-core.yaml`,
`10-storage-edge.yaml`, `20-bridge.yaml`, `30-ops.yaml`) covering AWS-managed
DynamoDB encryption, the Lambda bridge, S3/CloudFront/WAFv2 (including
the informational static `/kill` operator-status page, which does not mutate
the server-side kill switch), and the budget/watchdog ops stack, all
`cfn-lint`-clean and `cloudformation validate-template`-clean. Earlier IAM
policy drafts were exercised with `aws iam simulate-custom-policy`; the final
bridge action set is additionally locked by static deployment-contract tests
and still requires deployed-role authorization verification. An
`infra/agentcore/` project scaffold for the forked
`Vivek0712/strands-decider-agentcore` mirror, fact-checked line-by-line
against the live upstream repo (commit SHA, model revisions, the real
`agentcore.json`/`deciderctl.py` schema, and the real `runtime/Dockerfile`)
rather than guessed from the brief's paraphrase; and three ShellCheck-style
shell scripts for the kill switch and offline verification. The final integrated
candidate passes 145 tests: 4 top-level unittest tests, 53 backend unittest
tests, 43 bridge pytest tests, 7 watchdog pytest tests, and 38 Node tests.
The backend-only snapshot described here initially avoided frontend changes;
the later independently reviewed Codex/AGY integration intentionally modifies
`index.html`, `game/engine.js`, and the frontend reliability modules.

## Measured narration prompt input-token count

`backend/tests/test_narration_tokens.py` (`pytest -k narration_tokens`)
measures `agent.build_narration_prompt()`'s actual output with `tiktoken`'s
`cl100k_base` encoding (the standard stand-in used for cross-model
estimation; Nova Lite's real tokenizer was not available to install
offline), against fixtures drawn from the real call site
(`index.html`'s `narrate()` and `game/engine.js`'s `MISSIONS` data):

| Case | Tokens | Chars |
|---|---:|---:|
| Realistic (`MISSIONS[0]` win outcome) | **278** | 1,265 |
| Realistic + mismatch-penalty sentence | **296** | 1,358 |
| Worst case (all 3 text fields at the 600-char truncation ceiling) | **997** | 2,914 |

**Correction to both the plan and OpenCode's review**: `AWS_DEPLOYMENT_PLAN_V2.md`
assumed ~400 input tokens; `OPENCODE_V2_COST_REVIEW.md` finding #6 corrected
that to "~800, not 400." Measured against this game's actual data, the
realistic case is **278–296 tokens — lower than both estimates** — because
this game's mission/plan/outcome strings are short (outcome strings are
~60–150 chars, not the full 600-char-per-field budget
`build_narration_prompt` allows). The ~800-token figure is only reached
near the 600-char-per-field truncation ceiling (measured: 997 tokens),
which would require outcome/mission/plan text far longer than anything in
`game/engine.js` today. Cost impact is immaterial either way (Nova Lite
input is $0.06/1M tokens), but the corrected number matters for the
`DECIDER_MAX_TOKENS`/prompt-budget conversation if it comes up again.

## `cfn-lint` and `validate-template` output, per file

All four templates are clean on both checks (commands run from the repo root):

```
$ cfn-lint infra/cfn/00-core.yaml          -> (no output = 0 findings)
$ cfn-lint infra/cfn/10-storage-edge.yaml  -> (no output = 0 findings)
$ cfn-lint infra/cfn/20-bridge.yaml        -> (no output = 0 findings)
$ cfn-lint infra/cfn/30-ops.yaml           -> (no output = 0 findings)

$ aws cloudformation validate-template --template-body file://infra/cfn/00-core.yaml
{
    "Parameters": [{"ParameterKey": "AlertEmail", "DefaultValue": "", "NoEcho": false, ...}],
    "Description": "EVIL GENIUS V2 -- core stack (00): ..."
}

$ aws cloudformation validate-template --template-body file://infra/cfn/10-storage-edge.yaml
{
    "Parameters": [
        {"ParameterKey": "RateLimitExceededPerFiveMinutes", "DefaultValue": "100", ...},
        {"ParameterKey": "BridgeOriginDomain", "NoEcho": false, ...},
        {"ParameterKey": "CoreStackName", "DefaultValue": "eg-v2-core", ...}
    ],
    "Capabilities": ["CAPABILITY_IAM"],
    "CapabilitiesReason": "The following resource(s) require capabilities: [AWS::IAM::Role]"
}

$ aws cloudformation validate-template --template-body file://infra/cfn/20-bridge.yaml
{
    "Parameters": [
        {"ParameterKey": "PlayerDailyLimit", "DefaultValue": "20", ...},
        {"ParameterKey": "KillswitchCacheSeconds", "DefaultValue": "60", ...},
        {"ParameterKey": "BridgeCodeS3Key", "DefaultValue": "bridge/bridge.zip", ...},
        {"ParameterKey": "CloudFrontDistributionArn", "DefaultValue": "", ...},
        {"ParameterKey": "CoreStackName", "DefaultValue": "eg-v2-core", ...},
        {"ParameterKey": "AgentRuntimeArn", "NoEcho": false, ...},
        {"ParameterKey": "BridgeCodeS3Bucket", "NoEcho": false, ...},
        {"ParameterKey": "GlobalDailyLimit", "DefaultValue": "500", ...}
    ],
    "Capabilities": ["CAPABILITY_NAMED_IAM"],
    "CapabilitiesReason": "The following resource(s) require capabilities: [AWS::IAM::Role]"
}

$ aws cloudformation validate-template --template-body file://infra/cfn/30-ops.yaml
{
    "Parameters": [
        {"ParameterKey": "MonthlyBudgetLimitUsd", "DefaultValue": "30", ...},
        {"ParameterKey": "WatchdogCodeS3Key", "DefaultValue": "watchdog/watchdog.zip", ...},
        {"ParameterKey": "CostThresholdUsd", "DefaultValue": "18", ...},
        {"ParameterKey": "CoreStackName", "DefaultValue": "eg-v2-core", ...},
        {"ParameterKey": "WatchdogCodeS3Bucket", "NoEcho": false, ...}
    ],
    "Capabilities": ["CAPABILITY_NAMED_IAM"],
    "CapabilitiesReason": "The following resource(s) require capabilities: [AWS::IAM::Role]"
}
```

### IAM policy verification (`aws iam simulate-custom-policy`)

Each of the three `infra/iam/*.json` files was rendered with dummy
(syntactically valid, non-real) ARNs in place of the `${...}` placeholders
and tested for real:

| Policy | Intended-allow actions tested | Result | Deliberately denied action tested | Result |
|---|---|---|---|---|
| `bridge-role.json` | `bedrock-agentcore:InvokeAgentRuntime`, `bedrock:InvokeModel`, `dynamodb:GetItem`, `dynamodb:UpdateItem` | Existing actions were previously simulated; the transaction's nested `Update` permission is verified statically offline and requires deploy-day IAM authorization testing | `dynamodb:DeleteTable` | `implicitDeny` |
| `watchdog-role.json` | `ce:GetCostAndUsage`; `dynamodb:PutItem` scoped via `dynamodb:LeadingKeys=["ai_enabled"]` | `allowed`; `allowed` when the leading key is `ai_enabled`, **`implicitDeny` when tested against a different leading key** (e.g. a player counter) -- confirms the condition genuinely scopes access to the one kill-switch item | `bedrock-agentcore:InvokeAgentRuntime` | `implicitDeny` |
| `deploy-identity.json` | `cloudformation:CreateStack`, `iam:PassRole` (conditioned on `iam:PassedToService=lambda.amazonaws.com`), `iam:CreateRole`, `lambda:CreateFunction`, `s3:CreateBucket`, `cloudfront:CreateDistribution`, `dynamodb:CreateTable`, `bedrock-agentcore-control:CreateAgentRuntime`, `ecr:CreateRepository`, `sts:GetCallerIdentity` | all `allowed` | `iam:PassRole` to an **unlisted** role, and separately `ec2:RunInstances` and `iam:CreateUser` | all `implicitDeny` |

Two API quirks hit while running this, worth documenting for next time:
1. `--policy-input-list` (via `file://...`) failed with `InvalidInput:
   Policy input list item 1 has invalid content` for every file in this
   sandboxed Git-Bash-on-Windows environment, even a trivial
   known-valid policy -- the `file://` paramfile loader appears broken
   here specifically. Workaround: pass the policy inline via command
   substitution, e.g. `--policy-input-list "$(cat policy.json)"`, which
   worked for every test above.
2. `simulate-custom-policy`'s `--policy-input-list` has an undocumented
   (in the CLI help) **2000-character-per-policy** limit, confirmed via
   the API's own validation error. `deploy-identity.json` (4,045 chars
   rendered) had to be split into three statement-group chunks purely
   for simulation; the real policy is well under IAM's actual 10,240-char
   inline-role-policy limit and was never split for deployment, only for
   this test call.

### Live, read-only control-plane evidence gathered

```
$ aws bedrock-agentcore-control list-agent-runtimes --region us-east-1
{"agentRuntimes": []}
```
Confirms no AgentCore Runtime exists yet in this account -- consistent
with the freeze.

```
$ aws bedrock get-foundation-model-availability --region us-east-1 --model-id amazon.nova-lite-v1:0
{"modelId": "amazon.nova-lite-v1", "agreementAvailability": {"status": "AVAILABLE"},
 "authorizationStatus": "AUTHORIZED", "entitlementAvailability": "AVAILABLE", "regionAvailability": "AVAILABLE"}

$ aws bedrock get-inference-profile --region us-east-1 --inference-profile-identifier us.amazon.nova-lite-v1:0
{"inferenceProfileName": "US Nova Lite", "status": "ACTIVE", "type": "SYSTEM_DEFINED",
 "inferenceProfileArn": "arn:aws:bedrock:us-east-1:${AWS_ACCOUNT_ID}:inference-profile/us.amazon.nova-lite-v1:0",
 "models": [{"modelArn": "arn:aws:bedrock:us-east-1::foundation-model/amazon.nova-lite-v1:0"}, ...]}
```
(Account ID redacted here per "no account IDs in source"; both match the
exact ARNs already hardcoded into `infra/iam/bridge-role.json`.) Nova
Lite is active, authorized, and region-available, same as
`AWS_DEPLOYMENT_CHECKLIST.md` §1 already confirmed for V1.

### `infra/agentcore/` fact-checking against the live upstream repo

Rather than guess at the brief's paraphrase of `Vivek0712/strands-decider-agentcore`,
I fetched the actual pinned-commit source (`gh api`, raw GitHub content --
no model weights, no AWS calls) and corrected several details:

- `main` resolves to `f9691ee9b2891ecb72308377947e4d655f07bde5`, exactly
  matching the plan's abbreviated SHA -- confirmed, not assumed.
- The real `runtime/Dockerfile` is **CPU-only** (`python:3.12-slim-trixie`,
  CPU-wheel `torch==2.8.0`, no CUDA, no `bitsandbytes`). The brief's own
  file-layout comment says `strands-decider[cuda]==<pin>, torch,
  bitsandbytes for int8`, which contradicts both the real upstream image
  and this repo's own `AWS_DEPLOYMENT_PLAN_V2.md` ("Graviton2 has no int8
  matrix instructions, so compute is CPU-bound"). I followed the verified
  CPU-only upstream instead of the brief's literal text -- **flagged
  below for human sign-off**.
- The real `agentcore.json` is a CDK-managed project manifest (`name`,
  `runtimes: []`, etc.), not the flat `{idle-timeout, memory, vcpu,
  platform}` object the brief describes. Per-runtime config
  (`lifecycleConfiguration.idleRuntimeSessionTimeout`) only exists once a
  runtime is added via `deciderctl add`. I hand-simulated the exact
  output of `deciderctl add evilgenius --model v19 --idle-timeout 300`
  (reading `deciderctl.py`'s source directly) so the committed
  `agentcore.json` is what that real command would produce, byte for
  byte -- not an invented schema.
- `deciderctl.py`'s own `CATALOG` confirms v19 is
  `bb282d786bc251fd4e3068de3ada9ddbb38127cd` (matches
  `AWS_DEPLOYMENT_CHECKLIST.md`) and v21 is
  `2b52a6235c1b8306bbfa30b00b9d4b74b63a39f5`. `--idle-timeout`'s
  **real default is 1800**, confirming `OPENCODE_V2_COST_REVIEW.md`
  finding #5 directly from the tool's own argparse default, not just the
  README prose.
- **The post-deploy idle-timeout verification command is now consistent**
  across `AWS_DEPLOYMENT_PLAN_V2.md` §9 step 5 and
  `infra/agentcore/README.md`. It uses the `bedrock-agentcore-control`
  control-plane service and queries
  `lifecycleConfiguration.idleRuntimeSessionTimeout`. This was checked
  directly against the installed botocore service model (boto3 1.42.89); the
  similarly named `bedrock-agentcore` client is the data-plane invoke client.

## Files touched

The bridge, infrastructure policy, deployment documentation, browser request
adapter, and regression tests were updated for this correction pass. The
authoritative game engine (`game/engine.js`) and local model adapters remain
unchanged; `index.html` changed only to generate and transmit the anonymous
quota UUID and to make the cosmetic narration boundary explicit.

```
backend/bridge/__init__.py
backend/bridge/config.py
backend/bridge/handler.py
backend/bridge/killswitch.py
backend/bridge/ratelimit.py
backend/bridge/requirements.txt
backend/bridge/tests/test_fallback.py
backend/bridge/tests/test_handler.py
backend/bridge/tests/test_killswitch.py
backend/bridge/tests/test_ratelimit.py
backend/bridge/watchdog/handler.py
backend/bridge/watchdog/tests/test_watchdog.py
backend/tests/test_narration_tokens.py
infra/agentcore/{Dockerfile,agentcore.json,requirements.txt,README.md}
infra/cfn/{00-core,10-storage-edge,20-bridge,30-ops}.yaml
infra/dynamodb/schema.yaml
infra/iam/{bridge-role,watchdog-role,deploy-identity}.json
scripts/{kill_switch.sh,kill_switch_restore.sh,verify_offline.sh}
docs/V2_IMPLEMENTATION_NOTES.md (this file)
```

## Design decisions worth a second look (not bugs, but judgment calls)

- **Both paid endpoints consume one shared quota unit.** `/api/decide` and
  `/api/narrate` each atomically advance the best-effort player bucket and the
  authoritative global bucket before provider invocation. One mission can
  therefore consume two units when both calls succeed. Provider failures also
  consume their reserved unit; transaction rejection or DynamoDB failure
  advances neither counter.
- **`player_id` is a stable anonymous browser UUID, not identity.** The
  frontend generates it once with `crypto.randomUUID()`, stores it locally, and
  sends it to both endpoints. The bridge validates canonical UUID syntax and
  does not use the CloudFront/Function URL source IP as a player identity.
  Clearing browser storage can reset this best-effort bucket, which is why the
  atomic server-side global cap remains the real spending boundary.
- **CloudFront/Lambda dependency order.** Deploy `00-core.yaml`, create the
  operations controls, then deploy the pinned runtime. The request path is
  `20-bridge.yaml` → `10-storage-edge.yaml` → a final `20-bridge.yaml` update
  with the distribution ARN. The Function URL remains `AWS_IAM`-authenticated
  and has no public bootstrap permission.
- **v19, not v21**, remains pinned consistently in
  `infra/agentcore/agentcore.json` and `AWS_DEPLOYMENT_PLAN_V2.md` §9 step 2.
  Existing int8/bf16 parity validation was done against v19; v21 has not been
  re-validated for this codebase (`OPENCODE_V2_COST_REVIEW.md` finding #14),
  and re-running that validation requires a live model call this offline-only
  task cannot perform. Any future switch remains a deployment-day gated
  change documented in `infra/agentcore/README.md`.

## Open questions and deployment-day decisions

1. **v19 vs v21 model pin** (above) -- keep the reviewed v19 manifest
   unchanged unless a separately authorized deploy-day parity, memory, latency,
   and contract gate verifies a replacement identifier. Do not infer a model or
   runtime identifier from names or examples.
2. **Anonymous player buckets are best-effort, not identity.** The frontend
   now supplies a stable localStorage UUID to both paid endpoints. A player can
   reset it by clearing storage, so the atomic global cap is the authoritative
   spending boundary.
3. **Dockerfile CUDA/bitsandbytes discrepancy**: this implementation
   follows the verified CPU-only upstream image, not the brief's literal
   `[cuda]`/`bitsandbytes` text. Confirm this is the intended
   correction and not a sign that a different (GPU) runtime path was
   actually meant.
4. **`infra/agentcore/requirements.txt` hashes are not frozen.** Doing so
   requires resolving the full transitive dependency closure against a
   real package index at fork time (network access to PyPI/GitHub for
   the pinned `strands-decider` commit's own `setup.py`), which this
   offline-only prep task did not attempt. This is a deploy-day step.
5. **Cost Explorer `SERVICE` dimension values** (`'Amazon Bedrock'`,
   `'Amazon Bedrock AgentCore'`) used by the watchdog are the expected
   display names but are unverified against a live account (no spend
   exists yet under the freeze). Confirm via `aws ce get-dimension-values
   --dimension SERVICE` once any spend has occurred.
6. **WAFv2 Web ACL uses 2 of the allowed 5 Free-plan rules** (common
   threat protection + API rate limit), intentionally leaving 3 reserved
   per `AWS_DEPLOYMENT_CHECKLIST.md` §8 ("reserve one rule for emergency
   IP/ASN blocking," "reserve one for measured abuse"). Confirm this
   reservation is still wanted for V2.
7. **`deadline_ms` in `/api/health`** is wired through end-to-end
   (`killswitch.py` reads/writes it) but nothing currently sets it --
   `AWS_DEPLOYMENT_PLAN_V2.md` §8's "scheduled AI windows" feature is
   data-shape-ready but has no scheduling Lambda/logic, since §8 is
   described as a future layer on top of §6 and isn't in
   `CLAUDE_V2_BRIEF.md`'s required-behaviors list. Confirm this is
   correctly out of scope for this pass.

## §-checklist: pre-deployment verifications, offline evidence vs. requires-live-deploy

The brief asks for "a checklist of §3's seven pre-deployment
verifications" -- no single section in `CLAUDE_V2_BRIEF.md`,
`AWS_DEPLOYMENT_PLAN_V2.md`, or `AWS_DEPLOYMENT_CHECKLIST.md` enumerates
exactly seven items under a "§3," so rather than force-fit a count, here
is the full set of pre-deployment verifications found across
`CLAUDE_V2_BRIEF.md` §6, `AWS_DEPLOYMENT_PLAN_V2.md` §9 step 7, and the
kill-switch testability requirement in `CLAUDE_V2_BRIEF.md` §3:

| # | Verification | Status |
|---|---|---|
| 1 | `cfn-lint` clean on every CFN YAML | **Done offline** -- four deployment stacks plus the reference-only schema clean |
| 2 | `aws cloudformation validate-template` on every CFN YAML | **Done read-only** -- four deployment stacks plus the reference-only schema valid |
| 3 | IAM policies authorize intended actions | **Static contract complete** for the current bridge policy; real deployed-role authorization remains a live gate |
| 4 | IAM policies deny out-of-scope actions | Prior simulations informed the design; repeat against the final deployed roles before public traffic |
| 5 | Python unit tests for the bridge's rate-limit logic | **Done offline** -- 43 bridge tests + 7 watchdog tests, moto-backed, 0 failures |
| 6 | `aws bedrock-agentcore-control list-agent-runtimes` (read-only) | Prior preflight returned no runtimes; deployment-day preflight must repeat it |
| 7 | Kill-switch paths leave the game playable offline | **Done offline** -- manual DynamoDB script, cost watchdog, and IAM isolation are documented controls; the static `/kill` page is informational only |
| 8 | `--idle-timeout 300` actually took effect post-deploy | **Requires live deploy** -- no AgentCore Runtime exists yet; corrected verification command is documented in `infra/agentcore/README.md` for deploy day |
| 9 | int8/bf16 decision-parity check (v19 baseline, or re-run for v21) | **Requires live deploy** -- needs a running Decider to compare against; this offline task cannot invoke any model |
| 10 | CloudWatch Transaction Search auto-enable + teardown toggle | **Requires live deploy** -- the setting doesn't exist until the first AgentCore deploy in the account |

## Verification commands run (full brief block)

```
python -m pip install --quiet moto[dynamodb,cost-explorer] boto3 pytest cfn-lint   # OK (moto has no cost-explorer extra; core moto covers DynamoDB mocking used here)
python -m pytest -q backend/bridge/tests/                  # 43 passed
python -m pytest -q backend/bridge/watchdog/tests/         # 7 passed
cfn-lint infra/cfn/*.yaml infra/dynamodb/schema.yaml       # clean, all 5
aws cloudformation validate-template --template-body file://infra/cfn/00-core.yaml          # OK
aws cloudformation validate-template --template-body file://infra/cfn/10-storage-edge.yaml  # OK
aws cloudformation validate-template --template-body file://infra/cfn/20-bridge.yaml        # OK
aws cloudformation validate-template --template-body file://infra/cfn/30-ops.yaml           # OK
aws cloudformation validate-template --template-body file://infra/dynamodb/schema.yaml       # OK
bash scripts/verify_offline.sh          # ALL SUITES PASSED
python -m unittest discover -s tests                 # Ran 4 tests, OK
python -m unittest discover -s backend/tests          # Ran 53 tests, OK
node --test tests/*.test.mjs                           # tests 38, pass 38, fail 0
```

145 tests total (4 top-level unittest + 53 backend unittest + 43 bridge
pytest + 7 watchdog pytest + 38 Node), 0 failures, 0 regressions.
