"""Scrape Wikipedia per-player extracts for cohort profiles.

Idempotent: skips players whose extract already exists on the curated bucket.
Polite throttle (default 0.3s between requests). Writes plain text per
player to s3://<curated>/corpus/wikipedia/<player_id>.txt.

Run from engine/:
    uv run python scripts/run_corpus_wikipedia.py
    uv run python scripts/run_corpus_wikipedia.py --cohort training_2014_2020
    uv run python scripts/run_corpus_wikipedia.py --force      # overwrite cache
"""

from __future__ import annotations

import argparse
import os
import sys
import time

import boto3
from botocore.exceptions import ClientError
from dotenv import load_dotenv

from engine.corpus import wikipedia as wiki
from engine.features import runner as feat_runner

load_dotenv()


DEFAULT_COHORTS = ["training_2014_2020", "validation_2021_2025", "prediction_2026"]


def _exists(s3, bucket: str, key: str) -> bool:
    try:
        s3.head_object(Bucket=bucket, Key=key)
        return True
    except ClientError:
        return False


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cohort", action="append", help="cohort name (repeatable)")
    ap.add_argument("--throttle-sec", type=float, default=0.3)
    ap.add_argument("--max-chars", type=int, default=5000)
    ap.add_argument("--force", action="store_true", help="re-scrape even if cached")
    args = ap.parse_args()

    cohorts = args.cohort if args.cohort else DEFAULT_COHORTS
    cur = os.environ["S3_CURATED_BUCKET"]
    s3 = boto3.client("s3")

    summary = {}
    for cohort_name in cohorts:
        profiles = feat_runner.load_cohort(cur, cohort_name)
        n_total = len(profiles)
        n_cached = 0
        n_scraped = 0
        n_missing = 0
        started = time.monotonic()

        print(f"\n=== {cohort_name} ({n_total} profiles) ===")
        for i, p in enumerate(profiles, 1):
            key = f"corpus/wikipedia/{p.player_id}.txt"
            if not args.force and _exists(s3, cur, key):
                n_cached += 1
                continue
            text, title = wiki.fetch_player_text(p, max_chars=args.max_chars)
            if text:
                # Prepend resolved title as a header — useful when the title
                # disambiguator differs from the profile name.
                body = f"# {title}\n\n{text}".encode("utf-8")
                s3.put_object(Bucket=cur, Key=key, Body=body)
                n_scraped += 1
            else:
                n_missing += 1
            time.sleep(args.throttle_sec)

            if i % 25 == 0 or i == n_total:
                elapsed = time.monotonic() - started
                print(
                    f"  [{i}/{n_total}] cached={n_cached} scraped={n_scraped} "
                    f"missing={n_missing}  elapsed {elapsed/60:.1f} min",
                    flush=True,
                )

        summary[cohort_name] = {
            "total": n_total,
            "cached": n_cached,
            "scraped": n_scraped,
            "missing": n_missing,
        }

    print("\nSummary:")
    for name, info in summary.items():
        n = info["total"]
        found = info["cached"] + info["scraped"]
        pct = 100.0 * found / n if n else 0.0
        print(
            f"  {name}: {found}/{n} found ({pct:.1f}%) — "
            f"cached {info['cached']}, scraped {info['scraped']}, missing {info['missing']}"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
