"""Trigger Bedrock KB ingestion jobs across all configured data sources.

Bedrock allows only ONE concurrent ingestion job per Knowledge Base, so
this script runs them sequentially and polls each to COMPLETE.

Data sources are auto-discovered from the KB stack outputs (any output key
ending in 'DataSourceId' is treated as an ingestion target). This avoids
having to update this script every time a new source is added — only the
CDK stack and the build_kb_metadata_sidecars.py source handler need
touching.

Run from engine/:
    AWS_PROFILE=portfolio uv run python scripts/run_kb_ingestion.py --all
    AWS_PROFILE=portfolio uv run python scripts/run_kb_ingestion.py --source brugler
    AWS_PROFILE=portfolio uv run python scripts/run_kb_ingestion.py --source wikipedia
"""

from __future__ import annotations

import argparse
import os
import sys
import time

import boto3
from dotenv import load_dotenv

load_dotenv()


KB_STACK = "NflComparablesKb"


def _resolve_kb_outputs() -> dict[str, str]:
    region = os.environ.get("AWS_REGION", "us-east-1")
    cfn = boto3.client("cloudformation", region_name=region)
    outs = cfn.describe_stacks(StackName=KB_STACK)["Stacks"][0]["Outputs"]
    return {o["OutputKey"]: o["OutputValue"] for o in outs}


def _start_with_aurora_resume(client, kb_id: str, ds_id: str, label: str):
    """Start an ingestion job, retrying past Aurora SV2 cold-start.

    The KB is backed by Aurora Serverless v2 with min ACU=0. When the
    cluster is paused, the first call fails with a ValidationException
    saying the DB is "resuming". Retry every ~10s for up to 90s.
    """
    deadline = time.monotonic() + 90
    while True:
        try:
            return client.start_ingestion_job(
                knowledgeBaseId=kb_id, dataSourceId=ds_id
            )
        except Exception as e:
            msg = str(e)
            if "auto-paused" in msg or "resuming" in msg or "is paused" in msg:
                if time.monotonic() < deadline:
                    print(f"{label}: Aurora resuming, retrying in 10s…", flush=True)
                    time.sleep(10)
                    continue
            raise


def _ingest(client, kb_id: str, ds_id: str, label: str) -> str:
    r = _start_with_aurora_resume(client, kb_id, ds_id, label)
    job_id = r["ingestionJob"]["ingestionJobId"]
    print(f"{label}: started job {job_id}", flush=True)
    while True:
        r = client.get_ingestion_job(
            knowledgeBaseId=kb_id, dataSourceId=ds_id, ingestionJobId=job_id
        )
        j = r["ingestionJob"]
        s = j.get("statistics", {}) or {}
        print(
            f"{label}: {j['status']} "
            f"scanned={s.get('numberOfDocumentsScanned')} "
            f"indexed={s.get('numberOfNewDocumentsIndexed')} "
            f"modified={s.get('numberOfModifiedDocumentsIndexed')} "
            f"failed={s.get('numberOfDocumentsFailed')}",
            flush=True,
        )
        if j["status"] in ("COMPLETE", "FAILED", "STOPPED"):
            return j["status"]
        time.sleep(15)


def _discover_sources(outs: dict[str, str]) -> dict[str, str]:
    """Map source label -> data source ID by scanning stack outputs.

    Convention: every CfnOutput named '<Source>DataSourceId' is a source.
    Label is lower-snake (e.g. 'WalterFootballDataSourceId' → 'walter_football').
    """
    import re

    sources: dict[str, str] = {}
    for key, value in outs.items():
        if not key.endswith("DataSourceId"):
            continue
        stem = key[: -len("DataSourceId")]
        # CamelCase → snake_case
        label = re.sub(r"(?<!^)(?=[A-Z])", "_", stem).lower()
        sources[label] = value
    return sources


def main(argv: list[str] | None = None) -> int:
    outs = _resolve_kb_outputs()
    sources = _discover_sources(outs)

    p = argparse.ArgumentParser()
    p.add_argument("--all", action="store_true", help="Run all data sources")
    p.add_argument(
        "--source",
        choices=tuple(sorted(sources.keys())),
        help="Run a single data source",
    )
    args = p.parse_args(argv)
    if not (args.all or args.source):
        p.error("Pass --all or --source")

    kb_id = outs["KnowledgeBaseId"]
    region = os.environ.get("AWS_REGION", "us-east-1")
    client = boto3.client("bedrock-agent", region_name=region)

    targets = (
        sorted(sources.items())
        if args.all
        else [(args.source, sources[args.source])]
    )
    fails = 0
    for label, ds_id in targets:
        status = _ingest(client, kb_id, ds_id, label)
        if status != "COMPLETE":
            fails += 1
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
