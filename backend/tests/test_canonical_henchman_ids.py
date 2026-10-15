import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import agent

# Backend side of the shared id-keyed contract. The frontend exports its own
# identical array; this constant is duplicated here (not imported) so the
# test fails loudly if either side drifts, rather than silently passing
# because both sides import the same source of truth.
CANONICAL_HENCHMAN_IDS = ('mal', 'boris', 'chaos', 'kevin', 'dolores')

STATE = {
    'mission': 'Steal the Moon',
    'plan': 'Build a giant magnet',
    'success': True,
    'outcome': 'The moon wobbles ominously.',
}
REQUIRED = ('mission', 'plan', 'henchman', 'success', 'outcome')

# Voice keyword expected in the built prompt for each canonical id, taken
# from VOICE_DESCRIPTORS in agent.py / GAME_VISION.md §2.
EXPECTED_KEYWORDS = {
    'mal': 'particle physics',
    'boris': 'demolition',
    'chaos': 'subprocess states',
    'kevin': 'not to be alarmist',
    'dolores': 'per policy',
}


class CanonicalHenchmanIdSetTests(unittest.TestCase):
    def test_voice_descriptors_match_canonical_id_set(self):
        self.assertEqual(set(agent.VOICE_DESCRIPTORS.keys()), set(CANONICAL_HENCHMAN_IDS))


class CanonicalIdsMapToRealVoicesTests(unittest.TestCase):
    def test_every_canonical_id_returns_non_neutral_descriptor(self):
        for henchman_id in CANONICAL_HENCHMAN_IDS:
            descriptor = agent._voice_descriptor(henchman_id)
            self.assertNotEqual(
                descriptor,
                agent.NEUTRAL_VOICE_DESCRIPTOR,
                f'{henchman_id!r} silently fell back to the neutral voice',
            )


class DisplayNamesFallBackToNeutralTests(unittest.TestCase):
    def test_display_name_dr_malpractice_falls_back_to_neutral(self):
        self.assertEqual(agent._voice_descriptor('Dr. Malpractice'), agent.NEUTRAL_VOICE_DESCRIPTOR)

    def test_display_name_boris_the_brute_falls_back_to_neutral(self):
        self.assertEqual(agent._voice_descriptor('Boris the Brute'), agent.NEUTRAL_VOICE_DESCRIPTOR)


class CanonicalIdsAppearInNarrationPromptTests(unittest.TestCase):
    def test_each_canonical_id_voice_keyword_appears_in_prompt(self):
        for henchman_id, keyword in EXPECTED_KEYWORDS.items():
            state = dict(STATE, henchman=henchman_id)
            prompt = agent.build_narration_prompt(state, REQUIRED)
            self.assertIn(keyword, prompt, f'{henchman_id!r} voice keyword missing from prompt')


if __name__ == '__main__':
    unittest.main()
