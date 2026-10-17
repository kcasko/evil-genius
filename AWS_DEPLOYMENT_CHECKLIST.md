# EVIL GENIUS — AWS Deployment Implementation Checklist

Status: preparation only. **Do not run state-changing commands in this document until the next human authorization gate.**

> **Deployment freeze until 2026-10-16.** No billable AWS resource or service may be created, launched, deployed, or invoked before 2026-10-16 (Strands Decider 2B hackathon open). Covers EC2, EBS, Elastic IPs, CloudFront, S3, WAFv2, Bedrock inference, and any other billable service. The restriction may not be bypassed via another agent, automation, or CLI tool. 2026-10-16 is the earliest permitted deployment date, not automatic authorization — after the contest opens, status, resources, and expected charges must be reported and explicitly approved before provisioning. Preparation permitted now: GPU quota request (non-billable), script/config drafting, local dev/tests, security/rollback/cost review, keeping this checklist current.

Approved envelope:

- Region: `us-east-1`
- Primary: `g4dn.xlarge`
- `g5.xlarge`: prohibited without measured justification and separate approval
- Initial target: $30
- Budget notifications: $5, $15, and $30 (notifications, not hard limits)
- Priority: install and benchmark Strands Decider 2B before additional game features

## 1. Current blockers and verified facts

- [x] AWS credentials authenticate successfully.
- [x] G/VT On-Demand quota `L-DB2E81BA` is adjustable but currently **0 vCPUs**.
- [x] Quota increase request submitted 2026-10-14 21:56 EDT (id `dae2f65d11a74597962b4d351cc4c7a4kYHPPADx`), desired value 4 vCPUs, status `PENDING`.
- [x] `g4dn.xlarge` is listed in `us-east-1a`, `1b`, `1c`, `1d`, and `1f`.
- [x] `g5.xlarge` is listed in the same five AZs, but is not authorized for launch.
- [x] Nova Lite base model is active, authorized, entitled, and region-available.
- [x] `us.amazon.nova-lite-v1:0` is active and routes to `us-east-1`, `us-east-2`, and `us-west-2`.
- [x] CloudFront's origin-facing managed prefix list exists.
- [x] No existing CloudFront distribution or flat-rate subscription was found.
- [ ] GPU quota increase is approved by the human and AWS.
- [ ] A concrete CloudFront distribution and WAF web ACL pass Free-plan subscription validation.

Availability-zone listing proves that AWS offers the instance type in those AZs. It does not reserve capacity or guarantee a future launch.

## 2. Exact resource inventory

Create one infrastructure stack named `evil-genius-hackathon` with these resources and no others unless the plan is re-approved:

### Network

- One dedicated VPC, for example `10.42.0.0/24`.
- One public subnet, for example `10.42.0.0/26`, in an AZ selected from the verified offering list.
- One Internet Gateway and attachment.
- One route table with `0.0.0.0/0` to the Internet Gateway.
- One Elastic IP associated with the EC2 instance.
- One security group:
  - inbound TCP 443 only from `com.amazonaws.global.cloudfront.origin-facing`
  - no port 22 rule
  - no direct rule for port 8099 or 8787
  - outbound HTTPS/DNS required for package installation, Hugging Face, Bedrock, SSM, and OS updates

### Compute

- One `g4dn.xlarge` On-Demand EC2 instance.
- Ubuntu 22.04 Deep Learning Base OSS NVIDIA Driver GPU AMI, resolved at deployment time from:
  `/aws/service/deeplearning/ami/x86_64/base-oss-nvidia-driver-gpu-ubuntu-22.04/latest/ami-id`
- 80 GB encrypted gp3 root volume, delete-on-termination disabled until teardown approval.
- IMDSv2 required (`HttpTokens=required`, hop limit 1).
- API termination protection enabled during the demo window.
- `InstanceInitiatedShutdownBehavior=stop`.
- No EC2 key pair and no SSH ingress.
- One instance profile with the runtime policies in section 4.

### Application services on EC2

