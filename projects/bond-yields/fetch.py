"""fetch.py -> src/app/projects/bond-yields/data/yields.json

Two FRED series, sampled weekly since 2000, for the timeline chart:

  DGS10  10-year Treasury constant-maturity yield (daily, market days)
  DFF    effective federal funds rate (daily, every calendar day)

FRED's graph endpoint serves the full history as CSV with no key. Each
series is reduced to the last observation of each ISO week, which is
~1,400 points per line: plenty for a 1,100px chart and small enough to
ship in the page bundle. `python fetch.py --offline` rebuilds from the
CSVs already in raw/ without touching the network.

A snapshot by design: the page shows the "data through" date and this is
the one command that moves it.
"""

from __future__ import annotations

import csv
import json
import sys
import urllib.request
from datetime import date
from pathlib import Path

HERE = Path(__file__).parent
RAW = HERE / "raw"
OUT = HERE.parent.parent / "src" / "app" / "projects" / "bond-yields" / "data" / "yields.json"
START = date(2000, 1, 1)
SERIES = {"dgs10": "DGS10", "dff": "DFF"}


def download(fred_id: str) -> Path:
    path = RAW / f"{fred_id}.csv"
    url = f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={fred_id}"
    with urllib.request.urlopen(url, timeout=60) as r:
        path.write_bytes(r.read())
    return path


def read(path: Path) -> list[tuple[date, float]]:
    out = []
    with path.open() as f:
        for row in csv.DictReader(f):
            d = date.fromisoformat(row["observation_date"])
            v = row[path.stem]
            if d >= START and v not in (".", ""):
                out.append((d, float(v)))
    return out


def weekly(points: list[tuple[date, float]]) -> list[tuple[str, float]]:
    """Last observation per ISO week."""
    by_week: dict[tuple[int, int], tuple[date, float]] = {}
    for d, v in points:
        by_week[d.isocalendar()[:2]] = (d, v)
    return [(d.isoformat(), v) for d, v in sorted(by_week.values())]


def main() -> None:
    offline = "--offline" in sys.argv
    RAW.mkdir(exist_ok=True)
    series = {}
    for key, fred_id in SERIES.items():
        path = RAW / f"{fred_id}.csv" if offline else download(fred_id)
        series[key] = weekly(read(path))
    as_of = max(s[-1][0] for s in series.values())
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"asOf": as_of, "start": START.isoformat(), "series": series}, separators=(",", ":")))
    for key, pts in series.items():
        print(f"{key}: {len(pts)} weekly points, {pts[0][0]} .. {pts[-1][0]} (last {pts[-1][1]})")
    print("wrote", OUT, f"{OUT.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
