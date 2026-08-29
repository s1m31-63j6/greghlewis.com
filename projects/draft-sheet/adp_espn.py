"""adp_espn.py — ESPN ADP, ownership and format ranks.

Unauthenticated. `x-fantasy-role: NONE` comes back in the response headers,
confirming no session is involved.

Two things to know about this endpoint:

  * Use `leaguedefaults/3`, NOT `/players`. The `/players` endpoint ignores
    `limit` in the filter and returns all 11,617 players (39 MB) every time.
    `leaguedefaults/3` honors limit/offset/sortDraftRanks.

  * ESPN's ADP SATURATES. 790 of 1,027 players sit at ADP ~= 170, and by the
    200th player sorted by ADP the number is meaningless (Cam Ward: ADP 169.17,
    PPR rank 315). Past the clamp we null the ADP out and fall back to
    `draftRanksByRankType.PPR.rank`, which stays informative to ~1000. Averaging
    a clamped 170 against a real Yahoo 144 would drag every late-round player
    toward a fake consensus, which is exactly the kind of silent corruption this
    sheet cannot afford.

Usage:
    uv run python adp_espn.py [--force]
"""
from __future__ import annotations

import argparse
import json
from collections import Counter

import pandas as pd

from common import ESPN_TEAM, HERE, cached_text

URL = (
    "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/2026"
    "/segments/0/leaguedefaults/3?view=kona_player_info"
)

PAGE = 300
PAGES = 4  # 1,200 slots covers the ~1,027 the endpoint actually holds.

POS = {1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 16: "DST"}

# Beyond this pick ESPN's ADP is not a market signal any more.
ADP_TRUST_LIMIT = 190.0
# A value shared by this many players is a clamp bucket, not a coincidence.
CLAMP_MIN_SHARE = 20


def fetch(force: bool = False) -> list[dict]:
    rows: list[dict] = []
    for i in range(PAGES):
        flt = {
            "players": {
                "limit": PAGE,
                "offset": i * PAGE,
                "sortDraftRanks": {"sortPriority": 100, "sortAsc": True, "value": "PPR"},
            }
        }
        body = cached_text(
            f"espn-{i:02d}.json",
            URL,
            force=force,
            headers={"x-fantasy-filter": json.dumps(flt)},
        )
        page = json.loads(body).get("players", [])
        if not page:
            break
        rows.extend(page)
    return rows


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--force", action="store_true")
    raw = fetch(ap.parse_args().force)

    recs = []
    for entry in raw:
        p = entry.get("player") or {}
        own = p.get("ownership") or {}
        ranks = p.get("draftRanksByRankType") or {}
        recs.append({
            "espn_id": str(p.get("id")),
            "name": p.get("fullName"),
            "pos": POS.get(p.get("defaultPositionId")),
            "team": ESPN_TEAM.get(p.get("proTeamId")),
            "espn_adp_raw": own.get("averageDraftPosition"),
            "espn_pct_owned": own.get("percentOwned"),
            "espn_auction": own.get("auctionValueAverage"),
            "espn_rank_ppr": (ranks.get("PPR") or {}).get("rank"),
            "espn_rank_sf": (ranks.get("SUPERFLEX") or {}).get("rank"),
        })
    df = pd.DataFrame(recs).drop_duplicates("espn_id")

    # Identify the clamp: a small set of ADP values shared by a great many
    # players, all deep in the board.
    counts = Counter(round(v, 1) for v in df["espn_adp_raw"].dropna())
    clamped = {v for v, n in counts.items() if n >= CLAMP_MIN_SHARE and v > 100}

    def clean(v: float | None) -> float | None:
        if v is None or pd.isna(v):
            return None
        if round(v, 1) in clamped or v > ADP_TRUST_LIMIT:
            return None
        return float(v)

    df["espn_adp"] = df["espn_adp_raw"].map(clean)
    df = df[df["pos"].notna()]
    df.to_parquet(HERE / "data" / "adp_espn.parquet", index=False)

    kept = df["espn_adp"].notna().sum()
    print(f"  {len(df):,} players, {kept:,} with trustworthy ADP")
    print(f"  clamp buckets dropped: {sorted(clamped)} "
          f"({len(df) - kept:,} players fall back to PPR rank)")
    print(f"  deepest trusted ADP: {df['espn_adp'].max():.1f}")
    print("\nwrote data/adp_espn.parquet")


if __name__ == "__main__":
    main()
