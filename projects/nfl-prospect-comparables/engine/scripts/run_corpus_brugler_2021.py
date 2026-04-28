"""Recover Brugler 2021 from the clutchfans forum image-mirror.

Scrapes the forum for image URLs grouped by position (QB/RB/WR/TE), OCRs each
image via AWS Textract, runs the concatenated text through the existing
brugler split_profiles + match_profiles_to_cohort pipeline, and uploads
matched per-player text to S3.

Cost estimate: 160 skill-position images × $0.0015/page ≈ $0.24.

Run from engine/:
    uv run python scripts/run_corpus_brugler_2021.py
    uv run python scripts/run_corpus_brugler_2021.py --positions QB RB
    uv run python scripts/run_corpus_brugler_2021.py --force
"""

from __future__ import annotations

import argparse
import os
import sys
import time

import boto3
from botocore.exceptions import ClientError
from dotenv import load_dotenv

from engine.corpus import brugler, brugler_clutchfans_2021
from engine.features import runner as feat_runner

load_dotenv()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--positions", nargs="+", default=["QB", "RB", "WR", "TE"])
    ap.add_argument("--force", action="store_true",
                    help="overwrite cached files on S3 (default: skip cached)")
    args = ap.parse_args()

    cur = os.environ["S3_CURATED_BUCKET"]
    s3 = boto3.client("s3")
    textract = boto3.client("textract", region_name="us-east-1")

    cohort = feat_runner.load_cohort(cur, "validation_2021_2025")
    year_2021_skill = [
        p for p in cohort
        if p.draft and p.draft.draft_year == 2021
        and p.position.name in ("QB", "RB", "WR", "TE")
    ]
    print(f"validation cohort 2021 skill players: {len(year_2021_skill)}")

    print("\n=== Scraping forum image URLs ===")
    images_by_pos = brugler_clutchfans_2021.fetch_image_urls()
    for pos in args.positions:
        print(f"  {pos}: {len(images_by_pos.get(pos, []))} images")

    summary: dict[str, dict] = {}
    for pos in args.positions:
        urls = images_by_pos.get(pos, [])
        if not urls:
            continue
        print(f"\n=== {pos} — OCRing {len(urls)} images ===")
        started = time.monotonic()
        text = brugler_clutchfans_2021.ocr_position(urls, textract=textract)
        elapsed = time.monotonic() - started
        print(f"  OCR done: {len(text):,} chars in {elapsed:.0f}s")

        # Pass through existing brugler split + matcher
        profiles = brugler.split_profiles(text)
        n_with_name = sum(1 for bp in profiles if bp.last_name)
        print(f"  parsed: {len(profiles)} profile blocks, {n_with_name} with regex match")

        matched, unmatched = brugler.match_profiles_to_cohort(profiles, cohort, 2021)
        # Filter to this position's draftees only
        pos_cohort = [p for p in year_2021_skill if p.position.name == pos]
        pos_matched = [p for p in pos_cohort if p.player_id in matched]
        print(f"  matched: {len(pos_matched)}/{len(pos_cohort)} {pos} draftees")

        # Upload matched player text
        n_uploaded = 0
        n_cached = 0
        for player_id, bp in matched.items():
            # Filter to this position only — split_profiles is global
            cp = next((p for p in pos_cohort if p.player_id == player_id), None)
            if cp is None:
                continue
            key = f"corpus/brugler/2021/{player_id}.txt"
            if not args.force:
                try:
                    s3.head_object(Bucket=cur, Key=key)
                    n_cached += 1
                    continue
                except ClientError:
                    pass
            header = f"# Brugler 2021 (clutchfans OCR): {bp.summary_first[:200].strip()}\n\n"
            body = (header + bp.full_text + "\n\n" + bp.summary_paragraph).encode("utf-8")
            s3.put_object(Bucket=cur, Key=key, Body=body)
            n_uploaded += 1
        print(f"  uploaded: {n_uploaded} new, {n_cached} cached")
        summary[pos] = {
            "images": len(urls),
            "matched": len(pos_matched),
            "total": len(pos_cohort),
            "uploaded": n_uploaded,
            "cached": n_cached,
        }

    print("\nFinal summary:")
    total_matched = 0
    total_pos = 0
    for pos, s in summary.items():
        print(f"  {pos}: {s['matched']}/{s['total']} matched (uploaded {s['uploaded']}, cached {s['cached']})")
        total_matched += s['matched']
        total_pos += s['total']
    print(f"  TOTAL skill 2021: {total_matched}/{total_pos}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
