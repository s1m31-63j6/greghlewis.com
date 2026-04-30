"""Walter Football pre-draft scouting corpus ingest.

Discovery: walterfootball.com/scoutingreports.php master archive (~1013
reports across 2014-2024). Fetches each, extracts the
Strengths/Weaknesses/Summary block, matches to a cohort player by
(draft_year, slug-from-URL), persists to
s3://<curated>/corpus/walter_football/<player_id>.txt.

Run from engine/:
    uv run python scripts/run_corpus_walter_football.py
    uv run python scripts/run_corpus_walter_football.py --year 2017 --year 2024
    uv run python scripts/run_corpus_walter_football.py --dry-run
"""

from __future__ import annotations

import argparse
import os
import sys
import time

from dotenv import load_dotenv

from engine.corpus import walter_football as wf
from engine.features import runner as feat_runner
from engine.io import s3 as s3io

load_dotenv()


COHORT_BY_YEAR = {
    **{y: "training_2014_2020" for y in range(2014, 2021)},
    **{y: "validation_2021_2025" for y in range(2021, 2026)},
    2026: "prediction_2026",
}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--year", action="append", type=int, help="restrict to year(s) (default: all)")
    ap.add_argument("--dry-run", action="store_true", help="don't write to S3, just report match rates")
    ap.add_argument("--throttle", type=float, default=0.4, help="seconds between page fetches")
    args = ap.parse_args()

    cur = os.environ["S3_CURATED_BUCKET"]
    session = wf.make_session()

    print("fetching Walter Football master archive…")
    entries = wf.fetch_archive(session)
    if args.year:
        years = set(args.year)
        entries = [e for e in entries if e.year in years]
    print(f"  {len(entries)} URL entries")

    # Build a cohort slug index spanning all needed cohorts (cache cohort loads)
    needed_cohorts = {COHORT_BY_YEAR[e.year] for e in entries if e.year in COHORT_BY_YEAR}
    print(f"  loading cohorts: {sorted(needed_cohorts)}")
    all_players = []
    for c in sorted(needed_cohorts):
        all_players.extend(feat_runner.load_cohort(cur, c))
    slug_index = wf.build_cohort_slug_index(all_players)
    print(f"  built slug index: {len(slug_index)} (year, slug) keys across {len(all_players)} players")

    by_year_stats: dict[int, dict[str, int]] = {}

    grand_matched = 0
    grand_unmatched = 0
    grand_empty = 0
    started = time.monotonic()

    for entry in entries:
        cp = wf.match_entry_to_cohort(entry, slug_index)
        ystat = by_year_stats.setdefault(entry.year, {"matched": 0, "unmatched": 0, "empty": 0, "total": 0})
        ystat["total"] += 1
        if cp is None:
            ystat["unmatched"] += 1
            grand_unmatched += 1
            continue
        try:
            text = wf.fetch_scouting_report(entry.url, session)
        except Exception as e:
            ystat["empty"] += 1
            grand_empty += 1
            print(f"  fetch error {cp.name}: {e}")
            continue
        if not text:
            ystat["empty"] += 1
            grand_empty += 1
            continue
        ystat["matched"] += 1
        grand_matched += 1
        if grand_matched % 25 == 1:
            preview = text.replace("\n", " ")[:80]
            print(f"  [{entry.year}] {cp.name:28s} ({len(text):5d} chars) — {preview}…")
        if not args.dry_run:
            key = f"corpus/walter_football/{cp.player_id}.txt"
            s3io._client().put_object(
                Bucket=cur, Key=key, Body=text.encode("utf-8")
            )
        time.sleep(args.throttle)

    print(f"\n=== per-year ===")
    for y in sorted(by_year_stats):
        s = by_year_stats[y]
        print(
            f"  {y}: matched={s['matched']:3d}  unmatched={s['unmatched']:3d}  "
            f"empty={s['empty']:2d}  / total={s['total']:3d}  "
            f"({100 * s['matched'] / s['total']:.0f}% matched)"
        )

    elapsed = time.monotonic() - started
    print(
        f"\n=== Walter Football ingest summary ===\n"
        f"  matched:   {grand_matched}\n"
        f"  unmatched: {grand_unmatched}\n"
        f"  empty:     {grand_empty}\n"
        f"  elapsed:   {elapsed/60:.1f} min"
    )
    if not args.dry_run:
        print(f"  → s3://{cur}/corpus/walter_football/<player_id>.txt")
    return 0


if __name__ == "__main__":
    sys.exit(main())
