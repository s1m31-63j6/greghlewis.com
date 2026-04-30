"""v2 smoke audit — top-10 comps for the 4 elite + 4 control prospects, with
NFL outcome class for each comp. The smoke gate for the v2 architectural
pivot.

Pass criterion (per the pivot plan):
- Elite queries: top-10 includes >=3 settled-outcome Pro-Bowl-or-better
  historical players AND spans the outcome range (>=1 Bust/Role tier in 10)
  AND clusters archetypes correctly (Mendoza -> pocket processors NOT mobile-raw).
- Control queries: top-10 must NOT collapse onto elite players. The non-elite
  cluster must surface non-elite comps. Catches the "everyone gets Mahomes"
  pathology if it ever appears.

Run from engine/:
    uv run python scripts/audit_v2_smoke.py
    uv run python scripts/audit_v2_smoke.py --arm feature_v2
    uv run python scripts/audit_v2_smoke.py --compare hybrid feature_v2
"""

from __future__ import annotations

import argparse
import io
import os
import sys
from collections import Counter
from dataclasses import dataclass

import boto3
import polars as pl
from dotenv import load_dotenv

from engine.embedding import comps as comps_mod
from engine.eval.ablation import OUTCOME_TIERS

load_dotenv()


# Smoke-test queries. Elite queries are the 4 stars from the pivot plan;
# their comps should cluster with high-performer archetypes per Greg's reads.
# Control queries are historical mid-tier prospects from the validation
# cohort — used to detect the "elite collapse" pathology where every query
# returns the same handful of HOF-track names.
ELITE_QUERIES = [
    ("Fernando Mendoza", "QB", "pocket processor (McCarthy / Cousins / Stroud)"),
    ("Jeremiyah Love",    "RB", "elite three-down bell-cow (Bijan / Walker / Jeanty)"),
    ("Kenyon Sadiq",      "TE", "elite receiving TE (Kittle / Bowers / McBride)"),
    ("Carnell Tate",      "WR", "high-end pro WR (McConkey / Waddle / JSN)"),
]

CONTROL_QUERIES = [
    ("Hendon Hooker",  "QB", "mid-round QB (Tier: Role/Backup expected)"),
    ("Rachaad White",  "RB", "mid-tier 3rd-round RB"),
    ("Wan'Dale Robinson", "WR", "smaller mid-round WR"),
    ("Greg Dulcich",   "TE", "mid-tier 3rd-round TE"),
]

# Spot-check queries: a mix of additional 2026 prospects (forward-looking) and
# historical sanity checks (well-known archetypes — if Mahomes doesn't comp to
# gunslingers, the architecture has a problem).
SPOT_CHECK_QUERIES = [
    # 2026 prospects beyond the headline 4
    ("Drew Allar",       "QB", "2026 big-body pocket passer (Penn State)"),
    ("LaNorris Sellers", "QB", "2026 mobile gunslinger (South Carolina)"),
    # Historical sanity checks — elite settled outcomes, well-agreed archetypes
    ("Patrick Mahomes",  "QB", "HOF gunslinger (expect: Roethlisberger / Favre / Allen)"),
    ("Saquon Barkley",   "RB", "HOF elite bell-cow (expect: Gurley / Bell / McCaffrey)"),
    ("Justin Jefferson", "WR", "HOF elite separator (expect: Diggs / Cooper Kupp / Hopkins)"),
    ("George Kittle",    "TE", "HOF receiving+blocking TE (expect: Gronk-tier / Kelce-tier)"),
]


@dataclass
class OutcomeRow:
    outcome_class: str | None
    career_av: float | None
    peak_av: float | None
    pro_bowls: int | None


def _load_outcomes_full(curated_bucket: str, cohort: str) -> dict[str, OutcomeRow]:
    """Load outcomes parquet and return {pfr_player_id: OutcomeRow}."""
    s3 = boto3.client("s3")
    try:
        body = s3.get_object(
            Bucket=curated_bucket, Key=f"outcomes/{cohort}/data.parquet"
        )["Body"].read()
    except s3.exceptions.NoSuchKey:
        return {}
    df = pl.read_parquet(io.BytesIO(body))
    out: dict[str, OutcomeRow] = {}
    for row in df.iter_rows(named=True):
        pid = row.get("pfr_player_id")
        if not pid:
            continue
        out[pid] = OutcomeRow(
            outcome_class=row.get("outcome_class"),
            career_av=row.get("career_av"),
            peak_av=row.get("peak_av"),
            pro_bowls=row.get("pro_bowls"),
        )
    return out


