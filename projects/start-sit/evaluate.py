"""evaluate.py — score a week's lines against what happened.

The market is the projection; this is the test of it. For each committed
snapshot of the week (Saturday, Sunday morning, Sunday final) and, where the
per-book archive exists, for each book and tier, the evaluator measures:

  1. per stat: absolute error, bias, and the share of actuals over the line
  2. band coverage: how often the actual total fell inside p20–p80 (target 60%)
  3. touchdowns: Brier score and calibration by bucket, raw price vs scaled
  4. fantasy points: MAE by position against three baselines — the books' own
     fantasy-score line, the 2025 per-game average, and the pick'em tier alone
  5. the verdict: hit rate by projected gap across every same-position pair,
     and the gap at which the favorite wins ≥ 60%, which is what the
     "too close to call" rule will be set from once two weeks exist
  6. the week's story: league-wide bias and the largest misses by name

Snapshots are read from git history; actuals from nflverse. Writes
public/start-sit/eval.json (accumulating by week) and results/eval-wNN.md.

Usage:
    uv run python evaluate.py [--week N] [--raw data/raw/sgo-w01.json]
"""
from __future__ import annotations

import argparse
import collections
import json
import subprocess
from datetime import UTC, datetime
from itertools import combinations, pairwise
from pathlib import Path

import nflreadpy as nfl
import numpy as np
import pandas as pd

import schedule
import sgo
from common import HERE, dump
from sim import draw_points, weights

PUBLIC = HERE.parent.parent / "public" / "start-sit"
ROOT = HERE.parent.parent
STATS = ["pass_yds", "pass_tds", "ints", "rush_yds", "rush_att", "rec", "rec_yds"]
ACTUAL_COL = {"pass_yds": "passing_yards", "pass_tds": "passing_tds", "ints": "passing_interceptions",
              "rush_yds": "rushing_yards", "rush_att": "carries", "rec": "receptions",
              "rec_yds": "receiving_yards"}
GAP_EDGES = [0, 1, 2, 3, 5, 100]
TARGET_HIT = 0.60
SCORING = {"standard": 0.0, "half": 0.5, "ppr": 1.0}


# ── snapshots from git ───────────────────────────────────────────────────────

def git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=ROOT, check=True, capture_output=True, text=True).stdout


def snapshots(week: int) -> list[dict]:
    """Every committed snapshot of the week, oldest first."""
    shas = git("log", "--format=%H", "--", "public/start-sit/players.json").split()
    out = []
    for sha in shas:
        try:
            meta = json.loads(git("show", f"{sha}:public/start-sit/meta.json"))
        except subprocess.CalledProcessError:
            continue
        if meta.get("week") != week:
            continue
        players = json.loads(git("show", f"{sha}:public/start-sit/players.json"))["players"]
        lines = None
        try:
            lines = json.loads(git("show", f"{sha}:public/start-sit/lines.json"))["lines"]
        except subprocess.CalledProcessError:
            pass
        out.append({"sha": sha[:7], "builtAt": meta["builtAt"], "snapshot": meta.get("snapshot", "daily"),
                    "players": players, "lines": lines})
    return sorted(out, key=lambda s: s["builtAt"])


# ── actuals from nflverse ────────────────────────────────────────────────────

def actuals(week: int) -> pd.DataFrame:
    df = nfl.load_player_stats(seasons=[schedule.SEASON]).to_pandas()
    df = df[(df["season_type"] == "REG") & (df["week"] == week)].copy()
    df["td"] = df["rushing_tds"] + df["receiving_tds"]
    df["two_pt"] = df["passing_2pt_conversions"] + df["rushing_2pt_conversions"] + df["receiving_2pt_conversions"]
    df["fumbles_lost"] = df["rushing_fumbles_lost"] + df["receiving_fumbles_lost"] + df["sack_fumbles_lost"]
    return df.set_index("player_id")


def actual_points(row: pd.Series, rec: float, pass_td: float = 4.0) -> float:
    return (0.04 * row["passing_yards"] + pass_td * row["passing_tds"] - 1.0 * row["passing_interceptions"]
            + 0.1 * row["rushing_yards"] + 0.1 * row["receiving_yards"] + rec * row["receptions"] + 6 * row["td"])


