# Private AWS Smoke-Test Procedure

Status: planning authorized; deployment is not. No AWS resources have been
created and no paid inference, model download, or deployment is authorized by
this document. Earliest permitted testing date: **October 16, 2026**.

The approved planning policy excludes always-on GPU instances, any GPU EC2
deployment, provisioned throughput, and infrastructure with substantial idle
charges. Preserve every existing AWS project. Long-term target: under $10/month
for light traffic, with a separate review before exceeding $20/month.

## Authorization boundary

The operator must receive a separate, explicit deployment authorization naming:

- Region: `us-east-1`.
- Candidate Git commit SHA.
- Target incremental testing budget: **US$5.00**; this is not a guaranteed cap.
- Scope: one private deployment and smoke-test window; no public launch.
- Exact resource list, idle-billing behavior, per-resource expected charges,
  and teardown sequence.
- Expiry/teardown time.

Stop before the first state-changing command if any field is missing. The
October 16 spending freeze remains in force until that authorization is given.

## Immutable deployment inputs

- Decider model: `StrandsAgents/strands-decider-2B-hobson-v19`.
- Decider revision: `bb282d786bc251fd4e3068de3ada9ddbb38127cd`.
- Decider quantization: `int8`.
- AgentCore idle timeout: `300` seconds.
- Bedrock narration profile: `us.amazon.nova-lite-v1:0`.
- Bridge DynamoDB actions: `GetItem` plus `UpdateItem`; DynamoDB authorizes
  each nested operation inside `TransactWriteItems`, and the bridge transaction
  contains only `Update` entries.[4]

Do not replace an identifier with a newer model, alias, or runtime ARN. The
runtime ARN is a deployment output and must be captured rather than guessed.

## Cost envelope

AgentCore Runtime is billed for CPU and memory consumption while processing and
for the configured idle session window.[1] The figures below use the repository's
published-v1 estimate, not a measurement from this project.

| Meter | Bounded activity | Planning allowance |
|---|---:|---:|
| CodeBuild / initial image build | One build | $0.2500 |
| Isolated cold Decider decisions | At most ten | $0.0985 |
| Nova Lite narrations | At most five | $0.0004 |
| ECR storage | 1.56 GB for one day | $0.0052 |
| Cost Explorer API | One request | $0.0100 |
| Rebuild, logs, Transaction Search, edge requests, rounding, tax | Contingency to target | $4.6359 |
| **Initial testing budget target** |  | **$5.0000** |

Known-meter forecast: **$0.3641**, rounded to **$0.36**. The contingency is not
a spending target or a guarantee that billing cannot exceed $5. Stop and ask
for further approval before continuing if forecast or observed project charges
approach $5.00, if an unplanned recurring resource appears, or if any required
read-back fails. AWS billing can post after use, so resource and meter anomalies
are stop conditions even when the console has not yet recorded $5. Tax and
pre-existing account spend are excluded from the project increment but must be
inspected without changing or deleting other projects.

## Ordered procedure

### 0. Seal the candidate

1. Record `git rev-parse HEAD`, `git status --short`, and the reviewed commit
   range.
2. Require a clean tracked tree. Preserve unrelated untracked operator files.
3. Re-run `bash scripts/verify_offline.sh`, `cfn-lint`, JSON parsing, and Git
   whitespace checks.
4. Record the explicit authorization text. If it is absent, stop here.

Expected incremental charge: **$0.00**.

### 1. Read-only account preflight

1. Reauthenticate the AWS CLI without placing credentials in the repository.
2. Record caller identity, region, account-level Cost Explorer/Transaction
   Search state, existing project resources, and current month-to-date
   AgentCore and Bedrock spend.
3. Run `aws cloudformation validate-template` for all five templates.
4. Confirm current service quotas and that the pinned Bedrock profile is listed.
   Do not invoke it.
5. Recalculate prices from the target account and AWS pricing page.[1]

Expected incremental charge: **$0.00**, except an explicitly approved Cost
Explorer request, budgeted at **$0.01**.

### 2. Put controls ahead of inference

1. Package the bridge and watchdog artifacts without invoking either service.
2. Deploy `infra/cfn/00-core.yaml`.
3. Deploy `infra/cfn/30-ops.yaml` before the model runtime so budget alerts and
   the daily watchdog exist first.
4. Confirm the $5 / $15 / $18 / $30 notifications and the $18 automatic
   month-to-date watchdog configuration.
