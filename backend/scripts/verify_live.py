#!/usr/bin/env python3
"""Diagnostic script for live-verifying the Decider + Bedrock integration.

This is the ONLY place in this repo meant to make a real network call to a
real strands-decider server and real AWS Bedrock. It is NOT run by the test
suite and is NOT invoked automatically in CI. A human runs it by hand, with
real credentials and a running Decider server, to capture golden fixture
responses for backend/tests/fixtures/.

Usage:
    python backend/scripts/verify_live.py            # full live run (real Decider + real Bedrock calls)
    python backend/scripts/verify_live.py --dry-run  # dependency/reachability checks only -- NO inference calls, safe for CI

See README.md ("Run with live decision model + Bedrock") for the setup
(Decider weights, `strands-decider serve ...`, AWS credentials) this script
assumes is already running before you use it without --dry-run.
"""
import argparse
import importlib.util
import json
import socket
import sys
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import urlsplit

import boto3

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import agent  # noqa: E402

FIXTURES_DIR = Path(__file__).resolve().parents[1] / 'tests' / 'fixtures'

# Shaped exactly like the state dicts agent.call_decider / agent.call_bedrock_narration expect.
SAMPLE_DECIDER_STATE = {
    'available_tools': ['science', 'force', 'deception', 'finance'],
    'mission': 'moon',
    'plan': 'Build a giant magnet',
    'specialist': None,
    'budget': 500,
    'heat': 20,
    'loyalty': 70,
    'recent_events': [],
}
SAMPLE_NARRATION_STATE = {
    'mission': 'moon',
    'plan': 'Build a giant magnet',
    'henchman': 'mal',
    'success': True,
    'outcome': 'The moon wobbles ominously.',
}


class VerificationFailure(Exception):
    """Raised with a step name and a human-readable cause; main() prints it and exits non-zero."""

    def __init__(self, step, message):
        super().__init__(message)
        self.step = step


def check_strands_decider_importable():
    if importlib.util.find_spec('strands_decider') is None:
        raise VerificationFailure(
            'dependency: strands-decider',
            "the 'strands_decider' package is not importable. Install it with: "
            "python -m pip install strands-decider",
        )
    print('[OK] strands_decider package is importable.')


def check_boto3_credentials():
    try:
        creds = boto3.Session().get_credentials()
    except Exception as exc:
        # A broken/incomplete credential provider (e.g. a missing optional
        # dependency for one provider in the chain) raises here instead of
        # returning None -- still "no usable credentials", just with a
        # different failure mode. Report it the same way either way.
        raise VerificationFailure(
            'dependency: AWS credentials',
            f'boto3 could not resolve AWS credentials ({type(exc).__name__}: {exc}). '
            'Configure them (e.g. `aws configure`, or AWS_ACCESS_KEY_ID / '
            'AWS_SECRET_ACCESS_KEY env vars) with bedrock:InvokeModel permission '
            f'for {agent.BEDROCK_MODEL_ID} in {agent.AWS_REGION}.',
        ) from exc
    if creds is None:
        raise VerificationFailure(
            'dependency: AWS credentials',
            'boto3 could not find any AWS credentials via the default credential '
            'chain. Configure them (e.g. `aws configure`, or AWS_ACCESS_KEY_ID / '
            'AWS_SECRET_ACCESS_KEY env vars) with bedrock:InvokeModel permission '
            f'for {agent.BEDROCK_MODEL_ID} in {agent.AWS_REGION}.',
        )
    print('[OK] boto3 resolved AWS credentials via the default credential chain.')


def check_decider_listening(decider_url):
    parts = urlsplit(decider_url)
    host = parts.hostname
    port = parts.port or (443 if parts.scheme == 'https' else 80)
    try:
        with socket.create_connection((host, port), timeout=3):
            pass
    except OSError as exc:
        raise VerificationFailure(
            'dependency: Decider server',
            f'nothing is listening at {decider_url} ({exc}). Start it with: '
            'strands-decider serve StrandsAgents/strands-decider-2B-hobson-v19 --port 8099',
        ) from exc
    print(f'[OK] something is listening at {decider_url}.')


