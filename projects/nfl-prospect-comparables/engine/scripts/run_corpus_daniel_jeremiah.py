"""Scrape Daniel Jeremiah Top-N articles → per-player corpus on S3.

Run from engine/:
    AWS_PROFILE=portfolio uv run python scripts/run_corpus_daniel_jeremiah.py
    AWS_PROFILE=portfolio uv run python scripts/run_corpus_daniel_jeremiah.py --top 150

Pass article URLs explicitly to override the defaults (versions roll forward
during the draft cycle):
    --url <url>  (repeatable)
"""

from __future__ import annotations

import argparse
import os
import sys
import time

import boto3
from dotenv import load_dotenv

from engine.corpus import daniel_jeremiah as dj
from engine.features import runner as feat_runner

load_dotenv()


# Defaults known good as of 2026-05-02. Override with --url if NFL.com
# publishes a newer revision.
DEFAULT_URLS = [
    "https://www.nfl.com/news/daniel-jeremiah-s-top-50-2026-nfl-draft-prospect-rankings-4-0",
    "https://www.nfl.com/news/daniel-jeremiah-s-top-150-prospects-in-the-2026-nfl-draft-class",
]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cohort", action="append", default=None,
                    help="cohort to match against (repeatable). Defaults to all 3.")
    ap.add_argument("--url", action="append", help="article URL (repeatable)")
    ap.add_argument("--throttle-sec", type=float, default=1.0)
    args = ap.parse_args()

    # DJ Top-N articles cover the upcoming draft class only — match against
    # the prediction cohort by default to avoid last-name collisions with
    # historical players (e.g. multiple "Tate"/"Love"/"Williams" entries).
    cohorts = args.cohort or ["prediction_2026"]
    urls = args.url or DEFAULT_URLS

    cur = os.environ["S3_CURATED_BUCKET"]
    s3 = boto3.client("s3")
    session = dj.make_session()

    cohort_players = []
    for name in cohorts:
        cohort_players.extend(feat_runner.load_cohort(cur, name))
    index = dj.build_last_name_index(cohort_players)
    print(f"loaded {len(cohort_players)} players across cohorts {cohorts}")

    written = 0
    skipped = 0
    unmatched: list[str] = []
    for url in urls:
        print(f"\nfetching {url}")
        html = dj.fetch_article(url, session)
        rankings = dj.parse_article(html)
        print(f"  parsed {len(rankings)} ranked blurbs")
        for rank, first_word, blurb in rankings:
            matched = dj.match_blurb(first_word, blurb, index)
            if not matched:
                unmatched.append(f"{first_word} (rank {rank})")
                continue
            key = f"corpus/recency/daniel_jeremiah/{matched.player_id}.txt"
            text = dj.render_text(rank, matched.name, blurb)
            s3.put_object(Bucket=cur, Key=key, Body=text.encode("utf-8"))
            written += 1
        time.sleep(args.throttle_sec)

    print(f"\nwrote {written} files; {skipped} cached")
    if unmatched:
        print(f"unmatched ({len(unmatched)}):")
        for n in unmatched[:20]:
            print(f"  - {n}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
