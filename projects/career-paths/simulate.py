"""simulate.py -> reference.json, flows.json

reference.json: summary statistics per cohort (persona x first track x stage
x stay), 1,000 careers each under a fixed seed, which tie_out.mts reproduces
with the TypeScript engine and fails on drift.

flows.json: the sankey. 20,000 careers per first track per persona, bucketed
into milestone nodes; links between consecutive milestones carry counts and
the dominant forced event; nodes carry medians of current pay, average pay
to date, and cumulative pay for the "you vs the crowd" pane.

Run: uv run python simulate.py
"""

from __future__ import annotations

import json
import statistics as st
from collections import Counter, defaultdict
from pathlib import Path

from engine import PAYDAY, avg_first, block_forced, ltv, milestone_nodes, simulate
from params import PARAMS, STAGES, TRACKS3, plain
from publish import publish
from rng import Mulberry32

HERE = Path(__file__).parent
SEED = 20260906
N_REF = 1000
N_FLOW = 20000


def cohort_seed(persona: str, first: str, stage: str | None, stay: bool) -> int:
    """Deterministic seed per cohort; mirrored in engine/stats.ts."""
    key = f"{persona}|{first}|{stage or 'blended'}|{'stay' if stay else 'free'}"
    h = 0
    for ch in key:
        h = (h * 31 + ord(ch)) & 0xFFFFFFFF
    return (SEED + h) & 0xFFFFFFFF


def pct(xs: list[float], q: float) -> float:
    xs = sorted(xs)
    return xs[min(len(xs) - 1, int(q * len(xs)))]


def summarize(balls, years: int) -> dict:
    a = [avg_first(b, years) for b in balls]
    l = [ltv(b) for b in balls]
    eq = [sum(e.amount for e in b.events if e.kind in ("exit", "tender")) for b in balls]
    w = [b.wealth_by_year[years - 1] for b in balls]
    r = [sum(b.retire_by_year[:years]) for b in balls]
    return {
        "wealth": {"median": pct(w, 0.5), "p10": pct(w, 0.1), "p90": pct(w, 0.9), "retireMedian": pct(r, 0.5)},
        "n": len(balls),
        "avg30": {"mean": st.mean(a), "median": pct(a, 0.5), "p10": pct(a, 0.1), "p90": pct(a, 0.9),
                  "over1M": sum(1 for x in a if x >= 1_000_000)},
        "ltv": {"median": pct(l, 0.5), "p10": pct(l, 0.1), "p90": pct(l, 0.9)},
        "equity": {"median": pct(eq, 0.5), "p90": pct(eq, 0.9), "anyPayday": sum(1 for x in eq if x >= PAYDAY)},
    }


def reference(P) -> dict:
    out = {}
    for persona in ("technical", "nontechnical"):
        for first in TRACKS3:
            for stay in (False, True):
                stages = [None] + STAGES if first == "startup" else [None]
                for stage in stages:
                    rng = Mulberry32(cohort_seed(persona, first, stage, stay))
                    balls = [simulate(persona, first, P, rng, stage=stage, stay=stay) for _ in range(N_REF)]
                    out[f"{persona}|{first}|{stage or 'blended'}|{'stay' if stay else 'free'}"] = summarize(balls, P["plinkoYears"])
    return out


def flows(P) -> dict:
    ms = P["milestones"]
    out = {}
    for persona in ("technical", "nontechnical"):
        node_n: Counter = Counter()
        link_n: Counter = Counter()
        link_forced: dict[str, Counter] = defaultdict(Counter)
        node_pay: dict[str, list] = defaultdict(list)
        node_avg: dict[str, list] = defaultdict(list)
        node_ltv: dict[str, list] = defaultdict(list)
        node_life: dict[str, list] = defaultdict(list)
        node_cash: dict[str, list] = defaultdict(list)
        node_wealth: dict[str, list] = defaultdict(list)
        for first in TRACKS3:
            rng = Mulberry32(cohort_seed(persona, first, None, False) ^ 0x5F10)
            root = f"0:{first}"
            node_n[root] += N_FLOW
            for _ in range(N_FLOW):
                b = simulate(persona, first, P, rng)
                keys = milestone_nodes(b, P)
                forced = block_forced(b, P)
                prev = root
                for i, y in enumerate(ms):
                    nid = f"{y}:{keys[i]}"
                    node_n[nid] += 1
                    link = f"{prev}>{nid}"
                    link_n[link] += 1
                    if forced[i]:
                        link_forced[link][forced[i]] += 1
                    node_pay[nid].append(b.realized[y - 1])
                    node_avg[nid].append(avg_first(b, y))
                    node_ltv[nid].append(sum(b.realized[:y]))
                    node_wealth[nid].append(b.wealth_by_year[y - 1])
                    d = P["demand"].get(b.milestone_track[i]) or P["demand"]["corporate"]
                    node_life[nid].append(d["life"][b.milestone_level[i]])
                    node_cash[nid].append(d["cash"][b.milestone_level[i]])
                    prev = nid
        nodes = {}
        for nid, n in node_n.items():
            row = {"count": n}
            if nid in node_pay:
                row.update({"medPay": pct(node_pay[nid], 0.5), "medAvg": pct(node_avg[nid], 0.5),
                            "medLtv": pct(node_ltv[nid], 0.5), "medWealth": pct(node_wealth[nid], 0.5),
                            "life": st.mean(node_life[nid]),
                            "cash": st.mean(node_cash[nid])})
            nodes[nid] = row
        links = {k: {"count": v, "forced": dict(link_forced[k])} for k, v in link_n.items()}
        out[persona] = {"perTrack": N_FLOW, "nodes": nodes, "links": links}
    return out


if __name__ == "__main__":
    P = plain(PARAMS)
    ref = {"seed": SEED, "n": N_REF, "cohorts": reference(P)}
    blob = json.dumps(ref, indent=1)
    (HERE / "reference.json").write_text(blob)
    print("wrote", publish("reference.json", blob), f"({len(ref['cohorts'])} cohorts)")
    fl = flows(P)
    blob = json.dumps(fl)
    (HERE / "flows.json").write_text(blob)
    print("wrote", publish("flows.json", blob), f"({len(fl['technical']['links'])} links)")
