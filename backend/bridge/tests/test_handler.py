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


def _create_table():
    boto3.client('dynamodb', region_name=config.AWS_REGION).create_table(
        TableName=config.RATELIMIT_TABLE_NAME,
        KeySchema=[{'AttributeName': 'pk', 'KeyType': 'HASH'}, {'AttributeName': 'sk', 'KeyType': 'RANGE'}],
        AttributeDefinitions=[{'AttributeName': 'pk', 'AttributeType': 'S'}, {'AttributeName': 'sk', 'AttributeType': 'S'}],
        BillingMode='PAY_PER_REQUEST',
    )


def _event(method, path, body=None, source_ip='203.0.113.5'):
    if isinstance(body, dict):
        body = {**body, 'player_id': '00000000-0000-4000-8000-000000000099'}
    return {
        'rawPath': path,
        'requestContext': {'http': {'method': method, 'sourceIp': source_ip}},
        'body': json.dumps(body) if body is not None else None,
    }


class FakeStream:
    def __init__(self, payload):
        self._payload = json.dumps(payload).encode()

    def read(self):
        return self._payload


class BridgeHandlerTests(unittest.TestCase):
    def setUp(self):
        self.mock = mock_aws()
        self.mock.start()
        _create_table()
        killswitch.invalidate_cache()
        self.addCleanup(self.mock.stop)
        self.addCleanup(killswitch.invalidate_cache)

    # --- health ---

    def test_health_reports_enabled_by_default(self):
        response = handler.lambda_handler(_event('GET', '/api/health'))
        self.assertEqual(response['statusCode'], 200)
        body = json.loads(response['body'])
        self.assertEqual(body, {'ai_enabled': True, 'deadline_ms': None})

    def test_health_reports_disabled_after_kill_switch_trip(self):
        killswitch.set_ai_enabled(False)
        response = handler.lambda_handler(_event('GET', '/api/health'))
        self.assertEqual(response['statusCode'], 200)
        self.assertEqual(json.loads(response['body'])['ai_enabled'], False)

    # --- routing ---

    def test_unknown_route_is_404(self):
        response = handler.lambda_handler(_event('GET', '/api/nope'))
        self.assertEqual(response['statusCode'], 404)

    def test_malformed_json_body_is_400(self):
        event = _event('POST', '/api/decide')
        event['body'] = '{not json'
        response = handler.lambda_handler(event)
        self.assertEqual(response['statusCode'], 400)

    # --- decide ---

    def test_decide_happy_path_matches_decider_reply_shape(self):
        state = {'available_tools': ['science', 'force'], 'mission': 'Steal the Moon', 'player_id': 'p1'}
        agentcore_payload = {'answers': {'tool': {'choice': 'science', 'confidence': 0.8, 'probabilities': {'science': 0.8, 'force': 0.2}}}, 'latency_ms': 120}
        with mock.patch.object(handler, '_agentcore_client') as fake_client:
            fake_client.return_value.invoke_agent_runtime.return_value = {'response': FakeStream(agentcore_payload)}
            response = handler.lambda_handler(_event('POST', '/api/decide', state))
        self.assertEqual(response['statusCode'], 200)
        body = json.loads(response['body'])
        self.assertEqual(body, {
            'provider': 'decider', 'choice': 'science', 'confidence': 0.8,
            'probabilities': {'science': 0.8, 'force': 0.2}, 'latency_ms': 120,
        })
        fake_client.return_value.invoke_agent_runtime.assert_called_once()
        call_kwargs = fake_client.return_value.invoke_agent_runtime.call_args.kwargs
        self.assertIn('runtimeSessionId', call_kwargs)
        self.assertEqual(len(call_kwargs['runtimeSessionId']), 64)  # sha256 hex digest

    def test_decide_same_player_same_day_reuses_session_id(self):
        state = {'available_tools': ['science'], 'player_id': 'same-player'}
        agentcore_payload = {'answers': {'tool': {'choice': 'science'}}}
        session_ids = []
        with mock.patch.object(handler, '_agentcore_client') as fake_client:
            fake_client.return_value.invoke_agent_runtime.return_value = {'response': FakeStream(agentcore_payload)}
            for _ in range(2):
                handler.lambda_handler(_event('POST', '/api/decide', state))
                session_ids.append(fake_client.return_value.invoke_agent_runtime.call_args.kwargs['runtimeSessionId'])
        self.assertEqual(session_ids[0], session_ids[1])

    def test_decide_rejects_invalid_state_with_400(self):
        response = handler.lambda_handler(_event('POST', '/api/decide', {'available_tools': []}))
        self.assertEqual(response['statusCode'], 400)

    def test_decide_kill_switch_tripped_returns_503(self):
        killswitch.set_ai_enabled(False)
        state = {'available_tools': ['science'], 'player_id': 'p2'}
        response = handler.lambda_handler(_event('POST', '/api/decide', state))
        self.assertEqual(response['statusCode'], 503)
        self.assertEqual(json.loads(response['body']), {'error': 'ai_unavailable', 'fallback': 'offline'})

    def test_decide_over_player_cap_returns_429(self):
        config.PLAYER_DAILY_LIMIT = 1
        state = {'available_tools': ['science'], 'player_id': 'capped-player'}
        agentcore_payload = {'answers': {'tool': {'choice': 'science'}}}
        try:
            with mock.patch.object(handler, '_agentcore_client') as fake_client:
                fake_client.return_value.invoke_agent_runtime.return_value = {'response': FakeStream(agentcore_payload)}
                first = handler.lambda_handler(_event('POST', '/api/decide', state))
                second = handler.lambda_handler(_event('POST', '/api/decide', state))
            self.assertEqual(first['statusCode'], 200)
            self.assertEqual(second['statusCode'], 429)
            rate_limited = json.loads(second['body'])
            self.assertEqual(rate_limited['error'], 'rate_limited')
            self.assertEqual(rate_limited['fallback'], 'offline')
            self.assertIsInstance(rate_limited['until'], int)
            self.assertGreater(rate_limited['until'], 0)
        finally:
            config.PLAYER_DAILY_LIMIT = 20

    def test_decide_agentcore_transport_failure_returns_503_not_details(self):
        state = {'available_tools': ['science'], 'player_id': 'p3'}
        with mock.patch.object(handler, '_agentcore_client') as fake_client:
            fake_client.return_value.invoke_agent_runtime.side_effect = RuntimeError('arn:aws:iam::123456789012:role/secret-role boom')
            response = handler.lambda_handler(_event('POST', '/api/decide', state))
        self.assertEqual(response['statusCode'], 503)
        body_text = response['body']
        self.assertEqual(json.loads(body_text), {'error': 'ai_unavailable', 'fallback': 'offline'})
        self.assertNotIn('123456789012', body_text)

    def test_decide_without_player_id_is_rejected_before_paid_calls(self):
        state = {'available_tools': ['science']}
        event = _event('POST', '/api/decide', state, source_ip='198.51.100.9')
        event['body'] = json.dumps(state)
        with mock.patch.object(handler, '_agentcore_client') as fake_client:
            response = handler.lambda_handler(event)
        self.assertEqual(response['statusCode'], 400)
        self.assertEqual(json.loads(response['body']), {'error': 'invalid_request'})
        fake_client.assert_not_called()

    # --- narrate ---

    def test_narrate_happy_path_delegates_to_bedrock_narration(self):
        narrate_body = {'mission': 'm', 'plan': 'p', 'henchman': 'mal', 'success': True, 'outcome': 'o'}
        with mock.patch.object(handler, 'call_bedrock_narration', return_value={'provider': 'bedrock', 'narration': 'Mwahaha.'}) as fake:
            response = handler.lambda_handler(_event('POST', '/api/narrate', narrate_body))
        fake.assert_called_once_with(narrate_body)
        self.assertEqual(response['statusCode'], 200)
        self.assertEqual(json.loads(response['body']), {'provider': 'bedrock', 'narration': 'Mwahaha.'})

    def test_narrate_kill_switch_tripped_returns_503(self):
        killswitch.set_ai_enabled(False)
        narrate_body = {'mission': 'm', 'plan': 'p', 'henchman': 'mal', 'success': True, 'outcome': 'o'}
        response = handler.lambda_handler(_event('POST', '/api/narrate', narrate_body))
        self.assertEqual(response['statusCode'], 503)

    def test_narrate_atomically_consumes_player_and_global_budget(self):
        config.PLAYER_DAILY_LIMIT = 1
        config.GLOBAL_DAILY_LIMIT = 1
        narrate_body = {
            'mission': 'm', 'plan': 'p', 'henchman': 'mal', 'success': True,
            'outcome': 'o', 'player_id': '00000000-0000-4000-8000-000000000001',
        }
        try:
            with mock.patch.object(handler, 'call_bedrock_narration', return_value={'provider': 'bedrock', 'narration': 'x'}):
                first = handler.lambda_handler(_event('POST', '/api/narrate', narrate_body))
                second = handler.lambda_handler(_event('POST', '/api/narrate', narrate_body))
            self.assertEqual(first['statusCode'], 200)
            self.assertEqual(second['statusCode'], 429)
        finally:
            config.PLAYER_DAILY_LIMIT = 20
            config.GLOBAL_DAILY_LIMIT = 500

    def test_failed_bedrock_call_still_consumes_reserved_quota(self):
        config.PLAYER_DAILY_LIMIT = 1
        config.GLOBAL_DAILY_LIMIT = 1
        narrate_body = {
            'mission': 'm', 'plan': 'p', 'henchman': 'mal', 'success': True,
            'outcome': 'o',
        }
        try:
            with mock.patch.object(
                handler, 'call_bedrock_narration',
                side_effect=handler.BedrockUnavailableError('provider down'),
            ):
                failed = handler.lambda_handler(_event('POST', '/api/narrate', narrate_body))
            with mock.patch.object(handler, 'call_bedrock_narration', return_value={'provider': 'bedrock', 'narration': 'x'}):
                retry = handler.lambda_handler(_event('POST', '/api/narrate', narrate_body))
            self.assertEqual(failed['statusCode'], 503)
            self.assertEqual(retry['statusCode'], 429)
        finally:
            config.PLAYER_DAILY_LIMIT = 20
            config.GLOBAL_DAILY_LIMIT = 500

    def test_invalid_player_id_is_rejected_before_paid_calls(self):
        event = _event('POST', '/api/decide', {'available_tools': ['science']})
        event['body'] = json.dumps({'available_tools': ['science'], 'player_id': 'not-a-uuid'})
        with mock.patch.object(handler, '_agentcore_client') as fake_client:
            response = handler.lambda_handler(event)
        self.assertEqual(response['statusCode'], 400)
        fake_client.assert_not_called()

    def test_narrate_response_exposes_cosmetic_text_only(self):
        narrate_body = {
            'mission': 'm', 'plan': 'p', 'henchman': 'mal', 'success': True,
            'outcome': 'deterministic outcome',
            'player_id': '00000000-0000-4000-8000-000000000002',
        }
        malicious_shape = {
            'provider': 'bedrock', 'narration': 'Cosmetic rewrite.',
            'state': {'money': 999999}, 'success': False, 'reward': 999999,
        }
        with mock.patch.object(handler, 'call_bedrock_narration', return_value=malicious_shape):
            response = handler.lambda_handler(_event('POST', '/api/narrate', narrate_body))
        self.assertEqual(
            json.loads(response['body']),
            {'provider': 'bedrock', 'narration': 'Cosmetic rewrite.'},
        )


if __name__ == '__main__':
    unittest.main()
