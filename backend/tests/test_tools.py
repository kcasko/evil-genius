import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import agent

# Dummy, non-functional static credentials: these only make boto3's local
# credential-chain resolution (inside BedrockModel's constructor) succeed
# without touching ~/.aws or making a network call. No real AWS call happens.
FAKE_CREDS = {'AWS_ACCESS_KEY_ID': 'test', 'AWS_SECRET_ACCESS_KEY': 'test', 'AWS_DEFAULT_REGION': 'us-east-1'}


class ToolRegistrationTests(unittest.TestCase):
    def test_agent_exposes_both_tools(self):
        with patch.dict(os.environ, FAKE_CREDS):
            instance = agent.build_agent()
        self.assertIn('choose_specialist', instance.tool_names)
        self.assertIn('narrate_outcome', instance.tool_names)

    def test_decorated_tools_stay_directly_callable(self):
        # @tool-decorated functions remain plain-callable, so run_mission_turn
        # (and the HTTP layer) can call them without an LLM tool-calling loop.
        with patch.object(agent.urllib.request, 'urlopen'), patch.object(agent.json, 'load', return_value={'answers': {'tool': {'choice': 'science'}}}):
            result = agent.choose_specialist({'available_tools': ['science']})
        self.assertEqual(result['choice'], 'science')


if __name__ == '__main__':
    unittest.main()
