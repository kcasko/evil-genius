"""One-way campaign stop; billing is delayed, request limits are primary."""
import datetime as dt
import os
import json
from decimal import Decimal

import boto3
import killswitch

UTC = dt.timezone.utc
START = dt.date(2026, 10, 16)
END = dt.datetime(2026, 11, 16, 8, 0, tzinfo=UTC)


def allowance(now):
    days = max(1, (now.date() - START).days + 1)
    return min(Decimal('180'), Decimal('5') * days)


def campaign_cost(now):
    client = boto3.client('ce', region_name='us-east-1')
    args = {
        'TimePeriod': {'Start': START.isoformat(), 'End': (now.date() + dt.timedelta(days=1)).isoformat()},
        'Granularity': 'DAILY',
        'Metrics': ['UnblendedCost'],
        # Count gross account usage conservatively, including project supporting
        # services; credits and refunds must never cancel the measured usage.
        'Filter': {'Not': {'Dimensions': {'Key': 'RECORD_TYPE', 'Values': ['Credit', 'Refund']}}},
    }
    total = Decimal('0')
    while True:
        response = client.get_cost_and_usage(**args)
        for result in response.get('ResultsByTime', []):
            total += Decimal(result['Total']['UnblendedCost']['Amount'])
        if not response.get('NextPageToken'):
            return total
        args['NextPageToken'] = response['NextPageToken']


def lambda_handler(event=None, context=None):
    now = dt.datetime.now(UTC)
    if now >= END:
        killswitch.set_ai_enabled(False)
        result = {'tripped': True, 'reason': 'campaign_ended'}
        print(json.dumps(result))
        return result
    try:
        cost = campaign_cost(now)
    except Exception:
        # A broken meter is a reason to stop paid calls, never to reopen them.
        killswitch.set_ai_enabled(False)
        raise
    threshold = allowance(now)
    tripped = cost >= threshold
    if tripped:
        killswitch.set_ai_enabled(False)
    result = {'tripped': tripped, 'campaign_gross_account_usd': str(cost), 'threshold_usd': str(threshold)}
    print(json.dumps(result))
    return result