def model_points(stats: dict, w: dict[str, float]) -> float:
    total = sum(w[k] * s["ev"] for k, s in stats.items() if k != "td")
    return total + (w["td"] * stats["td"]["lambda"] if "td" in stats else 0.0)


# ── metrics ──────────────────────────────────────────────────────────────────

def r3(x: float) -> float:
    return round(float(x), 3)


def per_stat(players: list[dict], act: pd.DataFrame) -> dict:
    out = {}
    for stat in STATS:
        errs, over, n = [], 0, 0
        for p in players:
            s = p["stats"].get(stat)
            if not s or p["gsisId"] not in act.index:
                continue
            a = float(act.loc[p["gsisId"], ACTUAL_COL[stat]])
            errs.append(a - s["ev"])
            over += a > s["line"]
            n += 1
        if n >= 15:
            out[stat] = {"n": n, "mae": r3(np.mean(np.abs(errs))), "bias": r3(np.mean(errs)),
                         "overRate": r3(over / n)}
    return out


def band_coverage(players: list[dict], act: pd.DataFrame, rec: float) -> dict:
    w = weights(rec)
    rng = np.random.default_rng(11)
    below = inside = above = 0
    for p in players:
        if p["coverage"] not in ("full", "partial") or p["gsisId"] not in act.index:
            continue
        d = draw_points(p["stats"], w, 3000, rng)
        lo, hi = np.percentile(d, 20), np.percentile(d, 80)
        a = actual_points(act.loc[p["gsisId"]], rec)
        if a < lo:
            below += 1
        elif a > hi:
            above += 1
        else:
            inside += 1
    n = below + inside + above
    return {"n": n, "inside": r3(inside / n), "below": r3(below / n), "above": r3(above / n)} if n else {"n": 0}


def touchdowns(players: list[dict], act: pd.DataFrame) -> dict:
    rows = [(p["stats"]["td"]["p"], p["stats"]["td"].get("pRaw", p["stats"]["td"]["p"]),
             float(act.loc[p["gsisId"], "td"]) >= 1)
            for p in players if "td" in p["stats"] and p["gsisId"] in act.index]
    if len(rows) < 30:
        return {"n": len(rows)}
    p, praw, y = (np.array([r[i] for r in rows], dtype=float) for i in range(3))
    edges = [0, .2, .35, .5, .65, 1.01]
    buckets = []
    for lo, hi in pairwise(edges):
        m = (p >= lo) & (p < hi)
        if m.sum() >= 8:
            buckets.append({"from": lo, "to": min(hi, 1.0), "n": int(m.sum()),
                            "predicted": r3(p[m].mean()), "scored": r3(y[m].mean())})
    return {"n": len(rows), "brier": r3(np.mean((p - y) ** 2)), "brierRaw": r3(np.mean((praw - y) ** 2)),
            "baseRate": r3(y.mean()), "meanP": r3(p.mean()), "meanPRaw": r3(praw.mean()), "buckets": buckets}


def points_table(players: list[dict], act: pd.DataFrame, season_avg: dict, fs_lines: dict[str, float] | None) -> dict:
    """Ours vs the baselines, MAE and bias by position, full PPR."""
    w = weights(1.0)
    out = {}
    for pos in ("QB", "RB", "WR", "TE"):
        ours, fs, avg, dfs = [], [], [], []
        for p in players:
            if p["pos"] != pos or p["coverage"] != "full" or p["gsisId"] not in act.index:
                continue
            a = actual_points(act.loc[p["gsisId"]], 1.0)
            ours.append(a - model_points(p["stats"], w))
            if fs_lines and p["id"] in fs_lines:
                fs.append(a - fs_lines[p["id"]])
            sa = season_avg.get(p["gsisId"])
            if sa:
                avg.append(a - (0.04 * sa["pass_yds"] + 4 * sa["pass_tds"] - sa["ints"] + 0.1 * sa["rush_yds"]
                                + 0.1 * sa["rec_yds"] + sa["rec"] + 6 * sa["td"]))
            if all(s["tier"] == "dfs" for s in p["stats"].values()):
                dfs.append(a - model_points(p["stats"], w))
        def summ(e):
            return {"n": len(e), "mae": r3(np.mean(np.abs(e))), "bias": r3(np.mean(e))} if len(e) >= 8 else {"n": len(e)}
        out[pos] = {"ours": summ(ours), "bookFantasyLine": summ(fs), "lastSeasonAvg": summ(avg), "pickemOnly": summ(dfs)}
    return out


