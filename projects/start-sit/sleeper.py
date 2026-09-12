"""sleeper.py — the player pool.

Every player the advisor can name comes from Sleeper's players feed: name,
position, team, injury designation, and the ids that reach a headshot. The
pick'em lines are keyed by the same Sleeper id, so this file is the spine and
no name matching is needed for that tier.

Only QB/RB/WR/TE with a current team are kept. Kickers and defenses have no
start/sit question the market can answer at this depth.

Sleeper asks that the players endpoint be called at most once a day; it is
cached and only refetched with --force.

Usage:
    uv run python sleeper.py [--force]
"""
from __future__ import annotations

import argparse
import json

import pandas as pd

from common import HERE, cached_text, norm_name, norm_team

URL = "https://api.sleeper.app/v1/players/nfl"
POSITIONS = {"QB", "RB", "WR", "TE"}
# Past this Sleeper's ordering is filler: practice-squad bodies and players
# with no 2026 role. The picker does not need them and the pool stays honest
# about who could plausibly be started.
MAX_SEARCH_RANK = 1500


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--force", action="store_true")
    blob = cached_text("sleeper-players.json", URL, force=ap.parse_args().force)
    data = json.loads(blob)

    recs = []
    for pid, p in data.items():
        # Sleeper's `position` is the roster listing; `fantasy_positions` is
        # where he scores. A two-way player listed at DB but priced by every
        # book as a receiver belongs in the pool under the fantasy slot.
        pos = p.get("position")
        if pos not in POSITIONS:
            pos = next((x for x in (p.get("fantasy_positions") or []) if x in POSITIONS), None)
        if pos is None:
            continue
        team = norm_team(p.get("team"))
        rank = p.get("search_rank")
        if not team or rank is None or rank > MAX_SEARCH_RANK:
            continue
        name = p.get("full_name") or f"{p.get('first_name', '')} {p.get('last_name', '')}".strip()
        recs.append({
            "sleeper_id": str(pid),
            "name": name,
            "key": norm_name(name),
            "pos": pos,
            "team": team,
            "espn_id": str(p["espn_id"]) if p.get("espn_id") else None,
            "gsis_id": p.get("gsis_id"),
            "search_rank": rank,
            "depth_order": p.get("depth_chart_order"),
            "injury_status": p.get("injury_status"),
            "injury_part": p.get("injury_body_part"),
            "injury_note": p.get("injury_notes"),
            "status": p.get("status"),
        })
    df = pd.DataFrame(recs).drop_duplicates("sleeper_id")
    df.to_parquet(HERE / "data" / "pool.parquet", index=False)
    print(f"  {len(data):,} players in Sleeper's file, {len(df):,} in the pool")
    print(f"  {df['injury_status'].notna().sum():,} carrying an injury designation")
    print("wrote data/pool.parquet")


if __name__ == "__main__":
    main()
