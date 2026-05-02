"""Scrape Bleacher Report 2026 prospect articles → per-player corpus.

Run from engine/:
    AWS_PROFILE=portfolio uv run python scripts/run_corpus_bleacher_report.py

By default scrapes a curated set of B/R per-prospect scouting articles and
position-group rankings discovered via search. Pass --url to override.
"""

from __future__ import annotations

import argparse
import os
import sys
import time

import boto3
from dotenv import load_dotenv

from engine.corpus import bleacher_report as br
from engine.features import runner as feat_runner

load_dotenv()


# Curated list discovered via site:bleacherreport.com search 2026-05-02.
# Per-prospect scouting articles (one player each) + B/R position-group
# rankings (many prospects each).
DEFAULT_URLS: list[str] = [
    # Position-group rankings (many-prospect prose)
    "https://bleacherreport.com/articles/25314815-2026-nfl-draft-quarterback-rankings-and-grades",
    "https://bleacherreport.com/articles/25321894-2026-nfl-draft-running-back-rankings-and-grades",
    "https://bleacherreport.com/articles/25329779-2026-nfl-draft-wide-receiver-rankings-and-grades",
    "https://bleacherreport.com/articles/25419331-2026-nfl-draft-big-board-br-nfl-scouting-depts-final-rankings",
    "https://bleacherreport.com/articles/25415148-2026-nfl-draft-big-board-br-nfl-scouting-depts-latest-rankings",
    "https://bleacherreport.com/articles/25420962-final-br-nfl-draft-scouting-department-2026-mock",

    # QBs
    "https://bleacherreport.com/articles/25416854-haynes-king-2026-nfl-draft-scouting-report-carolina-panthers-qb",
    "https://bleacherreport.com/articles/25418673-joey-aguilar-2026-nfl-draft-scouting-report-minnesota-vikings-qb",
    "https://bleacherreport.com/articles/25394396-diego-pavia-2026-nfl-draft-scouting-report-free-agent-qb",
    "https://bleacherreport.com/articles/25308268-cole-payton-nfl-draft-2026-scouting-report-philadelphia-eagles-qb",
    "https://bleacherreport.com/articles/25259988-carson-beck-nfl-draft-2026-scouting-report-arizona-cardinals-qb",
    "https://bleacherreport.com/articles/25250851-taylen-green-nfl-draft-2026-scouting-report-cleveland-browns-qb",
    "https://bleacherreport.com/articles/25414915-athan-kaliakmanis-nfl-draft-2026-scouting-report-washington-commanders-qb",
    "https://bleacherreport.com/articles/25361051-nfl-draft-2026-scouting-report-baylor-qb-sawyer-robertson",

    # RBs
    "https://bleacherreport.com/articles/25327683-kaelon-black-2026-nfl-draft-scouting-report-san-francisco-49ers-rb",
    "https://bleacherreport.com/articles/25263024-leveon-moss-2026-nfl-draft-scouting-report-miami-dolphins-rb",
    "https://bleacherreport.com/articles/25393700-desmond-reid-2026-nfl-draft-scouting-report-buffalo-bills-rb",
    "https://bleacherreport.com/articles/25309126-adam-randall-nfl-draft-2026-scouting-report-baltimore-ravens-rb",
    "https://bleacherreport.com/articles/25409210-eli-heidenreich-nfl-draft-2026-scouting-report-pittsburgh-steelers-rb",
    "https://bleacherreport.com/articles/25409185-demond-claiborne-nfl-draft-2026-scouting-report-minnesota-vikings-rb",
    "https://bleacherreport.com/articles/25294697-emmett-johnson-nfl-draft-2026-scouting-report-kansas-city-chiefs-rb",
    "https://bleacherreport.com/articles/25274674-jonah-coleman-nfl-draft-2026-scouting-report-denver-broncos-rb",
    "https://bleacherreport.com/articles/25248572-nfl-draft-2026-scouting-report-notre-dame-rb-jeremiyah-love",

    # WRs
    "https://bleacherreport.com/articles/25396277-tyren-montgomery-2026-nfl-draft-scouting-report-tennessee-titans-wr",
    "https://bleacherreport.com/articles/25327600-deion-burks-nfl-draft-2026-scouting-report-indianapolis-colts-wr",
    "https://bleacherreport.com/articles/25409175-jeff-caldwell-2026-nfl-draft-scouting-report-kansas-city-chiefs-wr",
    "https://bleacherreport.com/articles/25414560-caullin-lacy-2026-nfl-draft-scouting-report-new-york-jets-wr",
    "https://bleacherreport.com/articles/25417509-zavion-thomas-nfl-draft-2026-scouting-report-chicago-bears-wr",
    "https://bleacherreport.com/articles/25360080-cj-daniels-nfl-draft-2026-scouting-report-los-angeles-rams-wr",
    "https://bleacherreport.com/articles/25387586-cyrus-allen-nfl-draft-2026-scouting-report-kansas-city-chiefs-wr",
    "https://bleacherreport.com/articles/25392392-kaden-wetjen-nfl-draft-2026-scouting-report-pittsburgh-steelers-wr",

    # TEs
    "https://bleacherreport.com/articles/25406557-john-michael-gyllenborg-2026-nfl-draft-scouting-report-kansas-city-chiefs-te",
    "https://bleacherreport.com/articles/25312723-nfl-draft-2026-scouting-report-stanford-te-sam-roush",
    "https://bleacherreport.com/articles/25260928-michael-trigg-2026-nfl-draft-scouting-report-dallas-cowboys-te",
    "https://bleacherreport.com/articles/25397231-daequan-wright-2026-nfl-draft-scouting-report-philadelphia-eagles-te",
    "https://bleacherreport.com/articles/25403306-nfl-draft-2026-scouting-report-utah-te-dallen-bentley",
    "https://bleacherreport.com/articles/25387651-dan-villari-2026-nfl-draft-scouting-report-los-angeles-rams-te",
    "https://bleacherreport.com/articles/25407042-khalil-dinkins-2026-nfl-draft-scouting-report-san-francisco-49ers-te",
    "https://bleacherreport.com/articles/25355455-riley-nowakowski-nfl-draft-2026-scouting-report-pittsburgh-steelers-te",
    "https://bleacherreport.com/articles/25260922-eli-raridon-nfl-draft-2026-scouting-report-new-england-patriots-te",
    "https://bleacherreport.com/articles/25391689-nfl-draft-2026-scouting-report-texas-am-te-nate-boerkircher",
]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cohort", action="append", default=None)
    ap.add_argument("--url", action="append", help="article URL (repeatable)")
    ap.add_argument("--throttle-sec", type=float, default=1.5)
    args = ap.parse_args()

    cohorts = args.cohort or ["prediction_2026"]
    urls = args.url or DEFAULT_URLS

    cur = os.environ["S3_CURATED_BUCKET"]
    s3 = boto3.client("s3")
    session = br.make_session()

    cohort_players = []
    for name in cohorts:
        cohort_players.extend(feat_runner.load_cohort(cur, name))
    print(f"loaded {len(cohort_players)} players across {cohorts}")

    written = 0
    seen_keys: set[str] = set()
    for url in urls:
        try:
            html = br.fetch_article(url, session)
        except Exception as e:
            print(f"  ERROR fetching {url}: {e}")
            continue
        parts = br.parse_article(html)
        hits = br.match_body_parts(parts, cohort_players)
        slug = br.url_slug(url)
        article_written = 0
        for hit in hits:
            key = f"corpus/recency/bleacher_report/{hit.profile.player_id}__{slug}.txt"
            if key in seen_keys:
                idx = 2
                while f"{key}.{idx}" in seen_keys:
                    idx += 1
                key = f"{key}.{idx}"
            seen_keys.add(key)
            text = br.render_text(url, hit)
            s3.put_object(Bucket=cur, Key=key, Body=text.encode("utf-8"))
            article_written += 1
        print(f"  [{slug}] body parts={len(parts)} hits={len(hits)} written={article_written}")
        written += article_written
        time.sleep(args.throttle_sec)

    print(f"\nTotal written: {written}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
