# EVIL GENIUS: let a small model choose the henchman, not rewrite the game

Tags: `#strands-decider-2b` `#tool-selection`

Live game: https://d2gk454hfl6odl.cloudfront.net/

Source repository: https://github.com/kcasko/evil-genius (publication candidate; the repository must be updated and made public before this article is submitted).

EVIL GENIUS is a turn-based browser strategy game about an incompetent supervillain organization trying to steal the Moon. You build a lair, choose a crew, survive crises, and try to escape with enough Infamy to declare victory. The accountant is a playable specialist. The robot needs server upkeep. The brute treats most problems as construction opportunities.

The AI experiment is narrower than the premise: can a small decision model choose a useful specialist without becoming the authority over the game?

## One meaningful decision

At the Breach stage, Strands Decider 2B chooses among the skills available in the player's actual mission roster: science, force, deception, or finance. The typed question is:

> Choose the most useful specialist action for executing the fictional mission plan using these resources.

The state includes the mission plan, selected crew and equipment, heat, and recent events. The bridge removes unavailable options before building the question. The response contains a choice, a probability distribution, and confidence. Decider answers a typed question; it does not write the dialogue. [Strands Decider inference documentation](https://github.com/strands-labs/strands-decider/blob/main/docs/inference.md).

This selection matters. The chosen skill maps to a member of the assigned crew. That specialist's competence, stress, and equipment synergy affect the Breach roll. A different choice can change the outcome. It is not a model label printed beside an otherwise unchanged result.

The JavaScript engine resolves the roll and commits the state. Only afterward does Amazon Bedrock, using the `us.amazon.nova-lite-v1:0` inference profile, generate cosmetic dialogue for that specialist. Narration is escaped for display and never parsed as game instructions, rewards, or statistics.

## The AWS path

The public game is served through CloudFront from a private S3 bucket using Origin Access Control. CloudFront routes API requests to an AWS-IAM-authenticated Lambda Function URL. The bridge checks a DynamoDB kill switch and reserves both player and global quotas atomically before invoking paid services.

The specialist question goes to a CPU Bedrock AgentCore Runtime. This build pins `StrandsAgents/strands-decider-2B-hobson-v19` to revision `bb282d786bc251fd4e3068de3ada9ddbb38127cd`, using int8 quantization, the V1 runtime platform, a 300-second idle session timeout, and a 600-second maximum session lifetime. The deployment uses no EC2 instance, GPU, or provisioned model throughput.

This is a bounded decision workflow, not a claim that an autonomous agent invents new tools. The live request path uses the bridge and the game engine. The repository also contains Strands SDK helper code, but the demo does not pretend that a free-running SDK planning loop controls gameplay.

## What happened when I tested it

The October 16 smoke-test records include a fresh-player decision request taking 83.266 seconds. Four warm samples had a median of 7.117 seconds and a p95 of 7.191 seconds. Those four samples are a small observation, not a service-level promise. Peak recorded runtime RSS was about 6.54 GB. Full initial model readiness took substantially longer than an individual decision request.

A later end-to-end browser test returned a real Decider response in about 50.5 seconds and a Nova Lite narration in about 1.4 seconds. Decider selected science with confidence 0.269. The mission then failed its game roll, correctly awarded the partial payout, and displayed the narration. A successful API response is not a guaranteed successful heist.

Model confidence is also not the mission's win probability. The debrief now labels these separately: the selected specialist and model confidence, the actual game roll, and the Bedrock dialogue.

The recorded demo makes one new real decision and one new narration request. With the reproducible seed `contest-demo-1`, Decider chose science with confidence 0.4029, Nova Lite returned character dialogue, and the mission reached victory. The reported model latency was 70.212 seconds; the combined browser Breach step took about 73.75 seconds. The video explicitly condenses the startup wait for readability, without replacing the responses or the game result.

I have not measured a latency or cost improvement against an equivalent frontier-model router. The CPU deployment does not reproduce the upstream project's hardware benchmark. Final attributable AWS charges are delayed, so this article makes no finalized per-decision cost or savings claim.

## Failure is part of the design

If a provider is unavailable, a daily quota is exhausted, or paid inference is disabled, the game continues with a deterministic specialist selection. The client labels the fallback instead of presenting it as a live model response.

The public campaign permits 50 combined paid requests per day globally and 10 per player. A six-hour watchdog checks posted account usage across the campaign's month boundary and disables inference at the lower of the cumulative $5-per-elapsed-UTC-day allowance and $180. These controls use delayed billing data and are not a guaranteed hard spending cap. The campaign also has an expiry, budgets, and short log retention. Public static gameplay can continue when paid inference is off.

End-to-end checks covered both missions, saving and reloading, valid and malformed imports, construction, research, crew rest, crises, forfeit, victory, and defeat. Some error paths used browser-local simulations or prepared saves, explicitly separated from the real inference evidence. Sixty-six existing gameplay tests, five new save-validation tests, three availability-probe tests, and five standalone recipe tests passed.

Testing found a save-import bug that could overwrite a working game before reporting an error. It also found that a rate-limit response left the badge saying LIVE. Both were fixed and retested. Neither is hidden behind a claim that a polished demo proves every possible game path.

A cold bridge response also exposed an overly short browser health-probe window. The window is now ten seconds, with tests showing that a healthy response after 3.5 seconds is accepted and a stalled request still aborts into fallback.

## Reuse the decision pattern

The source package includes `patterns/specialist-selection/`: a typed question builder, response validation, allowlisted action dispatch, a caller-supplied fallback, a recorded-response example, and tests. Its default command makes no network requests. An explicit endpoint option connects it to a running compatible local Decider server.

Replace the four fictional specialties with your own authorized actions, offer only those currently available, validate the answer, and route it to a callable. Keep the application authoritative over state. The game-specific AWS adapter and browser-to-engine wiring are documented alongside the standalone example.

The useful boundary was not between a game with AI and a game without it. It was the boundary around one decision: let the model choose the specialist, let the engine resolve the consequences, and let the narrator complain about the paperwork afterward.

References: [Decider source and model](https://github.com/strands-labs/strands-decider), [AgentCore reference packaging](https://github.com/Vivek0712/strands-decider-agentcore), and [contest requirements](https://builder.aws.com/build/hackathons/4f50957c-1d08-37ab-b11c-97516b9adeb4/agent-experience-hackathon).
