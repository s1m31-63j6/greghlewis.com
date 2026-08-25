"""CDK app entry — instantiates stacks for the portfolio account."""
import os

import aws_cdk as cdk

from stacks.nfl_comparables_data import DataStack
from stacks.nfl_comparables_network import NetworkStack
from stacks.nfl_comparables_hosting import HostingStack
from stacks.nfl_comparables_kb import KbStack
from stacks.glass_box_rag import GlassBoxRagStack
from stacks.nfl_comparables_kb_db import KbDbStack
from stacks.site_telemetry import SiteTelemetryStack
from stacks.playbook_data import PlaybookDataStack
from stacks.subscribers import SubscribersStack

app = cdk.App()

# Site telemetry secrets are supplied at synth time rather than committed.
# TELEMETRY_SALT seeds the daily-rotating visitor hash; TELEMETRY_KEY gates
# the /telemetry dashboard. Both are pushed to Amplify as SSR environment
# variables (see HostingStack), and that UpdateApp call REPLACES the app's
# env vars — so synthesising with them unset would silently wipe the live
# values. Fail loudly instead.
TELEMETRY_TABLE = "site-telemetry"
PLAYBOOK_TABLE = "playbook"
SUBSCRIBERS_TABLE = "subscribers"
try:
    TELEMETRY_SALT = os.environ["TELEMETRY_SALT"]
    TELEMETRY_KEY = os.environ["TELEMETRY_KEY"]
except KeyError as missing:
    raise SystemExit(
        f"{missing} is not set. Export TELEMETRY_SALT and TELEMETRY_KEY "
        "before running cdk (see infra/stacks/site_telemetry.py)."
    ) from None

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

# Stack ID stays "NflComparablesDb" even though the Postgres instance it was
# named for is gone: NflComparablesKbDb imports this VPC through cross-stack
# exports that embed the ID. Renaming it replaces the VPC and takes Aurora
# down with it. See the module docstring.
network_stack = NetworkStack(
    app,
    "NflComparablesDb",
    env=env,
    description="Shared VPC for the NFL comparables data tier",
)

# NflComparablesKbDb provisions the Aurora SV2 cluster (Bedrock KB requires
# a cluster ARN). It is the only remaining vector store — the comp-engine
# RDS micro was retired Aug 2026 after 14 days of zero connections.
kb_db_stack = KbDbStack(
    app,
    "NflComparablesKbDb",
    env=env,
    description="Aurora Serverless v2 + pgvector for the Bedrock Knowledge Base",
    vpc=network_stack.vpc,
)
kb_db_stack.add_dependency(network_stack)

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
    telemetry_table=TELEMETRY_TABLE,
    telemetry_salt=TELEMETRY_SALT,
    telemetry_key=TELEMETRY_KEY,
    playbook_table=PLAYBOOK_TABLE,
    subscribers_table=SUBSCRIBERS_TABLE,
)
hosting_stack.add_dependency(kb_stack)

# Glass Box RAG runs its own Lambda rather than the Amplify SSR route, because
# Amplify buffers SSE and cuts the origin at ~30s — see the stack docstring.
GlassBoxRagStack(
    app,
    "GlassBoxRag",
    env=env,
    description=(
        "Glass Box RAG orchestrator Lambda + streaming Function URL "
        "(legal precedent retrieval with a live pipeline trace)"
    ),
    allowed_origins=[
        "https://greghlewis.com",
        "https://www.greghlewis.com",
        "http://localhost:3000",
    ],
)

# SiteTelemetry depends on HostingStack for the SSR compute role it grants
# table access to. The table NAME is a plain constant rather than a CDK
# reference, which is what keeps that dependency one-directional — Hosting
# needs the name for its env vars at the same time.
telemetry_stack = SiteTelemetryStack(
    app,
    "SiteTelemetry",
    env=env,
    description=(
        "DynamoDB table for first-party page/click telemetry on greghlewis.com"
    ),
    table_name=TELEMETRY_TABLE,
    compute_role=hosting_stack.compute_role,
)
telemetry_stack.add_dependency(hosting_stack)

# Playbook storage. Same shape and the same reasoning as SiteTelemetry: a
# fixed table name so the dependency on HostingStack stays one-directional.
playbook_stack = PlaybookDataStack(
    app,
    "PlaybookData",
    env=env,
    description=(
        "DynamoDB table for user-created football playbooks on greghlewis.com"
    ),
    table_name=PLAYBOOK_TABLE,
    compute_role=hosting_stack.compute_role,
)
playbook_stack.add_dependency(hosting_stack)

# Lead capture. Same fixed-name pattern again, and the only table on the site
# holding personal data — see the stack docstring for why it has no TTL.
subscribers_stack = SubscribersStack(
    app,
    "Subscribers",
    env=env,
    description=(
        "DynamoDB table for 'keep me updated' signups on greghlewis.com"
    ),
    table_name=SUBSCRIBERS_TABLE,
    compute_role=hosting_stack.compute_role,
)
subscribers_stack.add_dependency(hosting_stack)

app.synth()
