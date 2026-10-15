"""Tests for the task-1 hardening: Decider/Bedrock failures must raise the
dedicated *Unavailable error types (so server.py can map them to a clean
503) instead of a raw KeyError/URLError whose message could be confusing
or, for boto3 ClientError, could embed a region or IAM ARN.
"""
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import agent

STATE = {
    'mission': 'Steal the Moon',
    'plan': 'Build a giant magnet',
    'henchman': 'mal',
    'success': True,
    'outcome': 'The moon wobbles ominously.',
}


class FakeHTTPResponse:
    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class DeciderErrorWrappingTests(unittest.TestCase):
    def test_connection_failure_raises_decider_unavailable(self):
        with patch.object(agent.urllib.request, 'urlopen', side_effect=agent.urllib.error.URLError('refused')):
            with self.assertRaises(agent.DeciderUnavailableError):
                agent.call_decider({'available_tools': ['science']})

    def test_missing_answers_field_raises_decider_unavailable_not_keyerror(self):
        with patch.object(agent.urllib.request, 'urlopen', return_value=FakeHTTPResponse()), \
             patch.object(agent.json, 'load', return_value={'unexpected': 'shape'}):
            with self.assertRaises(agent.DeciderUnavailableError):
                agent.call_decider({'available_tools': ['science']})

    def test_invalid_choice_still_raises_plain_valueerror(self):
        # Structurally valid response, invalid content -- a real validation
        # failure, not a service outage, so this must stay a ValueError
        # (tests/test_bridge.py depends on this exact behavior).
        with patch.object(agent.urllib.request, 'urlopen', return_value=FakeHTTPResponse()), \
             patch.object(agent.json, 'load', return_value={'answers': {'tool': {'choice': 'magic'}}}):
            with self.assertRaises(ValueError) as ctx:
                agent.call_decider({'available_tools': ['science']})
        self.assertNotIsInstance(ctx.exception, agent.DeciderUnavailableError)


class BedrockErrorWrappingTests(unittest.TestCase):
    def test_client_exception_raises_bedrock_unavailable(self):
        class ExplodingClient:
            def converse(self, **kwargs):
                raise RuntimeError('AccessDenied: arn:aws:iam::123456789012:user/example is not authorized')

        with patch.object(agent, 'boto3') as fake_boto3:
            fake_boto3.client.return_value = ExplodingClient()
            with self.assertRaises(agent.BedrockUnavailableError):
                agent.call_bedrock_narration(STATE)

    def test_malformed_response_raises_bedrock_unavailable_not_keyerror(self):
        class MalformedClient:
            def converse(self, **kwargs):
                return {'unexpected': 'shape'}

        with patch.object(agent, 'boto3') as fake_boto3:
            fake_boto3.client.return_value = MalformedClient()
            with self.assertRaises(agent.BedrockUnavailableError):
                agent.call_bedrock_narration(STATE)

    def test_missing_fields_still_raises_plain_valueerror(self):
        with self.assertRaises(ValueError):
            agent.call_bedrock_narration({'mission': 'Steal the Moon'})


if __name__ == '__main__':
    unittest.main()
