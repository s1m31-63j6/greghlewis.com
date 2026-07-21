"""Verify expansion candidates before they go anywhere near the manifest.

Same identity discipline as fetch.py: a case counts as found only when a returned
cluster actually carries the expected citation, or (for slip opinions with no
reporter cite) when the case name and court both match. Anything else is reported
as unresolved rather than guessed at.
"""

from __future__ import annotations

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

# area -> candidates. Chosen for doctrinal DISTANCE from fair use: the point is to
# give dense retrieval something to discriminate on.
CANDIDATES = [
    # --- right of publicity / voice ---
    ("publicity", "Lehrman v. Lovo", "nysd", None),
    ("publicity", "Midler v. Ford Motor Co", "ca9", "849 F.2d 460"),
    ("publicity", "Waits v. Frito-Lay", "ca9", "978 F.2d 1093"),
    # --- scraping / CFAA ---
    ("scraping", "hiQ Labs v. LinkedIn", "ca9", "31 F.4th 1180"),
    ("scraping", "Van Buren v. United States", "scotus", "593 U.S. 374"),
    # --- AI authorship / inventorship ---
    ("authorship", "Thaler v. Perlmutter", "dcd", None),
    ("authorship", "Thaler v. Vidal", "cafc", "43 F.4th 1207"),
    # --- algorithmic discrimination ---
    ("discrimination", "Mobley v. Workday", "cand", None),
    # --- secondary liability (from the citation-gap mining) ---
    ("secondary", "Metro-Goldwyn-Mayer Studios v. Grokster", "scotus", "545 U.S. 913"),
    ("secondary", "Gershwin Publishing v. Columbia Artists", "ca2", "443 F.2d 1159"),
    # --- machine ingestion, the closest pre-AI analogue ---
    ("ingestion", "A.V. v. iParadigms", "ca4", "562 F.3d 630"),
    ("ingestion", "Religious Technology Center v. Netcom", "cand", "907 F. Supp. 1361"),
]


def norm(c: str) -> str:
    return " ".join(c.split()).lower().replace(".", "").replace(" ", "")


def main() -> None:
    out = []
    with httpx.Client(timeout=90, headers={"Authorization": f"Token {TOKEN}"}) as c:
        for area, name, court, cite in CANDIDATES:
            rec = {"area": area, "query": name, "court": court, "want_cite": cite,
                   "found": None, "date": None, "cluster_court": None, "cites": [], "url": None}
            try:
                r = c.get(f"{CL}/search/", params={"q": name, "type": "o", "court": court})
                if r.status_code == 200:
                    for res in r.json().get("results", []):
                        cites = res.get("citation") or []
                        ok = (
                            any(norm(x) == norm(cite) for x in cites)
                            if cite
                            else name.split(" v. ")[0].lower() in (res.get("caseName") or "").lower()
                        )
                        if ok:
                            rec.update(
                                found=res.get("caseName"),
                                date=res.get("dateFiled"),
                                cluster_court=res.get("court_id"),
                                cites=cites,
                                url=f"https://www.courtlistener.com{res.get('absolute_url','')}",
                            )
                            break
                else:
                    rec["error"] = f"HTTP {r.status_code}"
            except Exception as e:
                rec["error"] = str(e)[:90]
            out.append(rec)
            mark = "OK " if rec["found"] else "-- "
            console.print(f"  {mark}{area:15s} {name[:38]:40s} {rec['found'] or '[not resolved]'}")
            time.sleep(DELAY)

    write_json(BUILD / "expansion_candidates.json", out)
    t = Table("area", "case", "court", "date", "citations")
    for r in out:
        if r["found"]:
            t.add_row(r["area"], r["found"][:38], r["cluster_court"] or "", r["date"] or "",
                      ", ".join(r["cites"][:2]))
    console.print(t)
    console.print(f"\n[bold]{sum(1 for r in out if r['found'])}/{len(out)} verified[/bold]")


if __name__ == "__main__":
    main()