- Nginx or equivalent TLS reverse proxy on TCP 443.
- Existing Python bridge on `127.0.0.1:8787`.
- Strands Decider on `127.0.0.1:8099`.
- Three hardened systemd services: reverse proxy, bridge, and Decider.
- One systemd shutdown service and timer as the backup auto-stop mechanism.

### Static site and edge

- One private, encrypted, versioned S3 bucket with Block Public Access enabled.
- One CloudFront Origin Access Control.
- One CloudFront distribution:
  - default origin: private S3 bucket
  - `/api/*` origin: TLS custom origin name pointing to the Elastic IP
  - viewer protocol: redirect HTTP to HTTPS
  - custom-origin protocol: HTTPS only
  - minimum origin TLS: TLS 1.2
  - static policy: AWS managed `CachingOptimized`
  - API policy: AWS managed `CachingDisabled`
  - API allowed methods limited to the application requirement
  - API responses and errors are never cached
  - random origin-verification header added only by CloudFront
- One ACM viewer certificate in `us-east-1`, DNS validated.
- One publicly trusted origin certificate matching the origin DNS name, obtained by manual DNS-01 validation so no DNS-provider API credential remains on EC2.
- One WAFv2 Web ACL associated with CloudFront.
- One CloudFront Free flat-rate subscription covering exactly the distribution and Web ACL.

### Guardrails and operations

- One AWS Budget with a $30 monthly limit and absolute-value notifications at $5, $15, and $30.
- One SNS topic or confirmed email subscriber for budget notifications.
- One EventBridge Scheduler one-time schedule targeting EC2 `StopInstances` for each launch window.
- One scheduler execution role scoped to stopping only the approved instance.
- Standard EC2/SSM logs only. Do not enable paid high-volume logging by default. CloudTrail management-event history remains available via the account's default trail; S3 server-access logging and CloudFront real-time logs are intentionally deferred until after benchmark and separate authorization, because both bill per-event or per-GB and would silently push the $30 target.
- Tags on every taggable resource:
  - `Project=evil-genius`
  - `Environment=hackathon`
  - `Owner=kcasko`
  - `ManagedBy=cloudformation`
  - `ExpiresAt=<approved UTC timestamp>`

## 3. Read-only preflight commands

These commands do not create resources:

```bash
export AWS_REGION=us-east-1

aws sts get-caller-identity >/dev/null

aws service-quotas get-service-quota \
  --region "$AWS_REGION" \
  --service-code ec2 \
  --quota-code L-DB2E81BA

aws ec2 describe-instance-type-offerings \
  --region "$AWS_REGION" \
  --location-type availability-zone \
  --filters Name=instance-type,Values=g4dn.xlarge

aws bedrock get-foundation-model-availability \
  --region "$AWS_REGION" \
  --model-id amazon.nova-lite-v1:0

aws bedrock get-inference-profile \
  --region "$AWS_REGION" \
  --inference-profile-identifier us.amazon.nova-lite-v1:0

aws ssm get-parameter \
  --region "$AWS_REGION" \
  --name /aws/service/deeplearning/ami/x86_64/base-oss-nvidia-driver-gpu-ubuntu-22.04/latest/ami-id
```

Expected pre-creation state:

- G/VT quota is at least 4, not 0.
- Nova access fields report authorized/available.
- Inference profile status is active.
- AMI parameter resolves to an x86_64 image.

## 4. IAM permissions

### Runtime EC2 role

