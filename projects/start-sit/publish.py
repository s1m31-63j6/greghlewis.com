"""publish.py — turn this week's prices into the advisor's artifacts.

Two tiers of evidence, kept apart on purpose:

  book  sportsbook prices from SportsGameOdds — DraftKings, FanDuel and the
        rest. Per book the pair of prices is de-vigged and the line is turned
        into an expected value; the consensus is the median across books. This
        is the headline number wherever it exists.
  dfs   Sleeper's pick'em line. Same arithmetic on the pair of payout
        multipliers, but a multiplier is a contest payout rather than a book's
        price, so this tier only fills in where no book posted a line, and it
        is labeled as such all the way to the screen.

Touchdowns are a rate, not a line. The price of "at least one" gives P(>=1)
and a Poisson count pins the expected number from that.

Every player in the pool is published, priced or not, so the picker can name
a player and say plainly that the market has no line on him. The `coverage`
field is that statement: full, partial, td-only, none, bye, played.

Usage:
    uv run python publish.py [--snapshot daily|final]
"""
from __future__ import annotations

import argparse
import collections
import json
import statistics
from datetime import UTC, datetime

import pandas as pd

import schedule
import sgo
from common import HERE, dump, norm_team, previous_committed
from ev import (
    devig_pair,
    ev_from_line,
    implied_from_multiplier,
    lam_from_p,
    p_from_lam,
    scale_field,
)
from sigma import sigma_at

PUBLIC = HERE.parent.parent / "public" / "start-sit"
DATA = HERE / "data"

# What the market prices for each position. Coverage is graded against this.
EXPECTED = {
    "QB": ["pass_yds", "pass_tds", "ints", "rush_yds", "td"],
    "RB": ["rush_yds", "rush_att", "rec", "rec_yds", "td"],
    "WR": ["rec", "rec_yds", "td"],
    "TE": ["rec", "rec_yds", "td"],
}
OU_STATS = ["pass_yds", "pass_tds", "ints", "rush_yds", "rush_att", "rec", "rec_yds"]

SLEEPER_STATS = {
    "receptions": "rec", "receiving_yards": "rec_yds", "rushing_yards": "rush_yds",
    "rushing_attempts": "rush_att", "passing_yards": "pass_yds",
    "passing_touchdowns": "pass_tds", "interceptions": "ints",
    "anytime_touchdowns": "td",
}

# Sanity thresholds. Fail the build rather than publish a number that has
# stopped resembling football.
MIN_SPEARMAN = 0.6
MAX_LEAN_SD = 1.5
MIN_PRICED = 120
# The books post their own fantasy-score line (DraftKings scoring: full PPR,
# -1 per interception). Our full-PPR total must agree with it, or the
# arithmetic upstream has broken.
FS_MIN_N = 50
FS_MIN_R = 0.98
FS_MAX_GAP = 0.5
# A yardage line under a yard is a yes/no prop ("any rushing yards"), not a
# projection, and the normal inversion turns its lean into negative yards.
MIN_YARD_LINE = 1.0
YARD_STATS = {"pass_yds", "rush_yds", "rec_yds"}

ATTRIBUTION = {
    "sgo": "Sportsbook player props and game lines from SportsGameOdds (sportsgameodds.com), "
           "as posted by DraftKings, FanDuel, BetMGM, Caesars and other books on the plan.",
    "sleeper": "Pick'em lines, player metadata and injury designations from the Sleeper API. "
               "A pick'em line is a contest payout, not a sportsbook price; it is shown as its "
               "own tier and never blended into the sportsbook consensus.",
    "nflverse": "Schedule, spreads and totals, 2025 weekly stats and team marks from nflverse. "
                "Marks and headshots served by ESPN's CDN.",
    "dynastyprocess": "Cross-platform player id crosswalk from DynastyProcess.",
}

INJURY = {
    "IR":   ("out",          "On injured reserve. Out at least four games, and often the season."),
    "PUP":  ("out",          "Physically unable to perform. Misses at least the first four games."),
    "NA":   ("out",          "Not active. Not available to play."),
    "DNR":  ("out",          "Did not report."),
    "Sus":  ("out",          "Suspended."),
    "Out":  ("out",          "Ruled out."),
    "Doubtful": ("doubtful", "Doubtful. Unlikely to play."),
    "Questionable": ("questionable", "Questionable. Day to day."),
    "COV":  ("questionable", "On the COVID list."),
}
BODY_PART_APPLIES = {"IR", "PUP", "Out", "Doubtful", "Questionable", "COV"}


