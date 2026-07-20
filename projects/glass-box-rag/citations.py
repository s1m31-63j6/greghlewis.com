"""Build the citation graph between corpus opinions.

This is the edge set behind the Citations tab and the agentic hop step: when the
model reads an opinion that turns on a precedent it hasn't retrieved yet, it
follows one of these edges.

Two problems make this less trivial than "grep for citations":

1. **Opinions cite by any parallel reporter.** Campbell is "510 U.S. 569" but also
   "114 S. Ct. 1164" and "127 L. Ed. 2d 500". A table keyed on one reporter misses
   most references, so we pull the full parallel-citation array from CourtListener
   once per case and match against all of them.

2. **Most references are short-form.** After one full citation an opinion writes
   "Campbell, 510 U.S., at 579" or just "Id." We count full and short-form numeric
   cites; bare "Id." chains are deliberately not resolved, since attributing them
   correctly needs sequence tracking that isn't worth the complexity here.

Edge weight is the number of times A cites B — CourtListener calls this `depth`,
and it's a free authority signal worth ranking on.

Usage:
    uv run python citations.py --refresh-cites   # rebuild the parallel-cite table
    uv run python citations.py                   # extract edges
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from collections import Counter

import httpx
from rich.console import Console
from rich.table import Table

from common import BUILD, RAW, all_cases, load_manifest, write_json

console = Console()
CL = "https://www.courtlistener.com/api/rest/v4"
CL_TOKEN = os.environ.get("COURTLISTENER_TOKEN")
CL_DELAY = 13.0

CITES_PATH = BUILD / "parallel_cites.json"


def _norm(c: str) -> str:
    return " ".join(c.split()).lower().replace(".", "")


def refresh_cites() -> dict[str, list[str]]:
    """Ask CourtListener for every parallel citation each corpus case carries."""
    if not CL_TOKEN:
        console.print("[red]COURTLISTENER_TOKEN required for --refresh-cites[/red]")
        raise SystemExit(1)
    headers = {"Authorization": f"Token {CL_TOKEN}"}
    out: dict[str, list[str]] = {}
    cases = all_cases(load_manifest())

    with httpx.Client(timeout=90, headers=headers) as client:
        for case in cases:
            want = case.get("citation")
            if not want:
                # Modern district opinions are mostly slip opinions with no
                # reporter citation yet; they are cited by name/docket, not cite.
                out[case["id"]] = []
                continue
            simple = re.sub(r"\b(Inc|Ltd|LLC|Co|Corp|v)\b\.?|[,\.]", " ", case["name"])
            simple = " ".join(simple.split())
            try:
                r = client.get(
                    f"{CL}/search/", params={"q": simple, "type": "o", "court": case["court"]}
                )
                r.raise_for_status()
                target = _norm(want)
                found: list[str] = []
                for res in r.json().get("results") or []:
                    cites = res.get("citation") or []
                    if any(_norm(c) == target for c in cites):
                        found = cites
                        break
                out[case["id"]] = found or [want]
                console.print(f"  {case['id']}: {len(out[case['id']])} cites")
            except Exception as e:
                console.print(f"  [yellow]{case['id']}: {str(e)[:80]}[/yellow]")
                out[case["id"]] = [want]
            time.sleep(CL_DELAY)

    write_json(CITES_PATH, out)
    return out


# "510 U.S. 569" / "114 S. Ct. 1164" / "82 F.4th 1262" / "755 F.3d 87"
_FULL = re.compile(r"\b(\d{1,3})\s+([A-Z][A-Za-z\. ]{1,12}?)\s+(\d{1,4})\b")
# short form: "510 U.S., at 579"
_SHORT = re.compile(r"\b(\d{1,3})\s+([A-Z][A-Za-z\. ]{1,12}?),?\s+at\s+\d{1,4}\b")


def _cite_key(vol: str, rep: str, page: str) -> str:
    return _norm(f"{vol} {rep} {page}")


def _vol_rep_key(vol: str, rep: str) -> str:
    return _norm(f"{vol} {rep}")


def build_edges(cites: dict[str, list[str]]) -> tuple[list[dict], Counter]:
    # index: exact "vol rep page" -> case_id, and "vol rep" -> case_id for short forms
    exact: dict[str, str] = {}
    volrep: dict[str, str] = {}
    for cid, cs in cites.items():
        for c in cs:
            m = _FULL.search(c)
            if not m:
                continue
            exact[_cite_key(*m.groups())] = cid
            volrep.setdefault(_vol_rep_key(m.group(1), m.group(2)), cid)

    edges: Counter = Counter()
    for f in sorted(RAW.glob("*.json")):
        op = json.loads(f.read_text())
        src = op["id"]
        text = op["text"]
        for m in _FULL.finditer(text):
            tgt = exact.get(_cite_key(*m.groups()))
            if tgt and tgt != src:
                edges[(src, tgt)] += 1
        for m in _SHORT.finditer(text):
            tgt = volrep.get(_vol_rep_key(m.group(1), m.group(2)))
            if tgt and tgt != src:
                edges[(src, tgt)] += 1

    out = [{"source": s, "target": t, "weight": w} for (s, t), w in edges.most_common()]
    return out, edges


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh-cites", action="store_true")
    args = ap.parse_args()

    if args.refresh_cites or not CITES_PATH.exists():
        console.print("[bold]refreshing parallel citations from CourtListener[/bold]")
        cites = refresh_cites()
    else:
        cites = json.loads(CITES_PATH.read_text())

    edges, counter = build_edges(cites)
    write_json(BUILD / "citation_edges.json", edges)

    names = {c["id"]: c["name"] for c in all_cases(load_manifest())}
    table = Table("cites →", "cited", "weight")
    for e in edges[:18]:
        table.add_row(
            names.get(e["source"], e["source"])[:34],
            names.get(e["target"], e["target"])[:34],
            str(e["weight"]),
        )
    console.print(table)

    indeg = Counter()
    for e in edges:
        indeg[e["target"]] += e["weight"]
    console.print("\n[bold]most-cited within corpus (authority signal):[/bold]")
    for cid, w in indeg.most_common(8):
        console.print(f"  {w:>4}  {names.get(cid, cid)[:56]}")
    console.print(f"\n[bold]{len(edges)} edges across {len(set(e['source'] for e in edges))} opinions[/bold]")
    return 0


if __name__ == "__main__":
    sys.exit(main())
