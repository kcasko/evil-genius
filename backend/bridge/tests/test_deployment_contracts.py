import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]


class DeploymentContractTests(unittest.TestCase):
    def test_bridge_policies_authorize_every_dynamodb_operation_used_by_bridge(self):
        policy = json.loads((ROOT / 'infra' / 'iam' / 'bridge-role.json').read_text(encoding='utf-8'))
        table_statement = next(
            statement for statement in policy['Statement']
            if statement['Sid'] == 'RateLimitAndKillSwitchTableAccess'
        )
        self.assertEqual(
            set(table_statement['Action']),
            {
                'dynamodb:GetItem',
                # TransactWriteItems authorizes each nested operation; this
                # bridge transaction contains Update actions only.
                'dynamodb:UpdateItem',
            },
        )

        template = (ROOT / 'infra' / 'cfn' / '20-bridge.yaml').read_text(encoding='utf-8')
        expected_actions = '''              - Sid: RateLimitAndKillSwitchTableAccess
                Effect: Allow
                Action:
                  - dynamodb:GetItem
                  - dynamodb:UpdateItem
                Resource: !ImportValue'''
        self.assertIn(expected_actions, template)
        self.assertEqual(template.count('dynamodb:UpdateItem'), 1)
        self.assertNotIn('dynamodb:TransactWriteItems', template)

    def test_deploy_identity_excludes_removed_kms_and_secret_resources(self):
        policy = (ROOT / 'infra' / 'iam' / 'deploy-identity.json').read_text(encoding='utf-8')
        self.assertNotIn('kms:', policy)
        self.assertNotIn('secretsmanager:', policy)

    def test_agentcore_config_and_deploy_docs_lock_idle_timeout_to_300_seconds(self):
        config = json.loads((ROOT / 'infra' / 'agentcore' / 'agentcore.json').read_text(encoding='utf-8'))
        runtime = next(item for item in config['runtimes'] if item['name'] == 'evilgenius')
        self.assertEqual(runtime['lifecycleConfiguration']['idleRuntimeSessionTimeout'], 300)
        env = {item['name']: item['value'] for item in runtime['envVars']}
        self.assertEqual(env['DECIDER_MODEL'], 'StrandsAgents/strands-decider-2B-hobson-v19')
        self.assertEqual(env['DECIDER_REVISION'], 'bb282d786bc251fd4e3068de3ada9ddbb38127cd')
        self.assertEqual(env['DECIDER_QUANT'], 'int8')

        bridge_template = (ROOT / 'infra' / 'cfn' / '20-bridge.yaml').read_text(encoding='utf-8')
        self.assertIn("BedrockModelId:\n    Type: String\n    Default: us.amazon.nova-lite-v1:0", bridge_template)
        self.assertIn('BEDROCK_MODEL_ID: !Ref BedrockModelId', bridge_template)

        plan = (ROOT / 'AWS_DEPLOYMENT_PLAN_V2.md').read_text(encoding='utf-8')
        readme = (ROOT / 'infra' / 'agentcore' / 'README.md').read_text(encoding='utf-8')
        expected_query = "--query 'lifecycleConfiguration.idleRuntimeSessionTimeout'"
        self.assertIn(expected_query, plan)
        self.assertIn(expected_query, readme)
        self.assertNotIn("--query 'idleTimeoutSeconds'", plan)
        self.assertNotIn('aws bedrock-agentcore get-agent-runtime', plan)
        self.assertNotIn('agentcore deploy -y --idle-timeout 300', plan)
        self.assertIn('deciderctl.py add evilgenius --model v19 --idle-timeout 300', plan)
        self.assertIn('agentcore deploy -y', plan)
        self.assertIn('agentcore deploy -y', readme)
        self.assertNotIn('agentcore deploy -y --verbose', plan)
        self.assertNotIn('agentcore deploy -y --verbose', readme)

    def test_reference_dynamodb_schema_matches_deployed_encryption_mode(self):
        core = (ROOT / 'infra' / 'cfn' / '00-core.yaml').read_text(encoding='utf-8')
        schema = (ROOT / 'infra' / 'dynamodb' / 'schema.yaml').read_text(encoding='utf-8')
        self.assertEqual(core.count('SSEType: KMS'), 1)
        self.assertEqual(schema.count('SSEType: KMS'), 1)


if __name__ == '__main__':
    unittest.main()