5. Run `scripts/kill_switch.sh eg-ai-ratelimit us-east-1` and verify the
   read-back is `false`. Leave AI disabled while the remaining resources are
   created.

Expected incremental charge: covered by the contingency; stop if any
unexpected fixed-price subscription or recurring resource is requested.

### 3. Create the pinned AgentCore runtime

1. From the pinned `strands-decider-agentcore` source used by the repository,
   run the reviewed `deciderctl.py add` command with model, revision,
   quantization, memory, CPU, and `--idle-timeout 300` exactly as documented.[2]
2. Inspect the generated manifest before running `agentcore deploy -y`.
3. Capture the returned runtime ARN.
4. Read the runtime back with `bedrock-agentcore-control get-agent-runtime` and
   require `lifecycleConfiguration.idleRuntimeSessionTimeout == 300`.
5. Stop and remove the runtime if any model identifier, revision, resource
   limit, or timeout differs.

Maximum allocation through this point: **$0.2552** plus negligible control-plane
requests. No inference is permitted yet.

### 4. Create the private request path

1. Deploy `infra/cfn/20-bridge.yaml` with the captured runtime ARN and pinned
   `BedrockModelId`.
2. Deploy `infra/cfn/10-storage-edge.yaml` using the bridge Function URL domain.
3. Update `20-bridge.yaml` with the CloudFront distribution ARN so only the
   distribution can invoke the AWS-IAM-authenticated Function URL.
4. Confirm direct S3 and direct Function URL requests are denied.
5. Confirm the CloudFront `/api/health` path reports AI disabled while the
   static game remains playable.

Expected incremental charge: contingency only. Do not open the distribution to
announced or public traffic.

### 5. Execute the bounded private tests

1. Restore the kill switch with `scripts/kill_switch_restore.sh`; verify the
   read-back before continuing.
2. Run one complete mission through `/api/decide` and `/api/narrate`. Capture
   schema, provider labels, latency, runtime session ID, and logs. Verify that
   model output is advisory/cosmetic and deterministic state is unchanged.
3. Run **5 decisions initially**. If configuration, meters, limits, and latency
   remain expected, continue to at most **10 total live Decider decisions**.
4. Run at most **5 total Nova Lite narration calls** initially, including the
   first complete mission.
5. Verify per-player and global quota failures, invalid UUID rejection,
   CloudFront OAC enforcement, and deterministic fallback on 429/5xx/timeout.
6. Trigger `scripts/kill_switch.sh`; require AI calls to stop within the
   60-second cache bound while deterministic play remains available.
7. Make at most one Cost Explorer request after billing data is available.

Inference limits: **5 initially, at most 10 total Decider decisions, and at most
5 Nova Lite calls**. No load test, public traffic, alternate model, second
runtime, GPU EC2, or provisioned throughput is authorized.

### 6. Teardown and read-back

1. Leave the kill switch disabled.
2. Remove the AgentCore runtime with the reviewed `deciderctl.py remove` plus
   `agentcore deploy -y` workflow.
3. Delete stacks in dependency-safe reverse order, including the bridge update,
   edge, bridge, ops, and core resources.
4. Inspect ECR, S3, CloudWatch logs, Transaction Search, DynamoDB, Lambda URLs,
   WAF, budgets, and SNS for retained or recurring resources.
5. Disable Transaction Search if it was enabled solely for this test.
6. Record final resource lists and project-attributable cost. Do not claim zero
   idle cost until those read-backs are clean.

## Live gates

Deployment is not ready for public traffic until the run records:

- Exact runtime ARN and immutable model/revision read-back.
- Exact 300-second idle-timeout read-back.
- Real AgentCore and Nova Lite schemas.
- Cold and warm p50/p95 latency and peak memory.
- Direct-origin denial and CloudFront-only invocation.
- Atomic DynamoDB quota behavior against the real table.
- Kill-switch propagation and restore evidence.
- Cost Explorer service dimensions and watchdog behavior.
- Teardown resource inventory and actual incremental charge.

## Sources

[1] https://aws.amazon.com/bedrock/agentcore/pricing — Amazon Bedrock AgentCore Pricing
[2] https://github.com/Vivek0712/strands-decider-agentcore — Strands Decider AgentCore reference implementation
[4] https://docs.aws.amazon.com/service-authorization/latest/reference/list_dynamodb.html — Actions, resources, and condition keys for Amazon DynamoDB
