# Claude task — Strands Agent + Bedrock integration

You are working in worktree `D:\Repos\evil-genius-claude` on branch
`claude/aws-agent`. Repository: EVIL GENIUS — World Domination Pending.

## Scope (owned files)

You MAY create or modify:

- `backend/` (all of it — server, new agent module, etc.)
- `requirements.txt`
- New files under `backend/` or a new `backend/tests/` directory
- `README.md` sections that describe the Strands Decider / Strands Agents SDK /
  Amazon Bedrock integration and how to configure it

## Forbidden files (owned by Codex)

- `index.html` and any new frontend files
- Top-level `tests/` game-engine tests
- README.md sections about offline gameplay only

If an edit requires touching a forbidden file, STOP and note it in your final
summary; do not edit it.

## Goals

1. Verify, via official documentation, the current API shape for:
   - `strands-decider` (the typed-choice `/v1/systemone` endpoint — request
     fields, response fields, confidence/probabilities names).
   - the Strands Agents SDK (`strands` / `strands-agents`): the Agent class,
     the tool-registration decorator, how to plug in a Bedrock model, and the
     intervention / handler pattern.
   - Amazon Bedrock `converse` API via boto3 (the current `nova-lite` model id
     and request/response shape).
   Pull docs with web fetches you perform yourself. Cite the URLs in your final
   summary. Do NOT invent fields — if a field is uncertain, write a short
   `# TODO: verify against installed version` comment and keep going.

2. Implement a real Strands Agent in `backend/agent.py` (new file) that:
   - Uses the Strands Agents SDK to build an Agent whose model is Amazon
     Bedrock (`BEDROCK_MODEL_ID`, default `us.amazon.nova-lite-v1:0`).
   - Registers at least two tools: `choose_specialist` (which internally calls
     the Strands Decider `/v1/systemone` endpoint and returns the typed choice)
     and `narrate_outcome` (which returns cosmetic dialogue via the Bedrock
     model). Tools must be idempotent and side-effect-free w.r.t. game state.
   - Validates every Decider response: `choice` is one of the available tools,
     `confidence` (if present) is a float in [0,1], `probabilities` (if present)
     is a dict of allowed tools to floats that are each in [0,1].
   - Exposes a single callable (e.g. `run_mission_turn(state) -> dict`) that
     the HTTP layer can use.

3. Refactor `backend/server.py` so `/api/decide` and `/api/narrate` route
   through the new agent module. Keep the existing `choose_tool()` function
   name importable so the existing `tests/test_bridge.py` keeps passing. Keep
   the server loopback-only, keep the unauthenticated warning in README, keep
   the graceful 503 fallback on service error.

4. Add integration tests under `backend/tests/`:
   - unit test the response validator with good and bad payloads,
   - unit test tool registration (the agent exposes `choose_specialist` and
     `narrate_outcome`),
   - mock-based test that `run_mission_turn` produces the expected shape when
     Decider and Bedrock are both faked. Do NOT make live network calls.
   Keep `tests/test_bridge.py` working.

5. Update README's Strands/Bedrock section with clear configuration steps:
   env vars, how to install the Strands Agents SDK, how to run the Decider
   locally, and a prominent note that live inference is UNVERIFIED until a
   human runs it with real credentials.

## Rules

- Read-write sandbox, but ONLY touch files in your scope above.
- Do NOT run `git push`, `git merge`, `git rebase -i`, `git reset --hard`.
- Do NOT touch the main worktree at `D:\Repos\evil-genius`.
- Do NOT read, print, or commit any credentials, `.env`, or `~/.aws`.
- Do NOT make live AWS or Decider network calls in tests.
- Do NOT claim live inference works unless an explicit human-run test proves it;
  the correct state is "unverified until a human runs it".
- When finished:
  1. Run `python -m unittest discover -s tests -v` and show output.
  2. Run `python -m unittest discover -s backend/tests -v` and show output.
  3. `python -m py_compile backend/server.py backend/agent.py` and show output.
  4. `git add -A && git commit -m "<concise message>"` on branch
     `claude/aws-agent`. Do NOT push.
- End with a short report: files changed, tools implemented, tests passed,
  tests failed, docs you cited (with URLs), and remaining blockers (e.g.
  "live inference untested, needs AWS creds + Decider weights").

Do not fabricate test results. If a test fails, report it as failed.
