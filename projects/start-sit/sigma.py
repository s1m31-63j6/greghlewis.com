"""sigma.py — how much a stat varies from game to game.

A prop line is a median. Turning it into an expected value needs one more
number: how wide the distribution around that median is, because the market's
lean (over priced shorter than under) moves the mean by a fraction of the
spread, not by a fixed amount. The practitioners who publish market-implied
projections (Vegas Edge Fantasy, Win With Odds) all use a per-stat typical
game-to-game standard deviation for this step; here it is measured rather than
assumed.

For each stat, every 2025 player with 8+ games contributes his mean and his
standard deviation across games. The spread grows with the level — a receiver
averaging 90 yards swings more than one averaging 30 — so it is fit as a line,
`sd = a + b * mean`, weighted by games played, and floored so a tiny line can
never get a spread near zero.

Also written: each player's 2025 per-game averages, which publish.py uses as a
sanity check on the market numbers, and the league's touchdowns per point,
which turns an implied team total into implied touchdowns.

Usage:
    uv run python sigma.py [--force]
"""
from __future__ import annotations

import argparse
import json

import nflreadpy as nfl
import numpy as np
import pandas as pd

from common import HERE

SEASON = 2025
MIN_GAMES = 8
# Below this the fitted slope is noise and a constant spread is used instead.
MIN_R2 = 0.2
POSITIONS = {"QB", "RB", "WR", "TE"}

# stat key -> nflverse column. These are the over/under markets the advisor
# prices; touchdowns are Poisson and need no spread.
STATS = {
    "pass_yds": "passing_yards",
    "pass_tds": "passing_tds",
    "ints": "passing_interceptions",
    "rush_yds": "rushing_yards",
    "rush_att": "carries",
    "rec": "receptions",
    "rec_yds": "receiving_yards",
}

OUT = HERE / "data"


def fit(stats: pd.DataFrame) -> dict:
    out = {}
    for key, col in STATS.items():
        # Only players for whom the stat is part of the job. A receiver's
        # rushing yards are almost always zero and would drag the fit to the
        # origin.
        pos = {"QB"} if key.startswith("pass") or key == "ints" else (
            {"RB", "WR", "TE", "QB"} if key.startswith("rush") else {"RB", "WR", "TE"})
        sub = stats[stats["position"].isin(pos)]
        g = sub.groupby("player_id")[col].agg(["mean", "std", "count"])
        g = g[(g["count"] >= MIN_GAMES) & (g["mean"] > 0)].dropna()
        w = g["count"].to_numpy(float)
        x, y = g["mean"].to_numpy(float), g["std"].to_numpy(float)
        A = np.vstack([np.ones_like(x), x]).T * np.sqrt(w)[:, None]
        a, b = np.linalg.lstsq(A, y * np.sqrt(w), rcond=None)[0]
        pred = a + b * x
        r2 = 1 - ((y - pred) ** 2).sum() / ((y - y.mean()) ** 2).sum()
        # Passing yards is the case that needs this: 37 quarterbacks, and the
        # level explains a tenth of the variance, with a slope that happens to
        # come out negative. When the line does not earn its slope the spread
        # is a constant, the games-weighted mean of the observed spreads.
        if r2 < MIN_R2:
            a, b, r2 = float(np.average(y, weights=w)), 0.0, 0.0
        # The floor is the 10th percentile of observed spreads: a line below
        # anything the fit has seen still gets a plausible spread.
        sd_min = float(np.percentile(y, 10))
        out[key] = {
            "a": round(float(a), 4), "b": round(float(b), 4),
            "n": len(g), "r2": round(float(r2), 3), "sdMin": round(sd_min, 3),
        }
    return out


def sigma_at(fitted: dict, key: str, level: float) -> float:
    f = fitted[key]
    return max(f["sdMin"], f["a"] + f["b"] * max(0.0, level))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()
    if (OUT / "sigma.json").exists() and not args.force:
        print("  data/sigma.json exists; use --force to refit")
        return

    stats = nfl.load_player_stats(seasons=[SEASON]).to_pandas()
    stats = stats[(stats["season_type"] == "REG") & (stats["position"].isin(POSITIONS))]
    fitted = fit(stats)

    # Touchdowns per point, league-wide: offensive touchdowns credited to
    # players over points scored in the same games.
    sched = nfl.load_schedules([SEASON]).to_pandas()
    sched = sched[sched["game_type"] == "REG"].dropna(subset=["home_score"])
    points = float((sched["home_score"] + sched["away_score"]).sum())
    tds = float((stats["rushing_tds"] + stats["receiving_tds"]).sum())
    td_per_point = round(tds / points, 4)

    # Per-game averages for the sanity check in publish.py.
    cols = list(STATS.values()) + ["rushing_tds", "receiving_tds"]
    avg = stats.groupby("player_id")[cols].mean()
    avg["games"] = stats.groupby("player_id").size()
    avg = avg[avg["games"] >= MIN_GAMES]
    season_avg = {
        pid: {**{k: round(float(row[c]), 3) for k, c in STATS.items()},
              "td": round(float(row["rushing_tds"] + row["receiving_tds"]), 3),
              "games": int(row["games"])}
        for pid, row in avg.iterrows()
    }

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "sigma.json").write_text(json.dumps(
        {"season": SEASON, "minGames": MIN_GAMES, "tdPerPoint": td_per_point, "stats": fitted},
        indent=1))
    (OUT / "season_avg.json").write_text(json.dumps(season_avg, separators=(",", ":")))
    for k, f in fitted.items():
        print(f"  {k:9s} sd = {f['a']:6.2f} + {f['b']:.3f}·mean   n={f['n']:3d}  r²={f['r2']:.2f}  floor {f['sdMin']}")
    print(f"  touchdowns per point: {td_per_point}  ({tds:.0f} TDs / {points:.0f} points)")
    print(f"  {len(season_avg)} players with {MIN_GAMES}+ games")
    print("wrote data/sigma.json, data/season_avg.json")


if __name__ == "__main__":
    main()
