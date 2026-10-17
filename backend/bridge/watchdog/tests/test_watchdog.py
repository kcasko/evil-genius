import importlib.util
import sys
import unittest
import unittest.mock as mock
from pathlib import Path

import boto3
from moto import mock_aws

# Loaded under a name distinct from 'handler' so it can't collide in
# sys.modules with backend/bridge/handler.py's own module when both test
# suites run in the same pytest session (both files are named handler.py).
_spec = importlib.util.spec_from_file_location(
    'eg_watchdog_handler', Path(__file__).resolve().parents[1] / 'handler.py'
)
handler = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(handler)  # also puts backend/bridge/ on sys.path

import config  # noqa: E402
import killswitch  # noqa: E402


def _create_table():
    boto3.client('dynamodb', region_name=config.AWS_REGION).create_table(
        TableName=config.RATELIMIT_TABLE_NAME,
        KeySchema=[{'AttributeName': 'pk', 'KeyType': 'HASH'}, {'AttributeName': 'sk', 'KeyType': 'RANGE'}],
        AttributeDefinitions=[{'AttributeName': 'pk', 'AttributeType': 'S'}, {'AttributeName': 'sk', 'AttributeType': 'S'}],
        BillingMode='PAY_PER_REQUEST',
    )


def _ce_response(amounts):
    return {'ResultsByTime': [{'Total': {'UnblendedCost': {'Amount': str(a), 'Unit': 'USD'}}} for a in amounts]}


class CostWatchdogTests(unittest.TestCase):
    """moto's `ce` mock (as of moto 5.2.4) always returns empty cost data --
    it does not simulate real billing records -- so these tests stub
    boto3's Cost Explorer client directly with unittest.mock to control
    the month-to-date figure, while still using moto for the DynamoDB
    kill-switch table so the trip/no-trip write path is exercised for
    real against the same table schema the bridge uses.
    """

    def setUp(self):
        self.mock = mock_aws()
        self.mock.start()
        _create_table()
        killswitch.invalidate_cache()
        self.addCleanup(self.mock.stop)
        self.addCleanup(killswitch.invalidate_cache)

    def _run_with_cost(self, amounts):
        with mock.patch.object(handler.boto3, 'client') as fake_client:
            fake_client.return_value.get_cost_and_usage.return_value = _ce_response(amounts)
            result = handler.lambda_handler()
        return result, fake_client

    def test_cost_below_threshold_does_not_trip(self):
        result, _ = self._run_with_cost([10.50])
        self.assertFalse(result['tripped'])
        self.assertTrue(killswitch.is_ai_enabled())

    def test_cost_at_threshold_trips(self):
        result, _ = self._run_with_cost([18.00])
        self.assertTrue(result['tripped'])
        self.assertFalse(killswitch.is_ai_enabled())

    def test_cost_above_threshold_trips(self):
        result, _ = self._run_with_cost([25.75])
        self.assertTrue(result['tripped'])
        self.assertFalse(killswitch.is_ai_enabled())

    def test_pagination_sums_across_pages(self):
        with mock.patch.object(handler.boto3, 'client') as fake_client:
            fake_client.return_value.get_cost_and_usage.side_effect = [
                {**_ce_response([10.0]), 'NextPageToken': 'page-2'},
                _ce_response([9.5]),
            ]
            result = handler.lambda_handler()
        self.assertAlmostEqual(result['month_to_date_usd'], 19.5)
        self.assertTrue(result['tripped'])

    def test_does_not_re_enable_a_manually_tripped_switch_on_a_cheap_day(self):
        killswitch.set_ai_enabled(False)  # operator-tripped emergency kill
        result, _ = self._run_with_cost([0.01])
        self.assertFalse(result['tripped'])
        self.assertFalse(killswitch.is_ai_enabled())  # watchdog never re-enables

    def test_date_range_is_month_to_date_inclusive_of_today(self):
        import datetime
        now = datetime.datetime(2026, 10, 15, 12, 0, tzinfo=datetime.timezone.utc)
        start, end = handler._month_to_date_range(now)
        self.assertEqual(start, '2026-10-01')
        self.assertEqual(end, '2026-10-16')  # End is exclusive in Cost Explorer

    def test_filters_on_the_two_billable_services_only(self):
        with mock.patch.object(handler.boto3, 'client') as fake_client:
            fake_client.return_value.get_cost_and_usage.return_value = _ce_response([1.0])
            handler.lambda_handler()
        kwargs = fake_client.return_value.get_cost_and_usage.call_args.kwargs
        self.assertEqual(kwargs['Filter']['Dimensions']['Key'], 'SERVICE')
        self.assertEqual(set(kwargs['Filter']['Dimensions']['Values']), set(handler.WATCHDOG_SERVICES))


if __name__ == '__main__':
    unittest.main()
