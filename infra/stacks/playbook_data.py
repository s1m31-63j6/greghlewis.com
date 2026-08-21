"""Playbook storage for greghlewis.com.

One DynamoDB table, one partition per playbook::

    pk = "pb#<id>"                 id = 12-char Crockford base32
    sk = "meta"                    the playbook header
    sk = "play#<pos>#<playId>"     pos zero-padded, gap-10 (0010, 0020, ...)
    sk = "rev#<playId>#<rev>"      capped revision history

Per-play items rather than one blob per book. A hundred compositional plays
would fit inside the 400KB item ceiling, but per-play items win on three
counts: saving one edited play is a 1KB PutItem rather than a 200KB rewrite;
two people on the same share link editing different plays cannot clobber each
other, and with no auth there is nothing to arbitrate if they do; and the read
costs the same either way, since one Query on the partition returns the whole
book in a single page.

There is no GSI. Without accounts there is no "list my playbooks" query, so
the index nothing asks for does not get built. The share link IS the access
model, and an item's random 12-character id is what protects it.

Cost: on-demand billing, nothing always-on. Rows self-expire eighteen months
after the last write via the ``exp`` TTL attribute, which is free, so
abandoned playbooks vacuum themselves.

The table name is fixed rather than CloudFormation-generated, for the same
reason SiteTelemetryStack fixes its own: HostingStack needs the name to set
the SSR environment variable while this stack needs HostingStack's compute
role for the IAM grant. A fixed name breaks what would otherwise be a
dependency cycle.
"""

import aws_cdk as cdk
from aws_cdk import (
    aws_dynamodb as dynamodb,
    aws_iam as iam,
)
from constructs import Construct


class PlaybookDataStack(cdk.Stack):
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
            "Playbooks",
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
            # A coach's playbook cannot be regenerated if the stack is torn
            # down by accident.
            removal_policy=cdk.RemovalPolicy.RETAIN,
        )

        # The SSR route handlers read and write playbooks through this one
        # role. A ManagedPolicy attached to the role rather than
        # table.grant_read_write_data(compute_role): the grant helper adds an
        # INLINE policy to a role that lives in HostingStack, so the table ARN
        # would flow Playbook -> Hosting while the role flows Hosting ->
        # Playbook, and CDK rejects that cycle. Same pattern as
        # SiteTelemetryStack.
        iam.ManagedPolicy(
            self,
            "PlaybookTableAccessPolicy",
            description="Read/write access to the playbook table",
            statements=[
                iam.PolicyStatement(
                    effect=iam.Effect.ALLOW,
                    actions=[
                        "dynamodb:PutItem",
                        "dynamodb:BatchWriteItem",
                        "dynamodb:DeleteItem",
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
