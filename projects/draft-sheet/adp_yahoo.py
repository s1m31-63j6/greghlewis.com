"""adp_yahoo.py — Yahoo ADP with no OAuth.

The documented host (`fantasysports.yahooapis.com`) requires OAuth2, and Yahoo's
developer programme currently appears closed to new Fantasy Sports apps. But
`pub-api-ro.fantasysports.yahoo.com` is the read-only host Yahoo's own public
draft-analysis page calls, and it answers a bare game key with no token, no
league key and no cookie.

That is worth stating plainly because it removed the single largest cost item
from this project's original scope. It is also undocumented, so it could vanish
without notice: every caller must tolerate this file being absent and fall back
to the last published snapshot rather than failing the board.

Values arrive as STRINGS, and players with no draft data carry the literal "-"
rather than null — cleaner than ESPN's clamp, since it can simply be filtered.

Attribution is required by Yahoo's developer terms and is carried in meta.json.

Usage:
    uv run python adp_yahoo.py [--force]
"""
from __future__ import annotations

import argparse
import json

import pandas as pd

from common import HERE, cached_text

BASE = (
    "https://pub-api-ro.fantasysports.yahoo.com/fantasy/v2/game/nfl/players"
    ";count={count};start={start};out=draft_analysis?format=json_f"
)

PAGE = 300
PAGES = 6


def num(v: object) -> float | None:
    """Yahoo sends numbers as strings and non-values as the literal '-'."""
    if v is None:
        return None
    s = str(v).strip()
    if not s or s == "-":
        return None
    try:
        return float(s)
    except ValueError:
        return None


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--force", action="store_true")
    force = ap.parse_args().force

    recs: list[dict] = []
    season = game_key = None
    for i in range(PAGES):
        body = cached_text(
            f"yahoo-{i:02d}.json",
            BASE.format(count=PAGE, start=i * PAGE),
            force=force,
        )
        game = json.loads(body)["fantasy_content"]["game"]
        season, game_key = game.get("season"), game.get("game_key")
        players = game.get("players") or []
        if not players:
            break
        for wrap in players:
            p = wrap.get("player") or {}
            da = p.get("draft_analysis") or {}
            recs.append({
                "yahoo_id": str(p.get("player_id")),
                "name": (p.get("name") or {}).get("full"),
                "pos": p.get("display_position"),
                "team_yahoo": p.get("editorial_team_abbr"),
                "bye": num((p.get("bye_weeks") or {}).get("week")),
                "yahoo_adp": num(da.get("average_pick")),
                "yahoo_round": num(da.get("average_round")),
                "yahoo_pct_drafted": num(da.get("percent_drafted")),
                "yahoo_adp_preseason": num(da.get("preseason_average_pick")),
                # Yahoo's own auction leagues: the average winning bid, in the
                # dollars of their default 12-team $200 room. It is a real
                # observed price, not a valuation model.
                "yahoo_cost": num(da.get("average_cost")),
                "yahoo_headshot": (p.get("headshot") or {}).get("url"),
            })

    df = pd.DataFrame(recs).drop_duplicates("yahoo_id")
    df.to_parquet(HERE / "data" / "adp_yahoo.parquet", index=False)

    real = df["yahoo_adp"].notna().sum()
    print(f"  season {season}, game_key {game_key}")
    print(f"  {len(df):,} players, {real:,} with a real average_pick")
    print(f"  deepest ADP: {df['yahoo_adp'].max():.1f}")
    print("\nwrote data/adp_yahoo.parquet")


if __name__ == "__main__":
    main()
