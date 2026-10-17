"""Reusable Strands Decider choice -> validated allowlisted action pattern.

No dependencies, model download or paid calls in the default example.
Use --endpoint only after starting a compatible local Decider server.
"""
import argparse
import json
import math
import urllib.request

OPTIONS = {
    'science': 'scientific invention and experiments',
    'force': 'brute force and construction',
    'deception': 'propaganda and misinformation in a fictional game',
    'finance': 'paperwork and financial acquisition',
}


def build_question(state, allowed):
    if not isinstance(state, dict) or not allowed or any(k not in OPTIONS for k in allowed):
        raise ValueError('Supply a state and a nonempty subset of known actions')
    return {'state': state, 'questions': {'tool': {
        'type': 'choice',
        'instructions': 'Choose the most useful specialist action for executing the fictional mission plan using these resources.',
        'criteria': {k: OPTIONS[k] for k in dict.fromkeys(allowed)},
    }}}


def validate_answer(answer, allowed):
    if not isinstance(answer, dict) or answer.get('choice') not in allowed:
        raise ValueError('Decider selected an unavailable action')
    confidence = answer.get('confidence')
    if confidence is not None and (type(confidence) not in (int, float) or not math.isfinite(confidence) or not 0 <= confidence <= 1):
        raise ValueError('Invalid confidence')
    probabilities = answer.get('probabilities')
    if probabilities is not None and (not isinstance(probabilities, dict) or any(
        k not in allowed or type(v) not in (int, float) or not math.isfinite(v) or not 0 <= v <= 1
        for k, v in probabilities.items()
    )):
        raise ValueError('Invalid probability distribution')
    return answer['choice']


def route_action(state, actions, ask, fallback):
    """ask(payload) returns a raw answers.tool object or normalized bridge reply.

    Only an allowlisted callable runs. The caller supplies its local fallback;
    this example imposes no confidence threshold that the deployed game lacks.
    """
    if fallback not in actions:
        raise ValueError('Fallback must be an available action')
    payload = build_question(state, list(actions))
    try:
        response = ask(payload)
        answer = response.get('answers', {}).get('tool', response)
        if response.get('fallback'):
            raise ValueError('Upstream requested fallback')
        choice = validate_answer(answer, actions)
        selection = {'provider': 'decider', 'choice': choice, 'confidence': answer.get('confidence')}
    except Exception:
        choice = fallback
        selection = {'provider': 'deterministic', 'choice': choice, 'confidence': None}
    return {'selection': selection, 'action_result': actions[choice](state)}


def http_ask(endpoint):
    def ask(payload):
        request = urllib.request.Request(endpoint, json.dumps(payload).encode(), {'Content-Type': 'application/json'})
        with urllib.request.urlopen(request, timeout=95) as response:
            return json.load(response)
    return ask


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--endpoint', help='Optional running local Decider /v1/systemone endpoint')
    args = parser.parse_args()
    state = {'mission': 'moon', 'plan': 'Analyze lunar security using a science crew and tractor prototype', 'heat': 28}
    actions = {k: (lambda s, skill=k: {'specialist_action': skill, 'mission': s['mission']}) for k in OPTIONS}
    fixture = {'choice': 'science', 'confidence': 0.269, 'probabilities': {'science': 0.4517, 'force': 0.3005, 'deception': 0.2256, 'finance': 0.0222}}
    print('LIVE LOCAL MODEL' if args.endpoint else 'RECORDED RESPONSE EXAMPLE: no live inference')
    result = route_action(state, actions, http_ask(args.endpoint) if args.endpoint else lambda _: fixture, 'force')
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
