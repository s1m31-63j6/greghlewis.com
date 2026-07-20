"""Find the authorities our corpus argues from but does not contain.

The corpus already tells us what it is missing: every opinion cites dozens of cases,
and the ones cited most often across many different opinions are, by definition, the
authorities this area of law actually turns on. That is a better expansion signal
than guessing at topics.

Outputs data/build/citation_gaps.json — candidate citations ranked by how many
DISTINCT corpus opinions cite them (breadth of reliance beats raw count, which
one long opinion can dominate).
"""

from __future__ import annotations

import json
import re
from collections import defaultdict

from rich.console import Console
from rich.table import Table

from common import BUILD, RAW, write_json

console = Console()

# "510 U.S. 569", "804 F.3d 202", "82 F.4th 1262", "60 F.3d 913", "977 F.2d 1510"
CITE = re.compile(
    r"\b(\d{1,3})\s+"
    r"(U\.\s?S\.|S\.\s?Ct\.|F\.\s?Supp\.\s?\d?d?|F\.\s?\d?d?|F\.4th|L\.\s?Ed\.\s?2d)"
    r"\s+(\d{1,4})\b"
)


def norm(v: str, rep: str, p: str) -> str:
    return " ".join(f"{v} {rep} {p}".split()).replace(". ", ".").lower()


def main() -> None:
    have: set[str] = set()
    cites_path = BUILD / "parallel_cites.json"
    if cites_path.exists():
        for cs in json.loads(cites_path.read_text()).values():
            for c in cs:
                m = CITE.search(c)
                if m:
                    have.add(norm(*m.groups()))

    # citation -> set of corpus opinions that cite it
    by_source: dict[str, set[str]] = defaultdict(set)
    raw_counts: dict[str, int] = defaultdict(int)
    display: dict[str, str] = {}

    for f in sorted(RAW.glob("*.json")):
        op = json.loads(f.read_text())
        for m in CITE.finditer(op["text"]):
            key = norm(*m.groups())
            if key in have:
                continue
            by_source[key].add(op["id"])
            raw_counts[key] += 1
            display.setdefault(key, " ".join(m.group(0).split()))

    ranked = sorted(
        by_source.items(),
        key=lambda kv: (len(kv[1]), raw_counts[kv[0]]),
        reverse=True,
    )

    out = [
        {
            "citation": display[k],
            "cited_by_n_opinions": len(srcs),
            "total_mentions": raw_counts[k],
            "cited_by": sorted(srcs),
        }
        for k, srcs in ranked
        if len(srcs) >= 2  # cited by at least two different opinions
    ]
    write_json(BUILD / "citation_gaps.json", out)

    table = Table("citation", "cited by N opinions", "mentions")
    for row in out[:30]:
        table.add_row(row["citation"], str(row["cited_by_n_opinions"]), str(row["total_mentions"]))
    console.print(table)
    console.print(
        f"\n[bold]{len(out)} candidate authorities cited by 2+ corpus opinions "
        f"but absent from the corpus[/bold]"
    )


if __name__ == "__main__":
    main()
