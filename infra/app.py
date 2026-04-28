"""CDK app entry — instantiates stacks for the portfolio account."""
import os

import aws_cdk as cdk

from stacks.nfl_comparables_data import DataStack
from stacks.nfl_comparables_db import DbStack

app = cdk.App()

env = cdk.Environment(
    account=os.environ.get("CDK_DEFAULT_ACCOUNT", "397483229232"),
    region=os.environ.get("CDK_DEFAULT_REGION", "us-east-1"),
)

DataStack(
    app,
    "NflComparablesData",
    env=env,
    description="Raw + curated S3 buckets and IAM policy for the NFL comparables engine",
)

DbStack(
    app,
    "NflComparablesDb",
    env=env,
    description="RDS Postgres + pgvector for kNN comp queries",
)

app.synth()
