import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import agent


class FakeHTTPResponse:
    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class FakeBedrockClient:
    def converse(self, **kwargs):
        return {'output': {'message': {'content': [{'text': 'Mwahaha.'}, {'text': ' Victory is mine!'}]}}}


class RunMissionTurnTests(unittest.TestCase):
    def test_run_mission_turn_shape_with_faked_decider_and_bedrock(self):
        state = {
            'available_tools': ['science', 'force'],
            'mission': 'Steal the Moon',
            'plan': 'Build a giant magnet',
            'success': True,
            'outcome': 'The moon wobbles ominously.',
        }
        decider_payload = {
            'answers': {'tool': {'choice': 'science', 'confidence': 0.7, 'probabilities': {'science': 0.7, 'force': 0.3}}},
            'latency_ms': 12.3,
        }
        with patch.object(agent.urllib.request, 'urlopen', return_value=FakeHTTPResponse()), \
             patch.object(agent.json, 'load', return_value=decider_payload), \
             patch.object(agent, 'boto3') as fake_boto3:
            fake_boto3.client.return_value = FakeBedrockClient()
            result = agent.run_mission_turn(state)

        self.assertEqual(set(result), {'decision', 'narration'})
        self.assertEqual(result['decision']['provider'], 'decider')
        self.assertEqual(result['decision']['choice'], 'science')
        self.assertEqual(result['narration']['provider'], 'bedrock')
        self.assertIn('Mwahaha', result['narration']['narration'])

    def test_run_mission_turn_rejects_non_dict_state(self):
        with self.assertRaises(ValueError):
            agent.run_mission_turn('not a dict')


if __name__ == '__main__':
    unittest.main()
