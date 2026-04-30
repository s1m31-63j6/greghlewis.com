"""Bedrock Knowledge Base for NFL prospect scouting RAG.

Architecture (two-tier storage, right-sized per workload):
  - Comp engine kNN (~10k cohort vectors): RDS t4g.micro Postgres + pgvector
    (NflComparablesDb stack, separate, untouched).
  - Bedrock-managed RAG (~3.5k chunks): Aurora Serverless v2 PostgreSQL
    cluster with min ACU=0 (NflComparablesKbDb stack — separate because
    the schema must exist BEFORE this stack's KB resource is created, so
    the bootstrap script runs between the two `cdk deploy` calls).

Deploy order:
  1. cdk deploy NflComparablesKbDb           (Aurora, ~6 min)
  2. python scripts/db_bootstrap_kb_aurora.py    (vector extension + table)
  3. cdk deploy NflComparablesKb             (this stack, ~1 min)

This is the methodology-page right-sizing story extended to the RAG layer:
RDS micro for kNN at $12/mo -> Aurora SV2 for managed RAG at $5-10/mo idle
-> OpenSearch SV at 1M+ chunks.
"""

from __future__ import annotations

import aws_cdk as cdk
from aws_cdk import (
    aws_bedrock as bedrock,
    aws_iam as iam,
    aws_rds as rds,
    aws_s3 as s3,
    aws_secretsmanager as secretsmanager,
)
from constructs import Construct


# Titan v2 — fixed 1024-dim, matches the comp engine's hybrid text channel.
TITAN_V2_MODEL_ARN_FMT = (
    "arn:aws:bedrock:{region}::foundation-model/amazon.titan-embed-text-v2:0"
)

KB_TABLE = "public.bedrock_kb_chunks"


