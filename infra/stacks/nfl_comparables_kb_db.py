"""Aurora Serverless v2 cluster for the Bedrock Knowledge Base.

Split from NflComparablesKb because Bedrock KB validates two things at
KB-create time:
  1. The cluster has the RDS Data API enabled (the KB queries via the
     Data API HTTPS endpoint, not direct TCP).
  2. The target table + pgvector extension exist on the cluster.

So deploy order is:
  1. cdk deploy NflComparablesKbDb        (this stack, ~6 min)
  2. python scripts/db_bootstrap_kb_aurora.py    (creates extension + table)
  3. cdk deploy NflComparablesKb           (KB + data sources, ~1 min)

The Aurora cluster auto-pauses (min ACU=0) so idle cost is ~$0/hr.
"""

from __future__ import annotations

import aws_cdk as cdk
from aws_cdk import (
    aws_ec2 as ec2,
    aws_rds as rds,
    aws_secretsmanager as secretsmanager,
)
from constructs import Construct


KB_DATABASE_NAME = "nflcomparables_kb"


class KbDbStack(cdk.Stack):
    def __init__(
        self,
        scope: Construct,
        construct_id: str,
        *,
        vpc: ec2.IVpc,
        **kwargs,
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # ---------- Aurora SG ----------
        # Bedrock KB doesn't need TCP/5432 ingress — it queries via the RDS
        # Data API (HTTPS). Only the dev laptop (schema bootstrap script)
        # needs direct ingress.
        aurora_sg = ec2.SecurityGroup(
            self,
            "AuroraSecurityGroup",
            vpc=vpc,
            description="Aurora SV2 (Bedrock KB)",
            allow_all_outbound=False,
        )
        allowed_ip = self.node.try_get_context("allowed-ip")
        if allowed_ip:
            aurora_sg.add_ingress_rule(
                peer=ec2.Peer.ipv4(allowed_ip),
                connection=ec2.Port.tcp(5432),
                description=f"developer ingress ({allowed_ip})",
            )

        # ---------- Aurora credentials secret ----------
        aurora_secret = secretsmanager.Secret(
            self,
            "AuroraSecret",
            description="Aurora SV2 credentials for the Bedrock Knowledge Base",
            generate_secret_string=secretsmanager.SecretStringGenerator(
                secret_string_template='{"username": "kbadmin"}',
                generate_string_key="password",
                exclude_punctuation=True,
                password_length=32,
            ),
        )

        # ---------- Aurora Serverless v2 cluster ----------
        # min_capacity=0 is the 2024 scale-to-zero capability. Cluster
        # auto-pauses after 5 min idle and resumes on the next connection
        # (cold-start ~10-15s).
        aurora_cluster = rds.DatabaseCluster(
            self,
            "AuroraCluster",
            engine=rds.DatabaseClusterEngine.aurora_postgres(
                version=rds.AuroraPostgresEngineVersion.VER_16_4,
            ),
            credentials=rds.Credentials.from_secret(aurora_secret),
            default_database_name=KB_DATABASE_NAME,
            serverless_v2_min_capacity=0,
            serverless_v2_max_capacity=2,
            writer=rds.ClusterInstance.serverless_v2(
                "Writer",
                publicly_accessible=True,
            ),
            vpc=vpc,
            vpc_subnets=ec2.SubnetSelection(subnet_type=ec2.SubnetType.PUBLIC),
            security_groups=[aurora_sg],
            storage_encrypted=True,
            enable_data_api=True,
            removal_policy=cdk.RemovalPolicy.SNAPSHOT,
        )

        # Expose for cross-stack consumption (NflComparablesKb).
        self.aurora_cluster = aurora_cluster
        self.aurora_secret = aurora_secret
        self.database_name = KB_DATABASE_NAME

        # ---------- Outputs ----------
        cdk.CfnOutput(self, "AuroraClusterArn", value=aurora_cluster.cluster_arn)
        cdk.CfnOutput(
            self,
            "AuroraClusterEndpoint",
            value=aurora_cluster.cluster_endpoint.hostname,
        )
        cdk.CfnOutput(self, "AuroraSecretArn", value=aurora_secret.secret_arn)
        cdk.CfnOutput(self, "AuroraDatabaseName", value=KB_DATABASE_NAME)
