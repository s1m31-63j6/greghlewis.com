"""rankings_fpros.py — the five canonical consensus boards.

This is the spine of the whole project. The product is about navigating the
market as it is, not about out-projecting it, so the board a user sees IS the
expert consensus board for their format, with tiers exactly where 100+ analysts
put them.

FantasyPros embeds the whole ranking as `var ecrData = {...};` in the HTML of
each cheatsheet page, so there is no table parsing and no JS rendering needed.
Five pages cover the axes that matter (PPR value x superflex).

`robots.txt` disallows /ajax/, /api/, /json/, /xml/ and /nfl/ranker/ but NOT
/nfl/rankings/, and sets `Crawl-delay: 5`. We honor the delay.

Usage:
    uv run python rankings_fpros.py
    uv run python rankings_fpros.py --force
"""
from __future__ import annotations

import argparse
import json
import re

from common import HERE, cached_text

BASE = "https://www.fantasypros.com/nfl/rankings"

# `rec` records the reception value the board already bakes in, which is what
# lets the client snap a league config to the nearest canonical board instead of
# recomputing one. `sf` marks the superflex variants.
BOARDS = {
    "standard":       {"page": "consensus-cheatsheets.php",                "rec": 0.0, "sf": False},
    "half":           {"page": "half-point-ppr-cheatsheets.php",           "rec": 0.5, "sf": False},
    "ppr":            {"page": "ppr-cheatsheets.php",                      "rec": 1.0, "sf": False},
    "superflex":      {"page": "superflex-cheatsheets.php",                "rec": 0.0, "sf": True},
    "half-superflex": {"page": "half-point-ppr-superflex-cheatsheets.php", "rec": 0.5, "sf": True},
}

ECR_RE = re.compile(r"var\s+ecrData\s*=\s*(\{.*?\})\s*;\s*\n", re.S)

CRAWL_DELAY = 5.0


def extract(html: str) -> dict:
    m = ECR_RE.search(html)
    if not m:
        raise SystemExit(
            "ecrData not found — FantasyPros changed their page shape. "
            "The board cannot be built without it; fix the parser before shipping."
        )
    return json.loads(m.group(1))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    out: dict[str, dict] = {}
    for key, spec in BOARDS.items():
        html = cached_text(
            f"fpros-{key}.html",
            f"{BASE}/{spec['page']}",
            force=args.force,
            delay=CRAWL_DELAY,
        )
        data = extract(html)
        players = data.get("players", [])
        out[key] = {
            "rec": spec["rec"],
            "superflex": spec["sf"],
            "last_updated": data.get("last_updated"),
            "total_experts": data.get("total_experts"),
            "players": players,
        }
        tiers = sorted({p.get("tier") for p in players if p.get("tier")})
        print(
            f"  {key:16s} {len(players):4d} players  "
            f"tiers 1-{max(tiers) if tiers else 0}  "
            f"experts {data.get('total_experts')}  "
            f"updated {data.get('last_updated')}"
        )

    dest = HERE / "data" / "consensus.json"
    dest.write_text(json.dumps(out, separators=(",", ":")))
    print(f"\nwrote data/consensus.json  ({dest.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