def verdict_calibration(players: list[dict], act: pd.DataFrame, rec: float) -> dict:
    w = weights(rec)
    rng = np.random.default_rng(23)
    draws, means, actual = {}, {}, {}
    for p in players:
        if p["coverage"] != "full" or p["gsisId"] not in act.index or p["coverage"] == "played":
            continue
        draws[p["id"]] = draw_points(p["stats"], w, 2000, rng)
        means[p["id"]] = model_points(p["stats"], w)
        actual[p["id"]] = actual_points(act.loc[p["gsisId"]], rec)
    by_pos = collections.defaultdict(list)
    for p in players:
        if p["id"] in draws:
            by_pos[p["pos"]].append(p["id"])
    gaps, pwin, hit = [], [], []
    for ids in by_pos.values():
        for a, b in combinations(ids, 2):
            if means[a] < means[b]:
                a, b = b, a
            gaps.append(means[a] - means[b])
            pwin.append(float(np.mean(draws[a] > draws[b])))
            hit.append(float(actual[a] > actual[b]))
    gaps, pwin, hit = np.array(gaps), np.array(pwin), np.array(hit)
    buckets = []
    for lo, hi in pairwise(GAP_EDGES):
        m = (gaps >= lo) & (gaps < hi)
        if m.sum():
            buckets.append({"from": lo, "to": hi if hi < 100 else None, "n": int(m.sum()),
                            "hitRate": r3(hit[m].mean()), "meanPWin": r3(pwin[m].mean())})
    # The smallest gap bucket in which the favorite won 60% or more on its own.
    # Cumulative from zero would always pass, because the wide gaps carry it.
    suggested = None
    for b in buckets:
        if b["n"] >= 50 and b["hitRate"] >= TARGET_HIT:
            suggested = {"minGap": b["from"], "hitRate": b["hitRate"], "n": b["n"]}
            break
    pbuckets = []
    for lo, hi in zip([.5, .6, .7, .8, .9], [.6, .7, .8, .9, 1.01]):
        m = (pwin >= lo) & (pwin < hi)
        if m.sum():
            pbuckets.append({"from": lo, "to": min(hi, 1.0), "n": int(m.sum()),
                             "predicted": r3(pwin[m].mean()), "won": r3(hit[m].mean())})
    return {"pairs": len(gaps), "overallHit": r3(hit.mean()), "brierPWin": r3(np.mean((pwin - hit) ** 2)),
            "byGap": buckets, "byPWin": pbuckets, "suggested": suggested}


def story(players: list[dict], act: pd.DataFrame, rec: float) -> dict:
    w = weights(rec)
    rows = []
    for p in players:
        if p["coverage"] != "full" or p["gsisId"] not in act.index:
            continue
        a = actual_points(act.loc[p["gsisId"]], rec)
        m = model_points(p["stats"], w)
        rows.append((a - m, p["name"], p["pos"], p["team"], round(m, 1), round(a, 1)))
    rows.sort()
    fmt = lambda r: {"name": r[1], "pos": r[2], "team": r[3], "projected": r[4], "actual": r[5], "diff": round(r[0], 1)}
    diffs = [r[0] for r in rows]
    return {"n": len(rows), "bias": r3(np.mean(diffs)), "mae": r3(np.mean(np.abs(diffs))),
            "hot": [fmt(r) for r in rows[-10:][::-1]], "cold": [fmt(r) for r in rows[:10]]}


