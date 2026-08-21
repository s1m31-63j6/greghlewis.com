"""Runtime configuration for the greghlewis.com Amplify Hosting app.

The Amplify app itself was created via the console (not by CDK). This
stack manages two of the three pieces the chat API needs in production:

  1. An IAM compute role assumed by the SSR Lambda at runtime, with
     scoped permissions to call Bedrock (KB Retrieve + Sonnet 4.6
     InvokeModel / InvokeModelWithResponseStream). Created here.
  2. Environment variables for the SSR runtime (KB id, account). Set on
     the Amplify app via an AwsCustomResource calling UpdateApp.

A third piece — attaching the compute role to the Amplify app via
``computeRoleArn`` — has to happen out-of-band. The AWS SDK bundled in
the AwsCustomResource Lambda doesn't yet know about ``computeRoleArn``
and silently drops the field on UpdateApp calls, which would clobber
the role on every subsequent ``cdk deploy``. Run the wire-up script
after the first deploy (and any time CDK creates a fresh role):

    uv run --with boto3 python infra/scripts/wire_amplify_compute_role.py

Then trigger a rebuild so the SSR Lambda picks up the new config:

    aws amplify start-job --app-id dhpo309lbx6w7 \\
        --branch-name main --job-type RELEASE
"""

import aws_cdk as cdk
from aws_cdk import (
    aws_iam as iam,
    custom_resources as cr,
)
from constructs import Construct


class HostingStack(cdk.Stack):
    def __init__(
        self,
        scope: Construct,
        construct_id: str,
        *,
        app_id: str,
        kb_id: str,
        account: str,
        telemetry_table: str,
        playbook_table: str,
        telemetry_salt: str,
        telemetry_key: str,
        **kwargs,
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # Trust principal is the Amplify Hosting service. The role is
        # assumed by the SSR Lambda the platform provisions for our
        # WEB_COMPUTE app — we never see that Lambda directly.
        compute_role = iam.Role(
            self,
            "AmplifyComputeRole",
            assumed_by=iam.ServicePrincipal("amplify.amazonaws.com"),
            description="SSR runtime role for greghlewis.com chat backend",
        )
        compute_role.add_to_policy(
            iam.PolicyStatement(
                effect=iam.Effect.ALLOW,
                actions=["bedrock:Retrieve"],
                resources=[
                    f"arn:aws:bedrock:{self.region}:{account}:knowledge-base/{kb_id}"
                ],
            )
        )
        compute_role.add_to_policy(
            iam.PolicyStatement(
                effect=iam.Effect.ALLOW,
                actions=[
                    "bedrock:InvokeModel",
                    "bedrock:InvokeModelWithResponseStream",
                ],
                resources=[
                    # The cross-region inference profile we call directly.
                    f"arn:aws:bedrock:{self.region}:{account}:inference-profile/us.anthropic.claude-sonnet-4-6",
                    # Foundation models the profile dispatches to. Region
                    # wildcard because the profile routes across us-east-1
                    # / us-east-2 / us-west-2 transparently. Matches both
                    # the unversioned ARN ("anthropic.claude-sonnet-4-6")
                    # and any future versioned variants.
                    "arn:aws:bedrock:*::foundation-model/anthropic.claude-sonnet-4-6*",
                    # Religious Voices uses Bedrock Cohere embeddings at
                    # query time (no Knowledge Base) — the corpus vectors
                    # are bundled with the site, but query vectors are
                    # produced live so the embedding space matches.
                    f"arn:aws:bedrock:{self.region}::foundation-model/cohere.embed-english-v3",
                ],
            )
        )

        # Exposed so other stacks can grant this role access to their
        # resources (SiteTelemetry grants DynamoDB read/write).
        self.compute_role = compute_role

        # AWS_REGION is set automatically by the Lambda runtime — and
        # Amplify rejects env vars with the reserved "AWS" prefix anyway.
        # Our rag.ts falls back to us-east-1 if AWS_REGION is unset, so
        # this is a no-op for the chat path.
        # NOTE: this dict is the COMPLETE set of app-level environment
        # variables sent to Amplify UpdateApp — the call replaces rather
        # than merges. Anything set by hand in the Amplify console gets
        # clobbered on the next `cdk deploy`, so new vars must be added
        # here. They must also be re-exported through the `env` block in
        # next.config.ts, because Amplify exposes app env vars at BUILD
        # time only and they never reach the SSR Lambda otherwise.
        env_vars = {
            "NFLCOMPARABLES_KB_ID": kb_id,
            "NFLCOMPARABLES_AWS_ACCOUNT": account,
            # Site telemetry. TELEMETRY_SALT seeds the daily-rotating
            # visitor hash; TELEMETRY_KEY gates the /telemetry dashboard.
            # Neither may ever be prefixed NEXT_PUBLIC_ — that would inline
            # them into the client bundle.
            "TELEMETRY_TABLE": telemetry_table,
            "TELEMETRY_SALT": telemetry_salt,
            "TELEMETRY_KEY": telemetry_key,
            # Playbook storage. No secret in it — the share link is the access
            # model — but it still must not be NEXT_PUBLIC_, because nothing in
            # the browser has any business naming a DynamoDB table.
            "PLAYBOOK_TABLE": playbook_table,
        }
        # Only the env-var update goes through the custom resource. The
        # compute role attachment is handled by the post-deploy script
        # (see module docstring) — including computeRoleArn here would
        # let the SDK in this Lambda silently drop it and clobber the
        # role on the next stack update.
        update_params = {
            "appId": app_id,
            "environmentVariables": env_vars,
        }
        physical_id = cr.PhysicalResourceId.of(f"amplify-app-config-{app_id}")

        cr.AwsCustomResource(
            self,
            "ConfigureAmplifyApp",
            on_create=cr.AwsSdkCall(
                service="Amplify",
                action="updateApp",
                parameters=update_params,
                physical_resource_id=physical_id,
            ),
            on_update=cr.AwsSdkCall(
                service="Amplify",
                action="updateApp",
                parameters=update_params,
                physical_resource_id=physical_id,
            ),
            on_delete=cr.AwsSdkCall(
                service="Amplify",
                action="updateApp",
                parameters={
                    "appId": app_id,
                    "environmentVariables": {},
                },
            ),
            policy=cr.AwsCustomResourcePolicy.from_statements(
                statements=[
                    iam.PolicyStatement(
                        actions=["amplify:UpdateApp", "amplify:GetApp"],
                        resources=[
                            f"arn:aws:amplify:{self.region}:{account}:apps/{app_id}"
                        ],
                    ),
                ],
            ),
        )

        cdk.CfnOutput(self, "ComputeRoleArn", value=compute_role.role_arn)
        cdk.CfnOutput(self, "AppId", value=app_id)
