"""fetch_sgo.py — sportsbook props from SportsGameOdds, the "Vegas" tier.

One request returns every NFL game with odds available, each game carrying
every player prop from every bookmaker on the plan, and each game counts as
one object against the monthly allowance. A full slate is about 16 objects;
the free plan allows 2,500 a month.

The key comes from the SGO_API_KEY environment variable and is sent as a
header, never in the URL, so it cannot reach a cache filename or a log line.

Exit codes: 0 wrote the file; 78 skipped because the month's allowance is
nearly spent (the workflow treats 78 as "skipped, not failed"); anything else
is an error.

Usage:
    SGO_API_KEY=... uv run python fetch_sgo.py [--force] [--week N]
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import UTC, datetime, timedelta

import httpx

import schedule
from common import HERE, UA, get_with_retry, previous_committed, raw_path

BASE = os.environ.get("SGO_BASE", "https://api.sportsgameodds.com/v2")
USAGE = HERE / "data" / "usage.json"
META_REL = "public/start-sit/meta.json"
# The free plan's monthly allowance, and the point at which a run steps aside
# so the Sunday-morning final, the snapshot that matters, still has budget.
# The feed reports no usage headers, so the count is our own ledger, carried
# in the committed meta.json (see publish.py).
PLAN_OBJECTS = 2500
BUDGET_STOP = int(os.environ.get("SGO_BUDGET_STOP", "2300"))
SLATE_OBJECTS = 20
EXIT_SKIPPED = 78


def redact(msg: str, key: str) -> str:
    return msg.replace(key, "***") if key else msg


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--week", type=int)
    args = ap.parse_args()

    key = os.environ.get("SGO_API_KEY", "")
    sched = schedule.load()
    week = args.week or schedule.current_week(sched)
    name = f"sgo-w{week:02d}.json"
    out = raw_path(name)
    if out.exists() and not args.force:
        print(f"  data/raw/{name} exists; use --force to refetch")
        return
    if not key:
        if os.environ.get("SGO_REQUIRE_KEY"):
            raise SystemExit("SGO_API_KEY is not set")
        print("  SGO_API_KEY not set — skipping the sportsbook tier (set SGO_REQUIRE_KEY=1 to fail instead)")
        return

    prev = previous_committed(META_REL) or {}
    usage_prev = prev.get("usage") or {}
    month = datetime.now(UTC).strftime("%Y-%m")
    if usage_prev.get("month") == month and usage_prev.get("objects", 0) + SLATE_OBJECTS > BUDGET_STOP:
        print(f"::notice::SportsGameOdds ledger at {usage_prev['objects']} of {PLAN_OBJECTS} objects "
              f"this month; skipping the sportsbook fetch to keep budget for the Sunday final.")
        raise SystemExit("budget")

    games = schedule.games_for(sched, week)
    start = min(g["kickoff"] for g in games)
    end = max(g["kickoff"] for g in games)
    starts_after = (datetime.fromisoformat(start) - timedelta(days=1)).isoformat()
    starts_before = (datetime.fromisoformat(end) + timedelta(hours=6)).isoformat()

    events: list[dict] = []
    cursor = None
    headers = {"User-Agent": UA, "x-api-key": key}
    last_headers: dict[str, str] = {}
    try:
        with httpx.Client(timeout=httpx.Timeout(90.0, connect=10.0), headers=headers) as c:
            while True:
                params = {
                    "leagueID": "NFL", "oddsAvailable": "true", "limit": 25,
                    "startsAfter": starts_after, "startsBefore": starts_before,
                }
                if cursor:
                    params["cursor"] = cursor
                r = get_with_retry(c, f"{BASE}/events", params=params)
                body = r.json()
                last_headers = dict(r.headers)
                events.extend(body.get("data", []))
                cursor = body.get("nextCursor")
                if not cursor:
                    break
    except httpx.HTTPStatusError as e:
        raise SystemExit(redact(f"SportsGameOdds returned {e.response.status_code}: {e.response.text[:300]}", key))
    except RuntimeError as e:
        raise SystemExit(redact(str(e), key))

    out.write_text(json.dumps({"week": week, "fetchedAt": datetime.now(UTC).isoformat(),
                               "events": events}, separators=(",", ":")))
    raw_path(f"{name}.headers.json").write_text(json.dumps(last_headers))

    # The allowance is reported in response headers when the plan exposes it;
    # keep whatever came back so meta.json can show it.
    usage = {k.lower(): v for k, v in last_headers.items() if "limit" in k.lower() or "remain" in k.lower() or "usage" in k.lower()}
    usage.update({"week": week, "events": len(events), "at": datetime.now(UTC).isoformat()})
    USAGE.parent.mkdir(parents=True, exist_ok=True)
    USAGE.write_text(json.dumps(usage, indent=1))
    print(f"  week {week}: {len(events)} events with odds, {out.stat().st_size / 1024:.0f} KB")
    print(f"  usage headers: {usage}")
    print(f"wrote data/raw/{name}")


if __name__ == "__main__":
    try:
        main()
    except SystemExit as e:
        if e.code == "budget":
            sys.exit(EXIT_SKIPPED)
        raise