class KbStack(cdk.Stack):
    def __init__(
        self,
        scope: Construct,
        construct_id: str,
        *,
        curated_bucket: s3.IBucket,
        aurora_cluster: rds.IDatabaseCluster,
        aurora_secret: secretsmanager.ISecret,
        database_name: str,
        **kwargs,
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)

        region = self.region
        titan_model_arn = TITAN_V2_MODEL_ARN_FMT.format(region=region)

        # ---------- KB execution role ----------
        kb_role = iam.Role(
            self,
            "KbExecutionRole",
            assumed_by=iam.ServicePrincipal(
                "bedrock.amazonaws.com",
                conditions={
                    "StringEquals": {"aws:SourceAccount": self.account},
                    "ArnLike": {
                        "aws:SourceArn": (
                            f"arn:aws:bedrock:{region}:{self.account}:knowledge-base/*"
                        )
                    },
                },
            ),
            description="Execution role for the NFL Comparables Bedrock Knowledge Base",
        )

        # Explicit Policy (not add_to_policy → DefaultPolicy) so we can pin
        # `kb.node.add_dependency(kb_policy)` below. Without that dependency
        # Bedrock starts validating the cluster (rds:DescribeDBClusters)
        # before the policy attaches and fails 403.
        kb_policy = iam.Policy(
            self,
            "KbExecutionPolicy",
            roles=[kb_role],
            statements=[
                # Embedding model
                iam.PolicyStatement(
                    effect=iam.Effect.ALLOW,
                    actions=["bedrock:InvokeModel"],
                    resources=[titan_model_arn],
                ),
                # Scouting corpus on S3 — only Brugler + Walter Football
                # prefixes. Wikipedia is NOT exposed.
                iam.PolicyStatement(
                    effect=iam.Effect.ALLOW,
                    actions=["s3:GetObject"],
                    resources=[
                        f"{curated_bucket.bucket_arn}/corpus/brugler/*",
                        f"{curated_bucket.bucket_arn}/corpus/walter_football/*",
                    ],
                ),
                iam.PolicyStatement(
                    effect=iam.Effect.ALLOW,
                    actions=["s3:ListBucket"],
                    resources=[curated_bucket.bucket_arn],
                    conditions={
                        "StringLike": {
                            "s3:prefix": ["corpus/brugler/*", "corpus/walter_football/*"]
                        }
                    },
                ),
                # Aurora secret
                iam.PolicyStatement(
                    effect=iam.Effect.ALLOW,
                    actions=[
                        "secretsmanager:GetSecretValue",
                        "secretsmanager:DescribeSecret",
                    ],
                    resources=[aurora_secret.secret_arn],
                ),
                # Aurora Data API + cluster introspection
                iam.PolicyStatement(
                    effect=iam.Effect.ALLOW,
                    actions=[
                        "rds-data:ExecuteStatement",
                        "rds-data:BatchExecuteStatement",
                        "rds:DescribeDBClusters",
                    ],
                    resources=[aurora_cluster.cluster_arn],
                ),
            ],
        )

        # ---------- Knowledge Base ----------
        kb = bedrock.CfnKnowledgeBase(
            self,
            "KnowledgeBase",
            name="nfl-comparables-kb",
            description=(
                "Pre-draft scouting corpus for NFL prospect comparables. "
                "Brugler (private, paraphrase-only) + Walter Football."
            ),
            role_arn=kb_role.role_arn,
            knowledge_base_configuration=bedrock.CfnKnowledgeBase.KnowledgeBaseConfigurationProperty(
                type="VECTOR",
                vector_knowledge_base_configuration=bedrock.CfnKnowledgeBase.VectorKnowledgeBaseConfigurationProperty(
                    embedding_model_arn=titan_model_arn,
                    embedding_model_configuration=bedrock.CfnKnowledgeBase.EmbeddingModelConfigurationProperty(
                        bedrock_embedding_model_configuration=bedrock.CfnKnowledgeBase.BedrockEmbeddingModelConfigurationProperty(
                            dimensions=1024,
                            embedding_data_type="FLOAT32",
                        ),
                    ),
                ),
            ),
            storage_configuration=bedrock.CfnKnowledgeBase.StorageConfigurationProperty(
                type="RDS",
                rds_configuration=bedrock.CfnKnowledgeBase.RdsConfigurationProperty(
                    resource_arn=aurora_cluster.cluster_arn,
                    credentials_secret_arn=aurora_secret.secret_arn,
                    database_name=database_name,
                    table_name=KB_TABLE,
                    field_mapping=bedrock.CfnKnowledgeBase.RdsFieldMappingProperty(
                        primary_key_field="id",
                        vector_field="embedding",
                        text_field="chunks",
                        metadata_field="metadata",
                        # Sidecar `.metadata.json` attributes go into this
                        # JSONB column (not separate columns). Lets us add
                        # new attributes without schema migrations.
                        custom_metadata_field="custom_metadata",
                    ),
                ),
            ),
        )
        kb.add_dependency(kb_role.node.default_child)
        # Wait for the inline policy to attach AND for IAM to converge
        # before letting Bedrock validate the cluster.
        kb.node.add_dependency(kb_policy)

        # ---------- Data Source: Brugler ----------
        # Brugler is private + licensed. Sidecar `.metadata.json` files (built
        # by `engine/scripts/build_kb_metadata_sidecars.py`) tag each chunk
        # with source/player_id/draft_year/position so the consumer can
        # filter retrievals.
        brugler_ds = bedrock.CfnDataSource(
            self,
            "BruglerDataSource",
            knowledge_base_id=kb.attr_knowledge_base_id,
            name="brugler",
            description="Brugler 'The Beast' pre-draft scouting profiles (private, paraphrase-only).",
            data_source_configuration=bedrock.CfnDataSource.DataSourceConfigurationProperty(
                type="S3",
                s3_configuration=bedrock.CfnDataSource.S3DataSourceConfigurationProperty(
                    bucket_arn=curated_bucket.bucket_arn,
                    inclusion_prefixes=["corpus/brugler/"],
                ),
            ),
            vector_ingestion_configuration=bedrock.CfnDataSource.VectorIngestionConfigurationProperty(
                chunking_configuration=bedrock.CfnDataSource.ChunkingConfigurationProperty(
                    chunking_strategy="HIERARCHICAL",
                    hierarchical_chunking_configuration=bedrock.CfnDataSource.HierarchicalChunkingConfigurationProperty(
                        level_configurations=[
                            bedrock.CfnDataSource.HierarchicalChunkingLevelConfigurationProperty(
                                max_tokens=1500,  # parent
                            ),
                            bedrock.CfnDataSource.HierarchicalChunkingLevelConfigurationProperty(
                                max_tokens=300,   # leaf
                            ),
                        ],
                        overlap_tokens=60,
                    ),
                ),
            ),
            data_deletion_policy="RETAIN",
        )

        # ---------- Data Source: Walter Football ----------
        walter_ds = bedrock.CfnDataSource(
            self,
            "WalterFootballDataSource",
            knowledge_base_id=kb.attr_knowledge_base_id,
            name="walter_football",
            description="WalterFootball.com pre-draft scouting reports (free, public).",
            data_source_configuration=bedrock.CfnDataSource.DataSourceConfigurationProperty(
                type="S3",
                s3_configuration=bedrock.CfnDataSource.S3DataSourceConfigurationProperty(
                    bucket_arn=curated_bucket.bucket_arn,
                    inclusion_prefixes=["corpus/walter_football/"],
                ),
            ),
            vector_ingestion_configuration=bedrock.CfnDataSource.VectorIngestionConfigurationProperty(
                chunking_configuration=bedrock.CfnDataSource.ChunkingConfigurationProperty(
                    chunking_strategy="HIERARCHICAL",
                    hierarchical_chunking_configuration=bedrock.CfnDataSource.HierarchicalChunkingConfigurationProperty(
                        level_configurations=[
                            bedrock.CfnDataSource.HierarchicalChunkingLevelConfigurationProperty(
                                max_tokens=1500,
                            ),
                            bedrock.CfnDataSource.HierarchicalChunkingLevelConfigurationProperty(
                                max_tokens=300,
                            ),
                        ],
                        overlap_tokens=60,
                    ),
                ),
            ),
            data_deletion_policy="RETAIN",
        )

        # ---------- Outputs ----------
        cdk.CfnOutput(self, "KnowledgeBaseId", value=kb.attr_knowledge_base_id)
        cdk.CfnOutput(self, "KnowledgeBaseArn", value=kb.attr_knowledge_base_arn)
        cdk.CfnOutput(self, "BruglerDataSourceId", value=brugler_ds.attr_data_source_id)
        cdk.CfnOutput(self, "WalterFootballDataSourceId", value=walter_ds.attr_data_source_id)
        cdk.CfnOutput(self, "KbExecutionRoleArn", value=kb_role.role_arn)
