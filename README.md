# EVIL GENIUS V2

**Local campaign preview:** this branch adds a progression campaign and has not replaced the public game. Read [CAMPAIGN_PREVIEW.md](CAMPAIGN_PREVIEW.md) for the new loop, local play instructions, verification, and remaining contest work.

A turn-based villain management game with one bounded AI decision: **Strands Decider 2B selects the Breach specialist; the game engine resolves the consequences; Amazon Bedrock Nova Lite adds cosmetic dialogue.**

Live game: https://d2gk454hfl6odl.cloudfront.net/

Contest pattern: **tool selection**. Tags: `#strands-decider-2b` and `#tool-selection`.

## Start here

- Play the live game and open its four-step guide.
- Read the [published Builder Center article](https://builder.aws.com/content/3KnbpaYvMSHHRgLJsWOVOW6Dyc2/evil-genius-let-decider-choose-the-henchman) for the architecture, measured behavior, limits, and lessons.
- Reuse `patterns/specialist-selection/` for a standalone typed-choice -> allowlisted-action recipe.
- Watch the [88-second live demo](https://d2gk454hfl6odl.cloudfront.net/demo/evil-genius.mp4). The explicitly labeled startup wait is condensed; model responses and gameplay are real.

## Run the static game locally

From this directory:

```text
python -m http.server 8080 --bind 127.0.0.1
```

Open http://127.0.0.1:8080/. The static server has no AI endpoints, so the health probe fails and the game uses deterministic fallback. This command does not create AWS resources, download a model, or invoke paid inference.

## Try the reusable decision recipe

```text
python patterns/specialist-selection/specialist_selection.py
python -m unittest discover -s patterns/specialist-selection -p "test_*.py" -v
node scripts/verify-contest.mjs
```

The default recipe uses an explicitly labeled recorded bridge response. A live local endpoint is opt-in; its README explains how to supply one. The recipe validates availability, confidence, and probabilities, routes only to allowlisted functions, and uses the caller's fallback on bad responses or upstream failure.

## What runs on AWS

```text
Browser -> CloudFront -> private S3 static assets
                    -> AWS_IAM Lambda bridge
                         -> DynamoDB kill switch + atomic daily quotas
                         -> AgentCore CPU runtime / pinned int8 Decider v19
                         -> Amazon Bedrock / Nova Lite narration
```

The selected crew limits the options submitted to Decider. `game/v2/engine.js:resolveBreach` maps its skill choice to a crew member and applies that specialist's game modifiers. The decision debrief labels the actual selected character and model confidence. Model confidence is not the mission win probability.

The game stays playable when paid inference is disabled. The browser applies no model-generated arithmetic. Narration is escaped and cannot alter the saved state. The deployed path is a bounded bridge-and-engine workflow; the presence of Strands SDK helper code does not imply that a free-running SDK agent controls the game.

## Source provenance and deployment

This candidate starts from immutable release `4744f50f2b48a13c29833abbe099099b5f8792d8` and includes the later reviewed deployment overlays, save fixes, tutorial, artwork, portraits, and debrief. `SOURCE_PROVENANCE.json` records file hashes and comparisons with the served asset set. The original checkout was left unchanged.

The CloudFormation templates are the campaign's source, not an instruction to deploy into the original account. Review names, artifact paths, IAM, alerts, expiry, quotas, runtime settings, and cleanup before using them in another environment. They can incur charges. No deployment runs when this archive is opened or when the local examples above are executed.

`deployment/bridge-source/` contains the Python source files taken from the deployed Lambda bundle, excluding third-party dependencies. `deployment/agentcore-source/` contains the packaged runtime source, excluding model weights. Rebuild dependencies from their manifests; do not treat the archive as a prebuilt Lambda ZIP or container image. The pinned runtime upstream revision and model revision are documented under `infra/agentcore/` and in the article.

The campaign config uses 50 combined paid calls/day globally, 10 per player, a 300-second idle session timeout, a 600-second maximum session lifetime, a six-hour spending watchdog, and inference expiry after the judging window. Billing is delayed; these are protective controls, not a guaranteed hard credit cap. This repository makes no measured cost-savings or 115-ms CPU inference claim.

## Historical notes

Earlier design reports, deployment plans, and preflight drafts are preserved for provenance. They may describe superseded EC2/GPU proposals, private-test teardown plans, old quotas, or unverified pre-deployment status. Use this README, `SUBMISSION_ARTICLE.md`, current source/templates, and the dated verification evidence for the final implementation. Neither outdated prose nor a past estimate is evidence of the live deployment's present state.

## Credits and license

Project source is under the included MIT license. The source package includes original generated game illustrations. It does not redistribute model weights or claim ownership of the upstream model/runtime. The reference runtime uses MIT No Attribution; its notice is included under `deployment/agentcore-source/LICENSE`. Preserve and review the Decider/model Apache-2.0 notices, dependency licenses, and model terms when rebuilding. Reference runtime packaging: https://github.com/Vivek0712/strands-decider-agentcore. Strands Decider: https://github.com/strands-labs/strands-decider.
