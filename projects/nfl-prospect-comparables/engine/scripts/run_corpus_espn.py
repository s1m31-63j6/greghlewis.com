"""Scrape ESPN big-board articles → per-player corpus on S3.

ESPN's analyst big boards (Matt Miller's 481, Jordan Reid's 499, Mel
Kiper's 150, Scouts Inc.'s 400, Jeff Legwold's 100) all share the same
heading layout as CBS Renner: an `<h2>` per prospect of the form
"1.Fernando Mendoza, QB, Indiana" followed by paragraphs of prose. We
reuse the CBS parser since the format is identical.

The earlier link-density approach (engine.corpus.espn) was too restrictive
and missed the actual ranked content — replaced by this runner.
"""

from __future__ import annotations

import argparse
import os
import sys
import time

import boto3
from dotenv import load_dotenv

# Reuse the CBS parser — ESPN's H2 heading pattern is structurally identical.
from engine.corpus import cbs_sports as cbs
from engine.features import runner as feat_runner

load_dotenv()


# ESPN big-board URLs discovered via site:espn.com search 2026-05-02.
DEFAULT_URLS: list[str] = [
    # Matt Miller — top 481
    "https://www.espn.com/nfl/draft2026/story/_/id/47190881/2026-nfl-draft-rankings-matt-miller-top-prospects-players-positions",
    # Jordan Reid — top 499
    "https://www.espn.com/nfl/draft2026/story/_/id/47027232/2026-nfl-draft-rankings-jordan-reid-top-prospects-players-positions",
    # Scouts Inc. — top 400 with grades
    "https://www.espn.com/nfl/draft2026/story/_/id/48349812/2026-nfl-draft-rankings-top-prospects-scouts-inc-grades",
    # Mel Kiper — top 150
    "https://www.espn.com/nfl/draft2026/story/_/id/46573669/2026-nfl-draft-rankings-mel-kiper-big-board-top-prospects-players-positions",
    # Jeff Legwold — top 100
    "https://www.espn.com/nfl/draft2026/story/_/id/48479903/2026-nfl-draft-jeff-legwold-ranking-top-100-prospects",
]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cohort", action="append", default=None)
    ap.add_argument("--url", action="append", help="article URL (repeatable)")
    ap.add_argument("--throttle-sec", type=float, default=2.0)
    args = ap.parse_args()

    cohorts = args.cohort or ["prediction_2026"]
    urls = args.url or DEFAULT_URLS

    cur = os.environ["S3_CURATED_BUCKET"]
    s3 = boto3.client("s3")
    session = cbs.make_session()

    cohort_players = []
    for name in cohorts:
        cohort_players.extend(feat_runner.load_cohort(cur, name))
    index = cbs.build_match_index(cohort_players)
    print(f"loaded {len(cohort_players)} players across {cohorts}")

    written = 0
    for url in urls:
        print(f"\n{url}")
        try:
            html = cbs.fetch_article(url, session)
        except Exception as e:
            print(f"  ERROR: {e}")
            continue
        entries = cbs.parse_article(html)
        slug = cbs.url_slug(url)
        article_written = 0
        unmatched = 0
        for e in entries:
            matched = cbs.match_entry(e, index)
            if not matched:
                unmatched += 1
                continue
            key = f"corpus/recency/espn/{matched.player_id}__{slug}.txt"
            text = cbs.render_text("espn", url, e)
            s3.put_object(Bucket=cur, Key=key, Body=text.encode("utf-8"))
            article_written += 1
        print(f"  parsed {len(entries)} entries; wrote {article_written}; unmatched {unmatched}")
        written += article_written
        time.sleep(args.throttle_sec)

    print(f"\nTotal written: {written}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
