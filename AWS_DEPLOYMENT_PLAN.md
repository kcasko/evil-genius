# EVIL GENIUS — AWS Deployment Plan

Status: architecture approved 2026-10-14; implementation preparation only. No AWS resources have been provisioned.

> **Deployment freeze until 2026-10-16.** No billable AWS resource or service may be created, launched, deployed, or invoked before 2026-10-16 (contest open). This covers EC2, EBS, Elastic IPs, CloudFront, S3, WAFv2, Bedrock inference, Budgets alarms targeting SNS email beyond the free tier, and any other service that can bill. The restriction may not be bypassed via another agent, automation, or CLI tool. 2026-10-16 is the earliest permitted deployment date, not automatic authorization — after the contest opens, status, resources, and expected charges must be reported and explicitly approved before provisioning. Preparation during the freeze is limited to: the GPU quota increase request (non-billable), script and configuration drafting, local development and tests, security/rollback/cost review, and keeping the deployment checklist current.

Pricing snapshot: 2026-10-14, Linux On-Demand, `us-east-1`, before tax.

Approved constraints:

- Region: `us-east-1`.
- Primary compute: `g4dn.xlarge`.
- Performance fallback: `g5.xlarge`, only after measured justification and separate human approval.
- Initial spending target: $30, with notifications at $5, $15, and $30. These alerts are not hard spending limits.
- The next authorization gate covers quota changes and actual AWS resource creation.
- Decider deployment and measured inference performance take priority over additional game features.

## Decision

Use one stopped-by-default `g4dn.xlarge` EC2 instance for the live AI path, plus a private S3 bucket behind CloudFront for the browser game.

- EC2 runs Strands Decider 2B, the existing Python bridge, and a TLS reverse proxy.
- Decider stays on loopback at `127.0.0.1:8099`.
- The Python bridge stays on loopback at `127.0.0.1:8787`.
- The bridge calls Amazon Bedrock Nova Lite through the Strands Agents SDK / Bedrock runtime using an EC2 instance role.
- CloudFront serves the private S3 site and forwards only `/api/*` to the EC2 origin.
- The browser receives the selected specialist, confidence, and probability map and renders them without changing game arithmetic.
- When EC2 is stopped, slow, or unavailable, the existing deterministic browser engine remains playable. A service worker will make the static shell available after a prior successful visit.

This is the least expensive low-risk x86 GPU configuration. It avoids an ALB, NAT Gateway, API Gateway, Lambda, ECS, EKS, App Runner, SageMaker, RDS, and any always-running compute.

## Architecture

