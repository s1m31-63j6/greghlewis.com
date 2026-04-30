"""Bootstrap the Bedrock-KB chunks table on the Aurora SV2 cluster.

Uses the RDS Data API (HTTPS) so no SG ingress is required and Aurora's
min-ACU=0 auto-pause is handled gracefully (first statement retries
through cluster resume).

Run from engine/ AFTER `cdk deploy NflComparablesKbDb`:
    AWS_PROFILE=portfolio uv run python scripts/db_bootstrap_kb_aurora.py

Sequence:
  1. cdk deploy NflComparablesKbDb            (Aurora cluster, ~6 min)
  2. python scripts/db_bootstrap_kb_aurora.py    (this script — Data API)
  3. cdk deploy NflComparablesKb              (Bedrock KB + data sources)
"""

from __future__ import annotations

import os
import sys

import boto3
from dotenv import load_dotenv

from engine.db import schema as db_schema

load_dotenv()


KB_DB_STACK = "NflComparablesKbDb"


def _resolve_kb_db_outputs() -> dict[str, str]:
    region = os.environ.get("AWS_REGION", "us-east-1")
    cfn = boto3.client("cloudformation", region_name=region)
    outs = cfn.describe_stacks(StackName=KB_DB_STACK)["Stacks"][0]["Outputs"]
    return {o["OutputKey"]: o["OutputValue"] for o in outs}


def main() -> int:
    print(f"[1/2] resolving {KB_DB_STACK} outputs...")
    outs = _resolve_kb_db_outputs()
    cluster_arn = outs["AuroraClusterArn"]
    secret_arn = outs["AuroraSecretArn"]
    database_name = outs["AuroraDatabaseName"]
    print(f"      cluster: {cluster_arn.split(':')[-1]}")
    print(f"      dbname:  {database_name}")

    region = os.environ.get("AWS_REGION", "us-east-1")
    print("[2/2] bootstrapping Bedrock-KB schema via RDS Data API...")
    db_schema.bootstrap_kb_schema_data_api(
        cluster_arn=cluster_arn,
        secret_arn=secret_arn,
        database_name=database_name,
        region=region,
    )
    print("      ✓ vector extension + bedrock_kb_chunks + hnsw + GIN indexes ready")
    print("\nNext: cdk deploy NflComparablesKb (creates KB + data sources)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