No static keys are stored on EC2. The application statement is restricted to the approved inference profile and its current destination models:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "InvokeNovaLiteThroughApprovedProfile",
      "Effect": "Allow",
      "Action": "bedrock:InvokeModel",
      "Resource": [
        "arn:aws:bedrock:us-east-1:${AWS_ACCOUNT_ID}:inference-profile/us.amazon.nova-lite-v1:0",
        "arn:aws:bedrock:us-east-1::foundation-model/amazon.nova-lite-v1:0",
        "arn:aws:bedrock:us-east-2::foundation-model/amazon.nova-lite-v1:0",
        "arn:aws:bedrock:us-west-2::foundation-model/amazon.nova-lite-v1:0"
      ]
    }
  ]
}
```

Replace `${AWS_ACCOUNT_ID}` during template rendering. Do not commit an account ID.

Attach `AmazonSSMManagedInstanceCore` for Session Manager. Do not grant the runtime role `bedrock:*`, IAM administration, S3 write, Secrets Manager, EC2 control, or streaming permissions. Add `bedrock:InvokeModelWithResponseStream` only after a code change requires it.

### EventBridge Scheduler role

Trust only `scheduler.amazonaws.com`. Its permission is:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "ec2:StopInstances",
      "Resource": "arn:aws:ec2:us-east-1:${AWS_ACCOUNT_ID}:instance/${INSTANCE_ID}"
    }
  ]
}
```

### Provisioning operator or CloudFormation execution role

The deployment identity needs only the create/read/update/delete and tagging actions required for:

- CloudFormation stack operations
- EC2, VPC, EBS, Elastic IP, security groups, and instance attributes
- IAM role/instance-profile creation and `iam:PassRole` limited to the two roles above
- S3 bucket/policy/static-object deployment
- CloudFront distribution, OAC, invalidation, and association
- WAFv2 Web ACL and rules
- ACM certificate request/describe (DNS record validation remains human-controlled)
- Budgets notification configuration
- SNS topic/subscription configuration
- EventBridge Scheduler schedule/role target
- CloudFront Pricing Plan Manager subscription operations
- read-only Service Quotas, SSM public parameters, Bedrock model/profile, and EC2 offering queries

Do not give the EC2 application role these provisioning permissions. The infrastructure template must be reviewed before creating a CloudFormation change set.

## 5. Approval-gated state-changing commands

None of these commands were run while preparing this checklist.

### GPU quota request

This is the first blocker. It changes an account quota but creates no billable compute:

```bash
aws service-quotas request-service-quota-increase \
  --region us-east-1 \
  --service-code ec2 \
  --quota-code L-DB2E81BA \
  --desired-value 4
```

Wait until `get-service-quota` returns at least `4.0`. Do not request more than four vCPUs for the initial demo.

### CloudFormation safety sequence

```bash
aws cloudformation validate-template \
  --region us-east-1 \
  --template-body file://infra/evil-genius.yaml

aws cloudformation create-change-set \
  --region us-east-1 \
  --stack-name evil-genius-hackathon \
  --change-set-name initial-reviewed-deploy \
  --change-set-type CREATE \
  --template-body file://infra/evil-genius.yaml \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameters file://infra/parameters.us-east-1.json

aws cloudformation describe-change-set \
  --region us-east-1 \
  --stack-name evil-genius-hackathon \
  --change-set-name initial-reviewed-deploy
```

Stop here for a final resource and cost review. Only then execute the change set.

### CloudFront Free subscription

AWS requires exactly one CloudFront distribution ARN and one WAF Web ACL ARN. Free activates immediately but costs $0/month:

```bash
aws pricing-plan-manager create-subscription \
  --region us-east-1 \
  --plan-family CloudFront \
  --plan-tier FREE \
  --usage-level DEFAULT \
  --approval-mode IMMEDIATE \
  --resource-arns "$CLOUDFRONT_DISTRIBUTION_ARN" "$WAF_WEB_ACL_ARN" \
  --client-token "$IDEMPOTENCY_TOKEN"
```

If AWS rejects the distribution configuration, stop. Do not switch to Pro or Business without separate approval.

## 6. Strands Decider installation and service validation

### Pinned inputs

- Package source commit: `6039cf8b64c6074e75804000c07ac3d4cce795f7`
- Model repository: `StrandsAgents/strands-decider-2B-hobson-v19`
- Model revision: `bb282d786bc251fd4e3068de3ada9ddbb38127cd`
- Recorded base revision: `b1485b2fa6dfa1287294f269f5fb618e03d52d7c`
- Python: 3.10 or newer; use the AMI's supported `python3` after verifying it is at least 3.10
- Torch: `2.7.1` from the official CUDA 12.6 wheel index
- Transformers: `5.17.0`
- PEFT: `0.21.0`

