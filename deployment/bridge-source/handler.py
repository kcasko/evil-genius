from botocore.config import Config as BotoConfig
"""Lambda bridge entry point.

Fronts three routes behind a Lambda Function URL (payload format 2.0):
GET /api/health, POST /api/decide, POST /api/narrate. Enforces the kill
switch and DynamoDB rate limits before any AgentCore/Bedrock call, signs
the AgentCore invocation (boto3 SigV4-signs every request automatically),
and passes /api/narrate straight through to the existing Nova Lite
narration path in backend/agent.py.

Never returns a 200 with a fake payload: any backend failure (kill
switch tripped, rate limit exceeded, AgentCore/Bedrock unreachable,
malformed upstream response) maps to a 503 or 429 with a small, sanitized
JSON body. Detailed exception text is logged server-side only -- never
echoed to the client, matching the existing posture in backend/server.py.
"""
import hashlib
import json
import sys
import uuid
from pathlib import Path

import boto3

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config
import killswitch
import ratelimit
from killswitch import KillSwitchUnavailableError
from ratelimit import RateLimitExceeded

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from agent import (  # noqa: E402
    TOOLS,
    BedrockUnavailableError,
    call_bedrock_narration,
    validate_decider_response,
)

AI_UNAVAILABLE_BODY = {'error': 'ai_unavailable', 'fallback': 'offline'}


def _rate_limited_body():
    """Return the next UTC reset in epoch seconds for the browser countdown."""
    return {
        'error': 'rate_limited',
        'fallback': 'offline',
        'until': ratelimit._day_end_ttl(),
    }


class AgentCoreUnavailableError(RuntimeError):
    """The AgentCore Runtime invocation failed or returned an unparseable response.

    Mirrors backend/agent.py's DeciderUnavailableError/BedrockUnavailableError
    split: this means the *service* is the problem (network, IAM, malformed
    JSON), not that the player's request was invalid. The handler maps this
    to a 503, never a 400, and never forwards the underlying message (which
    may embed an ARN or region) to the client.
    """


def _response(status, obj):
    return {
        'statusCode': status,
        'headers': {'Content-Type': 'application/json'},
        'body': json.dumps(obj),
    }


def resolve_player_id(body):
    """Validate the browser's stable, anonymous UUID quota bucket.

    This identifier is best-effort abuse control, not authentication. It is
    generated once in browser local storage and sent to both paid endpoints.
    Source IP is deliberately not used because the Function URL sees the
    CloudFront origin caller, not a reliable browser identity.
    """
    player_id = body.get('player_id') if isinstance(body, dict) else None
    if not isinstance(player_id, str):
        raise ValueError('Missing player_id')
    try:
        parsed = uuid.UUID(player_id)
    except (ValueError, AttributeError) as exc:
        raise ValueError('Invalid player_id') from exc
    canonical = str(parsed)
    if player_id.lower() != canonical:
        raise ValueError('Invalid player_id')
    return canonical


def runtime_session_id(player_id, day_bucket):
    """sha256(player_id + ymd): a single player's decisions in a day share one microVM session."""
    return hashlib.sha256(f'{player_id}{day_bucket}'.encode()).hexdigest()