def per_book(raw_lines: dict | None, players: list[dict], act: pd.DataFrame) -> dict:
    """Per-book MAE per stat from the archive: {player id: {stat: [{book, line, pOver}]}}."""
    if not raw_lines:
        return {}
    by_id = {p["id"]: p for p in players}
    errs: dict[str, dict[str, list]] = collections.defaultdict(lambda: collections.defaultdict(list))
    for pid, stats in raw_lines.items():
        p = by_id.get(pid)
        if not p or p["gsisId"] not in act.index:
            continue
        for stat, rows in stats.items():
            if stat not in ACTUAL_COL:
                continue
            a = float(act.loc[p["gsisId"], ACTUAL_COL[stat]])
            for r in rows:
                errs[r["book"]][stat].append(abs(a - r["line"]))
    out = {}
    for book, stats in errs.items():
        out[book] = {stat: {"n": len(e), "mae": r3(np.mean(e))} for stat, e in stats.items() if len(e) >= 15}
        allv = [x for e in stats.values() for x in e]
        out[book]["all"] = {"n": len(allv), "mae": r3(np.mean(allv))}
    return out


def archive_from_raw(raw_path: Path, players: list[dict]) -> tuple[dict, dict[str, float]]:
    """Week 1 only: the pipeline did not archive per-book lines yet, so rebuild
    the archive (and the books' fantasy-score lines) from a raw sportsbook pull."""
    teams = json.loads((PUBLIC / "teams.json").read_text())["teams"]
    names = {t["name"]: abbr for abbr, t in teams.items()}
    rows, _, _ = sgo.load(raw_path, names)
    from common import norm_name
    by_key = collections.defaultdict(list)
    for p in players:
        by_key[norm_name(p["name"])].append(p)
    aliases = {k: v for k, v in json.loads((HERE / "aliases.json").read_text()).items() if not k.startswith("_")}
    archive: dict[str, dict] = collections.defaultdict(lambda: collections.defaultdict(list))
    fs: dict[str, float] = {}
    for r in rows:
        cands = by_key.get(aliases.get(r["key"], r["key"]), [])
        p = next((c for c in cands if c["team"] in (r["team"], r["home"], r["away"])), cands[0] if len(cands) == 1 else None)
        if not p:
            continue
        if r["stat"] == "fantasy_score":
            fs[p["id"]] = r["line"]
        elif r["stat"] != "td":
            archive[p["id"]][r["stat"]].append({"book": r["book"], "line": r["line"], "pOver": r["p_over"]})
    return archive, fs


# ── report ───────────────────────────────────────────────────────────────────

