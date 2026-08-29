"""publish.py — derive the market view and write the browser artifacts.

Two jobs.

1. MAKE THE PLATFORMS COMPARABLE. Raw ADP is not comparable across platforms:
   each is drawn from a different league-size population, so ESPN's deepest
   trusted pick (171) and Yahoo's (144) do not mean the same thing. Averaging
   them directly would invent a consensus that no drafter would recognize.
   Instead each platform is converted to its own RANK ORDER — "the 40th player
   off the board on Sleeper" — which is comparable by construction, and the
   spread is computed in ranks. Raw ADP is still carried and shown, because a
   drafter recognizes "he goes at 40 on Sleeper"; it just is not what the
   arbitrage arithmetic runs on.

2. SPLIT THE ARTIFACTS by refresh cadence. `players.json` (identity + the five
   consensus boards) changes when rankings change; `adp.json` changes daily;
   `adp-history.json` is large and only needed when a sparkline is opened.

Usage:
    uv run python publish.py
"""
from __future__ import annotations

import json
from datetime import date
from pathlib import Path

import pandas as pd

from common import HERE

PUBLIC = HERE.parent.parent / "public" / "draft-sheet"

BOARDS = ["standard", "half", "ppr", "superflex", "half-superflex"]

# Each lane of the ADP track. `kind` is honest about what the number is:
# "adp" is a real average draft position, "rank" is a platform's own ordering.
PLATFORMS = [
    ("yahoo",   "yahoo_adp",           "adp"),
    ("espn",    "espn_adp",            "adp"),
    ("sleeper", "sleeper_search_rank", "rank"),
    ("ffc",     "ffc_adp_ppr",         "adp"),
]

ATTRIBUTION = {
    "ffc": "ADP data provided by Fantasy Football Calculator "
           "(https://fantasyfootballcalculator.com) — free for personal and "
           "commercial use with attribution.",
    "yahoo": "Fantasy data provided by Yahoo Fantasy.",
    "espn": "ADP and ownership from ESPN Fantasy public endpoints.",
    "sleeper": "Player metadata and search rank from the Sleeper API. Sleeper "
               "publishes no ADP; the Sleeper lane is their own ranking.",
    "fantasypros": "Expert consensus rankings and tiers from FantasyPros.",
    "dynastyprocess": "Cross-platform player id crosswalk from DynastyProcess.",
    "nflverse": "Rosters, draft picks and team marks from nflverse.",
}


# How far back the trend arrow looks. Long enough that a single noisy day does
# not flip an arrow, short enough to still be news on draft weekend.
TREND_DAYS = 30


def adp_movement() -> dict[str, float]:
    """Change in ADP over the trailing window, per player.

    POSITIVE MEANS RISING — being drafted earlier than a month ago. ADP itself
    falls as a player rises, so the sign is flipped here rather than in the
    component, where an inverted convention is a bug waiting to be written.

    Returns an empty map when the history file has not been built; the arrow
    simply does not render, which is better than a made-up flat one.
    """
    src = PUBLIC / "adp-history.json"
    if not src.exists():
        # Not fatal — the arrows simply do not render — but it must be visible.
        # This runs BEFORE adp_history.py on a cold machine, which is exactly how
        # a board ships with no movement at all and nothing says so.
        print("  WARNING: adp-history.json missing; no trend arrows will be published")
        return {}
    series = json.loads(src.read_text()).get("series", {})
    cutoff_ms = TREND_DAYS * 86_400_000
    out: dict[str, float] = {}
    for pid, points in series.items():
        if len(points) < 2:
            continue
        now_t, now_v = points[-1]
        # The last point at or before the cutoff, so a player with a gap in
        # coverage is compared against real data rather than interpolated.
        past = [(t, v) for t, v in points if t <= now_t - cutoff_ms]
        if not past:
            continue
        out[pid] = round(past[-1][1] - now_v, 2)
    return out


# What a designation actually means for availability. Sleeper gives the status
# and the body part but no return date, so duration is expressed as what the
# designation itself guarantees under the roster rules rather than as a guess at
# a comeback week.
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


