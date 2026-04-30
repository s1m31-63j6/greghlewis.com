"""Trigger Bedrock KB ingestion jobs (Brugler + Walter Football).

Bedrock allows only ONE concurrent ingestion job per Knowledge Base, so
this script runs them sequentially and polls each to COMPLETE.

Run from engine/:
    AWS_PROFILE=portfolio uv run python scripts/run_kb_ingestion.py --all
    AWS_PROFILE=portfolio uv run python scripts/run_kb_ingestion.py --source brugler
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


def _ingest(client, kb_id: str, ds_id: str, label: str) -> str:
    r = client.start_ingestion_job(knowledgeBaseId=kb_id, dataSourceId=ds_id)
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


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--all", action="store_true", help="Run both data sources")
    p.add_argument(
        "--source",
        choices=("brugler", "walter_football"),
        help="Run a single data source",
    )
    args = p.parse_args(argv)
    if not (args.all or args.source):
        p.error("Pass --all or --source")

    outs = _resolve_kb_outputs()
    kb_id = outs["KnowledgeBaseId"]
    region = os.environ.get("AWS_REGION", "us-east-1")
    client = boto3.client("bedrock-agent", region_name=region)

    sources = {
        "brugler": outs["BruglerDataSourceId"],
        "walter_football": outs["WalterFootballDataSourceId"],
    }
    targets = list(sources.items()) if args.all else [(args.source, sources[args.source])]
    fails = 0
    for label, ds_id in targets:
        status = _ingest(client, kb_id, ds_id, label)
        if status != "COMPLETE":
            fails += 1
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
