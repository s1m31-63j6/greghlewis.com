"""Scrape Rotoworld / NBC Sports prospect rankings (Connor Rogers).

Run from engine/:
    AWS_PROFILE=portfolio uv run python scripts/run_corpus_rotoworld.py
"""

from __future__ import annotations

import argparse
import os
import sys
import time

import boto3
from dotenv import load_dotenv

from engine.corpus import rotoworld as rw
from engine.features import runner as feat_runner

load_dotenv()


# Connor Rogers's most comprehensive single article. Position-specific
# rankings can be added via --url if/when desired.
DEFAULT_URLS = [
    "https://www.nbcsports.com/nfl/news/2026-nfl-draft-big-board-connor-rogers-top-335-prospect-rankings",
    "https://www.nbcsports.com/nfl/news/2026-nfl-draft-qb-rankings-fernando-mendoza-ty-simpson-lead-top-heavy-group-of-prospects",
]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cohort", action="append", default=None)
    ap.add_argument("--url", action="append", help="article URL (repeatable)")
    ap.add_argument("--throttle-sec", type=float, default=1.0)
    args = ap.parse_args()

    # Connor Rogers's articles cover the upcoming draft class only.
    cohorts = args.cohort or ["prediction_2026"]
    urls = args.url or DEFAULT_URLS

    cur = os.environ["S3_CURATED_BUCKET"]
    s3 = boto3.client("s3")
    session = rw.make_session()

    cohort_players = []
    for name in cohorts:
        cohort_players.extend(feat_runner.load_cohort(cur, name))
    index = rw.build_match_index(cohort_players)
    print(f"loaded {len(cohort_players)} players across {cohorts}")

    written = 0
    unmatched: list[str] = []
    for url in urls:
        print(f"\nfetching {url}")
        html = rw.fetch_article(url, session)
        entries = rw.parse_article(html)
        print(f"  parsed {len(entries)} entries")
        for entry in entries:
            matched = rw.match_entry(entry, index)
            if not matched:
                unmatched.append(entry.name)
                continue
            key = f"corpus/recency/rotoworld/{matched.player_id}.txt"
            text = rw.render_text(entry)
            s3.put_object(Bucket=cur, Key=key, Body=text.encode("utf-8"))
            written += 1
        time.sleep(args.throttle_sec)

    print(f"\nwrote {written} files")
    if unmatched:
        print(f"unmatched ({len(unmatched)}):")
        for n in unmatched[:20]:
            print(f"  - {n}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