def markdown(week: int, ev: dict) -> str:
    L = [f"# Week {week} evaluation", "", f"Actuals: {ev['games']} games; built {ev['evaluatedAt']}.", ""]
    L.append("## Snapshots")
    L.append("| snapshot | built (UTC) | priced | points MAE (PPR) | bias | inside p20–p80 |")
    L.append("|---|---|---|---|---|---|")
    for s in ev["snapshots"]:
        L.append(f"| {s['snapshot']} {s['sha']} | {s['builtAt'][:16]} | {s['priced']} | {s['story']['mae']} | {s['story']['bias']:+} | {s['band']['ppr'].get('inside', '—')} |")
    f = ev["final"]
    L += ["", f"## Final snapshot ({f['sha']}, {f['builtAt'][:16]} UTC)", "", "### Who predicted best (full PPR, MAE / bias)", "",
          "| pos | ours | books' fantasy line | 2025 avg | pick'em only |", "|---|---|---|---|---|"]
    for pos, t in f["points"].items():
        cell = lambda d: f"{d['mae']} / {d['bias']:+} (n={d['n']})" if "mae" in d else f"— (n={d['n']})"
        L.append(f"| {pos} | {cell(t['ours'])} | {cell(t['bookFantasyLine'])} | {cell(t['lastSeasonAvg'])} | {cell(t['pickemOnly'])} |")
    L += ["", "### Per stat", "", "| stat | n | MAE | bias | share over the line |", "|---|---|---|---|---|"]
    for stat, t in f["perStat"].items():
        L.append(f"| {stat} | {t['n']} | {t['mae']} | {t['bias']:+} | {t['overRate']} |")
    td = f["touchdowns"]
    L += ["", f"### Touchdowns (n={td['n']}): Brier {td.get('brier')} scaled vs {td.get('brierRaw')} raw; scored {td.get('baseRate')} vs predicted {td.get('meanP')} scaled / {td.get('meanPRaw')} raw", ""]
    for b in td.get("buckets", []):
        L.append(f"- p {b['from']:.2f}–{b['to']:.2f}: n={b['n']}, predicted {b['predicted']}, scored {b['scored']}")
    v = f["verdict"]
    L += ["", f"### Verdict calibration: {v['pairs']} same-position pairs, favorite won {v['overallHit']}, Brier of P(A>B) {v['brierPWin']}", ""]
    for b in v["byGap"]:
        L.append(f"- gap {b['from']}–{b['to'] if b['to'] else '∞'}: n={b['n']}, favorite won {b['hitRate']} (mean P(A>B) {b['meanPWin']})")
    L.append(f"- suggested minimum gap for a call: {v['suggested']}")
    if f["perBook"]:
        L += ["", "### Per book, MAE of the posted line", "", "| book | all | " + " | ".join(STATS) + " |", "|---|---|" + "---|" * len(STATS)]
        for book, t in sorted(f["perBook"].items(), key=lambda kv: kv[1]["all"]["mae"]):
            L.append(f"| {book} | {t['all']['mae']} (n={t['all']['n']}) | " + " | ".join(str(t.get(s, {}).get("mae", "—")) for s in STATS) + " |")
    st = f["story"]
    L += ["", f"### The week: bias {st['bias']:+} points per player (actual − projected), MAE {st['mae']}", "", "Hot:"]
    L += [f"- {r['name']} ({r['pos']} {r['team']}): projected {r['projected']}, actual {r['actual']} ({r['diff']:+})" for r in st["hot"]]
    L += ["", "Cold:"] + [f"- {r['name']} ({r['pos']} {r['team']}): projected {r['projected']}, actual {r['actual']} ({r['diff']:+})" for r in st["cold"]]
    return "\n".join(L) + "\n"


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--week", type=int)
    ap.add_argument("--raw", help="raw sportsbook pull to rebuild per-book lines from (week 1 only)")
    args = ap.parse_args()
    sched = schedule.load()
    week = args.week or max(1, schedule.current_week(sched) - 1)
    act = actuals(week)
    played = int(sched[(sched["week"] == week)]["home_score"].notna().sum())
    if act.empty:
        raise SystemExit(f"no week {week} stats yet")
    snaps = snapshots(week)
    if not snaps:
        raise SystemExit(f"no committed snapshots for week {week}")
    season_avg = json.loads((HERE / "data" / "season_avg.json").read_text())

    results = []
    for s in snaps:
        pl = s["players"]
        fs = None
        lines = s["lines"]
        if lines is None and args.raw:
            lines, fs = archive_from_raw(Path(args.raw), pl)
        elif lines:
            fs = None  # fantasy-score lines ride in meta from now on; see publish.py
        results.append({
            "sha": s["sha"], "builtAt": s["builtAt"], "snapshot": s["snapshot"],
            "priced": sum(1 for p in pl if p["stats"]),
            "perStat": per_stat(pl, act),
            "band": {k: band_coverage(pl, act, v) for k, v in SCORING.items()},
            "touchdowns": touchdowns(pl, act),
            "points": points_table(pl, act, season_avg, fs),
            "verdict": verdict_calibration(pl, act, 0.5),
            "story": story(pl, act, 0.5),
            "perBook": per_book(lines, pl, act),
            "booksFrom": "archive" if s["lines"] else ("raw pull" if args.raw else None),
        })
    final = results[-1]
    ev = {"week": week, "games": played, "evaluatedAt": datetime.now(UTC).isoformat(timespec="minutes"),
          "snapshots": [{k: v for k, v in r.items() if k in ("sha", "builtAt", "snapshot", "priced", "story", "band")} for r in results],
          "final": final}
    out = PUBLIC / "eval.json"
    doc = json.loads(out.read_text()) if out.exists() else {"_note": "Generated by projects/start-sit/evaluate.py — do not hand-edit.", "weeks": {}}
    doc["weeks"][str(week)] = ev
    doc["target"] = {"bandInside": 0.6, "verdictHit": TARGET_HIT}
    kb = dump(out, doc) / 1024
    md = markdown(week, ev)
    (HERE / "results" / f"eval-w{week:02d}.md").write_text(md)
    print(md)
    print(f"wrote public/start-sit/eval.json ({kb:.0f} KB) and results/eval-w{week:02d}.md")


if __name__ == "__main__":
    main()
