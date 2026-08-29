"""adp_history.py — offseason ADP movement.

Fantasy Football Calculator backs its ADP graphs with an undocumented endpoint
that returns a player's whole series as [[epoch_ms, adp], ...]:

    /adp/graph/data?player=<ffc_id>&teams=12&format=ppr

WHAT THE DATA ACTUALLY SUPPORTS. FFC only emits a point once enough mock drafts
have sampled a player, and spring mock volume only reaches round three. Measured
across the top 150, the share of players with any data by a given date is 8% on
Mar 1, 12% on Apr 1, 29% on Jun 1 and 89% on Jul 1. So this is a genuinely daily
series from about July onward, and a handful of elite players going back to
January. The UI defaults its window to Jun 1 for that reason, offers a
"since January" view only for players who have it, and never interpolates
across the sparse spring gaps — a smooth line through a 20-day hole would be an
invention.

PPR 12-team is used because the other pools are far thinner.

Usage:
    uv run python adp_history.py [--force] [--limit N]
"""
from __future__ import annotations

import argparse
import json
import time
from datetime import datetime, timezone

import pandas as pd
from rich.progress import track

from common import HERE, cached_json

PUBLIC = HERE.parent.parent / "public" / "draft-sheet"
URL = "https://fantasyfootballcalculator.com/adp/graph/data?player={pid}&teams=12&format=ppr"

DELAY = 0.15


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()

    merged = pd.read_parquet(HERE / "data" / "merged.parquet")
    have = merged[merged["ffc_id"].notna()][["fpros_id", "ffc_id", "name", "ecr_ppr"]]
    have = have.sort_values("ecr_ppr", na_position="last")
    if args.limit:
        have = have.head(args.limit)

    series, empty = {}, 0
    for r in track(list(have.itertuples()), description="  ADP history"):
        pid = int(r.ffc_id)
        try:
            d = cached_json(f"ffcgraph-{pid}.json", URL.format(pid=pid),
                            force=args.force, delay=DELAY)
        except Exception:
            empty += 1
            continue
        pts = d if isinstance(d, list) else (d.get("data") or d.get("points") or [])
        clean = [[int(t), round(float(v), 2)] for t, v in pts
                 if t is not None and v is not None]
        if not clean:
            empty += 1
            continue
        series[str(r.fpros_id)] = clean

    # A bare `continue` on every failure meant a dead endpoint produced an empty
    # history, every trend arrow vanished, and nothing complained. Floor it.
    attempted = len(have)
    if attempted and empty / attempted > 0.2:
        raise SystemExit(
            f"{empty}/{attempted} history fetches failed — refusing to publish a "
            "gutted history. The FFC graph endpoint is undocumented; check it is alive."
        )
    if attempted and len(series) < 200:
        raise SystemExit(
            f"only {len(series)} series returned, expected ~270 — refusing to publish."
        )

    if series:
        spans = [(s[0][0], s[-1][0]) for s in series.values()]
        first = datetime.fromtimestamp(min(a for a, _ in spans) / 1000, timezone.utc)
        last = datetime.fromtimestamp(max(b for _, b in spans) / 1000, timezone.utc)
        lens = sorted(len(s) for s in series.values())
        print(f"\n  {len(series):,} players with a series, {empty} without")
        print(f"  span {first:%Y-%m-%d} .. {last:%Y-%m-%d}")
        print(f"  points per player: median {lens[len(lens)//2]}, max {lens[-1]}")

    PUBLIC.mkdir(parents=True, exist_ok=True)
    blob = json.dumps({"format": "ppr", "teams": 12, "series": series},
                      separators=(",", ":"))
    (PUBLIC / "adp-history.json").write_text(blob)
    print(f"  wrote adp-history.json ({len(blob) / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