def _outcome_for(player_id: str, cohort: str, outcomes: dict[str, dict[str, OutcomeRow]]) -> OutcomeRow | None:
    return outcomes.get(cohort, {}).get(player_id)


def _summarize_outcome_distribution(comps: list, outcomes: dict[str, dict[str, OutcomeRow]]) -> str:
    counts = Counter()
    av_vals: list[float] = []
    for c in comps:
        row = _outcome_for(c.player_id, c.cohort, outcomes)
        if row and row.outcome_class:
            counts[row.outcome_class] += 1
            if row.career_av is not None:
                av_vals.append(float(row.career_av))
    parts = [f"{tier}={counts.get(tier, 0)}" for tier in OUTCOME_TIERS if counts.get(tier)]
    av_summary = ""
    if av_vals:
        av_vals_sorted = sorted(av_vals)
        av_summary = (
            f"  career AV: median={av_vals_sorted[len(av_vals_sorted)//2]:.0f}, "
            f"max={max(av_vals_sorted):.0f}"
        )
    return ", ".join(parts) + av_summary


def _print_comps(label: str, comps: list, outcomes: dict[str, dict[str, OutcomeRow]]) -> None:
    print(f"\n  {label}")
    if not comps:
        print("    (no comps)")
        return
    for c in comps:
        row = _outcome_for(c.player_id, c.cohort, outcomes)
        if row and row.outcome_class:
            cls = row.outcome_class
            av = f"AV={int(row.career_av) if row.career_av is not None else '--'}"
            pb = f"PB={int(row.pro_bowls) if row.pro_bowls is not None else 0}"
            outcome = f" -> {cls:11s}  {av:7s}  {pb}"
        else:
            outcome = " -> (no outcome)"
        cohort_short = c.cohort.split("_")[0]
        print(f"    {c.similarity:+.3f}  {c.name:26s} ({c.position}/{cohort_short}){outcome}")
    print(f"    distribution: {_summarize_outcome_distribution(comps, outcomes)}")


def _run_query(pool, name: str, top_k: int, layer_weights: dict[str, float] | None = None) -> list:
    q_row = pool.df.filter(pl.col("name") == name)
    if q_row.height == 0:
        return []
    cohort = q_row["cohort"][0]
    exclude = {"prediction_2026"} if cohort == "prediction_2026" else None
    return comps_mod.find_comps(
        pool, name, top_k=top_k, exclude_cohorts=exclude,
        layer_weights=layer_weights,
    )


# Compact aliases for the weight-spec CLI
_WEIGHT_ALIASES = {
    "T": "TRAITS",
    "TRAITS": "TRAITS",
    "V": "VOLUME",
    "VOLUME": "VOLUME",
    "B": "BODY",
    "BODY": "BODY",
    "E": "EFFICIENCY",
    "EFFICIENCY": "EFFICIENCY",
    "D": "DRAFT",
    "DRAFT": "DRAFT",
}


