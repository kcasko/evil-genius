"""Measures the real build_narration_prompt() input-token size.

OpenCode's V2 cost review flagged the plan's ~400-token assumption as an
under-count (real prompt carries framing + voice + banned-list + truncated
JSON context, likely closer to ~800). This test instruments the actual
prompt text with tiktoken (falling back to a char/4 heuristic if tiktoken
is unavailable) against fixtures drawn from the real call site in
index.html's narrate() -- mission/plan names and outcome text pulled from
game/engine.js's MISSIONS data -- plus a worst-case fixture where every
field hits the 600-char truncation ceiling in build_narration_prompt.

Run with: pytest backend/tests/test_narration_tokens.py -k narration_tokens
"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import agent

REQUIRED = ('mission', 'plan', 'henchman', 'success', 'outcome')

try:
    import tiktoken
    _ENCODING = tiktoken.get_encoding('cl100k_base')
except Exception:
    _ENCODING = None


def count_tokens(text):
    """Token count via tiktoken cl100k_base, or a char/4 heuristic fallback.

    cl100k_base is not Nova Lite's actual tokenizer, but it is the standard
    stand-in used for cross-model estimation when the real tokenizer is not
    locally available, consistent with the brief's 'tiktoken or char-count
    fallback' instruction.
    """
    if _ENCODING is not None:
        return len(_ENCODING.encode(text))
    return max(1, len(text) // 4)


# A realistic fixture drawn directly from game/engine.js MISSIONS[0] ('moon')
# and index.html's narrate() call shape: mission/plan are short names,
# henchman is a canonical id, outcome is a plan.win/plan.lose string
# (optionally with the ~90-char mismatch-penalty sentence appended).
REALISTIC_STATE = {
    'mission': 'Steal the Moon',
    'plan': 'Build a Tractor Beam',
    'henchman': 'mal',
    'success': True,
    'outcome': (
        'Malpractice shifts the moon six inches, calls it a successful '
        'orbital correction, and requests funding for phase two.'
    ),
}

# The mismatch penalty branch (resolveMission in game/engine.js) appends a
# second sentence to the outcome, the longest realistic outcome string.
REALISTIC_STATE_MISMATCH = dict(
    REALISTIC_STATE,
    outcome=(
        REALISTIC_STATE['outcome']
        + ' Boris the Brute took over the mission instead, and the plan '
        'suffered a coordination penalty.'
    ),
)

# Worst case: every field hits the 600-char truncation ceiling that
# build_narration_prompt applies per-field (str(state[k])[:600]).
WORST_CASE_STATE = {
    'mission': 'M' * 600,
    'plan': 'P' * 600,
    'henchman': 'mal',
    'success': True,
    'outcome': 'O' * 600,
}


class NarrationPromptTokenBudgetTests(unittest.TestCase):
    def test_narration_tokens_realistic_case(self):
        prompt = agent.build_narration_prompt(REALISTIC_STATE, REQUIRED)
        tokens = count_tokens(prompt)
        print(f'\n[narration_tokens] realistic case: {tokens} input tokens '
              f'({len(prompt)} chars)')
        # OpenCode's corrected estimate was ~800 input tokens (vs. the
        # plan's original ~400). The realistic single-sentence-outcome case
        # should land comfortably under that worst-case ceiling.
        self.assertLess(tokens, 800)

    def test_narration_tokens_realistic_mismatch_case(self):
        prompt = agent.build_narration_prompt(REALISTIC_STATE_MISMATCH, REQUIRED)
        tokens = count_tokens(prompt)
        print(f'\n[narration_tokens] realistic mismatch case: {tokens} input '
              f'tokens ({len(prompt)} chars)')
        self.assertLess(tokens, 800)

    def test_narration_tokens_worst_case_truncated_fields(self):
        prompt = agent.build_narration_prompt(WORST_CASE_STATE, REQUIRED)
        tokens = count_tokens(prompt)
        print(f'\n[narration_tokens] worst case (600-char fields): {tokens} '
              f'input tokens ({len(prompt)} chars)')
        # Each of the 3 required text fields is capped at 600 chars by
        # build_narration_prompt's JSON context construction, so the prompt
        # can never exceed roughly (3 * 600 chars of context) + fixed
        # instruction text, bounding worst-case tokens well under 1000.
        self.assertLess(tokens, 1000)


if __name__ == '__main__':
    unittest.main()
