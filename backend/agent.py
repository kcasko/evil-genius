"""Strands Agent wrapper: wires the strands-decider typed-choice endpoint and
Amazon Bedrock narration into a Strands Agents SDK Agent as two tools.

Docs consulted while writing this (field/class names below were checked
against these, and in several cases against the installed package source
directly -- `strands-agents` 1.61.0 / `boto3` 1.43.114 as resolved by
requirements.txt in this environment):

- Strands Agents SDK, Amazon Bedrock model provider:
  https://strandsagents.com/docs/user-guide/sdk/model-providers/amazon-bedrock/
- Strands Agents SDK, @tool decorator:
  https://strandsagents.com/docs/api/python/strands.tools.decorator/
- Strands Agents SDK, hooks / intervention concepts:
  https://strandsagents.com/docs/user-guide/concepts/agents/hooks/
- strands-decider (the /v1/systemone typed-choice model):
  https://github.com/strands-labs/strands-decider
  https://github.com/strands-labs/strands-decider/blob/main/docs/inference.md
  https://github.com/strands-labs/strands-decider/blob/main/docs/architecture.md
  https://github.com/strands-labs/strands-decider/blob/main/examples/strands/README.md
- Amazon Bedrock Nova Lite model card (model id) and Converse API:
  https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-amazon-nova-lite.html

LIVE INFERENCE IS UNVERIFIED: nothing here has been run against a real
strands-decider server or real AWS credentials in this environment. Every
test under backend/tests/ mocks the network boundary (urllib.request.urlopen
and boto3.client). See README.md before running this for real.
"""
import json
import os
import urllib.error
import urllib.request

import boto3
from strands import Agent, tool
from strands.interventions import Deny, InterventionHandler, Proceed
from strands.models import BedrockModel

DECIDER_URL = os.environ.get('STRANDS_DECIDER_URL', 'http://127.0.0.1:8099').rstrip('/')
BEDROCK_MODEL_ID = os.environ.get('BEDROCK_MODEL_ID', 'us.amazon.nova-lite-v1:0')
AWS_REGION = os.environ.get('AWS_REGION', 'us-east-1')

TOOLS = {
    'science': 'scientific invention and experiments',
    'force': 'brute force and construction',
    'deception': 'propaganda and misinformation in a fictional game',
    'finance': 'paperwork and financial acquisition',
}