def build_decider_payload(state):
    """Mirror backend/agent.py:call_decider's request shape, built from TOOLS.

    Kept as a small, separate construction (rather than importing a shared
    helper) because call_decider also performs the local-HTTP transport,
    which the bridge replaces with an AgentCore invocation; only the TOOLS
    source-of-truth is shared, so the two payloads cannot silently diverge.
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
    return payload, available


def _agentcore_client():
    return boto3.client('bedrock-agentcore', region_name=config.AWS_REGION, config=BotoConfig(connect_timeout=5, read_timeout=110, retries={'total_max_attempts': 1}))


def invoke_agentcore_decider(state, session_id):
    """Invoke the AgentCore Runtime and return the same shape as a successful decider reply.

    boto3's bedrock-agentcore client signs every request with SigV4;
    there is no separate manual-signing step. The exact response field
    names (`response` vs `payload`) are per the bedrock-agentcore
    InvokeAgentRuntime API as of this writing and are UNVERIFIED against a
    live AgentCore Runtime (none has been deployed -- see the prelaunch
    freeze). Re-verify against a real deploy before relying on this in
    production, same caveat backend/agent.py documents for the decider's
    ChoiceAnswer shape.
    """
    payload, available = build_decider_payload(state)
    try:
        client = _agentcore_client()
        raw = client.invoke_agent_runtime(
            agentRuntimeArn=config.AGENT_RUNTIME_ARN,
            runtimeSessionId=session_id,
            contentType='application/json',
            accept='application/json',
            payload=json.dumps(payload).encode(),
        )
    except Exception as exc:
        raise AgentCoreUnavailableError('AgentCore Runtime invocation failed') from exc
    try:
        body_stream = raw['response']
        result = json.loads(body_stream.read())
    except (KeyError, TypeError, json.JSONDecodeError, AttributeError) as exc:
        raise AgentCoreUnavailableError("AgentCore response missing expected 'response' field") from exc
    try:
        answer = result['answers']['tool']
    except (KeyError, TypeError) as exc:
        raise AgentCoreUnavailableError("AgentCore response missing expected 'answers.tool' field") from exc
    # Not wrapped: per agent.py's own DeciderUnavailableError/ValueError split,
    # a structurally valid-but-invalid-content answer (unknown choice,
    # out-of-range confidence) is a plain ValueError, mapped to 400 by the
    # caller -- the same taxonomy backend/agent.py:call_decider uses.
    choice = validate_decider_response(answer, available)
    return {
        'provider': 'decider',
        'choice': choice,
        'confidence': answer.get('confidence'),
        'probabilities': answer.get('probabilities'),
        'latency_ms': result.get('latency_ms'),
    }


def handle_health():
    try:
        state = killswitch.get_state()
    except KillSwitchUnavailableError:
        return _response(503, {'error': 'ai_unavailable', 'fallback': 'offline'})
    return _response(200, {'ai_enabled': state['enabled'], 'deadline_ms': state['deadline_ms']})


def handle_decide(body, event, day_bucket):
    try:
        player_id = resolve_player_id(body)
    except ValueError:
        return _response(400, {'error': 'invalid_request'})
    try:
        if not killswitch.is_ai_enabled():
            return _response(503, AI_UNAVAILABLE_BODY)
        ratelimit.enforce_rate_limits(player_id)
    except KillSwitchUnavailableError:
        return _response(503, AI_UNAVAILABLE_BODY)
    except RateLimitExceeded:
        return _response(429, _rate_limited_body())
    session_id = runtime_session_id(player_id, day_bucket)
    try:
        result = invoke_agentcore_decider(body, session_id)
    except AgentCoreUnavailableError:
        return _response(503, AI_UNAVAILABLE_BODY)
    except ValueError as exc:
        return _response(400, {'error': str(exc)})
    return _response(200, result)


def handle_narrate(body):
    """Return cosmetic text only after atomically reserving request quota.

    The quota is consumed before Bedrock is called, including when Bedrock
    later fails. This is intentional cost protection: retries cannot bypass
    the per-player or global daily ceiling.
    """
    try:
        player_id = resolve_player_id(body)
    except ValueError:
        return _response(400, {'error': 'invalid_request'})
    try:
        if not killswitch.is_ai_enabled():
            return _response(503, AI_UNAVAILABLE_BODY)
        ratelimit.enforce_rate_limits(player_id)
    except KillSwitchUnavailableError:
        return _response(503, AI_UNAVAILABLE_BODY)
    except RateLimitExceeded:
        return _response(429, _rate_limited_body())
    try:
        narration_input = {
            key: body[key]
            for key in ('mission', 'plan', 'henchman', 'success', 'outcome')
        }
        result = call_bedrock_narration(narration_input)
        narration = result['narration']
        if not isinstance(narration, str):
            raise BedrockUnavailableError('Bedrock narration is not text')
    except BedrockUnavailableError:
        return _response(503, AI_UNAVAILABLE_BODY)
    except (KeyError, TypeError):
        return _response(503, AI_UNAVAILABLE_BODY)
    except ValueError as exc:
        return _response(400, {'error': str(exc)})
    return _response(200, {'provider': 'bedrock', 'narration': narration})


def lambda_handler(event, context=None):
    method = (event.get('requestContext') or {}).get('http', {}).get('method', 'GET')
    path = event.get('rawPath', '')
    day_bucket = ratelimit._day_bucket()

    if method == 'GET' and path == '/api/health':
        return handle_health()

    if method != 'POST' or path not in ('/api/decide', '/api/narrate'):
        return _response(404, {'error': 'not_found'})

    try:
        raw_body = event.get('body') or '{}'
        body = json.loads(raw_body)
        if not isinstance(body, dict):
            raise ValueError('Expected a JSON object body')
    except (ValueError, TypeError, json.JSONDecodeError):
        return _response(400, {'error': 'invalid_request'})

    try:
        if path == '/api/decide':
            return handle_decide(body, event, day_bucket)
        return handle_narrate(body)
    except Exception as exc:  # noqa: BLE001 -- last-resort guard, never leak internals
        print(type(exc).__name__, str(exc)[:200])
        return _response(503, AI_UNAVAILABLE_BODY)