def txt(v) -> str | None:
    return None if v is None or (isinstance(v, float) and pd.isna(v)) else str(v).strip()


def injury_of(status, part, note) -> dict | None:
    status = txt(status)
    if not status:
        return None
    sev, meaning = INJURY.get(status, ("questionable", status))
    part, note = txt(part), txt(note)
    if status not in BODY_PART_APPLIES:
        part = None
    head = " · ".join(x for x in (part, note) if x and x.lower() != "undisclosed")
    return {"status": status, "severity": sev, "part": part,
            "detail": f"{head} — {meaning}" if head else meaning}


def short_name(name: str) -> str:
    parts = name.split()
    return f"{parts[0][0]}. {' '.join(parts[1:])}" if len(parts) > 1 else name


def r2(x: float | None) -> float | None:
    return None if x is None else round(float(x), 2)


# ── the pick'em tier ─────────────────────────────────────────────────────────

def sleeper_rows(games: list[dict]) -> tuple[dict, dict]:
    """{(sleeper_id, stat): {...}} and {sleeper_game_id: game}."""
    lines = json.loads((DATA / "sleeper_lines.json").read_text())
    by_teams = {frozenset((g["home"], g["away"])): g for g in games}
    # A Sleeper game id is opaque; the pair of teams on its lines identifies it.
    teams_of: dict[str, set[str]] = collections.defaultdict(set)
    for x in lines:
        for o in x["options"]:
            t = norm_team(o.get("subject_team"))
            if t:
                teams_of[o["game_id"]].add(t)
    game_of = {gid: by_teams.get(frozenset(t)) for gid, t in teams_of.items() if len(t) == 2}

    rows: dict[tuple[str, str], dict] = {}
    for x in lines:
        stat = SLEEPER_STATS.get(x["wager_type"])
        if stat is None or len(x["options"]) != 2:
            continue
        o = {opt["outcome"]: opt for opt in x["options"]}
        if "over" not in o or "under" not in o or o["over"]["game_status"] != "pre_game":
            continue
        game = game_of.get(o["over"]["game_id"])
        if game is None:
            continue
        p_over, _ = devig_pair(implied_from_multiplier(o["over"]["payout_multiplier"]),
                               implied_from_multiplier(o["under"]["payout_multiplier"]))
        line = float(o["over"]["outcome_value"])
        if stat == "td" and line != 0.5:
            continue
        rows[(x["subject_id"], stat)] = {"line": line, "p_over": p_over, "game": game["id"],
                                         "team": norm_team(o["over"]["subject_team"])}
    return rows, game_of


# ── the sportsbook tier ──────────────────────────────────────────────────────

def book_rows(pool: pd.DataFrame, games: list[dict], team_names: dict[str, str]) -> tuple[dict, list, dict]:
    files = sorted(f for f in (DATA / "raw").glob("sgo-w*.json") if not f.name.endswith(".headers.json"))
    if not files:
        return {}, [], {"present": False}
    rows, sgo_games, diag = sgo.load(files[-1], team_names)
    diag["present"] = True

    # Match a book row to the pool by normalized name within the game's two
    # teams, then by name alone when it is unique in the pool.
    by_key_team = {(r.key, r.team): r.sleeper_id for r in pool.itertuples()}
    by_key = collections.defaultdict(list)
    for r in pool.itertuples():
        by_key[r.key].append(r.sleeper_id)
    aliases = {k: v for k, v in json.loads((HERE / "aliases.json").read_text()).items() if not k.startswith("_")}

    matched: dict[tuple[str, str], list[dict]] = collections.defaultdict(list)
    unmatched: collections.Counter = collections.Counter()
    for r in rows:
        key = aliases.get(r["key"], r["key"])
        sid = None
        for t in (r["team"], r["home"], r["away"]):
            if t and (key, t) in by_key_team:
                sid = by_key_team[(key, t)]
                break
        if sid is None and len(by_key.get(key, [])) == 1:
            sid = by_key[key][0]
        if sid is None:
            # The fantasy-score line is an answer key, not a priced stat, and
            # the books post it for kickers, who are outside the pool by design.
            if r["stat"] != "fantasy_score":
                unmatched[r["name"]] += 1
            continue
        matched[(sid, r["stat"])].append(r)
    diag["unmatched"] = dict(unmatched)
    diag["matchedRows"] = sum(len(v) for v in matched.values())
    (DATA / "unmatched.json").write_text(json.dumps(sorted(unmatched), indent=1))
    return matched, sgo_games, diag


