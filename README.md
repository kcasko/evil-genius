# EVIL GENIUS: World Domination Pending

Standalone browser game with three missions, four henchmen, and persistent offline progress. The original manual gameplay remains available.

## Play offline

Open `index.html` in Chrome or Edge. Offline mode never calls AI and runs deterministic simulated outcomes.

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
weights and AWS credentials.

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
  change game arithmetic.

A `DeciderValidationHandler` (a Strands intervention / `before_tool_call`
handler) denies a `choose_specialist` call before it runs if its
`available_tools` argument is missing or empty.

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
python -m py_compile backend/server.py backend/agent.py
python -m unittest discover -s tests -v
python -m unittest discover -s backend/tests -v
```

## Contest tags

`#strands-decider-2b` and `#tool-selection`.