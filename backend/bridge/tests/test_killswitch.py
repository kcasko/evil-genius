import sys
import unittest
import unittest.mock as mock
from pathlib import Path

import boto3
from botocore.exceptions import ClientError
from moto import mock_aws

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import config
import killswitch
from killswitch import KillSwitchUnavailableError


def _create_table():
    boto3.client('dynamodb', region_name=config.AWS_REGION).create_table(
        TableName=config.RATELIMIT_TABLE_NAME,
        KeySchema=[{'AttributeName': 'pk', 'KeyType': 'HASH'}, {'AttributeName': 'sk', 'KeyType': 'RANGE'}],
        AttributeDefinitions=[{'AttributeName': 'pk', 'AttributeType': 'S'}, {'AttributeName': 'sk', 'AttributeType': 'S'}],
        BillingMode='PAY_PER_REQUEST',
    )


class KillSwitchTests(unittest.TestCase):
    def setUp(self):
        self.mock = mock_aws()
        self.mock.start()
        _create_table()
        killswitch.invalidate_cache()
        self.addCleanup(self.mock.stop)
        self.addCleanup(killswitch.invalidate_cache)

    def test_missing_item_defaults_to_enabled(self):
        self.assertTrue(killswitch.is_ai_enabled())
        self.assertIsNone(killswitch.get_state()['deadline_ms'])

    def test_set_ai_enabled_false_is_read_back(self):
        killswitch.set_ai_enabled(False)
        self.assertFalse(killswitch.is_ai_enabled())

    def test_set_ai_enabled_true_restores(self):
        killswitch.set_ai_enabled(False)
        killswitch.set_ai_enabled(True)
        self.assertTrue(killswitch.is_ai_enabled())

    def test_deadline_ms_round_trips(self):
        killswitch.set_ai_enabled(True, deadline_ms=1234567890)
        self.assertEqual(killswitch.get_state()['deadline_ms'], 1234567890)

    def test_read_is_cached_within_window(self):
        killswitch.set_ai_enabled(True)
        fake_now = [1000.0]
        self.assertTrue(killswitch.is_ai_enabled(now=fake_now[0]))
        # Flip the underlying item directly (bypassing set_ai_enabled's cache
        # invalidation) to prove the cached read doesn't go back to DynamoDB.
        boto3.resource('dynamodb', region_name=config.AWS_REGION).Table(config.RATELIMIT_TABLE_NAME).put_item(
            Item={'pk': 'ai_enabled', 'sk': 'flag', 'enabled': False}
        )
        self.assertTrue(killswitch.is_ai_enabled(now=fake_now[0] + 1))

    def test_cache_expires_after_window(self):
        killswitch.set_ai_enabled(True)
        killswitch.is_ai_enabled(now=1000.0)
        boto3.resource('dynamodb', region_name=config.AWS_REGION).Table(config.RATELIMIT_TABLE_NAME).put_item(
            Item={'pk': 'ai_enabled', 'sk': 'flag', 'enabled': False}
        )
        self.assertFalse(killswitch.is_ai_enabled(now=1000.0 + config.KILLSWITCH_CACHE_SECONDS + 1))

    def test_write_invalidates_cache_immediately(self):
        killswitch.set_ai_enabled(True)
        killswitch.is_ai_enabled(now=1000.0)
        killswitch.set_ai_enabled(False)
        self.assertFalse(killswitch.is_ai_enabled(now=1000.1))

    def test_dynamodb_failure_raises_unavailable_not_disabled(self):
        error = ClientError({'Error': {'Code': 'InternalServerError', 'Message': 'boom'}}, 'GetItem')
        with mock.patch.object(killswitch, '_table', side_effect=error):
            with self.assertRaises(KillSwitchUnavailableError):
                killswitch.get_state(now=99999)


if __name__ == '__main__':
    unittest.main()
