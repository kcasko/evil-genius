import unittest
from specialist_selection import build_question, route_action


class PatternTests(unittest.TestCase):
    def setUp(self):
        self.calls = []
        self.actions = {k: lambda s, k=k: self.calls.append(k) or k for k in ['science', 'force']}

    def test_typed_question_restricts_options(self):
        question = build_question({'mission': 'moon'}, ['force'])['questions']['tool']
        self.assertEqual(question['type'], 'choice')
        self.assertEqual(list(question['criteria']), ['force'])

    def test_valid_selection_runs_only_selected_action(self):
        result = route_action({}, self.actions, lambda _: {'answers': {'tool': {'choice': 'science', 'confidence': .8}}}, 'force')
        self.assertEqual(result['selection']['provider'], 'decider')
        self.assertEqual(self.calls, ['science'])

    def test_bad_choices_and_confidence_fall_back(self):
        for answer in [{'choice': '__import__'}, {'choice': 'science', 'confidence': float('nan')}, {'choice': 'science', 'confidence': True}, {'choice': 'science', 'probabilities': {'unknown': .9}}, {'fallback': True, 'choice': 'science'}]:
            result = route_action({}, self.actions, lambda _, a=answer: a, 'force')
            self.assertEqual(result['selection']['provider'], 'deterministic')
            self.assertEqual(result['action_result'], 'force')
        self.assertEqual(self.calls, ['force'] * 5)

    def test_network_failure_falls_back(self):
        def unavailable(_):
            raise TimeoutError('test timeout')
        self.assertEqual(route_action({}, self.actions, unavailable, 'force')['action_result'], 'force')

    def test_invalid_fallback_never_calls_model(self):
        with self.assertRaises(ValueError):
            route_action({}, self.actions, lambda _: self.fail('must not call'), 'unknown')


if __name__ == '__main__':
    unittest.main()
