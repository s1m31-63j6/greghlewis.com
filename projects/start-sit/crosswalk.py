"""crosswalk.py — the player-id spine.

Yahoo, ESPN, Sleeper and FantasyPros each live in their own id space, so
"average ADP across three platforms" is impossible without a crosswalk. Naive
name matching fails on about 15% of the relevant player pool — every suffix
case (`Marvin Harrison Jr.`, `James Cook III`, `Kyle Pitts Sr.`) plus every team
defense — and those failures are silent, which is the worst property a join can
have on a board people draft from.

DynastyProcess publishes `db_playerids.csv` weekly with mfl/sleeper/espn/yahoo/
fantasypros/gsis ids in one row. Note that Sleeper's OWN inline `espn_id` is
null for a lot of stars (Gibbs, Bijan, Chase), so Sleeper cannot be the spine
even though it has the richest metadata.

Usage:
    uv run python crosswalk.py [--force]
"""
from __future__ import annotations

import argparse

import pandas as pd

from common import HERE, cached_text, norm_name

URL = "https://github.com/dynastyprocess/data/raw/master/files/db_playerids.csv"

KEEP = [
    "mfl_id", "sleeper_id", "espn_id", "yahoo_id", "fantasypros_id",
    "gsis_id", "cbs_id", "name", "merge_name", "position", "team", "db_season",
]


def load(force: bool = False) -> pd.DataFrame:
    raw = cached_text("db_playerids.csv", URL, force=force)
    (HERE / "data" / "raw" / "db_playerids.csv").write_text(raw)
    df = pd.read_csv(HERE / "data" / "raw" / "db_playerids.csv", low_memory=False)
    cols = [c for c in KEEP if c in df.columns]
    df = df[cols].copy()
    # One row per player: the file carries historical seasons, and a stale row
    # would happily overwrite a current team.
    if "db_season" in df:
        df = df.sort_values("db_season", ascending=False)
    df = df.drop_duplicates(subset=["mfl_id"], keep="first")
    df["key"] = df["name"].fillna("").map(norm_name)
    for c in ("sleeper_id", "espn_id", "yahoo_id", "fantasypros_id"):
        if c in df:
            df[c] = df[c].astype("string").str.replace(r"\.0$", "", regex=True)
    return df


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--force", action="store_true")
    df = load(ap.parse_args().force)
    df.to_parquet(HERE / "data" / "crosswalk.parquet", index=False)
    print(f"  {len(df):,} players")
    for c in ("sleeper_id", "espn_id", "yahoo_id", "fantasypros_id"):
        if c in df:
            print(f"    {c:16s} {df[c].notna().sum():6,} populated")
    print("\nwrote data/crosswalk.parquet")


if __name__ == "__main__":
    main()
