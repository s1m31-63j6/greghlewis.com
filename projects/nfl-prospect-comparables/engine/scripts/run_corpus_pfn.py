"""Scrape Pro Football Network prospect profiles → per-player corpus on S3.

Run from engine/:
    AWS_PROFILE=portfolio uv run python scripts/run_corpus_pfn.py
    AWS_PROFILE=portfolio uv run python scripts/run_corpus_pfn.py --cohort prediction_2026
"""

from __future__ import annotations

import argparse
import os
import sys
import time

import boto3
from botocore.exceptions import ClientError
from dotenv import load_dotenv

from engine.corpus import profootballnetwork as pfn
from engine.features import runner as feat_runner

load_dotenv()


DEFAULT_COHORTS = ["prediction_2026"]


def _exists(s3, bucket: str, key: str) -> bool:
    try:
        s3.head_object(Bucket=bucket, Key=key)
        return True
    except ClientError:
        return False


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cohort", action="append", default=None)
    ap.add_argument("--throttle-sec", type=float, default=1.5)
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    cohorts = args.cohort or DEFAULT_COHORTS
    cur = os.environ["S3_CURATED_BUCKET"]
    s3 = boto3.client("s3")
    session = pfn.make_session()

    summary = {}
    for cname in cohorts:
        profiles = feat_runner.load_cohort(cur, cname)
        cached = scraped = missing = 0
        started = time.monotonic()
        print(f"\n=== {cname} ({len(profiles)} profiles) ===")
        for i, p in enumerate(profiles, 1):
            key = f"corpus/recency/pfn/{p.player_id}.txt"
            if not args.force and _exists(s3, cur, key):
                cached += 1
                continue
            page = pfn.fetch_for_profile(p, session)
            if page:
                body = f"# {p.name} — Pro Football Network\n\n{page.text}".encode("utf-8")
                s3.put_object(Bucket=cur, Key=key, Body=body)
                scraped += 1
            else:
                missing += 1
            time.sleep(args.throttle_sec)
            if i % 25 == 0 or i == len(profiles):
                elapsed = time.monotonic() - started
                print(
                    f"  [{i}/{len(profiles)}] cached={cached} scraped={scraped} "
                    f"missing={missing}  {elapsed/60:.1f} min",
                    flush=True,
                )
        summary[cname] = (cached, scraped, missing, len(profiles))

    print("\nSummary:")
    for name, (c, s_, m, n) in summary.items():
        found = c + s_
        pct = 100.0 * found / n if n else 0.0
        print(f"  {name}: {found}/{n} found ({pct:.1f}%) — cached {c}, scraped {s_}, missing {m}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
