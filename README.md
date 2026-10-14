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
python backend/server.py
```

Open `http://127.0.0.1:8787`. The server binds to loopback only. **Do not expose the server publicly**: it has no authentication, quota enforcement, rate limiting, or permission boundaries. Before AWS deployment, replace this server with authenticated, rate-limited cloud endpoints.

## Reusable recipe: specialist tool selection

`backend/server.py` -> `choose_tool()` provides a typed `choice` decision. Its state includes mission, selected plan, budget, suspicion, loyalty and recent events. Its options are `science`, `force`, `deception`, `finance`. The decision is checked against allowed options and passed to the actual game engine. If a different specialist is chosen, that specialist acts, gains/loses loyalty, and the mission gets a coordination penalty. The generated Bedrock dialogue is cosmetic only and cannot change game arithmetic. On service error, the game falls back to offline play.

**Important:** Actual Strands response fields and request schema require validation against the installed model version. This package has not been tested end-to-end with the live model or AWS credentials. In particular the typed choice `options` payload should be verified with a live server. The project does not yet include a Strands Agents SDK Agent/InterventionHandler, AWS deployment, public repository, Builder Center article, or video, so it is not a qualified submission yet.

## Verify

```bash
python -m py_compile backend/server.py
python -m unittest discover -s tests -v
```

## Contest tags

`#strands-decider-2b` and `#tool-selection`.