PyPI `0.1.0` lacks the CUDA extra. Do not use an unpinned `pip install strands-decider` for this GPU deployment.

### Installation commands on the approved EC2 instance

```bash
python3 -c 'import sys; assert sys.version_info >= (3, 10); print(sys.version)'

sudo useradd --system --create-home --home-dir /opt/evil-genius \
  --shell /usr/sbin/nologin evilgenius
sudo install -d -o evilgenius -g evilgenius \
  /opt/evil-genius/app /opt/evil-genius/models /opt/evil-genius/cache

sudo -u evilgenius python3 -m venv /opt/evil-genius/.venv
sudo -u evilgenius /opt/evil-genius/.venv/bin/python -m pip install \
  --upgrade pip setuptools wheel
sudo -u evilgenius /opt/evil-genius/.venv/bin/python -m pip install \
  'torch==2.7.1' --index-url https://download.pytorch.org/whl/cu126
sudo -u evilgenius /opt/evil-genius/.venv/bin/python -m pip install \
  'transformers==5.17.0' 'peft==0.21.0'
sudo -u evilgenius /opt/evil-genius/.venv/bin/python -m pip install \
  'strands-decider[cuda] @ git+https://github.com/strands-labs/strands-decider@6039cf8b64c6074e75804000c07ac3d4cce795f7'
sudo -u evilgenius /opt/evil-genius/.venv/bin/python -m pip install \
  -r /opt/evil-genius/app/requirements.txt

sudo -u evilgenius env HF_HOME=/opt/evil-genius/cache/huggingface \
  /opt/evil-genius/.venv/bin/hf download \
  StrandsAgents/strands-decider-2B-hobson-v19 \
  --revision bb282d786bc251fd4e3068de3ada9ddbb38127cd \
  --local-dir /opt/evil-genius/models/strands-decider-2B-hobson-v19
```

The initial path deliberately uses the PyTorch fallback for `causal_conv1d`, which the official v19 setup documents as supported. After a successful baseline benchmark, `causal-conv1d` may be compiled as a separate optimization only if `nvcc` is installed and the result passes response-regression tests:

```bash
nvcc --version
sudo -u evilgenius /opt/evil-genius/.venv/bin/python -m pip install \
  causal-conv1d --no-build-isolation
```

Before starting the service:

```bash
nvidia-smi
/opt/evil-genius/.venv/bin/python -c \
  'import torch; assert torch.cuda.is_available(); print(torch.cuda.get_device_name(0))'
/opt/evil-genius/.venv/bin/strands-decider --help
```

Serve only on the default loopback address:

```bash
sudo -u evilgenius env HF_HOME=/opt/evil-genius/cache/huggingface \
  /opt/evil-genius/.venv/bin/strands-decider serve \
  /opt/evil-genius/models/strands-decider-2B-hobson-v19 \
  --device cuda \
  --port 8099
```

Health check from EC2:

```bash
curl --fail --silent http://127.0.0.1:8099/health
```

Reject deployment if the service binds to a non-loopback address, CUDA is unavailable, model revision differs, or health reports a different model/device.

## 7. Bridge configuration

Use systemd environment entries, not committed secrets:

```text
AWS_REGION=us-east-1
BEDROCK_MODEL_ID=us.amazon.nova-lite-v1:0
STRANDS_DECIDER_URL=http://127.0.0.1:8099
DECIDER_TIMEOUT_SECONDS=3.5
```

The bridge remains on `127.0.0.1:8787`. Its unit starts after network readiness and Decider health. It runs as `evilgenius`, uses `NoNewPrivileges=true`, a private temporary directory, a read-only application tree, and write access only to an explicit state/log directory if needed.

Do not run a paid Bedrock inference check until the creation gate explicitly authorizes the negligible call cost.

