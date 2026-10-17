"""DynamoDB-backed atomic rate-limit counters for the Lambda bridge.

Table ``eg-ai-ratelimit`` (see infra/dynamodb/schema.yaml): PK ``pk`` (S),
SK ``sk`` (S), TTL attribute ``ttl`` (N, epoch seconds). Two counter item
shapes, both keyed on a single day bucket so they self-expire via DynamoDB
TTL instead of needing a cleanup job:

- ``pk=player#<uuid>#day#<yyyymmdd>``, ``sk=count`` -- per-player daily cap.
- ``pk=global#day#<yyyymmdd>``, ``sk=count`` -- account-wide daily cap.

Both counters are incremented in one ``TransactWriteItems`` call. Each
update has a conditional cap check, so neither counter advances if either
cap has already been reached; concurrent Lambda invocations cannot create a
check-then-increment race or consume a player's allowance without consuming
the matching global allowance.
"""
import datetime
import sys
from pathlib import Path

import boto3
from botocore.exceptions import ClientError

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config

_SECONDS_PER_DAY = 86400


class RateLimitExceeded(RuntimeError):
    """Raised when a per-player or global daily cap has been reached.

    ``scope`` is ``'player'`` or ``'global'`` so the handler can report
    which cap tripped without leaking internal counter values to the
    client.
    """

    def __init__(self, scope):
        self.scope = scope
        super().__init__(f'{scope} rate limit exceeded')


def _client():
    return boto3.client('dynamodb', region_name=config.AWS_REGION)


def _day_bucket(now=None):
    now = now or datetime.datetime.now(datetime.timezone.utc)
    return now.strftime('%Y%m%d')


def _day_end_ttl(now=None):
    now = now or datetime.datetime.now(datetime.timezone.utc)
    midnight = datetime.datetime(now.year, now.month, now.day, tzinfo=datetime.timezone.utc)
    next_midnight = midnight + datetime.timedelta(days=1)
    return int(next_midnight.timestamp())


def _counter_update(pk, limit, ttl):
    return {
        'Update': {
            'TableName': config.RATELIMIT_TABLE_NAME,
            'Key': {'pk': {'S': pk}, 'sk': {'S': 'count'}},
            'UpdateExpression': 'ADD cnt :incr SET #ttl = if_not_exists(#ttl, :ttl)',
            'ConditionExpression': 'attribute_not_exists(cnt) OR cnt < :limit',
            'ExpressionAttributeNames': {'#ttl': 'ttl'},
            'ExpressionAttributeValues': {
                ':incr': {'N': '1'},
                ':limit': {'N': str(limit)},
                ':ttl': {'N': str(ttl)},
            },
        }
    }


def enforce_rate_limits(player_id, now=None):
    """Atomically consume one player allowance and one global allowance."""
    day = _day_bucket(now)
    ttl = _day_end_ttl(now)
    writes = [
        _counter_update(
            f'player#{player_id}#day#{day}', config.PLAYER_DAILY_LIMIT, ttl
        ),
        _counter_update(f'global#day#{day}', config.GLOBAL_DAILY_LIMIT, ttl),
    ]
    try:
        _client().transact_write_items(TransactItems=writes)
    except ClientError as exc:
        if exc.response['Error']['Code'] != 'TransactionCanceledException':
            raise
        reasons = exc.response.get('CancellationReasons', [])
        # Transaction item order is stable: player then global. If an SDK,
        # emulator, or future service response omits reasons, report the
        # conservative combined scope without leaking counter values.
        if reasons and reasons[0].get('Code') == 'ConditionalCheckFailed':
            raise RateLimitExceeded('player') from exc
        if len(reasons) > 1 and reasons[1].get('Code') == 'ConditionalCheckFailed':
            raise RateLimitExceeded('global') from exc
        raise RateLimitExceeded('player_or_global') from exc
