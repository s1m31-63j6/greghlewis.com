"""Scrape NFL.com columnist articles → per-player corpus on S3.

Generic runner: feed it a list of (source_label, article_url) pairs and
it writes per-prospect chunks under `corpus/recency/<source>/`. Source
labels become the metadata `source` value at retrieval time, so the
chat agent can fan out by columnist.

Run from engine/:
    AWS_PROFILE=portfolio uv run python scripts/run_corpus_nfl_com.py
    AWS_PROFILE=portfolio uv run python scripts/run_corpus_nfl_com.py \\
        --source lance_zierlein --url "https://www.nfl.com/news/..."

Default targets cover Lance Zierlein + Bucky Brooks (DJ already has its
own dedicated runner because it predates this generic one).
"""

from __future__ import annotations

import argparse
import os
import sys
import time

import boto3
from dotenv import load_dotenv

from engine.corpus import nfl_com
from engine.features import runner as feat_runner

load_dotenv()


# (source_label, url). source_label becomes the sidecar `source` attribute
# and the S3 prefix path. Multiple URLs per source are fine.
DEFAULT_TARGETS: list[tuple[str, str]] = [
    # Lance Zierlein — multiple mock-draft revisions and one position-group ranking
    ("lance_zierlein",
     "https://www.nfl.com/news/lance-zierlein-2026-nfl-mock-draft-4-0-jeremiyah-love-cracks-top-3-cowboys-trade-up-for-arvell-reese"),
    ("lance_zierlein",
     "https://www.nfl.com/news/lance-zierlein-2026-nfl-mock-draft-3-0-cowboys-hit-the-jackpot-at-no-12-plus-two-trades"),
    ("lance_zierlein",
     "https://www.nfl.com/news/lance-zierlein-2026-nfl-mock-draft-2-0-two-cbs-in-top-five-combine-star-sonny-styles-cracks-top-10"),
    ("lance_zierlein",
     "https://www.nfl.com/news/ranking-11-position-groups-in-2026-nfl-draft-from-strongest-to-weakest-edge-rusher-linebacker-loaded"),
    # Bucky Brooks — final mock + final position-group rankings
    ("bucky_brooks",
     "https://www.nfl.com/news/bucky-brooks-2026-nfl-mock-draft-4-0-giants-gift-jaxson-dart-top-10-picks-at-running-back-receiver"),
    ("bucky_brooks",
     "https://www.nfl.com/news/bucky-brooks-top-five-2026-nfl-draft-prospects-by-position-3-0-carson-beck-climbs-qb-rankings"),
    # Daniel Jeremiah — Top 150 (different from Top 50 article)
    ("daniel_jeremiah",
     "https://www.nfl.com/news/daniel-jeremiah-s-top-150-prospects-in-the-2026-nfl-draft-class"),
]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cohort", action="append", default=None)
    ap.add_argument(
        "--source",
        help="Source label for --url targets passed on the command line",
    )
    ap.add_argument(
        "--url",
        action="append",
        help="Article URL (repeatable). Requires --source.",
    )
    ap.add_argument("--throttle-sec", type=float, default=1.5)
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
    session = nfl_com.make_session()

    cohort_players = []
    for name in cohorts:
        cohort_players.extend(feat_runner.load_cohort(cur, name))
    print(f"loaded {len(cohort_players)} players across {cohorts}")

    summary: dict[str, int] = {}
    for source, url in targets:
        print(f"\n[{source}] {url}")
        try:
            html = nfl_com.fetch_article(url, session)
        except Exception as e:
            print(f"  ERROR: {e}")
            continue
        parts = nfl_com.parse_article(html)
        hits = nfl_com.match_body_parts(parts, cohort_players)
        print(f"  body parts={len(parts)}  hits={len(hits)}")
        slug = nfl_com.url_slug(url)
        seen_keys: set[str] = set()
        written = 0
        for hit in hits:
            key = f"corpus/recency/{source}/{hit.profile.player_id}__{slug}.txt"
            if key in seen_keys:
                # If a single article references the same prospect in
                # multiple body parts, only the first is kept (others would
                # overwrite). Append a counter to keep additional mentions.
                idx = 2
                while f"{key}.{idx}" in seen_keys:
                    idx += 1
                key = f"{key}.{idx}"
            seen_keys.add(key)
            text = nfl_com.render_text(source, url, hit)
            s3.put_object(Bucket=cur, Key=key, Body=text.encode("utf-8"))
            written += 1
        summary[source] = summary.get(source, 0) + written
        print(f"  wrote {written} files")
        time.sleep(args.throttle_sec)

    print("\nSummary by source:")
    for src, n in sorted(summary.items()):
        print(f"  {src}: {n}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
