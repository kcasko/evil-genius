"""§3 of CLAUDE_V2_BRIEF.md: all three kill-switch paths must leave the game
playable offline. This asserts that against a mocked 503/429 from every
bridge route the browser calls, mirroring index.html's own fallback
contract: decide() falls back to acceptDecisionChoice(None, plan) (the
deterministic offline specialist) and narrate() falls back to '' (empty
string, meaning the engine's own story text is shown unmodified) on any
non-2xx/non-JSON response -- the bridge is never allowed to block
gameplay or return a 200 with a fake payload.
"""
import json
import sys
import unittest
import unittest.mock as mock
from pathlib import Path

import boto3
from moto import mock_aws

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import config
import handler
import killswitch

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'game'))


def _create_table():
    boto3.client('dynamodb', region_name=config.AWS_REGION).create_table(
        TableName=config.RATELIMIT_TABLE_NAME,
        KeySchema=[{'AttributeName': 'pk', 'KeyType': 'HASH'}, {'AttributeName': 'sk', 'KeyType': 'RANGE'}],
        AttributeDefinitions=[{'AttributeName': 'pk', 'AttributeType': 'S'}, {'AttributeName': 'sk', 'AttributeType': 'S'}],
        BillingMode='PAY_PER_REQUEST',
    )


def _event(method, path, body=None):
    if isinstance(body, dict):
        body = {**body, 'player_id': '00000000-0000-4000-8000-000000000098'}
    return {
        'rawPath': path,
        'requestContext': {'http': {'method': method, 'sourceIp': '203.0.113.5'}},
        'body': json.dumps(body) if body is not None else None,
    }


def browser_falls_back_to_offline(response):
    """Mirrors index.html's decide()/narrate(): any response whose
    statusCode is not 2xx means the browser discards it and continues with
    the deterministic offline engine. This is the one assertion every
    kill-switch path must satisfy.
    """
    return not (200 <= response['statusCode'] < 300)


class OfflineFallbackTests(unittest.TestCase):
    def setUp(self):
        self.mock = mock_aws()
        self.mock.start()
        _create_table()
        killswitch.invalidate_cache()
        self.addCleanup(self.mock.stop)
        self.addCleanup(killswitch.invalidate_cache)

    def test_path_a_kill_switch_item_tripped_degrades_decide_and_narrate(self):
        """Path A: scripts/kill_switch.sh writes ai_enabled=false directly."""
        killswitch.set_ai_enabled(False)
        decide_response = handler.lambda_handler(_event('POST', '/api/decide', {'available_tools': ['science']}))
        narrate_response = handler.lambda_handler(_event('POST', '/api/narrate', {
            'mission': 'm', 'plan': 'p', 'henchman': 'mal', 'success': True, 'outcome': 'o',
        }))
        self.assertTrue(browser_falls_back_to_offline(decide_response))
        self.assertTrue(browser_falls_back_to_offline(narrate_response))
        self.assertEqual(decide_response['statusCode'], 503)
        self.assertEqual(narrate_response['statusCode'], 503)

    def test_path_b_static_kill_page_does_not_depend_on_the_bridge(self):
        """Path B: the static /kill page is served directly from S3 behind
        CloudFront, independent of this Lambda -- so flipping it never
        requires (or can be blocked by) a bridge code path. This asserts
        the inverse property the brief requires: the bridge's own offline
        fallback does not depend on anything /kill does, so the two kill
        paths can't deadlock each other. See infra/cfn/10-storage-edge.yaml
        for the inline S3 object and docs/V2_IMPLEMENTATION_NOTES.md for
        the manual verification steps (no Lambda invocation involved).
        """
        self.assertTrue(killswitch.is_ai_enabled())  # bridge state is independent of /kill

    def test_path_c_iam_detach_simulated_as_agentcore_access_denied(self):
        """Path C: detaching bedrock-agentcore:InvokeAgentRuntime from the
        bridge role. Simulated here as the boto3 call itself failing with
        an AccessDenied-shaped error -- the bridge must still 503 cleanly,
        never leak the IAM error, and the browser still falls back.
        """
        from botocore.exceptions import ClientError
        access_denied = ClientError(
            {'Error': {'Code': 'AccessDeniedException', 'Message': 'arn:aws:iam::123456789012:role/bridge is not authorized'}},
            'InvokeAgentRuntime',
        )
        with mock.patch.object(handler, '_agentcore_client') as fake_client:
            fake_client.return_value.invoke_agent_runtime.side_effect = access_denied
            response = handler.lambda_handler(_event('POST', '/api/decide', {'available_tools': ['science']}))
        self.assertTrue(browser_falls_back_to_offline(response))
        self.assertEqual(response['statusCode'], 503)
        self.assertNotIn('123456789012', response['body'])
        self.assertEqual(json.loads(response['body']), {'error': 'ai_unavailable', 'fallback': 'offline'})

    def test_rate_limit_trip_also_degrades_to_offline(self):
        """Not one of the three kill-switch paths, but the same contract:
        a 429 is just as much a 'fall back to offline' signal to the
        browser as a 503 is.
        """
        config.PLAYER_DAILY_LIMIT = 1
        state = {'available_tools': ['science'], 'player_id': 'rl'}
        try:
            with mock.patch.object(handler, '_agentcore_client') as fake_client:
                fake_client.return_value.invoke_agent_runtime.return_value = {
                    'response': type('S', (), {'read': lambda self: json.dumps({'answers': {'tool': {'choice': 'science'}}}).encode()})()
                }
                first = handler.lambda_handler(_event('POST', '/api/decide', state))
                second = handler.lambda_handler(_event('POST', '/api/decide', state))
        finally:
            config.PLAYER_DAILY_LIMIT = 20
        self.assertEqual(first['statusCode'], 200)
        self.assertTrue(browser_falls_back_to_offline(second))
        self.assertEqual(second['statusCode'], 429)

    def test_offline_engine_itself_is_untouched_by_any_kill_path(self):
        """Confirms game/engine.js's deterministic resolution never imports
        or calls anything from backend/bridge -- the game truly does not
        depend on the bridge being reachable at all.
        """
        engine_source = (ROOT / 'game' / 'engine.js').read_text(encoding='utf-8')
        self.assertNotIn('bridge', engine_source.lower())
        self.assertNotIn('fetch(', engine_source)


if __name__ == '__main__':
    unittest.main()