## 8. TLS, origin, and API security checklist

### Viewer and static origin

- [ ] S3 Block Public Access is enabled at bucket and account level where compatible.
- [ ] Bucket policy permits `s3:GetObject` only to CloudFront service principal with the exact distribution `AWS:SourceArn`.
- [ ] OAC uses SigV4 signing always.
- [ ] Viewer HTTP redirects to HTTPS.
- [ ] Viewer TLS minimum is 1.2.
- [ ] Direct S3 object URL returns access denied.

### EC2 custom origin

- [ ] DNS-only origin hostname points to the Elastic IP.
- [ ] Origin certificate is publicly trusted, unexpired, and matches the hostname.
- [ ] CloudFront origin protocol policy is HTTPS-only and minimum TLS is 1.2.
- [ ] EC2 security group has exactly one inbound rule: TCP 443 from the CloudFront origin-facing prefix list.
- [ ] Ports 22, 80, 8099, and 8787 are not publicly reachable.
- [ ] CloudFront overwrites the random origin-verification header.
- [ ] Nginx rejects a missing or wrong origin header before proxying.
- [ ] Nginx exposes only `/api/decide`, `/api/narrate`, and the minimal health path.
- [ ] Request body maximum is 16 KiB.
- [ ] Unsupported methods return 405; unknown paths return 404.
- [ ] Proxy and application timeouts are finite.

### Abuse protection

Use no more than the five Free-plan WAF rules. Initial policy:

1. AWS managed common-threat protection.
2. IP rate limit scoped to `/api/*`, initially 100 requests per five minutes per IP.
3. Block API bodies larger than 16 KiB.
4. Reserve one rule for emergency IP/ASN blocking.
5. Reserve one rule for measured abuse, not speculative complexity.

At the application boundary:

- fixed JSON schemas only
- no arbitrary model prompt supplied by the browser
- allowlisted specialist IDs only
- confidence/probability bounds enforced
- `Content-Type: application/json` required
- sanitized errors only
- CORS/Origin/Sec-Fetch validation used as defense in depth, not authentication
- no caching of `/api/*`

## 9. Automatic shutdown

### Primary mechanism: EventBridge Scheduler

Create a one-time schedule at every start/rehearsal. Universal target:

```text
arn:aws:scheduler:::aws-sdk:ec2:stopInstances
```

Input:

```json
{"InstanceIds":["${INSTANCE_ID}"]}
```

Configure:

- exact UTC stop time
- flexible time window disabled
- retry policy with at least three attempts
- short maximum event age
- execution role scoped to the one instance
- action after completion: delete the schedule if supported, otherwise remove it during cleanup

### Backup mechanism: systemd timer

Install `evil-genius-autostop.service`:

```ini
[Unit]
Description=Stop EVIL GENIUS EC2 after the approved window

[Service]
Type=oneshot
ExecStart=/sbin/shutdown -h now
```

Install `evil-genius-autostop.timer`:

```ini
[Unit]
Description=Backup EVIL GENIUS EC2 stop timer

[Timer]
OnActiveSec=6h
AccuracySec=1min
Unit=evil-genius-autostop.service

[Install]
WantedBy=timers.target
```

Because `InstanceInitiatedShutdownBehavior=stop`, `shutdown -h now` must stop, not terminate, the instance. Verify both settings before inference testing:

```bash
systemctl status evil-genius-autostop.timer
aws ec2 describe-instance-attribute \
  --region us-east-1 \
  --instance-id "$INSTANCE_ID" \
  --attribute instanceInitiatedShutdownBehavior
```

Perform one controlled test of each stop mechanism before the demo, then restart and verify model readiness.

## 10. Performance measurement

Measure Decider before implementing additional game features.

Record:

- AMI ID and package/model commit hashes
- instance type and AZ
- boot-to-SSM time
- boot-to-Decider-health time
- model-load time from systemd journal
- 50 game-shaped warm requests
- p50, p95, maximum, and error count for Decider `latency_ms`
- end-to-end `/api/decide` p50/p95
- peak VRAM from `nvidia-smi`
- peak system RAM
- chosen specialist, confidence, and probability schema validity