def run_dry_run():
    """Dependency/reachability checks only. Makes NO Bedrock or Decider inference call."""
    print('--- dry-run: dependency and reachability checks only, no inference calls ---')
    checks = [
        ('strands-decider importable', check_strands_decider_importable),
        ('boto3 credentials', check_boto3_credentials),
        ('Decider server listening', lambda: check_decider_listening(agent.DECIDER_URL)),
    ]
    failed = []
    for name, check in checks:
        try:
            check()
        except VerificationFailure as exc:
            print(f'[FAIL] {name}: {exc}')
            failed.append(name)
    if failed:
        print(f'\ndry-run FAILED: {len(failed)}/{len(checks)} checks failed: {", ".join(failed)}')
        return 1
    print('\ndry-run PASSED: all dependencies present and Decider server reachable.')
    return 0


def fetch_healthz(decider_url):
    """Step 1: confirm the Decider server is reachable; print its raw health response."""
    for path in ('/healthz', '/health', '/'):
        req = urllib.request.Request(decider_url.rstrip('/') + path, method='GET')
        try:
            with urllib.request.urlopen(req, timeout=5) as response:
                body = response.read().decode('utf-8', errors='replace')
                print(f'GET {path} -> {response.status}')
                print(body)
                return
        except urllib.error.HTTPError as exc:
            print(f'GET {path} -> {exc.code}')
            continue
        except urllib.error.URLError as exc:
            print(f'GET {path} -> unreachable ({exc})')
            continue
    raise VerificationFailure(
        'step 1: healthz',
        f'no health endpoint responded at {decider_url} (tried /healthz, /health, /). '
        'Is `strands-decider serve ...` running?',
    )


def run_live():
    """Full live run: one real Decider call, one real Bedrock call. NEVER called by tests or CI."""
    print('--- LIVE RUN: this makes real network calls to Decider and Bedrock ---')
    FIXTURES_DIR.mkdir(parents=True, exist_ok=True)

    print(f'\n[1/4] Checking Decider server at {agent.DECIDER_URL} ...')
    fetch_healthz(agent.DECIDER_URL)

    print('\n[2/4] Sending one real /v1/systemone request (same shape agent.call_decider sends) ...')
    try:
        decider_result = agent.call_decider(SAMPLE_DECIDER_STATE)
    except Exception as exc:
        raise VerificationFailure('step 2: /v1/systemone request', f'{type(exc).__name__}: {exc}') from exc
    print(json.dumps(decider_result, indent=2))

    # call_decider() already runs the raw answer through validate_decider_response()
    # and raises before returning on failure, so reaching this line IS the PASS.
    print('\n[3/4] Validating against validate_decider_response: PASS '
          '(call_decider raises ValueError before returning on a validation failure).')

    print(f'\n[4/4] Calling Bedrock converse() once against {agent.BEDROCK_MODEL_ID} ...')
    try:
        narration_result = agent.call_bedrock_narration(SAMPLE_NARRATION_STATE)
    except Exception as exc:
        raise VerificationFailure('step 4: Bedrock converse', f'{type(exc).__name__}: {exc}') from exc
    print(json.dumps(narration_result, indent=2))

    decider_fixture_path = FIXTURES_DIR / 'live_decider_response.json'
    bedrock_fixture_path = FIXTURES_DIR / 'live_bedrock_response.json'
    decider_fixture_path.write_text(json.dumps(decider_result, indent=2) + '\n')
    bedrock_fixture_path.write_text(json.dumps(narration_result, indent=2) + '\n')
    print(f'\nWrote {decider_fixture_path}')
    print(f'Wrote {bedrock_fixture_path}')
    print('\nLIVE RUN PASSED. Commit the two fixture files above as golden responses, '
          'then resolve the "# TODO: verify against installed version" marker in backend/agent.py against them.')
    return 0


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument(
        '--dry-run', action='store_true',
        help='Check dependencies/reachability only; make no inference calls. Safe for CI.',
    )
    args = parser.parse_args(argv)
    try:
        return run_dry_run() if args.dry_run else run_live()
    except VerificationFailure as exc:
        print(f'\nFAILED at {exc.step}: {exc}')
        return 1


if __name__ == '__main__':
    sys.exit(main())
