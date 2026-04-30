"""Vector database for the NFL comparables engine — RDS Postgres + pgvector.

Right-sized for portfolio-traffic kNN over ~1k-10k vectors. Documented
migration thresholds: 100k+ vectors → consider Aurora Serverless v2;
1M+ vectors → consider OpenSearch Serverless. The right-sizing decision
is itself a methodology-page beat (RDS micro $12/mo vs Aurora SV2 $50/mo
vs OpenSearch SV $700/mo).

Resources:
  - VPC (2 AZ, public subnets only — no NAT, free-tier-friendly)
  - DB security group (no ingress by default — append your IP via
    AWS console or `aws ec2 authorize-security-group-ingress`)
  - Postgres 16 db.t4g.micro (free-tier-eligible Year 1, ~$12-15/mo Year 2+)
  - Auto-generated 32-char password in Secrets Manager
  - pgvector is available on RDS Postgres 15.3+; the extension itself is
    enabled by the loader script via `CREATE EXTENSION IF NOT EXISTS
    vector;` once the engine connects.

Optional context:
  --context allowed-ip=X.X.X.X/32     # add an ingress rule to the DB SG

Bootstrap after `cdk deploy`:
    1. Fetch the secret → get DB endpoint + credentials
    2. Connect: psql "postgresql://..."
    3. CREATE EXTENSION IF NOT EXISTS vector;
    4. Schema DDL (players, embeddings) — handled by Phase 2.6 loader.
"""

import aws_cdk as cdk
from aws_cdk import (
    aws_ec2 as ec2,
    aws_iam as iam,
    aws_rds as rds,
    aws_secretsmanager as secretsmanager,
)
from constructs import Construct


class DbStack(cdk.Stack):
    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # --- VPC ---
        # Public subnets only — no NAT gateway (NAT is ~$32/mo, unjustified
        # for a portfolio DB). DB is in public subnet but private at the SG
        # level (no ingress unless explicitly authorized).
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

        # --- security group ---
        db_sg = ec2.SecurityGroup(
            self,
            "DbSecurityGroup",
            vpc=vpc,
            description="Postgres + pgvector ingress",
            allow_all_outbound=False,
        )
        # Optional: add a single CIDR via --context allowed-ip=X.X.X.X/32
        allowed_ip = self.node.try_get_context("allowed-ip")
        if allowed_ip:
            db_sg.add_ingress_rule(
                peer=ec2.Peer.ipv4(allowed_ip),
                connection=ec2.Port.tcp(5432),
                description=f"developer ingress ({allowed_ip})",
            )

        # --- DB credentials secret ---
        # 32-char auto-generated password; username is "engine".
        db_secret = secretsmanager.Secret(
            self,
            "DbSecret",
            description="Postgres credentials for the comparables engine DB",
            generate_secret_string=secretsmanager.SecretStringGenerator(
                secret_string_template='{"username": "engine"}',
                generate_string_key="password",
                exclude_punctuation=True,
                password_length=32,
            ),
        )

        # --- parameter group ---
        # Postgres 16; pgvector is available out of the box once the
        # extension is created. shared_preload_libraries doesn't need
        # adjustment for pgvector.
        param_group = rds.ParameterGroup(
            self,
            "DbParameterGroup",
            engine=rds.DatabaseInstanceEngine.postgres(
                version=rds.PostgresEngineVersion.VER_16_3,
            ),
            description="Postgres 16 for nflcomparables-db (pgvector)",
            parameters={
                # No custom params for v1. pgvector ships with RDS Postgres
                # 15.3+ — extension created via DDL by the loader.
            },
        )

        # --- RDS instance ---
        db = rds.DatabaseInstance(
            self,
            "Db",
            engine=rds.DatabaseInstanceEngine.postgres(
                version=rds.PostgresEngineVersion.VER_16_3,
            ),
            instance_type=ec2.InstanceType.of(
                ec2.InstanceClass.BURSTABLE4_GRAVITON,
                ec2.InstanceSize.MICRO,
            ),
            vpc=vpc,
            vpc_subnets=ec2.SubnetSelection(subnet_type=ec2.SubnetType.PUBLIC),
            security_groups=[db_sg],
            credentials=rds.Credentials.from_secret(db_secret),
            database_name="nflcomparables",
            allocated_storage=20,                # GB — free-tier limit
            storage_type=rds.StorageType.GP3,
            multi_az=False,                      # cost — single-AZ for dev
            publicly_accessible=True,            # SG-gated; nothing reaches without an explicit rule
            backup_retention=cdk.Duration.days(7),  # free-tier ≤ 20 days
            deletion_protection=False,           # dev convenience
            removal_policy=cdk.RemovalPolicy.SNAPSHOT,
            parameter_group=param_group,
            auto_minor_version_upgrade=True,
            enable_performance_insights=False,   # cost; revisit if traffic grows
        )

        # --- Engine policy: read DB credentials from the secret ---
        secret_read_policy = iam.ManagedPolicy(
            self,
            "EngineDbSecretReadPolicy",
            description="Read DB connection credentials from Secrets Manager",
            statements=[
                iam.PolicyStatement(
                    effect=iam.Effect.ALLOW,
                    actions=[
                        "secretsmanager:GetSecretValue",
                        "secretsmanager:DescribeSecret",
                    ],
                    resources=[db_secret.secret_arn],
                ),
            ],
        )

        # Expose for cross-stack consumption. NflComparablesKb co-locates
        # an Aurora SV2 cluster in this VPC (Bedrock KB requires a cluster
        # ARN, not an instance ARN — two-tier storage right-sized per
        # workload).
        self.vpc = vpc
        self.db_instance = db
        self.db_secret = db_secret
        self.db_security_group = db_sg
        self.database_name = "nflcomparables"

        # --- outputs ---
        cdk.CfnOutput(self, "DbEndpoint", value=db.db_instance_endpoint_address)
        cdk.CfnOutput(self, "DbPort", value=db.db_instance_endpoint_port)
        cdk.CfnOutput(self, "DbName", value="nflcomparables")
        cdk.CfnOutput(self, "DbSecretArn", value=db_secret.secret_arn)
        cdk.CfnOutput(self, "DbSecurityGroupId", value=db_sg.security_group_id)
        cdk.CfnOutput(self, "VpcId", value=vpc.vpc_id)
        cdk.CfnOutput(
            self,
            "EngineDbSecretReadPolicyArn",
            value=secret_read_policy.managed_policy_arn,
        )
