"""CDK app entry — instantiates stacks for the portfolio account."""
import os

import aws_cdk as cdk

from stacks.nfl_comparables_data import DataStack
from stacks.nfl_comparables_db import DbStack
from stacks.nfl_comparables_hosting import HostingStack
from stacks.nfl_comparables_kb import KbStack
from stacks.nfl_comparables_kb_db import KbDbStack

app = cdk.App()

env = cdk.Environment(
    account=os.environ.get("CDK_DEFAULT_ACCOUNT", "397483229232"),
    region=os.environ.get("CDK_DEFAULT_REGION", "us-east-1"),
)

data_stack = DataStack(
    app,
    "NflComparablesData",
    env=env,
    description="Raw + curated S3 buckets and IAM policy for the NFL comparables engine",
)

db_stack = DbStack(
    app,
    "NflComparablesDb",
    env=env,
    description="RDS Postgres + pgvector for kNN comp queries",
)

# NflComparablesKbDb provisions the Aurora SV2 cluster (Bedrock KB requires
# a cluster ARN, not the RDS micro). Co-located in the DbStack VPC. The
# RDS micro stays as-is for the comp-engine kNN — two-tier storage,
# right-sized per workload.
kb_db_stack = KbDbStack(
    app,
    "NflComparablesKbDb",
    env=env,
    description="Aurora Serverless v2 + pgvector for the Bedrock Knowledge Base",
    vpc=db_stack.vpc,
)
kb_db_stack.add_dependency(db_stack)

# NflComparablesKb is deployed AFTER schema bootstrap on Aurora — Bedrock KB
# validates that the target table exists at create time.
kb_stack = KbStack(
    app,
    "NflComparablesKb",
    env=env,
    description="Bedrock Knowledge Base — RAG over pre-draft scouting corpus",
    curated_bucket=data_stack.curated_bucket,
    aurora_cluster=kb_db_stack.aurora_cluster,
    aurora_secret=kb_db_stack.aurora_secret,
    database_name=kb_db_stack.database_name,
)
kb_stack.add_dependency(kb_db_stack)

# NflComparablesHosting wires the Amplify SSR runtime to call Bedrock.
# The Amplify app itself was created via the console; this stack just
# manages its compute role + environment variables. The KB id is read
# from the KbStack output to avoid drift if the KB ever gets re-created.
hosting_stack = HostingStack(
    app,
    "NflComparablesHosting",
    env=env,
    description=(
        "Amplify SSR compute role + environment variables for "
        "greghlewis.com (chat API access to Bedrock)"
    ),
    app_id="dhpo309lbx6w7",
    kb_id="XQVEIGOLBO",
    account=env.account,
)
hosting_stack.add_dependency(kb_stack)

app.synth()
