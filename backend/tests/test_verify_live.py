"""Tests for backend/scripts/verify_live.py's dry-run path only.

These tests never touch the network: `--dry-run` itself must not make a
live Decider or Bedrock call, so testing it only requires mocking the
reachability/credential checks it performs, not a live boundary. The full
live-run path (run_live) is intentionally NOT exercised here -- a human
runs that by hand with real credentials and a running Decider server.
"""
import importlib.util
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location(
    'verify_live', Path(__file__).resolve().parents[1] / 'scripts' / 'verify_live.py'
)
verify_live = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verify_live)


class DryRunTests(unittest.TestCase):
    def test_dry_run_fails_when_everything_missing(self):
        with patch.object(verify_live.importlib.util, 'find_spec', return_value=None), \
             patch.object(verify_live, 'check_boto3_credentials', side_effect=verify_live.VerificationFailure('x', 'no creds')), \
             patch.object(verify_live.socket, 'create_connection', side_effect=OSError('refused')):
            self.assertEqual(verify_live.run_dry_run(), 1)

    def test_dry_run_passes_when_everything_present(self):
        with patch.object(verify_live.importlib.util, 'find_spec', return_value=object()), \
             patch.object(verify_live, 'check_boto3_credentials'), \
             patch.object(verify_live.socket, 'create_connection'):
            self.assertEqual(verify_live.run_dry_run(), 0)

    def test_dry_run_never_calls_bedrock_or_decider_inference(self):
        with patch.object(verify_live.importlib.util, 'find_spec', return_value=object()), \
             patch.object(verify_live, 'check_boto3_credentials'), \
             patch.object(verify_live.socket, 'create_connection'), \
             patch.object(verify_live.agent, 'call_decider') as fake_decide, \
             patch.object(verify_live.agent, 'call_bedrock_narration') as fake_narrate:
            verify_live.run_dry_run()
        fake_decide.assert_not_called()
        fake_narrate.assert_not_called()


class CredentialCheckTests(unittest.TestCase):
    def test_broken_credential_provider_is_reported_cleanly_not_raised_raw(self):
        class ExplodingSession:
            def get_credentials(self):
                raise RuntimeError('MissingDependencyException: needs botocore[crt]')

        with patch.object(verify_live, 'boto3') as fake_boto3:
            fake_boto3.Session.return_value = ExplodingSession()
            with self.assertRaises(verify_live.VerificationFailure):
                verify_live.check_boto3_credentials()

    def test_none_credentials_raises_verification_failure(self):
        class EmptySession:
            def get_credentials(self):
                return None

        with patch.object(verify_live, 'boto3') as fake_boto3:
            fake_boto3.Session.return_value = EmptySession()
            with self.assertRaises(verify_live.VerificationFailure):
                verify_live.check_boto3_credentials()


class DeciderListeningCheckTests(unittest.TestCase):
    def test_connection_refused_raises_verification_failure(self):
        with patch.object(verify_live.socket, 'create_connection', side_effect=OSError('refused')):
            with self.assertRaises(verify_live.VerificationFailure):
                verify_live.check_decider_listening('http://127.0.0.1:8099')

    def test_successful_connect_does_not_raise(self):
        with patch.object(verify_live.socket, 'create_connection'):
            verify_live.check_decider_listening('http://127.0.0.1:8099')


if __name__ == '__main__':
    unittest.main()
