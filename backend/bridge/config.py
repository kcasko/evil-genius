"""Environment configuration for the Lambda bridge.

No secrets live in source. CloudFormation wires the AgentCore runtime ARN
and table name into Lambda environment variables. Access to the AWS_IAM
function URL is restricted by CloudFront OAC, so the bridge needs no origin
verification secret.
"""

import os


AWS_REGION = os.environ.get('AWS_REGION', 'us-east-1')
RATELIMIT_TABLE_NAME = os.environ.get('RATELIMIT_TABLE_NAME', 'eg-ai-ratelimit')
AGENT_RUNTIME_ARN = os.environ.get('AGENT_RUNTIME_ARN', '')

PLAYER_DAILY_LIMIT = int(os.environ.get('PLAYER_DAILY_LIMIT', '20'))
GLOBAL_DAILY_LIMIT = int(os.environ.get('GLOBAL_DAILY_LIMIT', '500'))
KILLSWITCH_CACHE_SECONDS = int(os.environ.get('KILLSWITCH_CACHE_SECONDS', '60'))
