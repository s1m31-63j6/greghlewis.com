"""Phase 3.3 — extract pre-draft expert comp mentions per cohort prospect.

Walks the Brugler corpus already in S3 (extracts comp mentions via regex
patterns) and re-fetches Walter Football scouting reports (extracts the
"Player Comparison" section). Writes per-player JSON to:
    s3://<curated>/corpus/expert_comps/<player_id>.json

Run from engine/:
    uv run python scripts/run_corpus_expert_comps.py
    uv run python scripts/run_corpus_expert_comps.py --dry-run
    uv run python scripts/run_corpus_expert_comps.py --skip-walter
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time

import boto3
from dotenv import load_dotenv

from engine.corpus import expert_comps as ec
from engine.corpus import walter_football as wf
from engine.features import runner as feat_runner
from engine.io import s3 as s3io

load_dotenv()


COHORTS = ("training_2014_2020", "validation_2021_2025", "prediction_2026")


def _read_brugler_text(s3, bucket: str, year: int, player_id: str) -> str | None:
    try:
        body = s3.get_object(
            Bucket=bucket, Key=f"corpus/brugler/{year}/{player_id}.txt"
        )["Body"].read().decode("utf-8")
        return body
    except Exception:
        return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="don't write to S3")
    ap.add_argument("--skip-walter", action="store_true", help="only extract from Brugler text")
    ap.add_argument("--skip-brugler", action="store_true", help="only re-fetch Walter Football pages")
    ap.add_argument("--throttle", type=float, default=0.3, help="seconds between WF page fetches")
    args = ap.parse_args()

    cur = os.environ["S3_CURATED_BUCKET"]
    s3 = boto3.client("s3")
    session = wf.make_session()

    # Load cohorts
    profiles_by_cohort = {c: feat_runner.load_cohort(cur, c) for c in COHORTS}
    all_profiles = [p for ps in profiles_by_cohort.values() for p in ps]
    total = len(all_profiles)
    print(f"loaded {total} profiles across {len(COHORTS)} cohorts")

    # Pre-build the WF slug index so we know which players have a WF page
    wf_index_by_pid: dict[str, str] = {}
    if not args.skip_walter:
        print("fetching Walter Football archive…")
        wf_entries = wf.fetch_archive(session)
        wf_slug_idx = wf.build_cohort_slug_index(all_profiles)
        for entry in wf_entries:
            cp = wf.match_entry_to_cohort(entry, wf_slug_idx)
            if cp is not None:
                wf_index_by_pid[cp.player_id] = entry.url
        print(f"  matched {len(wf_index_by_pid)} cohort players to WF reports")

    n_brugler = 0
    n_walter = 0
    n_either = 0
    n_neither = 0
    started = time.monotonic()

    for i, p in enumerate(all_profiles, 1):
        comps_record: dict = {"brugler": [], "walter_football": []}

        # Brugler — read existing S3 text
        if not args.skip_brugler and p.draft and p.draft.draft_year:
            text = _read_brugler_text(s3, cur, p.draft.draft_year, p.player_id)
            if text:
                comps_record["brugler"] = ec.extract_brugler_comps(text)

        # Walter Football — re-fetch the page and extract comp section
        if not args.skip_walter and p.player_id in wf_index_by_pid:
            try:
                section, names = ec.fetch_walter_comp(
                    wf_index_by_pid[p.player_id], session
                )
            except Exception as e:
                print(f"  WF fetch error {p.name}: {e}")
                section, names = None, []
            comps_record["walter_football"] = names
            if section:
                comps_record["walter_football_prose"] = section
            time.sleep(args.throttle)

        has_b = bool(comps_record["brugler"])
        has_w = bool(comps_record["walter_football"])
        if has_b:
            n_brugler += 1
        if has_w:
            n_walter += 1
        if has_b or has_w:
            n_either += 1
        else:
            n_neither += 1

        if not args.dry_run and (has_b or has_w):
            key = f"corpus/expert_comps/{p.player_id}.json"
            s3io._client().put_object(
                Bucket=cur,
                Key=key,
                Body=json.dumps(comps_record, indent=2).encode("utf-8"),
                ContentType="application/json",
            )

        if i % 50 == 0 or i == total:
            elapsed = time.monotonic() - started
            print(
                f"  [{i}/{total}] brugler={n_brugler} walter={n_walter} "
                f"either={n_either} neither={n_neither}  "
                f"elapsed {elapsed/60:.1f} min",
                flush=True,
            )

    print(
        f"\n=== expert_comps ingest summary ===\n"
        f"  brugler comps:  {n_brugler}\n"
        f"  walter comps:   {n_walter}\n"
        f"  either:         {n_either}\n"
        f"  neither:        {n_neither}"
    )
    if not args.dry_run:
        print(f"  → s3://{cur}/corpus/expert_comps/<player_id>.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
