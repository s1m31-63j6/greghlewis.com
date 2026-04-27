"""Data layer for the NFL comparables engine.

Provisions two private S3 buckets (raw + curated) and a managed IAM policy
that future compute (Lambda, ECS, Glue) will attach to for read/write access.
"""

import aws_cdk as cdk
from aws_cdk import (
    aws_iam as iam,
    aws_s3 as s3,
)
from constructs import Construct


class DataStack(cdk.Stack):
    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        raw_bucket = s3.Bucket(
            self,
            "RawBucket",
            encryption=s3.BucketEncryption.S3_MANAGED,
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            enforce_ssl=True,
            versioned=True,
            removal_policy=cdk.RemovalPolicy.RETAIN,
        )

        curated_bucket = s3.Bucket(
            self,
            "CuratedBucket",
            encryption=s3.BucketEncryption.S3_MANAGED,
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            enforce_ssl=True,
            versioned=True,
            removal_policy=cdk.RemovalPolicy.RETAIN,
        )

        engine_policy = iam.ManagedPolicy(
            self,
            "EngineDataAccessPolicy",
            description="Read/write access to the raw and curated data buckets",
            statements=[
                iam.PolicyStatement(
                    effect=iam.Effect.ALLOW,
                    actions=["s3:ListBucket", "s3:GetBucketLocation"],
                    resources=[raw_bucket.bucket_arn, curated_bucket.bucket_arn],
                ),
                iam.PolicyStatement(
                    effect=iam.Effect.ALLOW,
                    actions=[
                        "s3:GetObject",
                        "s3:PutObject",
                        "s3:DeleteObject",
                    ],
                    resources=[
                        f"{raw_bucket.bucket_arn}/*",
                        f"{curated_bucket.bucket_arn}/*",
                    ],
                ),
            ],
        )

        cdk.CfnOutput(self, "RawBucketName", value=raw_bucket.bucket_name)
        cdk.CfnOutput(self, "CuratedBucketName", value=curated_bucket.bucket_name)
        cdk.CfnOutput(self, "EnginePolicyArn", value=engine_policy.managed_policy_arn)
