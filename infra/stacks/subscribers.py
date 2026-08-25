"""Lead capture for greghlewis.com.

One DynamoDB table, one partition per email address::

    pk = "sub#<email lowercased>"
    sk = "signup#<iso timestamp>"      one item per submission

A submission rather than a subscriber is the unit, which is the whole point
of the table. The same coach who signs up from the playbook and again from
Two-Minute Drill is two rows, and the second row is the interesting one: it
says which project pulled him back. Collapsing both into a single subscriber
record would throw that away to save a kilobyte.

Every row carries the project that sourced it and whatever the person typed
into the optional note, so the list can be read as leads rather than as an
undifferentiated mailing list.

NO TTL, deliberately, and this is the one table on the site that has none.
Telemetry rows expire because they are a sample; playbooks expire because an
abandoned one is dead weight. A person who asked to hear from you has not
expired eighteen months later, and quietly deleting the request would be a
worse answer than keeping it.

RETAIN on removal for the same reason. There is no regenerating this table
from anywhere else if the stack goes away.

The table name is fixed rather than CloudFormation-generated, matching
SiteTelemetryStack and PlaybookDataStack: HostingStack needs the name for its
SSR environment variable while this stack needs HostingStack's compute role
for the IAM grant, and a fixed name is what keeps that from being a cycle.

This table holds personal data, which nothing else on the site does. Two
consequences worth stating where they will be read: the compute role gets
Query and Scan but never DeleteItem, so a bug in a route handler cannot erase
the list; and the dashboard that reads it is gated by TELEMETRY_KEY.
"""

import aws_cdk as cdk
from aws_cdk import (
    aws_dynamodb as dynamodb,
    aws_iam as iam,
)
from constructs import Construct


class SubscribersStack(cdk.Stack):
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
            "Subscribers",
            table_name=table_name,
            partition_key=dynamodb.Attribute(
                name="pk", type=dynamodb.AttributeType.STRING
            ),
            sort_key=dynamodb.Attribute(
                name="sk", type=dynamodb.AttributeType.STRING
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            encryption=dynamodb.TableEncryption.AWS_MANAGED,
            point_in_time_recovery_specification=dynamodb.PointInTimeRecoverySpecification(
                point_in_time_recovery_enabled=True
            ),
            removal_policy=cdk.RemovalPolicy.RETAIN,
        )

        # A ManagedPolicy attached to the role rather than
        # table.grant_read_write_data(compute_role), for the reason spelled out
        # in PlaybookDataStack: the grant helper writes an inline policy onto a
        # role that lives in HostingStack, which would send this table's ARN
        # back the way the role came and make a cycle CDK refuses to synth.
        #
        # PutItem, Query and Scan only. The write path adds a lead; the
        # dashboard reads the list. Nothing in the running site has any reason
        # to delete one, so it cannot.
        iam.ManagedPolicy(
            self,
            "SubscriberTableAccessPolicy",
            description="Append and read access to the subscriber table",
            statements=[
                iam.PolicyStatement(
                    effect=iam.Effect.ALLOW,
                    actions=[
                        "dynamodb:PutItem",
                        "dynamodb:Query",
                        "dynamodb:Scan",
                    ],
                    resources=[table.table_arn],
                )
            ],
            roles=[compute_role],
        )

        self.table = table

        cdk.CfnOutput(self, "TableName", value=table.table_name)
        cdk.CfnOutput(self, "TableArn", value=table.table_arn)
