"""Ingest Brugler "The Beast" PDFs from local corpus dir → per-player text on
the curated bucket (private prefix).

LICENSING: Brugler text is private S3 only — never publicly accessible. The
methodology page paraphrases + cites; never quotes >5 consecutive words.
This script lands raw text on a private bucket prefix; embeddings (Phase 2.5)
are what the engine actually exposes.

Auto-routes each year to the right cohort:
  2014-2020 → training_2014_2020
  2021-2025 → validation_2021_2025
  2026      → prediction_2026 (skipped if cohort profiles don't exist yet)

Run from engine/:
    uv run python scripts/run_corpus_brugler.py
    uv run python scripts/run_corpus_brugler.py --year 2024
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path

import boto3
from botocore.exceptions import ClientError
from dotenv import load_dotenv

from engine.corpus import brugler
from engine.features import runner as feat_runner

load_dotenv()


CORPUS_DIR = Path("corpus/brugler/raw")
PDF_PATTERN = re.compile(r"the-beast-(\d{4})\.pdf$")


def cohort_for_year(year: int) -> str | None:
    if 2014 <= year <= 2020:
        return "training_2014_2020"
    if 2021 <= year <= 2025:
        return "validation_2021_2025"
    if year == 2026:
        return "prediction_2026"
    return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--year", type=int, action="append", help="restrict to specific year(s)")
    ap.add_argument("--force", action="store_true", help="overwrite cached files on S3")
    args = ap.parse_args()

    cur = os.environ["S3_CURATED_BUCKET"]
    s3 = boto3.client("s3")

    # Discover PDFs in corpus dir
    pdfs: list[tuple[int, Path]] = []
    if CORPUS_DIR.exists():
        for path in sorted(CORPUS_DIR.glob("the-beast-*.pdf")):
            m = PDF_PATTERN.search(path.name)
            if m:
                year = int(m.group(1))
                if args.year and year not in args.year:
                    continue
                pdfs.append((year, path))

    if not pdfs:
        print(f"No matching PDFs found in {CORPUS_DIR}/")
        return 1

    # Cache loaded cohort profiles to avoid duplicate S3 reads
    cohort_cache: dict[str, list] = {}

    def _load_cohort(name: str):
        if name not in cohort_cache:
            try:
                cohort_cache[name] = feat_runner.load_cohort(cur, name)
            except ClientError:
                cohort_cache[name] = []
        return cohort_cache[name]

    summary: list[dict] = []
    for year, pdf_path in pdfs:
        cohort_name = cohort_for_year(year)
        if cohort_name is None:
            print(f"  skip {year}: out of cohort range")
            continue
        cohort = _load_cohort(cohort_name)
        if not cohort:
            print(f"  skip {year}: cohort {cohort_name!r} not yet built")
            continue

        print(f"\n=== {year} ({pdf_path.name} → {cohort_name}) ===")
        text = brugler.extract_full_text(str(pdf_path))
        profiles = brugler.split_profiles(text)
        matched, unmatched = brugler.match_profiles_to_cohort(profiles, cohort, year)
        cohort_year = [p for p in cohort if p.draft and p.draft.draft_year == year]
        skill = [p for p in cohort_year if p.position.name in ("QB", "RB", "WR", "TE")]
        skill_matched = sum(1 for p in skill if p.player_id in matched)

        # Upload per-player
        n_uploaded = 0
        n_cached = 0
        for player_id, bp in matched.items():
            key = f"corpus/brugler/{year}/{player_id}.txt"
            if not args.force:
                try:
                    s3.head_object(Bucket=cur, Key=key)
                    n_cached += 1
                    continue
                except ClientError:
                    pass
            # Header + full block (stats + measurables + STRENGTHS + WEAKNESSES + SUMMARY)
            header = f"# Brugler {year}: {bp.summary_first[:200].strip()}\n\n"
            body = (header + bp.full_text + "\n\n" + bp.summary_paragraph).encode("utf-8")
            s3.put_object(Bucket=cur, Key=key, Body=body)
            n_uploaded += 1

        print(
            f"  parsed: {len(profiles)} profile blocks, {sum(1 for bp in profiles if bp.last_name)} with regex match"
        )
        print(
            f"  matched: {len(matched)}/{len(cohort_year)} draftees "
            f"(skill: {skill_matched}/{len(skill)})"
        )
        print(f"  uploaded: {n_uploaded} new, {n_cached} cached")

        summary.append({
            "year": year,
            "cohort": cohort_name,
            "matched": len(matched),
            "draftees": len(cohort_year),
            "skill_matched": skill_matched,
            "skill_total": len(skill),
            "uploaded": n_uploaded,
            "cached": n_cached,
        })

    print("\nFinal summary:")
    for s in summary:
        print(
            f"  {s['year']}: {s['matched']}/{s['draftees']} "
            f"(skill: {s['skill_matched']}/{s['skill_total']}); "
            f"uploaded {s['uploaded']}, cached {s['cached']}"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