`g4dn.xlarge` acceptance gate:

- 50/50 valid responses
- zero process restarts or CUDA out-of-memory events
- warm end-to-end p50 at or below 1 second
- warm end-to-end p95 at or below 2.5 seconds
- browser remains within the existing 3.5-second timeout

If it fails, stop the instance and present evidence. Do not launch `g5.xlarge` until separately approved.

## 11. Verification sequence

After authorized deployment:

1. Verify the stack resource list matches section 2.
2. Verify budget notification subscribers are confirmed.
3. Verify both shutdown mechanisms.
4. Verify direct S3 access fails.
5. Verify direct origin access without the secret fails.
6. Verify SSH and internal service ports are closed.
7. Verify CloudFront static and API routes succeed.
8. Verify Decider benchmark gate.
9. Run exactly one approved Nova Lite narration test.
10. Run the repository live-verification script and save sanitized fixtures.
11. Stop EC2 and verify the browser continues in offline mode.
12. Verify the EC2 state is `stopped` and the scheduler/timer results are recorded.

## 12. Rollback and teardown

### Failed EC2/model deployment

1. Stop the EC2 instance immediately.
2. Do not delete the failed volume until logs and package versions are captured.
3. Detach CloudFront `/api/*` behavior or point it to a maintenance/offline response.
4. Keep S3/CloudFront static gameplay available.
5. Roll back the CloudFormation change set or update to the last reviewed template.
6. If the instance is unrecoverable, snapshot the encrypted EBS volume only if needed for diagnosis, then terminate/delete after approval.

### Failed edge/TLS deployment

1. Disable the API cache behavior before changing DNS.
2. Restore the previous DNS record and CloudFront configuration.
3. Invalidate only changed static paths if needed.
4. Stop EC2 while the origin is unreachable.
5. Never weaken TLS, open the security group to `0.0.0.0/0`, or expose 8099/8787 as a shortcut.

### Full cost teardown

1. Stop EC2 and verify `stopped`.
2. Save a tested encrypted image/snapshot only if retention is required.
3. Delete the CloudFormation stack after confirming retained-data choices.
4. Release the Elastic IP.
5. Delete the EBS volume and unwanted snapshots.
6. Cancel the CloudFront Free subscription and delete the distribution/Web ACL if the public offline site is not being retained.
7. Empty/delete the S3 bucket if not retaining the site.
8. Delete EventBridge schedules, IAM roles, SNS topic, and budget.
9. Verify no project-tagged resources remain and review Cost Explorer the following day.

## 13. Cost implications

While running:

- `g4dn.xlarge`: approximately $0.526/hour.
- Eight-hour window: approximately $4.21 compute.
- Twenty hours: approximately $10.52 compute.
- Nova Lite: approximately $0.06 per 1,000 game-sized narrations under the documented token assumption.

While stopped but retained:

- EC2 compute: $0.
- 80 GB gp3: approximately $6.40/month.
- Elastic IP/public IPv4: approximately $3.65/month.
- CloudFront Free plan: $0/month if AWS accepts the final distribution/Web ACL.
- Expected retained baseline: approximately $10.05/month, before optional snapshots and tax.

After releasing the Elastic IP and deleting EBS/snapshots, the retained static site can approach $0/month under the Free plan. The $5, $15, and $30 budget messages provide warning only. They do not stop EC2 or cap AWS charges; the Scheduler and systemd timer are the actual compute-cost brakes.

## 14. Authorization gate

The next authorization must explicitly cover:

- requesting the four-vCPU G/VT quota increase
- creating the CloudFormation change set and listed resources
- activating the $0 CloudFront Free subscription
- downloading model/base weights to EC2
- the first `g4dn.xlarge` running window and maximum duration
- one Nova Lite live call

It does not authorize `g5.xlarge`, a paid CloudFront tier, opening SSH, relaxing origin controls, or exceeding the $30 initial target.