def injury_of(status, part, note) -> dict | None:
    if not status or (isinstance(status, float) and pd.isna(status)):
        return None
    sev, meaning = INJURY.get(str(status), ("questionable", str(status)))
    txt = lambda v: None if v is None or (isinstance(v, float) and pd.isna(v)) else str(v).strip()
    part, note = txt(part), txt(note)

    # Lead with the injury, not the designation. Sleeper lists a player who has
    # had ACL surgery as "Questionable", and "Questionable. Day to day." as the
    # first thing a reader sees actively misleads them about a torn knee.
    head = " · ".join(x for x in (part, note) if x and x.lower() != "undisclosed")
    return {
        "status": str(status),
        "severity": sev,
        "part": part,
        "detail": f"{head} — {meaning}" if head else meaning,
    }


def num(v) -> float | None:
    if v is None or pd.isna(v):
        return None
    return round(float(v), 2)


def txt(v) -> str | None:
    """Missing strings arrive from pandas as float NaN, which is not JSON."""
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    s = str(v).strip()
    return s or None


def main() -> None:
    PUBLIC.mkdir(parents=True, exist_ok=True)
    df = pd.read_parquet(HERE / "data" / "merged.parquet")
    df = df[df["pos"].notna()].copy()

    # ── platform rank order ──────────────────────────────────────────────
    #
    # Two ranks per platform, and the second one matters more than it looks.
    #
    # OVERALL rank makes platforms comparable for the spread. But comparing a
    # platform's overall rank against a consensus rank is systematically wrong
    # for Sleeper: `search_rank` reflects how Sleeper surfaces players, and it
    # puts quarterbacks far higher than a PPR consensus board does. Differenced
    # naively, every quarterback rendered as a screaming "reach" on Sleeper —
    # a bias dressed up as a signal, which is exactly what this sheet must not
    # do.
    #
    # WITHIN-POSITION rank cancels that bias, and is the more useful comparison
    # anyway: a drafter is choosing between running backs, not against the whole
    # board. It drives the color on every platform cell.
    for key, col, _ in PLATFORMS:
        if col not in df:
            df[f"rank_{key}"] = None
            df[f"posrankp_{key}"] = None
            continue
        df[f"rank_{key}"] = df[col].rank(method="min", na_option="keep")
        df[f"posrankp_{key}"] = df.groupby("pos")[col].rank(method="min", na_option="keep")

    # The consensus side of that same comparison.
    df["posrank_ecr"] = df.groupby("pos")["ecr_ppr"].rank(method="min", na_option="keep")

    rank_cols = [f"rank_{k}" for k, _, _ in PLATFORMS]
    ranks = df[rank_cols]
    df["mean_rank"] = ranks.mean(axis=1)
    df["n_sources"] = ranks.notna().sum(axis=1)
    # A spread needs at least two opinions to be a disagreement.
    spread = ranks.max(axis=1) - ranks.min(axis=1)
    df["spread"] = spread.where(df["n_sources"] >= 2)

    df = df.sort_values("ecr_ppr", na_position="last", kind="mergesort").reset_index(drop=True)

    movement = adp_movement()

    # NOTE: iterate records, NOT itertuples(). Pandas renames any column that
    # is not a valid Python identifier to a positional `_N`, which silently
    # dropped the entire `half-superflex` board (hyphen) on the first run. The
    # board came out with zero players and nothing complained.
    players, adp = [], []
    for r in df.to_dict("records"):
        g = r.get
        pid = str(g("fpros_id"))
        bye = g("bye")
        players.append({
            "id": pid,
            "name": txt(g("name")),
            "short": txt(g("short_name")) or txt(g("name")),
            "pos": txt(g("pos")),
            "team": txt(g("team")),
            "bye": int(float(bye)) if txt(bye) else None,
            "espnId": txt(g("espn_id")),
            "yahooHeadshot": txt(g("yahoo_headshot")),
            "ecr": {b: num(g(f"ecr_{b}")) for b in BOARDS},
            "tier": {b: (None if g(f"tier_{b}") is None or pd.isna(g(f"tier_{b}"))
                         else int(g(f"tier_{b}"))) for b in BOARDS},
            "posRank": {b: txt(g(f"posrank_{b}")) for b in BOARDS},
            "ecrStd": num(g("std_ppr")),
            "injury": injury_of(
                g("sleeper_injury"), g("sleeper_injury_part"), g("sleeper_injury_note")
            ),
            "depth": num(g("sleeper_depth_order")),
        })
        adp.append({
            "id": pid,
            "raw": {k: num(g(col)) for k, col, _ in PLATFORMS},
            "rank": {k: num(g(f"rank_{k}")) for k, _, _ in PLATFORMS},
            # Rank within the player's own position, per platform, plus the
            # consensus equivalent. The cell color is the gap between them.
            "posRank": {k: num(g(f"posrankp_{k}")) for k, _, _ in PLATFORMS},
            "posRankEcr": num(g("posrank_ecr")),
            "mean": num(g("mean_rank")),
            "spread": num(g("spread")),
            "n": int(g("n_sources") or 0),
            "dispersion": {
                "stdev": num(g("ffc_stdev")),
                "high": num(g("ffc_high")),
                "low": num(g("ffc_low")),
                "drafts": num(g("ffc_times_drafted")),
            },
            "espnPctOwned": num(g("espn_pct_owned")),
            "espnRankPpr": num(g("espn_rank_ppr")),
            # Positive = rising up draft boards over the last 30 days.
            "move": movement.get(pid),
        })

    for b in BOARDS:
        n = sum(1 for p in players if p["ecr"][b] is not None)
        if n == 0:
            raise SystemExit(f"board '{b}' published zero players — check the merge")

    boards = json.loads((HERE / "data" / "consensus.json").read_text())

    # Source-reported freshness, surfaced for the unattended day-over-day gate. A feed that
    # keeps answering with last week's numbers is the most likely silent failure there is,
    # and it is invisible unless the source's own timestamp is published alongside the data.
    ffc_meta_path = HERE / "data" / "ffc_meta.json"
    ffc_meta = json.loads(ffc_meta_path.read_text()) if ffc_meta_path.exists() else {}
    ffc_window = ffc_meta.get("ppr") or {}
    meta = {
        "_note": "Generated by projects/draft-sheet/publish.py — do not hand-edit.",
        "built": date.today().isoformat(),
        "season": 2026,
        "counts": {"players": len(players)},
        "freshness": {
            # FantasyPros stamps "M/D" with no year and no timezone; it is republished
            # verbatim rather than parsed here, and the gate interprets it against the
            # run date.
            "rankings": boards["ppr"]["last_updated"],
            # Fantasy Football Calculator reports the window its mock-draft pool covers.
            "adpWindowEnd": ffc_window.get("end_date"),
            "adpWindowStart": ffc_window.get("start_date"),
            "adpDrafts": ffc_window.get("total_drafts"),
        },
        "boards": {b: {"lastUpdated": boards[b]["last_updated"],
                       "experts": boards[b]["total_experts"],
                       "players": len(boards[b]["players"])} for b in BOARDS},
        "platforms": [{"key": k, "kind": kind} for k, _, kind in PLATFORMS],
        "trendDays": TREND_DAYS,
        "movementCoverage": sum(1 for a in adp if a["move"] is not None),
        "attribution": ATTRIBUTION,
    }

    def write(name: str, payload) -> None:
        blob = json.dumps(payload, separators=(",", ":"), allow_nan=False)
        (PUBLIC / name).write_text(blob)
        print(f"  {name:22s} {len(blob) / 1024:8.1f} KB")

    write("players.json", {"players": players})
    write("adp.json", {"adp": adp})
    write("meta.json", meta)
    print(f"\nwrote {PUBLIC.relative_to(HERE.parent.parent)}")


if __name__ == "__main__":
    main()