def _parse_weights(spec: str) -> dict[str, float]:
    """Parse 'T=0.5,V=0.3,B=0.2' or 'TRAITS=0.5,VOLUME=0.3,BODY=0.2' into
    the layer-name keyed dict find_comps expects.
    Layers not specified default to 0 weight (excluded from the combiner)."""
    out: dict[str, float] = {}
    for part in spec.split(","):
        part = part.strip()
        if not part:
            continue
        if "=" not in part:
            raise ValueError(f"weight spec needs 'LAYER=VALUE', got {part!r}")
        k, v = part.split("=", 1)
        layer = _WEIGHT_ALIASES.get(k.strip().upper())
        if layer is None:
            raise ValueError(
                f"unknown layer {k!r}; expected one of {list(_WEIGHT_ALIASES)}"
            )
        out[layer] = float(v.strip())
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--compare",
        nargs="*",
        default=["hybrid", "feature_v2_traits"],
        help=(
            "space-separated arms to compare side by side (default: hybrid + feature_v2_traits). "
            "Pass --compare with no args to skip named arms entirely (use only --weights). "
            "Use --weights to add additional weighted variants of feature_v2_traits."
        ),
    )
    ap.add_argument(
        "--weights",
        action="append",
        default=[],
        metavar="SPEC",
        help=(
            "Add a weighted feature_v2_traits arm. Spec format: 'T=0.5,V=0.3,B=0.2' "
            "(or 'TRAITS=0.5,VOLUME=0.3,BODY=0.2,EFFICIENCY=0.0'). "
            "Repeatable — each --weights flag adds another comparison column. "
            "Layers not specified get 0 weight."
        ),
    )
    ap.add_argument("--top-k", type=int, default=10)
    ap.add_argument(
        "--queries",
        choices=["all", "elite", "control", "spot", "elite+spot"],
        default="all",
        help=(
            "elite = 4 stars (Mendoza/Love/Sadiq/Tate); control = 4 mid-tier "
            "checks; spot = expanded sanity check (more 2026 + historical "
            "Mahomes/Saquon/Jefferson/Kittle); all = elite+control."
        ),
    )
    ap.add_argument(
        "--positions",
        nargs="+",
        choices=["QB", "RB", "WR", "TE"],
        default=None,
        help="Filter queries to these positions (default: all)",
    )
    args = ap.parse_args()

    # Parse and label each weight spec for the side-by-side output
    weight_arms: list[tuple[str, dict[str, float]]] = []
    for spec in args.weights:
        weights = _parse_weights(spec)
        # Pretty label: T:0.6/V:0.25/B:0.15
        parts = []
        for layer in ("EFFICIENCY", "TRAITS", "VOLUME", "BODY", "DRAFT"):
            if layer in weights:
                parts.append(f"{layer[0]}{weights[layer]:.2f}")
        label = "v2_traits[" + "/".join(parts) + "]"
        weight_arms.append((label, weights))

    cur = os.environ["S3_CURATED_BUCKET"]
    cohorts = ("training_2014_2020", "validation_2021_2025", "prediction_2026")

    print(f"Loading outcomes for {cohorts}...")
    outcomes_by_cohort = {c: _load_outcomes_full(cur, c) for c in cohorts}
    for c, m in outcomes_by_cohort.items():
        print(f"  {c}: {len(m)} outcomes")

    # Pools to load: any explicitly named arm + (if --weights given) the
    # feature_v2_traits pool reused for all weighted variants.
    pools_to_load = list(args.compare)
    if weight_arms and "feature_v2_traits" not in pools_to_load:
        pools_to_load.append("feature_v2_traits")

    print(f"\nLoading {len(pools_to_load)} pool(s) (cohorts: {', '.join(cohorts)})...")
    pools = {}
    for arm in pools_to_load:
        print(f"  loading {arm}...")
        pools[arm] = comps_mod.load_pool(cur, cohorts=cohorts, arm=arm)
        print(f"    {pools[arm].df.height} vectors across {len(pools[arm].by_position)} positions")

    queries = []
    if args.queries in ("all", "elite", "elite+spot"):
        queries.extend([(n, p, e, "ELITE") for n, p, e in ELITE_QUERIES])
    if args.queries in ("all", "control"):
        queries.extend([(n, p, e, "CONTROL") for n, p, e in CONTROL_QUERIES])
    if args.queries in ("spot", "elite+spot"):
        queries.extend([(n, p, e, "SPOT") for n, p, e in SPOT_CHECK_QUERIES])
    if args.positions:
        queries = [q for q in queries if q[1] in args.positions]

    for name, position, expected, kind in queries:
        print()
        print("=" * 72)
        print(f"  {kind}: {name} ({position}) — expected: {expected}")
        print("=" * 72)
        # Named-arm variants (each with its own pool, default weights)
        for arm in args.compare:
            pool = pools[arm]
            res = _run_query(pool, name, args.top_k)
            if not res:
                print(f"\n  arm={arm}: not found")
                continue
            _print_comps(f"arm={arm}", res, outcomes_by_cohort)
        # Weighted variants (all share the feature_v2_traits pool)
        if weight_arms:
            traits_pool = pools["feature_v2_traits"]
            for label, weights in weight_arms:
                res = _run_query(traits_pool, name, args.top_k, layer_weights=weights)
                if not res:
                    print(f"\n  {label}: not found")
                    continue
                _print_comps(label, res, outcomes_by_cohort)

    return 0


if __name__ == "__main__":
    sys.exit(main())
