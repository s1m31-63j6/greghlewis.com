"""schedule.py — which week it is, and when each game kicks off.

nflverse's schedule is the calendar of record here. It also carries a spread
and a total for every game, which is enough to price a team's implied points
without a second odds source, and is the fallback when the sportsbook feed has
no game line.

"Current week" is the week of the next game that has not kicked off yet. On a
Saturday that is the week whose Sunday slate is tomorrow; on a Tuesday it is
the coming week. A Thursday game that has already started does not move the
week on, which is what a start/sit page wants: Sunday's lineup is still open.
"""
from __future__ import annotations

from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

import nflreadpy as nfl
import pandas as pd

from common import norm_team

SEASON = 2026
EASTERN = ZoneInfo("America/New_York")


def load(season: int = SEASON) -> pd.DataFrame:
    df = nfl.load_schedules([season]).to_pandas()
    df = df[df["game_type"] == "REG"].copy()
    df["home"] = df["home_team"].map(norm_team)
    df["away"] = df["away_team"].map(norm_team)
    df["kickoff"] = [
        datetime.fromisoformat(f"{d}T{t}:00").replace(tzinfo=EASTERN).astimezone(UTC)
        for d, t in zip(df["gameday"], df["gametime"])
    ]
    return df


def current_week(df: pd.DataFrame, now: datetime | None = None) -> int:
    now = now or datetime.now(UTC)
    # A game counts as open until it kicks off. The 4h grace is for the feed
    # publishing a score late, not for the lineup decision.
    ahead = df[df["kickoff"] > now - timedelta(hours=4)]
    if ahead.empty:
        return int(df["week"].max())
    return int(ahead["week"].min())


def games_for(df: pd.DataFrame, week: int) -> list[dict]:
    rows = df[df["week"] == week].sort_values("kickoff")
    out = []
    for r in rows.itertuples():
        total = None if pd.isna(r.total_line) else float(r.total_line)
        # nflverse's spread_line is home minus away in points, so a positive
        # number means the home team is favored. The published `spread` uses
        # the betting convention instead: negative means the home team is
        # favored, which is how anyone reading a line sheet expects it.
        sl = None if pd.isna(r.spread_line) else float(r.spread_line)
        out.append({
            "id": r.game_id,
            "week": int(r.week),
            "home": r.home,
            "away": r.away,
            "kickoff": r.kickoff.isoformat().replace("+00:00", "Z"),
            "played": not pd.isna(r.home_score),
            "spread": None if sl is None else -sl,
            "total": total,
            "homeTotal": None if sl is None or total is None else round((total + sl) / 2, 2),
            "awayTotal": None if sl is None or total is None else round((total - sl) / 2, 2),
            "lineSource": "nflverse",
        })
    return out


if __name__ == "__main__":
    df = load()
    wk = current_week(df)
    print(f"season {SEASON}, current week {wk}")
    for g in games_for(df, wk):
        print(f"  {g['id']:22s} {g['kickoff']}  {g['away']}@{g['home']}  "
              f"spread {g['spread']}  total {g['total']}  played={g['played']}")
