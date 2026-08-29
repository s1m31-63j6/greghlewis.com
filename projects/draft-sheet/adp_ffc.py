"""adp_ffc.py — Fantasy Football Calculator ADP, and the only clean license.

FFC is the only source in this project with an explicit grant: "Use of the ADP
REST API is free for personal and commercial use", asking only for attribution,
which meta.json carries. It is also the only source that publishes DISPERSION —
`stdev`, `high`, `low`, `times_drafted` — which is a different and better signal
than the cross-platform spread: it says how much real drafters disagree about a
player, not how much two platforms' populations differ.

Their data updates once a day, so we do too.

Usage:
    uv run python adp_ffc.py [--force]
"""
from __future__ import annotations

import argparse
import json

import pandas as pd

from common import HERE, cached_text

URL = "https://fantasyfootballcalculator.com/api/v1/adp/{fmt}?teams=12&year=2026"

# ppr is the deepest and best-sampled pool; the others are carried so the
# client can prefer a format-matched ADP when the league is standard or 2QB.
FORMATS = ["ppr", "half-ppr", "standard", "2qb"]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--force", action="store_true")
    force = ap.parse_args().force

    frames = []
    meta = {}
    for fmt in FORMATS:
        d = json.loads(cached_text(f"ffc-{fmt}.json", URL.format(fmt=fmt), force=force))
        m = d.get("meta", {})
        meta[fmt] = {
            "total_drafts": m.get("total_drafts"),
            "start_date": m.get("start_date"),
            "end_date": m.get("end_date"),
        }
        rows = pd.DataFrame(d.get("players", []))
        if rows.empty:
            continue
        rows = rows.rename(columns={"player_id": "ffc_id", "adp": f"ffc_adp_{fmt}"})
        keep = ["ffc_id", "name", "position", "team", "bye", f"ffc_adp_{fmt}"]
        if fmt == "ppr":
            rows = rows.rename(columns={
                "stdev": "ffc_stdev", "high": "ffc_high",
                "low": "ffc_low", "times_drafted": "ffc_times_drafted",
            })
            keep += ["ffc_stdev", "ffc_high", "ffc_low", "ffc_times_drafted"]
        frames.append(rows[[c for c in keep if c in rows.columns]])
        print(f"  {fmt:10s} {len(rows):4d} players  "
              f"{m.get('total_drafts'):,} drafts  {m.get('start_date')}..{m.get('end_date')}")

    df = frames[0]
    for extra in frames[1:]:
        cols = ["ffc_id"] + [c for c in extra.columns if c.startswith("ffc_adp_")]
        df = df.merge(extra[cols], on="ffc_id", how="outer")

    df.to_parquet(HERE / "data" / "adp_ffc.parquet", index=False)
    (HERE / "data" / "ffc_meta.json").write_text(json.dumps(meta, indent=1))
    print(f"\n  {len(df):,} unique players across formats")
    print("wrote data/adp_ffc.parquet")


if __name__ == "__main__":
    main()
