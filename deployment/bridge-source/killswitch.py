"""Monthly hard-shutoff kill switch, cached 60 s on read.

Single DynamoDB item in the ``eg-ai-ratelimit`` table: ``pk=ai_enabled``,
``sk=flag``, attributes ``enabled`` (bool) and optional ``deadline_ms``
(epoch milliseconds a scheduled AI window ends, or absent). Writes
(scripts/kill_switch.sh, scripts/kill_switch_restore.sh, the cost
watchdog) always bypass the cache via set_ai_enabled(); reads are cached
in-process for KILLSWITCH_CACHE_SECONDS so a hot Lambda container doesn't
hit DynamoDB on every request.

Missing item == enabled (fresh deploy, before anyone has ever flipped the
switch). A DynamoDB error while reading is NOT the same as "disabled" --
it is a backend failure, so callers must 503, never silently treat it as
either state.
"""
import sys
import time
from pathlib import Path

import boto3
from botocore.exceptions import ClientError

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config

_PK = 'ai_enabled'
_SK = 'flag'

_cache = {'value': None, 'checked_at': 0.0}


class KillSwitchUnavailableError(RuntimeError):
    """The kill-switch item could not be read (DynamoDB unreachable, etc.)."""


def _table():
    return boto3.resource('dynamodb', region_name=config.AWS_REGION).Table(
        config.RATELIMIT_TABLE_NAME
    )


def _read():
    try:
        response = _table().get_item(Key={'pk': _PK, 'sk': _SK})
    except ClientError as exc:
        raise KillSwitchUnavailableError('kill-switch item unreadable') from exc
    item = response.get('Item')
    if item is None:
        return {'enabled': False, 'deadline_ms': None}
    return {'enabled': bool(item.get('enabled', True)), 'deadline_ms': int(item['deadline_ms']) if item.get('deadline_ms') is not None else None}


def get_state(now=None):
    """Return {'enabled': bool, 'deadline_ms': int|None}, cached 60 s."""
    now = time.time() if now is None else now
    if _cache['value'] is not None and (now - _cache['checked_at']) < config.KILLSWITCH_CACHE_SECONDS:
        value = _cache['value']
    else:
        value = _read()
        _cache['value'] = value
        _cache['checked_at'] = now
    deadline = value.get('deadline_ms')
    if deadline is not None and now * 1000 >= float(deadline):
        return {**value, 'enabled': False}
    return value


def is_ai_enabled(now=None):
    return get_state(now)['enabled']


def set_ai_enabled(enabled, deadline_ms=None):
    """Write the kill switch directly, bypassing the read cache.

    Used by scripts/kill_switch.sh (via the AWS CLI, not this function)
    and by the cost watchdog Lambda (via this function). Also clears the
    in-process cache so the next read in this container reflects the
    write immediately instead of waiting out the cache window.
    """
    item = {'pk': _PK, 'sk': _SK, 'enabled': bool(enabled)}
    if deadline_ms is not None:
        item['deadline_ms'] = deadline_ms
    _table().put_item(Item=item)
    invalidate_cache()


def invalidate_cache():
    _cache['value'] = None
    _cache['checked_at'] = 0.0
