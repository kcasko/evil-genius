import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import agent


class FakeEvent:
    """Stand-in for strands.hooks.events.BeforeToolCallEvent exposing only
    the `.tool_use` attribute DeciderValidationHandler reads."""

    def __init__(self, tool_use):
        self.tool_use = tool_use


class InterventionHandlerTests(unittest.TestCase):
    def test_denies_choose_specialist_with_missing_available_tools(self):
        handler = agent.DeciderValidationHandler()
        event = FakeEvent({'name': 'choose_specialist', 'input': {'state': {}}})
        self.assertIsInstance(handler.before_tool_call(event), agent.Deny)

    def test_denies_choose_specialist_with_empty_available_tools(self):
        handler = agent.DeciderValidationHandler()
        event = FakeEvent({'name': 'choose_specialist', 'input': {'state': {'available_tools': []}}})
        self.assertIsInstance(handler.before_tool_call(event), agent.Deny)

    def test_proceeds_with_available_tools(self):
        handler = agent.DeciderValidationHandler()
        event = FakeEvent({'name': 'choose_specialist', 'input': {'state': {'available_tools': ['science']}}})
        self.assertIsInstance(handler.before_tool_call(event), agent.Proceed)

    def test_ignores_other_tools(self):
        handler = agent.DeciderValidationHandler()
        event = FakeEvent({'name': 'narrate_outcome', 'input': {}})
        self.assertIsInstance(handler.before_tool_call(event), agent.Proceed)


if __name__ == '__main__':
    unittest.main()
