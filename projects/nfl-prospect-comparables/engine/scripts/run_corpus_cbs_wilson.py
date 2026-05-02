"""Scrape Ryan Wilson's CBS big-board articles via paragraph scan.

Wilson's articles don't use the H2 ranked-heading layout Renner uses —
his prospect commentary is in long prose paragraphs interleaved with
short "Name, POS, School" listing rows. The paragraph-scan approach
(reused from `engine.corpus.nfl_com`) attaches each long paragraph to
the first cohort prospect whose last name appears in it.

Source label = `cbs_wilson`. Sidecar metadata distinguishes Wilson's
chunks from Renner's at retrieval time.
"""

from __future__ import annotations

import argparse
import os
import sys
import time

import boto3
from dotenv import load_dotenv

from engine.corpus import cbs_sports as cbs
from engine.corpus import nfl_com
from engine.features import runner as feat_runner

load_dotenv()


DEFAULT_URLS: list[str] = [
    "https://www.cbssports.com/nfl/draft/news/ryan-wilson-final-big-board-2026-nfl-draft-vs-consensus/",
    "https://www.cbssports.com/nfl/draft/news/wilsons-2026-nfl-draft-big-board-top-125-prospect-rankings/",
]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cohort", action="append", default=None)
    ap.add_argument("--url", action="append")
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
    print(f"loaded {len(cohort_players)} players across {cohorts}")

    written = 0
    seen_keys: set[str] = set()
    for url in urls:
        print(f"\n{url}")
        try:
            html = cbs.fetch_article(url, session)
        except Exception as e:
            print(f"  ERROR: {e}")
            continue
        parts = nfl_com.parse_paragraphs(html)
        hits = nfl_com.match_body_parts(parts, cohort_players)
        slug = cbs.url_slug(url)
        article_written = 0
        for hit in hits:
            key = f"corpus/recency/cbs_wilson/{hit.profile.player_id}__{slug}.txt"
            if key in seen_keys:
                idx = 2
                while f"{key}.{idx}" in seen_keys:
                    idx += 1
                key = f"{key}.{idx}"
            seen_keys.add(key)
            text = nfl_com.render_text("cbs_wilson", url, hit)
            s3.put_object(Bucket=cur, Key=key, Body=text.encode("utf-8"))
            article_written += 1
        print(f"  body parts={len(parts)} hits={len(hits)} written={article_written}")
        written += article_written
        time.sleep(args.throttle_sec)
    print(f"\nTotal written: {written}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
