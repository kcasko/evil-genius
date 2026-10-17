# Reusable pattern: bounded specialist action selection

Pattern: **tool selection**. Submission tags: `#strands-decider-2b` and `#tool-selection`.

Decider receives a compact state, a typed `choice` question, and a finite option set. An allowlist validates the reply before routing to a callable. A caller-selected deterministic fallback handles unavailable or malformed responses. The pattern is useful whenever an agent must choose among actions it is already authorized to take.

## Try it without any AWS calls

From the repository root:

```text
python patterns/specialist-selection/specialist_selection.py
python -m unittest discover -s patterns/specialist-selection -p "test_*.py" -v
```

The default example explicitly uses a recorded, normalized bridge response from the October 16 live game test. It is not a new live model invocation. Only the selected example action runs. Replace `actions` with your own functions and supply your own fallback.

## Typed question

`build_question` constructs:

```json
{"state":{"mission":"moon","plan":"Analyze lunar security","heat":28},"questions":{"tool":{"type":"choice","instructions":"Choose the most useful specialist action for executing the fictional mission plan using these resources.","criteria":{"science":"scientific invention and experiments","force":"brute force and construction"}}}}
```

The full vocabulary is science, force, deception, and finance. Offer only the options that are actually available. Never execute a model-generated function name or import an arbitrary tool from its answer.

## Connect a running local model

After installing and starting the compatible Strands Decider server using its official instructions, run:

```text
python patterns/specialist-selection/specialist_selection.py --endpoint http://127.0.0.1:8099/v1/systemone
```

This performs inference on that server. Model installation/download and hosting are separate steps. The deployed game pins `StrandsAgents/strands-decider-2B-hobson-v19`, revision `bb282d786bc251fd4e3068de3ada9ddbb38127cd`, with int8 quantization. Do not silently replace it while reproducing these measurements.

For an AWS transport, inject a callable that signs an AgentCore invocation and returns its decoded JSON; `route_action` does not depend on the transport. Follow the deployed adapter in `backend/bridge/handler.py:build_decider_payload` and `invoke_agentcore_decider`. Keep authentication, kill-switch checks, daily quotas, and error sanitization ahead of paid calls.

## Where it affects the actual game

1. `index.html` limits options to the selected crew and sends the plan, equipment, and game context through `/api/decide`.
2. `backend/bridge/handler.py` builds the typed question, invokes AgentCore, and validates the reply.
3. `game/v2/engine.js:resolveBreach` maps the selected skill to a roster member. That specialist's competence, stress, and equipment synergy affect the Breach roll. This is an actual game decision, not decorative narration.
4. After the game result is fixed, `/api/narrate` calls Nova Lite for dialogue. Narration is escaped and never fed back into game arithmetic.

The standalone recipe demonstrates routing to real Python callables. The browser game's action execution lives in its JavaScript engine; it does not use this standalone file at runtime or pretend to run an autonomous Strands SDK loop.

Confidence describes the model's specialist choice. It is not the game's win probability. This recipe intentionally adds no confidence threshold because the deployed game does not use one. A threshold can be added by the adopting application, with its own evaluation.

References: https://github.com/strands-labs/strands-decider/blob/main/docs/inference.md and https://github.com/strands-labs/strands-decider/blob/main/docs/architecture.md.
