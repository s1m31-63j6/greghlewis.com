"""Resolve mined citation strings to case names via CourtListener.

Uses the search endpoint and requires the returned cluster to actually carry the
citation — the same identity check the fetcher uses, for the same reason: querying
a citation string returns opinions that CITE it unless you verify.
"""

from __future__ import annotations

import argparse
import json
import os
import time

import httpx
from rich.console import Console
from rich.table import Table

from common import BUILD, write_json

console = Console()
CL = "https://www.courtlistener.com/api/rest/v4"
TOKEN = os.environ.get("COURTLISTENER_TOKEN")
DELAY = 13.0


def norm(c: str) -> str:
    return " ".join(c.split()).lower().replace(".", "").replace(" ", "")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--top", type=int, default=40)
    args = ap.parse_args()

    gaps = json.loads((BUILD / "citation_gaps.json").read_text())[: args.top]
    out = []
    with httpx.Client(timeout=90, headers={"Authorization": f"Token {TOKEN}"}) as c:
        for g in gaps:
            cite = g["citation"]
            name, year, court = None, None, None
            try:
                r = c.get(f"{CL}/search/", params={"q": f'"{cite}"', "type": "o"})
                if r.status_code == 200:
                    target = norm(cite)
                    for res in r.json().get("results", []):
                        if any(norm(x) == target for x in (res.get("citation") or [])):
                            name = res.get("caseName")
                            year = (res.get("dateFiled") or "")[:4]
                            court = res.get("court_id")
                            break
            except Exception as e:
                console.print(f"  [yellow]{cite}: {str(e)[:60]}[/yellow]")
            out.append({**g, "case_name": name, "year": year, "court": court})
            console.print(f"  {cite:20s} {name or '[unresolved]'} ({year or '?'})")
            time.sleep(DELAY)

    write_json(BUILD / "citation_gaps_resolved.json", out)
    table = Table("citation", "case", "court", "year", "cited by")
    for r in out:
        if r["case_name"]:
            table.add_row(r["citation"], r["case_name"][:44], r["court"] or "", r["year"] or "",
                          str(r["cited_by_n_opinions"]))
    console.print(table)


if __name__ == "__main__":
    main()
