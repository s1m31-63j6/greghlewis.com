"""adp_sleeper.py — Sleeper's board position.

IMPORTANT, AND SAID PLAINLY EVERYWHERE THIS IS SHOWN: Sleeper publishes no ADP.
Their documented API is players, trending, and drafts; there is no ADP endpoint
and no public way to discover draft ids, so an ADP cannot be computed from it
either.

What Sleeper does publish is `search_rank`, its own ordering of players. Against
FFC's real mock-draft ADP that correlates at Spearman 0.872 over the shared
pool — good enough to show where Sleeper's own product places a player, not good
enough to call ADP. The UI labels this lane "Sleeper rank" for that reason, and
the methodology page explains the difference rather than quietly averaging a
rank into a mean of picks.

Sleeper asks that this endpoint be called at most once a day, so it is cached
aggressively and only refetched with --force.

Usage:
    uv run python adp_sleeper.py [--force]
"""
from __future__ import annotations

import argparse
import json

import pandas as pd

from common import HERE, cached_text, norm_team

URL = "https://api.sleeper.app/v1/players/nfl"

FANTASY = {"QB", "RB", "WR", "TE", "K", "DEF"}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--force", action="store_true")
    blob = cached_text("sleeper-players.json", URL, force=ap.parse_args().force)
    data = json.loads(blob)

    recs = []
    for pid, p in data.items():
        pos = p.get("position")
        if pos not in FANTASY:
            continue
        recs.append({
            "sleeper_id": str(pid),
            "name": p.get("full_name") or f"{p.get('first_name','')} {p.get('last_name','')}".strip(),
            "pos": "DST" if pos == "DEF" else pos,
            "team": norm_team(p.get("team")),
            "sleeper_search_rank": p.get("search_rank"),
            "sleeper_depth_order": p.get("depth_chart_order"),
            "sleeper_injury": p.get("injury_status"),
            "sleeper_injury_part": p.get("injury_body_part"),
            "sleeper_injury_note": p.get("injury_notes"),
            "sleeper_practice": p.get("practice_participation"),
            "sleeper_years_exp": p.get("years_exp"),
            "sleeper_age": p.get("age"),
        })
    df = pd.DataFrame(recs)
    # search_rank is 9999999 for players Sleeper does not surface at all.
    df.loc[df["sleeper_search_rank"] > 10000, "sleeper_search_rank"] = None
    df = df.dropna(subset=["sleeper_search_rank"]).drop_duplicates("sleeper_id")
    df.to_parquet(HERE / "data" / "adp_sleeper.parquet", index=False)
    hurt = df["sleeper_injury"].notna().sum()
    print(f"  {len(data):,} players in Sleeper's file, {len(df):,} ranked fantasy players")
    print(f"  {hurt:,} carrying an injury designation")
    print("wrote data/adp_sleeper.parquet")


if __name__ == "__main__":
    main()
