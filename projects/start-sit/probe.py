"""probe.py — step 0: what the two feeds actually carry this week.

Reads the cached raw files (run fetch_sleeper_lines.py and fetch_sgo.py
first) and prints depth by market and position, the least prominent players
carrying a yardage line, whether touchdown prices come paired, and what the
sportsbook feed's player ids look like. The answers shape publish.py, and the
summary belongs in README.md under "What the probe found".

Usage:
    uv run python probe.py
"""
from __future__ import annotations

import collections
import json

import pandas as pd

from common import HERE

pool = pd.read_parquet(HERE / "data" / "pool.parquet").set_index("sleeper_id")

print("── Sleeper pick'em ─────────────────────────────────────────────")
lines = json.loads((HERE / "data" / "sleeper_lines.json").read_text())
lines = [x for x in lines if x["options"][0]["game_status"] == "pre_game"]
by_market = collections.defaultdict(set)
for x in lines:
    by_market[x["wager_type"]].add(x["subject_id"])
for k, v in sorted(by_market.items(), key=lambda kv: -len(kv[1])):
    print(f"  {k:32s} {len(v):4d} players")
asym = sum(1 for x in lines if len(x["options"]) == 2
           and abs(float(x["options"][0]["payout_multiplier"]) - float(x["options"][1]["payout_multiplier"])) > 0.01)
print(f"  {asym}/{len(lines)} lines carry an asymmetric pair (lean recoverable)")
td = [x for x in lines if x["wager_type"] == "anytime_touchdowns"]
print(f"  anytime TD: {len(td)} lines, all two-sided at 0.5: "
      f"{all(len(x['options']) == 2 and x['options'][0]['outcome_value'] == 0.5 for x in td)}")
priced = {x["subject_id"] for x in lines if x["wager_type"] in ("receptions", "receiving_yards", "rushing_yards")}
inpool = [p for p in priced if p in pool.index]
print(f"  {len(priced)} players with a yardage/reception line, {len(inpool)} in the pool")
deep = pool.loc[inpool].sort_values("search_rank", ascending=False).head(12)
print("  least prominent with a line:", ", ".join(f"{r.name} ({r.pos} {r.team})" for r in deep.itertuples()))

print("\n── SportsGameOdds ──────────────────────────────────────────────")
files = sorted(f for f in (HERE / "data" / "raw").glob("sgo-w*.json") if not f.name.endswith(".headers.json"))
if not files:
    print("  no sgo-w*.json yet — set SGO_API_KEY and run fetch_sgo.py")
else:
    doc = json.loads(files[-1].read_text())
    events = doc["events"]
    print(f"  {files[-1].name}: {len(events)} events")
    ev = events[0]
    print("  event keys:", sorted(ev.keys()))
    odds = ev.get("odds", {})
    print(f"  first event: {len(odds)} oddIDs")
    stat_ids = collections.Counter(k.split("-")[0] for k in odds)
    print("  statIDs:", dict(stat_ids.most_common(40)))
    bet_types = collections.Counter("-".join(k.split("-")[2:]) for k in odds)
    print("  period-betType-side:", dict(bet_types.most_common(20)))
    sample = next((k for k in odds if k.startswith("receiving_yards")), None)
    if sample:
        print("  sample oddID:", sample)
        print("  sample odd:", json.dumps(odds[sample])[:1200])
    books = collections.Counter(b for o in odds.values() for b in (o.get("byBookmaker") or {}))
    print("  bookmakers:", dict(books))
    players = ev.get("players") or {}
    print(f"  players map: {len(players)} entries; sample:", json.dumps(list(players.items())[:2])[:600])
    per_book = collections.defaultdict(set)
    for e in events:
        for k, o in (e.get("odds") or {}).items():
            parts = k.split("-")
            if parts[0] in ("receptions", "receiving_yards", "rushing_yards") and parts[-1] == "over":
                for b in (o.get("byBookmaker") or {}):
                    per_book[b].add(parts[1])
    print("  players with a yardage/reception over, per book:", {b: len(v) for b, v in per_book.items()})
