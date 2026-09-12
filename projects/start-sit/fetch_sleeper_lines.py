"""fetch_sleeper_lines.py — Sleeper's pick'em lines, the depth tier.

Sleeper runs its own pick'em product and publishes every live line at one
open endpoint, keyed by the same player id as its players feed. This week it
carried lines for about 260 NFL players — receptions and receiving yards down
to a team's third receiver, rushing yards to the second back — which is far
deeper than any sportsbook posts. Each line has two sides with their own
payout multiplier, so the market's lean is recoverable.

What it is not: a sportsbook price. A pick'em multiplier is a contest payout
and the lean it encodes is weaker evidence than DraftKings' price on the same
number. publish.py labels everything from here as the pick'em tier and never
blends it into the sportsbook consensus.

Usage:
    uv run python fetch_sleeper_lines.py [--force]
"""
from __future__ import annotations

import argparse
import json

from common import HERE, cached_text

URL = "https://api.sleeper.app/lines/available?sport=nfl"


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--force", action="store_true")
    blob = cached_text("sleeper-lines-all.json", URL, force=ap.parse_args().force)
    lines = [x for x in json.loads(blob) if x.get("sport") == "nfl"]
    if not lines:
        raise SystemExit("Sleeper returned no NFL lines — the feed is down or the shape changed")
    out = HERE / "data" / "sleeper_lines.json"
    out.write_text(json.dumps(lines, separators=(",", ":")))
    players = {x["subject_id"] for x in lines}
    games = {o["game_id"] for x in lines for o in x["options"]}
    print(f"  {len(lines):,} NFL lines on {len(players)} players across {len(games)} games")
    print("wrote data/sleeper_lines.json")


if __name__ == "__main__":
    main()
