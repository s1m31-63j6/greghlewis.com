"""Scrape CBS Sports big-board articles → per-player corpus on S3.

Targets Mike Renner's Top 250 and other CBS big-board / position-ranking
articles that render server-side (NOT the per-pick mock drafts, which are
client-rendered).
"""

from __future__ import annotations

import argparse
import os
import sys
import time

import boto3
from dotenv import load_dotenv

from engine.corpus import cbs_sports as cbs
from engine.features import runner as feat_runner

load_dotenv()


# (source_label, article_url) — source_label sets the S3 prefix and
# becomes the sidecar `source` attribute.
DEFAULT_TARGETS: list[tuple[str, str]] = [
    ("cbs_renner",
     "https://www.cbssports.com/nfl/draft/news/mike-renner-2026-nfl-draft-top-250-prospect-rankings-final/"),
    ("cbs_renner",
     "https://www.cbssports.com/nfl/draft/news/renners-2026-nfl-draft-big-board-top-150-prospects/"),
]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cohort", action="append", default=None)
    ap.add_argument("--source", help="source label for --url targets")
    ap.add_argument("--url", action="append", help="article URL (repeatable)")
    ap.add_argument("--throttle-sec", type=float, default=2.0)
    args = ap.parse_args()

    cohorts = args.cohort or ["prediction_2026"]
    if args.url:
        if not args.source:
            ap.error("--source is required when passing --url")
        targets = [(args.source, u) for u in args.url]
    else:
        targets = DEFAULT_TARGETS

    cur = os.environ["S3_CURATED_BUCKET"]
    s3 = boto3.client("s3")
    session = cbs.make_session()

    cohort_players = []
    for name in cohorts:
        cohort_players.extend(feat_runner.load_cohort(cur, name))
    index = cbs.build_match_index(cohort_players)
    print(f"loaded {len(cohort_players)} players across {cohorts}")

    summary: dict[str, int] = {}
    for source, url in targets:
        print(f"\n[{source}] {url}")
        try:
            html = cbs.fetch_article(url, session)
        except Exception as e:
            print(f"  ERROR: {e}")
            continue
        entries = cbs.parse_article(html)
        print(f"  parsed {len(entries)} entries")
        slug = cbs.url_slug(url)
        written = 0
        unmatched: list[str] = []
        for e in entries:
            matched = cbs.match_entry(e, index)
            if not matched:
                unmatched.append(e.name)
                continue
            key = f"corpus/recency/{source}/{matched.player_id}__{slug}.txt"
            text = cbs.render_text(source, url, e)
            s3.put_object(Bucket=cur, Key=key, Body=text.encode("utf-8"))
            written += 1
        summary[source] = summary.get(source, 0) + written
        print(f"  wrote {written}, unmatched {len(unmatched)}")
        time.sleep(args.throttle_sec)

    print("\nSummary:")
    for src, n in sorted(summary.items()):
        print(f"  {src}: {n}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
