"""fetch.py -> src/app/projects/bond-yields/data/yields.json

The series behind the paper's charts, since 2000, with no API key:

  Timeline        DGS10  10-year Treasury yield          weekly
                  DFF    effective fed funds rate        weekly
  I   Real+infl.  DFII10 10-year TIPS (real) yield       weekly, from 2003
                  T10YIE 10-year breakeven inflation     weekly, from 2003
  II  Bet on Fed  DGS2   2-year Treasury yield           weekly
  III Fed's job   CPIAUCSL -> inflation, % over a year   monthly
                  UNRATE unemployment rate               monthly
  IV  Term prem.  THREEFYTP10 Kim-Wright term premium    weekly
  V   Resting     Laubach-Williams r* (NY Fed xlsx)      quarterly

FRED's graph endpoint serves full histories as CSV. The New York Fed
publishes r* as a spreadsheet; its "data" sheet is read with the standard
library (no openpyxl). Daily series are reduced to the last observation of
each ISO week. `python fetch.py --offline` rebuilds from raw/ without the
network.

A snapshot by design: the page shows the "data through" date and this is
the one command that moves it.
"""

from __future__ import annotations

import csv
import json
import re
import sys
import urllib.request
import zipfile
from datetime import date, timedelta
from pathlib import Path
from xml.etree import ElementTree as ET

HERE = Path(__file__).parent
RAW = HERE / "raw"
OUT = HERE.parent.parent / "src" / "app" / "projects" / "bond-yields" / "data" / "yields.json"
START = date(2000, 1, 1)
FRED = {
    "dgs10": "DGS10", "dff": "DFF", "dgs2": "DGS2", "dfii10": "DFII10", "t10yie": "T10YIE",
    "tp": "THREEFYTP10", "cpi": "CPIAUCSL", "unrate": "UNRATE",
}
MONTHLY = {"cpi", "unrate"}
LW_URL = "https://www.newyorkfed.org/medialibrary/media/research/economists/williams/data/Laubach_Williams_current_estimates.xlsx"
LW_PATH = RAW / "Laubach_Williams_current_estimates.xlsx"

Points = list[tuple[date, float]]


def download(url: str, path: Path) -> Path:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        path.write_bytes(r.read())
    return path


def read_fred(path: Path, start: date = START) -> Points:
    out = []
    with path.open() as f:
        for row in csv.DictReader(f):
            d = date.fromisoformat(row["observation_date"])
            v = row[path.stem]
            if d >= start and v not in (".", ""):
                out.append((d, float(v)))
    return out


def read_lw(path: Path) -> Points:
    """Column C ("rstar", one-sided) of the "data" sheet; dates are Excel serials."""
    ns = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
    with zipfile.ZipFile(path) as z:
        book = z.read("xl/workbook.xml").decode()
        names = re.findall(r'<sheet [^>]*name="([^"]+)"', book)
        sheet = f"xl/worksheets/sheet{names.index('data') + 1}.xml"
        root = ET.fromstring(z.read(sheet))
    out = []
    for row in root.iter(f"{ns}row"):
        cells = {c.get("r")[0]: c.findtext(f"{ns}v") for c in row.findall(f"{ns}c")}
        a, c = cells.get("A"), cells.get("C")
        if a and c and re.fullmatch(r"\d+", a):
            d = date(1899, 12, 30) + timedelta(days=int(a))
            if d >= START:
                out.append((d, round(float(c), 2)))
    return out


def weekly(points: Points) -> Points:
    """Last observation per ISO week."""
    by_week: dict[tuple[int, int], tuple[date, float]] = {}
    for d, v in points:
        by_week[d.isocalendar()[:2]] = (d, v)
    return sorted(by_week.values())


def yoy(points: Points) -> Points:
    """Percent change over twelve months, for a monthly index."""
    by_month = {(d.year, d.month): v for d, v in points}
    out = []
    for d, v in points:
        prev = by_month.get((d.year - 1, d.month))
        if prev and d >= START:
            out.append((d, round(100 * (v / prev - 1), 2)))
    return out


def main() -> None:
    offline = "--offline" in sys.argv
    RAW.mkdir(exist_ok=True)
    series: dict[str, Points] = {}
    for key, fred_id in FRED.items():
        path = RAW / f"{fred_id}.csv"
        if not offline:
            download(f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={fred_id}", path)
        if key == "cpi":
            series[key] = yoy(read_fred(path, START.replace(year=START.year - 1)))
        elif key in MONTHLY:
            series[key] = read_fred(path)
        else:
            series[key] = weekly(read_fred(path))
    if not offline:
        download(LW_URL, LW_PATH)
    series["rstar"] = read_lw(LW_PATH)

    as_of = max(series["dgs10"][-1][0], series["dff"][-1][0]).isoformat()
    payload = {
        "asOf": as_of,
        "start": START.isoformat(),
        "series": {k: [(d.isoformat(), v) for d, v in pts] for k, pts in series.items()},
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, separators=(",", ":")))
    for key, pts in series.items():
        print(f"{key:7} {len(pts):5} points  {pts[0][0]} .. {pts[-1][0]}  last {pts[-1][1]}")
    print("wrote", OUT, f"{OUT.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
