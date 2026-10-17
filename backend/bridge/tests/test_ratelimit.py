import datetime
import sys
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import boto3
from botocore.exceptions import ClientError
from moto import mock_aws

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import config
import ratelimit
from ratelimit import RateLimitExceeded


def _create_table():
    boto3.client('dynamodb', region_name=config.AWS_REGION).create_table(
        TableName=config.RATELIMIT_TABLE_NAME,
        KeySchema=[{'AttributeName': 'pk', 'KeyType': 'HASH'}, {'AttributeName': 'sk', 'KeyType': 'RANGE'}],
        AttributeDefinitions=[{'AttributeName': 'pk', 'AttributeType': 'S'}, {'AttributeName': 'sk', 'AttributeType': 'S'}],
        BillingMode='PAY_PER_REQUEST',
    )


class RateLimitTests(unittest.TestCase):
    def setUp(self):
        self.mock = mock_aws()
        self.mock.start()
        _create_table()
        self.addCleanup(self.mock.stop)

    def test_per_player_cap_allows_up_to_the_limit(self):
        config.PLAYER_DAILY_LIMIT = 3
        try:
            for _ in range(3):
                ratelimit.enforce_rate_limits('player-a')
        finally:
            config.PLAYER_DAILY_LIMIT = 20

    def test_per_player_cap_trips_on_the_next_call(self):
        config.PLAYER_DAILY_LIMIT = 2
        try:
            ratelimit.enforce_rate_limits('player-b')
            ratelimit.enforce_rate_limits('player-b')
            with self.assertRaises(RateLimitExceeded) as ctx:
                ratelimit.enforce_rate_limits('player-b')
            self.assertEqual(ctx.exception.scope, 'player')
        finally:
            config.PLAYER_DAILY_LIMIT = 20

    def test_one_players_cap_does_not_affect_another_player(self):
        config.PLAYER_DAILY_LIMIT = 1
        try:
            ratelimit.enforce_rate_limits('player-c')
            ratelimit.enforce_rate_limits('player-d')  # different player, same global bucket
        finally:
            config.PLAYER_DAILY_LIMIT = 20

    def test_global_cap_trips_even_for_distinct_players(self):
        config.PLAYER_DAILY_LIMIT = 100
        config.GLOBAL_DAILY_LIMIT = 2
        try:
            ratelimit.enforce_rate_limits('player-e')
            ratelimit.enforce_rate_limits('player-f')
            with self.assertRaises(RateLimitExceeded) as ctx:
                ratelimit.enforce_rate_limits('player-g')
            self.assertEqual(ctx.exception.scope, 'global')
        finally:
            config.PLAYER_DAILY_LIMIT = 20
            config.GLOBAL_DAILY_LIMIT = 500

    def test_player_cap_checked_before_global_so_it_does_not_spend_global_budget(self):
        config.PLAYER_DAILY_LIMIT = 1
        config.GLOBAL_DAILY_LIMIT = 500
        try:
            ratelimit.enforce_rate_limits('player-h')
            with self.assertRaises(RateLimitExceeded) as ctx:
                ratelimit.enforce_rate_limits('player-h')
            self.assertEqual(ctx.exception.scope, 'player')
            table = boto3.resource('dynamodb', region_name=config.AWS_REGION).Table(config.RATELIMIT_TABLE_NAME)
            day = ratelimit._day_bucket()
            item = table.get_item(Key={'pk': f'global#day#{day}', 'sk': 'count'}).get('Item')
            self.assertEqual(item['cnt'], 1)  # only player-h's first successful call counted
        finally:
            config.PLAYER_DAILY_LIMIT = 20

    def test_global_cap_rejection_does_not_consume_player_allowance(self):
        config.PLAYER_DAILY_LIMIT = 100
        config.GLOBAL_DAILY_LIMIT = 1
        try:
            ratelimit.enforce_rate_limits('player-global-first')
            with self.assertRaises(RateLimitExceeded) as ctx:
                ratelimit.enforce_rate_limits('player-not-charged')
            self.assertEqual(ctx.exception.scope, 'global')
            table = boto3.resource('dynamodb', region_name=config.AWS_REGION).Table(config.RATELIMIT_TABLE_NAME)
            day = ratelimit._day_bucket()
            item = table.get_item(
                Key={'pk': f'player#player-not-charged#day#{day}', 'sk': 'count'}
            ).get('Item')
            self.assertIsNone(item)
        finally:
            config.PLAYER_DAILY_LIMIT = 20
            config.GLOBAL_DAILY_LIMIT = 500

    def test_counter_ttl_is_set_to_next_utc_midnight(self):
        now = datetime.datetime(2026, 10, 14, 23, 59, tzinfo=datetime.timezone.utc)
        ratelimit.enforce_rate_limits('player-i', now=now)
        table = boto3.resource('dynamodb', region_name=config.AWS_REGION).Table(config.RATELIMIT_TABLE_NAME)
        day = ratelimit._day_bucket(now)
        item = table.get_item(Key={'pk': f'player#player-i#day#{day}', 'sk': 'count'})['Item']
        expected_ttl = int(datetime.datetime(2026, 10, 15, tzinfo=datetime.timezone.utc).timestamp())
        self.assertEqual(item['ttl'], expected_ttl)


    def test_concurrent_requests_never_exceed_player_or_global_cap(self):
        config.PLAYER_DAILY_LIMIT = 7
        config.GLOBAL_DAILY_LIMIT = 7
        try:
            def consume(_):
                try:
                    ratelimit.enforce_rate_limits('concurrent-player')
                    return True
                except RateLimitExceeded:
                    return False

            with ThreadPoolExecutor(max_workers=16) as pool:
                accepted = list(pool.map(consume, range(40)))

            self.assertEqual(sum(accepted), 7)
            table = boto3.resource('dynamodb', region_name=config.AWS_REGION).Table(config.RATELIMIT_TABLE_NAME)
            day = ratelimit._day_bucket()
            player = table.get_item(
                Key={'pk': f'player#concurrent-player#day#{day}', 'sk': 'count'}
            )['Item']
            global_item = table.get_item(
                Key={'pk': f'global#day#{day}', 'sk': 'count'}
            )['Item']
            self.assertEqual(player['cnt'], 7)
            self.assertEqual(global_item['cnt'], 7)
        finally:
            config.PLAYER_DAILY_LIMIT = 20
            config.GLOBAL_DAILY_LIMIT = 500

    def test_dynamodb_failure_does_not_partially_advance_either_counter(self):
        failure = ClientError(
            {'Error': {'Code': 'ProvisionedThroughputExceededException', 'Message': 'retry'}},
            'TransactWriteItems',
        )
        original_client = ratelimit._client
        ratelimit._client = lambda: type(
            'FailingClient', (), {'transact_write_items': lambda self, **kwargs: (_ for _ in ()).throw(failure)}
        )()
        try:
            with self.assertRaises(ClientError):
                ratelimit.enforce_rate_limits('failed-player')
        finally:
            ratelimit._client = original_client

        table = boto3.resource('dynamodb', region_name=config.AWS_REGION).Table(config.RATELIMIT_TABLE_NAME)
        self.assertEqual(table.scan()['Count'], 0)


if __name__ == '__main__':
    unittest.main()
