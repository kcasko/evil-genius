import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import agent

STATE = {
    'mission': 'Steal the Moon',
    'plan': 'Build a giant magnet',
    'success': True,
    'outcome': 'The moon wobbles ominously.',
}
REQUIRED = ('mission', 'plan', 'henchman', 'success', 'outcome')

# Keyword expected to appear in the built prompt for each henchman id,
# taken from the voice descriptors in GAME_VISION.md §2.
EXPECTED_KEYWORDS = {
    'mal': 'particle physics',
    'boris': 'demolition',
    'chaos': 'subprocess states',
    'kevin': 'not to be alarmist',
    'dolores': 'per policy',
}


class NarrationPromptVoiceTests(unittest.TestCase):
    def test_each_henchman_voice_keyword_is_present(self):
        for henchman, keyword in EXPECTED_KEYWORDS.items():
            state = dict(STATE, henchman=henchman)
            prompt = agent.build_narration_prompt(state, REQUIRED)
            self.assertIn(keyword, prompt, f'{henchman} voice keyword missing from prompt')

    def test_unknown_henchman_falls_back_to_neutral_voice(self):
        state = dict(STATE, henchman='some-new-character')
        prompt = agent.build_narration_prompt(state, REQUIRED)
        self.assertIn(agent.NEUTRAL_VOICE_DESCRIPTOR, prompt)
        for keyword in EXPECTED_KEYWORDS.values():
            self.assertNotIn(keyword, prompt)

    def test_prompt_states_fictional_comedy_framing(self):
        state = dict(STATE, henchman='mal')
        prompt = agent.build_narration_prompt(state, REQUIRED)
        self.assertIn('fiction', prompt.lower())
        self.assertIn('comedic', prompt.lower())

    def test_prompt_bans_show_references_and_requests_two_sentences(self):
        state = dict(STATE, henchman='boris')
        prompt = agent.build_narration_prompt(state, REQUIRED)
        self.assertIn('EXACTLY two sentences', prompt)
        for show in agent.BANNED_SHOW_REFERENCES:
            self.assertIn(show.title(), prompt)


class PostprocessNarrationTests(unittest.TestCase):
    def test_strips_leading_markdown_fence(self):
        raw = '```\nMwahaha. Victory is mine!\n```'
        self.assertEqual(agent.postprocess_narration(raw), 'Mwahaha. Victory is mine!')

    def test_strips_leading_fence_with_language_tag(self):
        raw = '```text\nMwahaha. Victory is mine!'
        self.assertEqual(agent.postprocess_narration(raw), 'Mwahaha. Victory is mine!')

    def test_strips_leading_role_prefix(self):
        raw = 'Assistant: Mwahaha. Victory is mine!'
        self.assertEqual(agent.postprocess_narration(raw), 'Mwahaha. Victory is mine!')

    def test_truncates_at_500_chars(self):
        raw = 'X' * 600
        result = agent.postprocess_narration(raw)
        self.assertEqual(len(result), 500)

    def test_leaves_clean_text_untouched(self):
        raw = 'Mwahaha. Victory is mine!'
        self.assertEqual(agent.postprocess_narration(raw), raw)

    def test_falls_back_when_banned_show_reference_present(self):
        raw = "This is just like that episode of The Office. Victory is mine!"
        self.assertEqual(agent.postprocess_narration(raw), agent.FALLBACK_NARRATION)

    def test_falls_back_is_case_insensitive(self):
        raw = "silicon valley called, they want their jokes back."
        self.assertEqual(agent.postprocess_narration(raw), agent.FALLBACK_NARRATION)

    def test_fallback_narration_itself_contains_no_banned_reference(self):
        for show in agent.BANNED_SHOW_REFERENCES:
            self.assertNotIn(show, agent.FALLBACK_NARRATION.lower())


class CallBedrockNarrationServerFallbackTests(unittest.TestCase):
    """The server (not the game) decides when to fall back to the engine's
    own text; the agent's job is to never propagate a banned reference."""

    def test_banned_reference_triggers_fallback_not_propagation(self):
        state = dict(STATE, henchman='mal')

        class FakeBedrockClient:
            def converse(self, **kwargs):
                return {'output': {'message': {'content': [{'text': 'Classic The Office moment.'}]}}}

        import unittest.mock as mock
        with mock.patch.object(agent, 'boto3') as fake_boto3:
            fake_boto3.client.return_value = FakeBedrockClient()
            result = agent.call_bedrock_narration(state)

        self.assertEqual(result['narration'], agent.FALLBACK_NARRATION)


if __name__ == '__main__':
    unittest.main()
