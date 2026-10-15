# EVIL GENIUS: World Domination Pending

Standalone browser game with three missions, four henchmen, and persistent offline progress. The original manual gameplay remains available.

## Play offline

Open `index.html` in Chrome or Edge. Offline mode never calls AI and runs deterministic simulated outcomes.

Gameplay rules live in `game/engine.js`. The browser uses the same pure mission resolver and deterministic specialist fallback exercised by the Node test suite.

## Run with live decision model + Bedrock

Requires Python 3.10+, AWS credentials configured with `bedrock:InvokeModel` permission, access to the configured Bedrock model, and the experimental Decider model weights (downloaded separately). Running Decider may use substantial CPU/GPU memory.

```bash
python -m pip install -r requirements.txt
python -m pip install strands-decider
strands-decider serve StrandsAgents/strands-decider-2B-hobson-v19 --port 8099
```

In a second terminal:

```bash
export AWS_REGION=us-east-1
export BEDROCK_MODEL_ID=us.amazon.nova-lite-v1:0
export STRANDS_DECIDER_URL=http://127.0.0.1:8099
python backend/server.py
```

`requirements.txt` also installs `strands-agents` (the Strands Agents SDK),
which `backend/agent.py` uses to build a real `Agent` backed by `BedrockModel`.

Open `http://127.0.0.1:8787`. The server binds to loopback only. **Do not expose the server publicly**: it has no authentication, quota enforcement, rate limiting, or permission boundaries. Before AWS deployment, replace this server with authenticated, rate-limited cloud endpoints.

**UNVERIFIED:** live inference (a real strands-decider server plus real AWS
credentials actually answering a request) has not been run end-to-end by a
human in this environment. Everything in `backend/agent.py` is covered only
by mock-based tests (see `backend/tests/`, which never touch the network);
treat live behavior as unverified until someone runs it with real Decider
weights and AWS credentials. This hedge comes off once
`backend/tests/fixtures/live_decider_response.json` and
`live_bedrock_response.json` exist as real captured responses (see below).

### Verifying live inference

`backend/scripts/verify_live.py` is the diagnostic script for this. It is
never run automatically (not by the test suite, not in CI) because it makes
real network calls. Run it yourself once Decider is serving and AWS
credentials are configured:

```bash
# Dependency/reachability check only -- no Bedrock or Decider inference
# call, safe to run anytime (including CI):
python backend/scripts/verify_live.py --dry-run

# Full live run: hits the real /v1/systemone endpoint and real Bedrock
# converse() once each, prints every raw response, and writes
# backend/tests/fixtures/live_decider_response.json and
# live_bedrock_response.json for you to commit as golden fixtures:
python backend/scripts/verify_live.py
```

Use the captured `live_decider_response.json` to resolve the
`# TODO: verify against installed version` marker in
`backend/agent.py::validate_decider_response`, then add a golden-response
unit test under `backend/tests/` built from that fixture so a future schema
regression breaks CI.

## Strands Agent: specialist tool selection + narration

`backend/agent.py` builds a Strands Agents SDK `Agent` (model: Amazon Bedrock
via `BedrockModel`, default `BEDROCK_MODEL_ID=us.amazon.nova-lite-v1:0`) with
two `@tool`-decorated tools, both idempotent and side-effect-free with
respect to game state:

- `choose_specialist(state)` calls the local strands-decider `/v1/systemone`
  endpoint for a typed `choice` decision between `science`, `force`,
  `deception`, `finance`, then validates the response: `choice` must be one
  of the tools offered, `confidence` (if present) must be a float in
  `[0, 1]`, and every key in `probabilities` (if present) must be an offered
  tool mapped to a float in `[0, 1]`.
- `narrate_outcome(state)` calls Bedrock's Converse API for two sentences of
  cosmetic supervillain dialogue. Cosmetic only: it cannot and does not
  change game arithmetic. The prompt (`agent.build_narration_prompt`) is
  hardened per `GAME_VISION.md` §3: exactly two sentences, no markdown/lists,
  explicit fictional-comedy framing, the correct per-character voice tag
  (`mal` / `boris` / `chaos` / `kevin` / `dolores`, with a neutral fallback
  voice for any other id), and a ban on modern-world brands, celebrities,
  politicians, and references to our inspiration TV shows (The Office, Parks
  and Recreation, Silicon Valley, Scrubs, Arrested Development, Brooklyn
  Nine-Nine, Futurama) -- per §3, the game studies the comedic *technique* of
  those shows, it never references or copies them. `agent.postprocess_narration`
  then strips a leading markdown fence or role prefix, truncates to 500 chars,
  and falls back to a fixed, non-Bedrock line if a banned reference slips
  through anyway.

A `DeciderValidationHandler` (a Strands intervention / `before_tool_call`
handler) denies a `choose_specialist` call before it runs if its
`available_tools` argument is missing or empty.

Both tools raise a dedicated error type (`DeciderUnavailableError` /
`BedrockUnavailableError`) when the upstream service is unreachable or
returns a response that can't be parsed, as opposed to a plain `ValueError`
for an actual bad/invalid decision. `backend/server.py` maps the former to a
sanitized HTTP 503 and the latter to a 400; neither ever forwards a stack
trace, credential detail, AWS region, or ARN to the HTTP client -- those only
get printed to the server's own stdout for a human to read locally.

`backend/server.py` imports `agent.call_decider` / `agent.call_bedrock_narration`
as `choose_tool` / `narrate` (kept importable under their original names for
`tests/test_bridge.py`) to serve `/api/decide` and `/api/narrate`.
`agent.run_mission_turn(state)` is a single callable that runs both tools in
sequence (decide, then narrate with the chosen specialist as `henchman`) for
callers that want a full mission turn in one call. The decision is checked
against allowed options and passed to the actual game engine. If a different
specialist is chosen, that specialist acts, gains/loses loyalty, and the
mission gets a coordination penalty. On service error, the game falls back
to offline play.

**Important:** request/response field names for strands-decider's
`/v1/systemone` and for the Strands Agents SDK's `Agent` / `@tool` /
intervention APIs were checked against the installed `strands-decider` docs
and the installed `strands-agents` package source, except where marked
`# TODO: verify against installed version` in `backend/agent.py` (a live
JSON example of a strands-decider `choice` answer, as opposed to its `noul`
answer, was not found). The project does not yet include AWS deployment, a
public repository, Builder Center article, or video, so it is not a
qualified submission yet.

## Verify

```bash
python -m py_compile backend/server.py backend/agent.py backend/scripts/verify_live.py
python -m unittest discover -s tests -v
python -m unittest discover -s backend/tests -v
node --test tests/*.test.mjs
python backend/scripts/verify_live.py --dry-run
```

## Contest tags

`#strands-decider-2b` and `#tool-selection`.
