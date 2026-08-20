"""Shared VPC for the NFL comparables data tier.

Formerly the home of an RDS Postgres + pgvector instance used for kNN comp
queries. That instance was retired in Aug 2026: the comparables results are
baked into static JSON at build time, the live chat's vector store is the
Aurora SV2 cluster in NflComparablesKbDb, and CloudWatch showed zero
connections to the Postgres box over a 14-day window. It was costing ~$22/mo
(instance + gp3 storage + backups + a public IPv4) to sit idle.

What remains is the VPC that Aurora lives in.

    ┌─ NflComparablesDb (this stack) ── VPC, 2 AZ, public subnets, no NAT
    └─ NflComparablesKbDb ──────────── Aurora SV2 (min ACU=0) in that VPC

!! DO NOT RENAME THE CLOUDFORMATION STACK ID !!
It is still "NflComparablesDb" (see infra/app.py). NflComparablesKbDb
consumes this VPC through cross-stack exports whose names embed that ID
("NflComparablesDb:ExportsOutputRefVpc..."). Changing the stack ID would
force a VPC replacement and take the Aurora cluster — and the live NFL
chat — down with it. The Python module/class names are cosmetic and safe
to change; the stack ID is not.

To bring the Postgres tier back (re-running the engine's kNN loaders),
restore this file from git history at 790957b and redeploy — the curated
S3 bucket in NflComparablesData still holds the source data, and a final
snapshot of the retired instance was taken on delete.
"""

import aws_cdk as cdk
from aws_cdk import aws_ec2 as ec2
from constructs import Construct


class NetworkStack(cdk.Stack):
    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # Public subnets only — no NAT gateway (NAT is ~$33/mo, unjustified
        # for a portfolio data tier). Aurora sits here with no public IP;
        # Bedrock and the bootstrap script both reach it over the RDS Data
        # API, which is a regional HTTPS endpoint rather than a VPC path.
        vpc = ec2.Vpc(
            self,
            "Vpc",
            max_azs=2,
            nat_gateways=0,
            subnet_configuration=[
                ec2.SubnetConfiguration(
                    name="public",
                    subnet_type=ec2.SubnetType.PUBLIC,
                    cidr_mask=24,
                ),
            ],
        )

        # Exposed for cross-stack consumption (NflComparablesKbDb).
        self.vpc = vpc

        cdk.CfnOutput(self, "VpcId", value=vpc.vpc_id)