# ── main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--snapshot", choices=["daily", "final"], default="daily")
    args = ap.parse_args()

    pool = pd.read_parquet(DATA / "pool.parquet")
    xw = pd.read_parquet(DATA / "crosswalk.parquet")[["sleeper_id", "espn_id", "gsis_id"]].dropna(subset=["sleeper_id"])
    pool = pool.merge(xw.drop_duplicates("sleeper_id"), on="sleeper_id", how="left", suffixes=("", "_xw"))
    pool["espn_id"] = pool["espn_id"].fillna(pool["espn_id_xw"])
    pool["gsis_id"] = pool["gsis_id"].fillna(pool["gsis_id_xw"])
    sig = json.loads((DATA / "sigma.json").read_text())
    season_avg = json.loads((DATA / "season_avg.json").read_text())
    teams_doc = json.loads((PUBLIC / "teams.json").read_text())["teams"]
    team_names = {t["name"]: abbr for abbr, t in teams_doc.items()}

    sched = schedule.load()
    week = schedule.current_week(sched)
    games = schedule.games_for(sched, week)
    team_game = {g["home"]: g for g in games} | {g["away"]: g for g in games}
    now = datetime.now(UTC)

    dfs, _ = sleeper_rows(games)
    sleeper_updated = max(
        (x.get("updated_at", 0) for x in json.loads((DATA / "sleeper_lines.json").read_text())),
        default=0)
    book, sgo_games, book_diag = book_rows(pool, games, team_names)

    # Sportsbook game lines override nflverse's where both exist.
    for sg in sgo_games:
        g = team_game.get(sg["home"])
        if g and g["away"] == sg["away"] and sg.get("total") and sg.get("spread") is not None:
            total, sp = float(sg["total"]), float(sg["spread"])
            g.update({"spread": sp, "total": total, "homeTotal": round((total - sp) / 2, 2),
                      "awayTotal": round((total + sp) / 2, 2), "lineSource": "sgo",
                      "books": sg.get("books", 0)})
    td_per_point = sig["tdPerPoint"]
    for g in games:
        g["expectedTds"] = {
            g["home"]: None if g["homeTotal"] is None else round(g["homeTotal"] * td_per_point, 2),
            g["away"]: None if g["awayTotal"] is None else round(g["awayTotal"] * td_per_point, 2),
        }

    # ── per player ──
    players = []
    lam_by_team: dict[str, dict[str, float]] = collections.defaultdict(dict)
    unpaired: set[str] = set()
    for r in pool.itertuples():
        g = team_game.get(r.team)
        stats: dict[str, dict] = {}
        for stat in OU_STATS:
            src = [row for row in book.get((r.sleeper_id, stat), [])
                   if not (stat in YARD_STATS and row["line"] < MIN_YARD_LINE)]
            if src:
                evs, lines = [], []
                for row in src:
                    sd = sigma_at(sig["stats"], stat, row["line"])
                    evs.append(max(0.0, ev_from_line(row["line"], row["p_over"], sd)))
                    lines.append(row["line"])
                line = statistics.median(lines)
                ev = statistics.median(evs)
                se = None
                if len(evs) >= 3:
                    q = statistics.quantiles(evs, n=4)
                    se = (q[2] - q[0]) / 1.349
                stats[stat] = {"line": line, "ev": r2(ev), "sd": r2(sigma_at(sig["stats"], stat, line)),
                               "se": r2(se), "books": len(evs), "tier": "book"}
                continue
            d = dfs.get((r.sleeper_id, stat))
            if d and not (stat in YARD_STATS and d["line"] < MIN_YARD_LINE):
                sd = sigma_at(sig["stats"], stat, d["line"])
                stats[stat] = {"line": d["line"], "ev": r2(max(0.0, ev_from_line(d["line"], d["p_over"], sd))),
                               "sd": r2(sd), "se": None, "books": 1, "tier": "dfs"}
        td_src = book.get((r.sleeper_id, "td"))
        if td_src:
            ps = [row["p"] for row in td_src]
            paired = all(row["paired"] for row in td_src)
            p = statistics.median(ps)
            stats["td"] = {"p": r2(p), "lambda": round(lam_from_p(p), 3), "books": len(ps),
                           "tier": "book", "paired": paired, "scaled": 1.0}
        elif (r.sleeper_id, "td") in dfs:
            d = dfs[(r.sleeper_id, "td")]
            stats["td"] = {"p": r2(d["p_over"]), "lambda": round(lam_from_p(d["p_over"]), 3),
                           "books": 1, "tier": "dfs", "paired": True, "scaled": 1.0}
        if "td" in stats:
            lam_by_team[r.team][r.sleeper_id] = stats["td"]["lambda"]
            if not stats["td"]["paired"]:
                unpaired.add(r.sleeper_id)

        expected = EXPECTED[r.pos]
        have = [s for s in expected if s in stats]
        if g is None:
            coverage = "bye"
        elif not stats:
            coverage = "played" if datetime.fromisoformat(g["kickoff"]) < now else "none"
        elif have == ["td"] or (set(have) == {"td"}):
            coverage = "td-only"
        elif all(s in stats for s in expected):
            coverage = "full"
        else:
            coverage = "partial"

        players.append({
            "id": r.sleeper_id, "name": r.name, "short": short_name(r.name), "pos": r.pos,
            "team": r.team, "espnId": txt(r.espn_id), "gsisId": txt(r.gsis_id),
            "rank": int(r.search_rank),
            "game": None if g is None else g["id"],
            "opp": None if g is None else (g["away"] if g["home"] == r.team else g["home"]),
            "home": None if g is None else g["home"] == r.team,
            "kickoff": None if g is None else g["kickoff"],
            "injury": injury_of(r.injury_status, r.injury_part, r.injury_note),
            "coverage": coverage,
            "stats": stats,
        })

    # Touchdown field scaling applies only to unpaired (vig-inclusive) prices.
    # A paired price is already a probability; scaling it would be double
    # counting. The ratio is still measured for every team as a sanity read.
    td_ratio = {}
    for team, lams in lam_by_team.items():
        g = team_game.get(team)
        exp = (g or {}).get("expectedTds", {}).get(team)
        if exp:
            td_ratio[team] = round(sum(lams.values()) / exp, 2)
            f = scale_field({k: v for k, v in lams.items() if k in unpaired}, exp - sum(v for k, v in lams.items() if k not in unpaired))
            if f < 1.0:
                for p in players:
                    if p["id"] in unpaired and p["team"] == team and "td" in p["stats"]:
                        p["stats"]["td"]["lambda"] = round(p["stats"]["td"]["lambda"] * f, 3)
                        p["stats"]["td"]["scaled"] = round(f, 3)

    # The probability shown must be the one the published rate implies. The
    # raw price is vig-inclusive; after field scaling the rate is not, and a
    # card showing "56% to score" beside 0.66 expected touchdowns contradicts
    # itself. Keep the raw figure for the methodology page.
    for p in players:
        t = p["stats"].get("td")
        if t:
            t["pRaw"] = t["p"]
            t["p"] = r2(p_from_lam(t["lambda"]))

    # ── sanity ──
    priced = [p for p in players if p["stats"]]
    if len(priced) < MIN_PRICED:
        raise SystemExit(f"only {len(priced)} priced players — a feed is missing or the week is wrong")
    spearman = {}
    for stat in ("rec_yds", "rush_yds", "pass_yds", "rec"):
        pairs = [(p["stats"][stat]["ev"], season_avg[p["gsisId"]][stat])
                 for p in priced if stat in p["stats"] and p["gsisId"] in season_avg]
        if len(pairs) >= 15:
            df = pd.DataFrame(pairs, columns=["ev", "avg"])
            # Rank correlation by hand: pandas defers Spearman to scipy.
            spearman[stat] = round(float(df["ev"].rank().corr(df["avg"].rank())), 3)
    bad = [s for s, v in spearman.items() if v < MIN_SPEARMAN]
    if bad:
        raise SystemExit(f"market EV no longer tracks last season for {bad}: {spearman}")
    lean = max((abs(s["ev"] - s["line"]) / s["sd"] for p in priced for k, s in p["stats"].items()
                if k != "td"), default=0)
    if lean > MAX_LEAN_SD:
        raise SystemExit(f"an EV sits {lean:.2f} spreads from its line — the de-vig is broken")

    # Object ledger: the feed reports no usage, so this month's count is the
    # previous committed count plus this run's events, counted once per fetch
    # (a publish over a cached snapshot adds nothing).
    usage_file = json.loads((DATA / "usage.json").read_text()) if (DATA / "usage.json").exists() else None
    prev = previous_committed("public/start-sit/meta.json") or {}
    month = now.strftime("%Y-%m")
    prev_usage = prev.get("usage") or {}
    objects = prev_usage.get("objects", 0) if prev_usage.get("month") == month else 0
    fetched_new = bool(usage_file) and usage_file.get("at", "") > prev.get("builtAt", "")
    if fetched_new:
        objects += usage_file.get("events", 0)
    usage = {"month": month, "objects": objects, "plan": 2500,
             "lastFetch": usage_file.get("at") if usage_file else None,
             "lastFetchEvents": usage_file.get("events") if usage_file else None}

    # Against the books' own fantasy-score line, full PPR and -1 per INT.
    def full_ppr(p: dict) -> float:
        w = {"pass_yds": .04, "pass_tds": 4, "ints": -1, "rush_yds": .1, "rush_att": 0, "rec": 1, "rec_yds": .1}
        total = sum(v["ev"] * w[k] for k, v in p["stats"].items() if k != "td")
        return total + 6 * p["stats"]["td"]["lambda"] if "td" in p["stats"] else total
    fs_pairs = [(full_ppr(p), book[(p["id"], "fantasy_score")][0]["line"])
                for p in players if p["coverage"] == "full" and (p["id"], "fantasy_score") in book]
    fantasy_score = {"n": len(fs_pairs), "r": None, "meanGap": None}
    if len(fs_pairs) >= FS_MIN_N:
        df = pd.DataFrame(fs_pairs, columns=["ours", "book"])
        fantasy_score["r"] = round(float(df["ours"].corr(df["book"])), 4)
        fantasy_score["meanGap"] = round(float((df["ours"] - df["book"]).mean()), 3)
        if fantasy_score["r"] < FS_MIN_R or abs(fantasy_score["meanGap"]) > FS_MAX_GAP:
            raise SystemExit(f"our totals no longer match the books' fantasy-score line: {fantasy_score}")

    counts = collections.Counter(p["coverage"] for p in players)
    books = sorted(book_diag.get("books", {}).keys())
    tiers = collections.Counter(s["tier"] for p in priced for s in p["stats"].values())
    meta = {
        "_note": "Generated by projects/start-sit/publish.py — do not hand-edit.",
        "built": now.date().isoformat(), "builtAt": now.isoformat(timespec="seconds"),
        "season": schedule.SEASON, "week": week, "snapshot": args.snapshot,
        "counts": {"pool": len(players), "priced": len(priced), "full": counts["full"],
                   "partial": counts["partial"], "tdOnly": counts["td-only"], "none": counts["none"],
                   "bye": counts["bye"], "played": counts["played"], "games": len(games),
                   "books": len(books), "bookStats": tiers["book"], "dfsStats": tiers["dfs"],
                   "unmatched": len(book_diag.get("unmatched", {}))},
        "books": books,
        "sigma": sig["stats"], "sigmaSeason": sig["season"], "tdPerPoint": td_per_point,
        "usage": usage,
        "freshness": {"sleeperLines": sleeper_updated,
                      "sgoFetchedAt": book_diag.get("fetchedAt")},
        "sanity": {"ran": True, "spearman": spearman, "maxLeanSd": round(lean, 3),
                   "tdRatio": td_ratio, "fantasyScore": fantasy_score},
        "unmatched": sorted(book_diag.get("unmatched", {}))[:20],
        "attribution": ATTRIBUTION,
    }

    for name, payload in (
        ("players.json", {"_note": meta["_note"], "week": week, "players": players}),
        ("games.json", {"_note": meta["_note"], "week": week, "games": games}),
        ("meta.json", meta),
    ):
        kb = dump(PUBLIC / name, payload) / 1024
        print(f"  {name:13s} {kb:6.0f} KB")
    print(f"  week {week}: {len(priced)} priced of {len(players)} in the pool — "
          f"{dict(counts)}")
    print(f"  stats by tier: {dict(tiers)}; books: {books or 'none (no SGO snapshot)'}")
    print(f"  spearman vs 2025: {spearman}; max lean {lean:.2f} sd")
    print(f"  vs the books' fantasy-score line: {fantasy_score}")
    if book_diag.get("present"):
        print(f"  sgo: {book_diag['events']} events, {book_diag['rows']} rows, "
              f"{book_diag['matchedRows']} matched, unmatched {sorted(book_diag['unmatched'])[:10]}")
        if book_diag.get("unknownStats"):
            print(f"  sgo unknown statIDs: {book_diag['unknownStats']}")


if __name__ == "__main__":
    main()