def _is_unit_fraction(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and 0.0 <= value <= 1.0


def validate_decider_response(answer, available):
    """Validate a strands-decider ChoiceAnswer before the game trusts it.

    # TODO: verify against installed version -- strands-decider's docs confirm
    # the *shape* of a choice answer (top choice + per-option probabilities +
    # a derived confidence) but a live JSON example of a 'choice' answer was
    # not published as of this writing; only a 'noul' answer example was
    # ({"type": "noul", "noul": 0.86}). Field names here (choice/confidence/
    # probabilities) follow that shape by analogy.

    Args:
        answer: the `answers.<question>` object from a /v1/systemone response.
        available: the list of tool keys that were offered as criteria.

    Returns:
        The validated choice string.

    Raises:
        ValueError: if `answer` is malformed in any way.
    """
    if not isinstance(answer, dict):
        raise ValueError(f'Decider answer must be an object, got {type(answer).__name__}')
    choice = answer.get('choice')
    if choice not in available:
        raise ValueError(f'Unknown Decider choice: {choice!r} (available: {available})')
    confidence = answer.get('confidence')
    if confidence is not None and not _is_unit_fraction(confidence):
        raise ValueError(f'Decider confidence out of range: {confidence!r}')
    probabilities = answer.get('probabilities')
    if probabilities is not None:
        if not isinstance(probabilities, dict):
            raise ValueError(f'Decider probabilities must be an object, got {type(probabilities).__name__}')
        for key, value in probabilities.items():
            if key not in available:
                raise ValueError(f'Decider probabilities contain unknown tool: {key!r}')
            if not _is_unit_fraction(value):
                raise ValueError(f'Decider probability out of range for {key!r}: {value!r}')
    return choice


def call_decider(state):
    """POST a typed 'choice' question to strands-decider's /v1/systemone and return a validated choice.

    Reusable typed-choice decision recipe; the returned tool drives actual game mechanics.
    """
    if not isinstance(state, dict) or not isinstance(state.get('available_tools'), list):
        raise ValueError('Invalid decision state')
    available = [k for k in TOOLS if k in state['available_tools']]
    if not available:
        raise ValueError('No available tools')
    compact = {k: state.get(k) for k in ('mission', 'plan', 'specialist', 'budget', 'heat', 'loyalty', 'recent_events')}
    payload = {
        'state': compact,
        'questions': {
            'tool': {
                'type': 'choice',
                'instructions': 'Choose the most useful specialist action for executing the fictional mission plan using these resources.',
                'criteria': {k: TOOLS[k] for k in available},
            }
        },
    }
    req = urllib.request.Request(
        DECIDER_URL + '/v1/systemone',
        data=json.dumps(payload).encode(),
        headers={'Content-Type': 'application/json'},
        method='POST',
    )
    with urllib.request.urlopen(req, timeout=15) as response:
        result = json.load(response)
    # Response shape per strands_decider.schema.ChoiceAnswer: choice, probabilities, confidence.
    answer = result['answers']['tool']
    choice = validate_decider_response(answer, available)
    return {
        'provider': 'decider',
        'choice': choice,
        'confidence': answer.get('confidence'),
        'probabilities': answer.get('probabilities'),
        'latency_ms': result.get('latency_ms'),
    }


@tool
def choose_specialist(state: dict) -> dict:
    """Choose which specialist (science, force, deception, finance) should act on the mission plan.

    Calls the local strands-decider /v1/systemone typed-choice endpoint and
    validates its answer before returning it. Idempotent and side-effect-free
    with respect to game state: it only reads `state` and returns a decision.

    Args:
        state: mission state dict. Must include `available_tools` (list of
            allowed specialist keys) plus any of mission, plan, specialist,
            budget, heat, loyalty, recent_events used as Decider context.

    Returns:
        A dict with provider, choice, confidence, probabilities, latency_ms.
    """
    return call_decider(state)


def call_bedrock_narration(state):
    """Call Bedrock's Converse API for two sentences of cosmetic supervillain dialogue."""
    required = ('mission', 'plan', 'henchman', 'success', 'outcome')
    if any(k not in state for k in required):
        raise ValueError('Missing narration fields')
    prompt = (
        'Write exactly two funny, short sentences of cartoon-supervillain dialogue. No markdown. '
        'Keep the outcome fixed, do not invent money or change game statistics. '
        'This is a fictional comedy game. JSON context: ' + json.dumps({k: str(state[k])[:600] for k in required})
    )
    client = boto3.client('bedrock-runtime', region_name=AWS_REGION)
    result = client.converse(
        modelId=BEDROCK_MODEL_ID,
        messages=[{'role': 'user', 'content': [{'text': prompt}]}],
        inferenceConfig={'maxTokens': 130, 'temperature': 0.85},
    )
    parts = result['output']['message']['content']
    return {'provider': 'bedrock', 'narration': ' '.join(p.get('text', '') for p in parts).strip()[:500]}


@tool
def narrate_outcome(state: dict) -> dict:
    """Generate cosmetic supervillain dialogue for a mission outcome via Amazon Bedrock.

    Cosmetic only: the returned narration cannot and does not change game
    arithmetic. Idempotent and side-effect-free with respect to game state.

    Args:
        state: dict with mission, plan, henchman, success, outcome.

    Returns:
        A dict with provider and narration.
    """
    return call_bedrock_narration(state)


class DeciderValidationHandler(InterventionHandler):
    """Strands intervention handler (the "before_tool_call" pattern).

    Denies a `choose_specialist` call before it executes if its `available_tools`
    argument is missing or empty, instead of letting the HTTP call to the
    Decider fail downstream with a less useful error.

    https://strandsagents.com/docs/user-guide/concepts/agents/hooks/
    """

    name = 'decider-validation'

    def before_tool_call(self, event, **kwargs):
        if event.tool_use.get('name') == 'choose_specialist':
            tool_input = event.tool_use.get('input') or {}
            available = (tool_input.get('state') or {}).get('available_tools')
            if not isinstance(available, list) or not available:
                return Deny(reason='choose_specialist requires a non-empty available_tools list')
        return Proceed()


def build_agent():
    """Construct the Strands Agent: Bedrock model, the two game tools, and the validation intervention."""
    model = BedrockModel(model_id=BEDROCK_MODEL_ID, region_name=AWS_REGION)
    return Agent(model=model, tools=[choose_specialist, narrate_outcome], interventions=[DeciderValidationHandler()])


def run_mission_turn(state):
    """Run one full mission turn: Decider picks a specialist, then Bedrock narrates the outcome.

    Calls the tool functions directly rather than through the agent's LLM
    tool-calling loop, because specialist choice must stay deterministic game
    logic driven by the Decider, not a free-form model decision.

    Args:
        state: dict with the fields needed by both choose_specialist and
            narrate_outcome (available_tools, mission, plan, budget, heat,
            loyalty, recent_events, success, outcome). `henchman` defaults to
            the Decider's choice if not given.

    Returns:
        {'decision': <choose_specialist result>, 'narration': <narrate_outcome result>}
    """
    if not isinstance(state, dict):
        raise ValueError('Expected object state')
    decision = choose_specialist(state)
    narrate_state = dict(state)
    narrate_state.setdefault('henchman', decision['choice'])
    narration = narrate_outcome(narrate_state)
    return {'decision': decision, 'narration': narration}
