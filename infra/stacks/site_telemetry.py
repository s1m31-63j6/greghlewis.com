"""First-party telemetry storage for greghlewis.com.

One DynamoDB table, day-partitioned:

    pk = "d#YYYY-MM-DD"        one partition per day
    sk = "<epochMs>#<i>#<sid>" chronological + unique within the day

Writes come from the Amplify SSR route handler at ``/api/events`` (a
same-origin path on purpose — a ``*.lambda-url.on.aws`` beacon reads as
third-party tracking to ad blockers, and silently losing traffic is worse
than having no analytics). Reads come from the ``/telemetry`` dashboard,
which Queries one partition per day in the range.

Cost: on-demand billing, no provisioned capacity, nothing always-on. At
$1.25/M writes a heavy month of portfolio traffic is a few cents. Rows
self-expire after ~13 months via the ``exp`` TTL attribute, which is free.

The table name is fixed rather than CloudFormation-generated. That is
load-bearing: HostingStack needs the name to set the SSR environment
variable, while this stack needs HostingStack's compute role for the IAM
grant. A fixed name breaks what would otherwise be a dependency cycle.
"""

import aws_cdk as cdk
from aws_cdk import (
    aws_dynamodb as dynamodb,
    aws_iam as iam,
)
from constructs import Construct


class SiteTelemetryStack(cdk.Stack):
    def __init__(
        self,
        scope: Construct,
        construct_id: str,
        *,
        table_name: str,
        compute_role: iam.IRole,
        **kwargs,
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)

        table = dynamodb.Table(
            self,
            "Events",
            table_name=table_name,
            partition_key=dynamodb.Attribute(
                name="pk", type=dynamodb.AttributeType.STRING
            ),
            sort_key=dynamodb.Attribute(
                name="sk", type=dynamodb.AttributeType.STRING
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            time_to_live_attribute="exp",
            encryption=dynamodb.TableEncryption.AWS_MANAGED,
            # Analytics history can't be regenerated if the stack is torn
            # down by accident.
            removal_policy=cdk.RemovalPolicy.RETAIN,
        )

        # The SSR Lambda writes beacons and reads them back for the
        # dashboard. Both go through this one role.
        #
        # This is a ManagedPolicy attached to the role rather than
        # table.grant_read_write_data(compute_role): the grant helper adds an
        # INLINE policy to the role, and the role lives in HostingStack, so
        # the table ARN would flow Telemetry -> Hosting while the role flows
        # Hosting -> Telemetry. CDK rejects that cycle. Attaching a managed
        # policy keeps the whole reference inside this stack, and matches the
        # pattern DataStack already uses for its buckets.
        iam.ManagedPolicy(
            self,
            "TelemetryTableAccessPolicy",
            description="Read/write access to the site telemetry table",
            statements=[
                iam.PolicyStatement(
                    effect=iam.Effect.ALLOW,
                    actions=[
                        "dynamodb:PutItem",
                        "dynamodb:BatchWriteItem",
                        "dynamodb:Query",
                    ],
                    resources=[table.table_arn],
                )
            ],
            roles=[compute_role],
        )

        self.table = table

        cdk.CfnOutput(self, "TableName", value=table.table_name)
        cdk.CfnOutput(self, "TableArn", value=table.table_arn)