```text
Browser
  |
  | HTTPS: evilgenius.<existing-domain>
  v
CloudFront distribution
  |-- default /* --------------> private S3 bucket (OAC)
  |
  `-- /api/* ------------------> EC2 Elastic IP / DNS-only origin name
                                  TLS + CloudFront-only security group
                                  reverse proxy on :443
                                      |
                                      |-- /api/* -> Python bridge :8787
                                      |                |
                                      |                `-> Bedrock Nova Lite
                                      |                    (EC2 IAM role)
                                      |
                                      `-> Decider :8099
                                          (loopback only)
```

### Request flow

1. The browser loads the game from CloudFront/S3.
2. The browser POSTs to same-origin `/api/decide`; it never receives an AWS credential or an origin secret.
3. CloudFront adds an origin-only random header and forwards the request over TLS to the EC2 reverse proxy.
4. The bridge validates the request and calls local Decider `/v1/systemone`.
5. The response preserves `choice`, `confidence`, and `probabilities`; the UI displays them and gives the validated choice to the existing engine.
6. `/api/narrate` calls Nova Lite through the EC2 instance role. Bedrock output remains cosmetic and cannot change game state.
7. On timeout, non-2xx response, or malformed AI output, the browser uses the existing deterministic fallback.

### Why one EC2 instance

Decider is a persistent model server. Serverless services do not fit a multi-gigabyte model with GPU requirements and would add cold-start or image-size problems. Splitting the bridge from Decider would add another service, authentication boundary, and network cost without improving a single-instance hackathon demo. The loopback split still keeps the components replaceable later.

## CPU versus GPU

The pinned v19 checkpoint repository itself is about 91 MB and references `Qwen/Qwen3.5-2B-Base`, whose base weights are about 4.5 GB. The checkpoint pins the base revision and declares `bfloat16` on GPU. CPU serving upcasts the torso to fp32. Practical minimums are therefore:

- GPU: approximately 4 GB of bf16 base weights plus adapter, activations, CUDA kernels, tokenizer, and runtime overhead. A 16 GB T4 has comfortable serving headroom.
- CPU experiment: 16 GB RAM is possible but tight because the torso is upcast to roughly 8 GB before runtime overhead.
- CPU safe target: 32 GB RAM.
- Disk: 80 GB encrypted gp3 root volume for Ubuntu/DLAMI, CUDA build tooling, Python environment, both model caches, logs, and headroom.

The maintainers report v19 at 115 ms median and 299 ms p95 per JevBench question on an RTX 3090 under WSL2. They also report about 1.6 seconds per ask on a Xeon 8375C using eight threads for the closely related v21 path. Those are useful reference points, not T4 or EC2 benchmarks. Phase 2 must measure cold load and p50/p95 latency with the exact pinned v19 revision on `g4dn.xlarge` before the demo architecture is accepted.

| Option | Hardware / memory | Approx. On-Demand | Startup to ready (cached weights) | Expected warm choice latency | Availability / risk | Verdict |
|---|---:|---:|---:|---:|---|---|
| `r7i.large` | 2 vCPU, 16 GiB RAM | $0.1323/hr | 4–10 min | roughly 3–10 sec, unmeasured | Broad CPU capacity; memory is tight | Cheapest experiment only |
| `m7i.xlarge` | 4 vCPU, 16 GiB RAM | $0.2016/hr | 4–10 min | roughly 2–6 sec, unmeasured | Broad CPU capacity; memory is still tight | Not recommended |
| `r7i.xlarge` | 4 vCPU, 32 GiB RAM | $0.2646/hr | 4–10 min | roughly 2–6 sec, unmeasured | Broad CPU capacity; safe RAM | CPU fallback, not primary demo |
| `g5g.xlarge` | 4 Graviton vCPU, 16 GiB RAM, T4G 16 GB | about $0.42/hr | 4–8 min | unmeasured | GPU quota/capacity plus ARM64/Python-wheel compatibility risk | Not approved |
| `g4dn.xlarge` | 4 vCPU, 16 GiB RAM, NVIDIA T4 16 GB | $0.526/hr | 3–7 min | expected sub-second for short requests; must be measured | Offered in five account-visible AZs; quota is currently zero; capacity is not guaranteed | Approved primary |
| `g5.xlarge` | 4 vCPU, 16 GiB RAM, NVIDIA A10G 24 GB | $1.006/hr | 3–7 min | expected faster than T4; must be measured | Offered in five account-visible AZs; same quota class; higher cost | Separate approval required |

Startup estimate includes EC2 boot, systemd startup, loading cached weights from EBS, and health checks. The first build/download should be budgeted at 15–30 minutes and is not the normal demo startup path.

### Selection rule

1. Benchmark `g4dn.xlarge` first.
2. Accept it if 50 warm game-shaped `/api/decide` calls have no errors or invalid answers, p50 at or below 1 second, and p95 at or below 2.5 seconds.
3. Record cold boot-to-ready time, peak system RAM, peak VRAM, and per-request `latency_ms` alongside the API timing.
4. If `g4dn.xlarge` fails, stop it and present the evidence and revised cost estimate. Do not launch `g5.xlarge` without separate human approval.
5. Keep `r7i.xlarge` as a functionality/capacity fallback, not as the recorded interactive demo path.
6. `g5g.xlarge` is not approved.

The current browser timeout is 3.5 seconds. Keep it during the first benchmark so the test represents the existing application. Change it only if measured results justify a bounded adjustment and the deterministic fallback tests remain green.

## Cost estimate

### Variable compute

| Instance | 4-hour rehearsal | 8-hour demo day | 20 hours/month | 730 hours always on |
|---|---:|---:|---:|---:|
| `r7i.large` | $0.53 | $1.06 | $2.65 | $96.58 |
| `m7i.xlarge` | $0.81 | $1.61 | $4.03 | $147.17 |
| `r7i.xlarge` | $1.06 | $2.12 | $5.29 | $193.16 |
| `g5g.xlarge` | $1.68 | $3.36 | $8.40 | $306.60 |
| `g4dn.xlarge` | $2.10 | $4.21 | $10.52 | $383.98 |
| `g5.xlarge` | $4.02 | $8.05 | $20.12 | $734.38 |

Compute is billed only while the On-Demand instance is running, with a 60-second minimum. Stopping is therefore the main cost control.

### Stopped-instance baseline

- 80 GB gp3 EBS at approximately $0.08/GB-month: $6.40/month.
- One public IPv4/Elastic IP at $0.005/hour: approximately $3.65/month.
- Baseline while EC2 is stopped: approximately $10.05/month.
- Optional 80 GB EBS snapshot: up to roughly $4/month before incremental/compression effects.
- Existing-domain DNS: no new Route 53 hosted zone is required.

Deleting the Elastic IP after the event removes $3.65/month but requires a DNS/origin update before the next launch. Deleting the EBS volume after creating a tested image/snapshot removes the remaining $6.40/month.

### Static hosting and edge

Use the CloudFront Free flat-rate plan. AWS currently documents that it supports one distribution, 100 GB/month data transfer, 1 million requests/month, 5 GB S3 storage, five cache behaviors, five WAF rules, IP-based rate limiting, TLS, and dynamic/non-cacheable applications, with no overage charges. That covers the proposed private S3 origin plus one `/api/*` behavior and public EC2 custom origin.

The Free plan does not support custom cache rules, custom origin-request rules, private VPC origins, custom response-header rules, or an uptime SLA. The implementation therefore uses AWS-managed policies (`CachingOptimized` for static content and `CachingDisabled` for `/api/*`), a public custom origin restricted by the CloudFront prefix list and origin-verification header, and managed response-header behavior where possible. If any required setting is rejected when the subscription is validated, stop before creation and revise the plan rather than silently switching to the $15 Pro or $200 Business tier.

Read-only account checks found no existing CloudFront distribution and no existing flat-rate subscription. Final account eligibility can only be established when AWS validates a concrete distribution plus WAF web ACL at the next creation gate.

### Bedrock

Nova Lite on-demand text pricing is approximately $0.00006 per 1,000 input tokens and $0.00024 per 1,000 output tokens. At 500 input and 130 output tokens, one narration is about $0.000061; 1,000 narrations are about $0.06. Cross-region inference may move the call among supported US regions but uses the same inference-profile identifier.

### Expected total

For 20 GPU hours, 1,000 narrations, an 80 GB retained EBS volume, and one retained Elastic IP:

- Recommended `g4dn.xlarge`: about $20.63/month.
- Faster `g5.xlarge`: about $30.23/month.
- Safe CPU `r7i.xlarge`: about $15.40/month, but with poor interactive latency.

These totals exclude tax, optional snapshots, and traffic beyond the CloudFront allowance. They are planning estimates; the AWS Pricing Calculator must be saved and reviewed immediately before approval to deploy.

## Security design

### Public edge, private static origin

- S3 Block Public Access stays enabled.
- CloudFront uses Origin Access Control and a bucket policy scoped to the distribution ARN.
- ACM provides the viewer certificate in `us-east-1`.
- HTTP redirects to HTTPS; TLS 1.2+ only.
- Security headers: CSP, HSTS after validation, `X-Content-Type-Options`, `Referrer-Policy`, and frame denial.

### EC2 origin

- Place EC2 in a public subnet with no inbound SSH rule.
- Admin access uses Systems Manager Session Manager; the instance role includes only the SSM managed-instance permissions required for administration.
- Security group allows inbound TCP 443 only from the AWS-managed CloudFront origin-facing prefix list.
- CloudFront adds a random origin-verification header. The reverse proxy rejects requests without an exact match.
- Use a DNS-only origin hostname pointing at the Elastic IP. Install a publicly trusted origin certificate using a manual DNS-01 challenge so no DNS API credential remains on EC2.
- Bind Decider and the Python bridge to loopback. Only the reverse proxy listens publicly.
- Require IMDSv2, encrypt EBS, disable termination by API during the event, and patch the image before the final rehearsal.

The CloudFront header protects the origin; it is not end-user authentication. Because the game is public, no browser-held value can be a durable secret. The public API must therefore rely on narrow functionality and abuse controls rather than a fake API key embedded in JavaScript.

### API controls

- CloudFront accepts only `GET`, `HEAD`, and `OPTIONS` for static paths and only the required methods for `/api/*`.
- Disable caching for mutation/API responses.
- Enforce same-origin requests in the browser and strict `Origin`/`Sec-Fetch-Site` checks at the proxy/bridge as defense in depth; do not treat CORS as authentication.
- Apply a WAF rate-based rule and request-size limit at CloudFront. If Free-plan WAF is unavailable, set a hard budget before enabling pay-as-you-go WAF.
- Allow only the fixed `/api/decide`, `/api/narrate`, and minimal `/api/health` schemas. Reject unknown fields, oversized bodies, invalid content types, and arbitrary prompt text.
- Preserve existing sanitized 400/503 responses. Never return stack traces, AWS identifiers, model paths, or provider errors.
- Add per-request IDs and metric counters, but do not log credentials, the origin secret, raw authorization headers, or unnecessary player payloads.

### IAM

The application instance role gets no long-lived access keys. Its Bedrock statement grants only:

- `bedrock:InvokeModel`
- the `us.amazon.nova-lite-v1:0` inference-profile ARN
- the destination Nova Lite foundation-model ARNs required by that cross-region profile

Do not grant `bedrock:*`, model-management actions, S3 write access, IAM access, or Secrets Manager access to the app. Separate deploy/admin permissions from runtime permissions. Add `InvokeModelWithResponseStream` only if the application is changed to stream.

### Cost guardrails

- AWS Budget alerts at $5, $15, and $30 monthly forecast/actual spend.
- Billing alarm where supported.
- EC2 tags: project, owner, environment, and expiry timestamp.
- EventBridge Scheduler one-time `StopInstances` safety job for every rehearsal/demo window.
- A second on-instance shutdown timer with `InstanceInitiatedShutdownBehavior=stop`.
- No Spot instance for the live demonstration; interruption savings are not worth demo failure.

## Offline behavior and visible Decider evidence

The deployment must not replace or fork the existing game engine.

- Keep `game/engine.js` as the authoritative mission resolver.
- Treat Decider as specialist selection only and Bedrock text as cosmetic only.
- Render a compact AI evidence panel containing mode (`AWS live` or `offline fallback`), selected specialist, confidence, and all returned probabilities.
- Mark confidence unavailable rather than inventing a value when the server omits it.
- Validate every returned probability and choice before display or engine use.
- On timeout, 429, 5xx, network error, or invalid response, show an unobtrusive fallback notice and continue with the existing deterministic selection.
- Add a versioned service worker/cache manifest for `index.html`, styles, and `game/engine.js`, while preserving direct-file offline play.
- Never cache `/api/*` responses in CloudFront or the service worker.

## Verified account and dependency preflight

Read-only checks against the configured AWS account on 2026-10-14 found:

- AWS identity authentication succeeds in `us-east-1`.
- `Running On-Demand G and VT instances` quota (`L-DB2E81BA`) is **0 vCPUs** and adjustable. This blocks both `g4dn.xlarge` and `g5.xlarge` until a quota increase to at least 4 vCPUs is separately authorized and approved by AWS.
- `g4dn.xlarge` and `g5.xlarge` are listed as offerings in `us-east-1a`, `1b`, `1c`, `1d`, and `1f`. An offering is not a live capacity reservation, so launch capacity remains unconfirmed until creation.
- Nova Lite `amazon.nova-lite-v1:0` is `ACTIVE`, `AUTHORIZED`, entitled, and region-available.
- The `us.amazon.nova-lite-v1:0` system inference profile is `ACTIVE` and currently routes to Nova Lite foundation models in `us-east-1`, `us-east-2`, and `us-west-2`.
- The CloudFront origin-facing prefix list exists in `us-east-1`.
- The account currently has no CloudFront distributions and no CloudFront flat-rate subscriptions.

Official Decider sources confirm:

- Python 3.10+ and Linux CUDA are supported.
- PyPI `strands-decider==0.1.0` does not contain the new `cuda` extra, so the deployment must use a reviewed Git commit until a newer release includes it.
- Pin package source commit `6039cf8b64c6074e75804000c07ac3d4cce795f7`, which includes the current CUDA extra and the concurrent-request correctness fix.
- Pin v19 checkpoint revision `bb282d786bc251fd4e3068de3ada9ddbb38127cd` and its recorded base-model revision `b1485b2fa6dfa1287294f269f5fb618e03d52d7c`.
- The CUDA extra installs `flash-linear-attention`; `causal-conv1d` is an optional separately compiled optimization when a matching local CUDA toolkit is present. The documented PyTorch fallback is the safer first benchmark path.
- The serving command is `strands-decider serve <pinned-local-model-directory> --device cuda --port 8099`; it binds to loopback by default, exposes `GET /health`, and has no authentication. It must remain behind the bridge/reverse proxy.

The command sequence and rollback steps are in `AWS_DEPLOYMENT_CHECKLIST.md`.

## Implementation plan

No phase below authorizes AWS provisioning.

### Phase 0 — approval and account preflight

1. [x] Approve `us-east-1`, `g4dn.xlarge`, and a $30 initial spending target.
2. [x] Verify the account's GPU quota and regional instance-type offerings.
3. [ ] With separate authorization, request at least four On-Demand G/VT vCPUs; wait for AWS approval.
4. [x] Confirm Nova Lite access and cross-region inference-profile destinations.
5. [x] Validate the pinned Decider installation and serving path against official sources.
6. [ ] At the creation gate, validate the concrete CloudFront distribution and WAF web ACL for Free-plan subscription eligibility.
7. [ ] Save a current AWS Pricing Calculator estimate immediately before creation.

### Phase 1 — application changes, local/mock only

1. Add production configuration without changing loopback-safe local defaults.
2. Add the AI evidence panel for `choice`, `confidence`, and `probabilities`.
3. Add bounded client timeout and deterministic fallback tests.
4. Add strict request schema/body limits and a health/readiness endpoint.
5. Add service-worker caching for the static shell and tests proving `/api/*` is never cached.
6. Keep all existing offline and backend tests green.

### Phase 2 — reproducible infrastructure, still not deployed

1. Add reviewed infrastructure-as-code for S3, CloudFront/OAC, response headers, WAF/rate limit, EC2, EBS, Elastic IP, security group, IAM role, SSM, budgets, and the stop schedule.
2. Add idempotent instance bootstrap/systemd units for reverse proxy, Decider, and bridge.
3. Pin the Decider package and the exact Hugging Face model revision after live schema verification.
4. Document certificate issuance, DNS, start, health check, stop, restore, and teardown.
5. Run static IaC/security checks without creating resources.

### Phase 3 — provision only after separate approval

1. Deploy the static path first and prove OAC prevents direct S3 access.
2. Launch `g4dn.xlarge`, install/cache the pinned model, and capture a reusable encrypted image or snapshot.
3. Attach the least-privilege role, configure TLS/origin authentication, then attach the API behavior.
4. Run the repository live-verification script from EC2 and capture genuine Decider and Bedrock responses.
5. Resolve the remaining live-schema TODO and add the golden fixture test.

### Phase 4 — acceptance

- All existing automated tests pass.
- Direct S3 and direct-origin requests fail; CloudFront same-origin requests succeed.
- No SSH port is exposed.
- Fifty warm game-shaped Decider calls meet the documented p50/p95 gate and retain valid probabilities/confidence.
- Bedrock narration works with the instance role and no static AWS key.
- Simulated Decider, Bedrock, EC2, and network failures all continue playable offline.
- Stopping EC2 leaves the static game available and puts the UI into explicit offline-fallback mode.
- Budget alerts and both stop mechanisms are tested.

### Phase 5 — demo operations and shutdown

Before the demo:

1. Start EC2 15–20 minutes early.
2. Wait for systemd services and `/api/health` readiness.
3. Run one synthetic decision and narration; confirm the evidence panel and CloudFront path.
4. Confirm the scheduled stop time and the local shutdown timer.

After the demo:

1. Confirm the browser falls back cleanly, then stop (do not terminate) EC2.
2. Verify instance state is `stopped` and record EBS/EIP resources still billing.
3. Review Cost Explorer the following day.
4. After submission retention needs are settled, create/verify a snapshot or image, release the Elastic IP, and delete the EBS volume to approach $0/month.
5. Keep CloudFront/S3 only if the public offline game should remain available; otherwise disable/delete them through the same infrastructure stack.

## Evolution path

Do not add production-scale services before usage justifies them. If the game becomes publicly popular:

1. Separate bridge and inference only when independent scaling is needed.
2. Move the origin behind a private load balancer/VPC origin or an autoscaled GPU service.
3. Add real identity/session quotas if features become account-specific.
4. Add durable telemetry and queueing only for measured needs.
5. Re-evaluate quantization or a newer inference runtime with regression tests against Decider behavior.

## Risks requiring proof

- GPU quota may be zero and quota approval may take time.
- A stopped GPU instance can fail to restart because On-Demand capacity is not guaranteed. Try another listed AZ for `g4dn.xlarge`; `g5.xlarge` remains prohibited without benchmark evidence and separate approval.
- The pinned model declares BF16 on CUDA and upcasts to FP32 on CPU; verify actual peak VRAM/RAM rather than assuming raw checkpoint size.
- Instance latency and cold-load times above are estimates until benchmarked.
- The CloudFront Free plan and all prices must be checked in the target account immediately before deployment.
- Cross-region Bedrock policies must include every profile destination model ARN or calls can fail with `AccessDeniedException`.

## Research sources

- Strands Decider repository and server instructions: https://github.com/strands-labs/strands-decider
- Pinned model repository/API: https://huggingface.co/StrandsAgents/strands-decider-2B-hobson-v19
- EC2 G4: https://aws.amazon.com/ec2/instance-types/g4/
- EC2 G5: https://aws.amazon.com/ec2/instance-types/g5/
- EC2 G5g: https://aws.amazon.com/ec2/instance-types/g5g/
- EC2 On-Demand behavior/pricing rules: https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-on-demand-instances.html
- EC2 instance quotas: https://docs.aws.amazon.com/ec2/latest/instancetypes/ec2-instance-quotas.html
- EC2 stop/start behavior: https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/Stop_Start.html
- CloudFront S3 Origin Access Control: https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html
- CloudFront custom origin headers: https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/add-origin-custom-headers.html
- CloudFront plans/pricing: https://aws.amazon.com/cloudfront/pricing/
- CloudFront flat-rate plans: https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/flat-rate-pricing-plan.html
- CloudFront origin-facing prefix list: https://docs.aws.amazon.com/vpc/latest/userguide/working-with-aws-managed-prefix-lists.html
- S3 pricing: https://aws.amazon.com/s3/pricing/
- EBS pricing: https://aws.amazon.com/ebs/pricing/
- VPC/public IPv4 pricing: https://aws.amazon.com/vpc/pricing/
- Bedrock pricing: https://aws.amazon.com/bedrock/pricing/
- Nova Lite model card: https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-amazon-nova-lite.html
- Cross-region inference permissions: https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles-prereq.html
- EC2 instance roles: https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/iam-roles-for-amazon-ec2.html
- Systems Manager Session Manager: https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager.html

## Research note

Claude Code was asked to research this architecture. Its first pass recommended the same basic single-EC2 + S3/CloudFront shape and identified `g5g.xlarge` as the lowest-cost GPU candidate. This plan applies a conservative correction: use x86 `g4dn.xlarge` as the default until ARM64 compatibility is proven, and treat all latency/startup numbers as benchmark gates rather than established facts. A second Claude pass could not run because the configured Claude account had reached its session limit; no output from that failed attempt is represented as research.
