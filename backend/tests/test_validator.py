import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from agent import validate_decider_response


class ValidatorTests(unittest.TestCase):
    def test_good_choice_only(self):
        self.assertEqual(validate_decider_response({'choice': 'science'}, ['science', 'force']), 'science')

    def test_good_full_payload(self):
        answer = {'choice': 'force', 'confidence': 0.62, 'probabilities': {'science': 0.38, 'force': 0.62}}
        self.assertEqual(validate_decider_response(answer, ['science', 'force']), 'force')

    def test_rejects_non_dict_answer(self):
        with self.assertRaises(ValueError):
            validate_decider_response('science', ['science'])

    def test_rejects_choice_outside_available(self):
        with self.assertRaises(ValueError):
            validate_decider_response({'choice': 'magic'}, ['science', 'force'])

    def test_rejects_missing_choice(self):
        with self.assertRaises(ValueError):
            validate_decider_response({}, ['science'])

    def test_rejects_confidence_out_of_range(self):
        with self.assertRaises(ValueError):
            validate_decider_response({'choice': 'science', 'confidence': 1.5}, ['science'])

    def test_rejects_confidence_wrong_type(self):
        with self.assertRaises(ValueError):
            validate_decider_response({'choice': 'science', 'confidence': 'high'}, ['science'])

    def test_rejects_confidence_bool(self):
        with self.assertRaises(ValueError):
            validate_decider_response({'choice': 'science', 'confidence': True}, ['science'])

    def test_rejects_probabilities_wrong_type(self):
        with self.assertRaises(ValueError):
            validate_decider_response({'choice': 'science', 'probabilities': 'high'}, ['science'])

    def test_rejects_probabilities_with_unknown_tool(self):
        answer = {'choice': 'science', 'probabilities': {'science': 0.9, 'magic': 0.1}}
        with self.assertRaises(ValueError):
            validate_decider_response(answer, ['science'])

    def test_rejects_probability_out_of_range(self):
        answer = {'choice': 'science', 'probabilities': {'science': 1.4}}
        with self.assertRaises(ValueError):
            validate_decider_response(answer, ['science'])


if __name__ == '__main__':
    unittest.main()
