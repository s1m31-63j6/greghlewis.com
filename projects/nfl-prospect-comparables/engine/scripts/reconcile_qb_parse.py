"""QB parse reconciliation.

For every cohort QB:
  1. Find their espn_id and college teams via ff_playerids + cfbd/rosters.
  2. Parse every CFBD play in their college seasons; attribute via NameResolver.
  3. Aggregate parsed totals: pass_attempts, pass_completions, pass_tds,
     interceptions.
  4. Compare to CFBD `player_season_stats` box totals.
  5. Report per-QB reconciliation %; flag QBs below the gate.

Usage (from engine/):
    uv run python scripts/reconcile_qb_parse.py
"""

from __future__ import annotations

import io
import json
import os
import sys
import time
from collections import defaultdict

import polars as pl
from dotenv import load_dotenv

from engine.io import s3 as s3io
from engine.parse.playtext import (
    PASS_PLAY_TYPES,
    RUSH_PLAY_TYPES,
    parse_play,
)
from engine.parse.resolver import NameResolver
from engine.schema import PlayerProfile

load_dotenv()


def _list_keys(bucket: str, prefix: str) -> list[str]:
    paginator = s3io._client().get_paginator("list_objects_v2")
    return [
        obj["Key"]
        for page in paginator.paginate(Bucket=bucket, Prefix=prefix)
        for obj in page.get("Contents", [])
    ]


def _read_parquet(bucket: str, key: str) -> pl.DataFrame:
    body = s3io._client().get_object(Bucket=bucket, Key=key)["Body"].read()
    return pl.read_parquet(io.BytesIO(body))


def _load_cohort_qbs(curated: str) -> list[PlayerProfile]:
    qbs: list[PlayerProfile] = []
    for cohort in ("training_2014_2020", "validation_2021_2025"):
        body = s3io._client().get_object(
            Bucket=curated, Key=f"profiles/{cohort}/data.jsonl"
        )["Body"].read().decode()
        for line in body.splitlines():
            if not line:
                continue
            p = PlayerProfile.model_validate_json(line)
            if p.position.value == "QB":
                qbs.append(p)
    return qbs


def _qb_espn_ids(raw: str, qbs: list[PlayerProfile]) -> dict[str, int]:
    """Map pfr_id → espn_id via ff_playerids."""
    df = _read_parquet(raw, "raw/nflverse/ff_playerids/data.parquet")
    df = df.select(
        pl.col("pfr_id"),
        pl.col("espn_id").cast(pl.Int64, strict=False).alias("espn_id"),
    )
    out: dict[str, int] = {}
    pfr_set = {q.player_id for q in qbs}
    for row in df.iter_rows(named=True):
        if row["pfr_id"] in pfr_set and row["espn_id"] is not None:
            out[row["pfr_id"]] = int(row["espn_id"])
    return out


def _qb_box_totals(raw: str, espn_ids: set[int]) -> dict[tuple[int, int], dict[str, int]]:
    """Per (espn_id, season) box totals from cfbd/player_season_stats.

    Returns: { (espn_id, season) -> {pass_att, pass_comp, pass_yds, pass_td, int} }
    """
    keys = sorted(
        k for k in _list_keys(raw, "raw/cfbd/player_season_stats/")
        if k.endswith("data.parquet")
    )
    totals: dict[tuple[int, int], dict[str, int]] = {}
    for k in keys:
        df = _read_parquet(raw, k)
        df = df.with_columns(
            pl.col("playerId").cast(pl.Int64, strict=False).alias("eid")
        ).filter(pl.col("eid").is_in(list(espn_ids)) & (pl.col("category") == "passing"))
        for row in df.iter_rows(named=True):
            key = (int(row["eid"]), int(row["season"]))
            t = totals.setdefault(key, {"pass_att": 0, "pass_comp": 0, "pass_yds": 0, "pass_td": 0, "int": 0})
            try:
                v = int(float(row["stat"]))
            except (ValueError, TypeError):
                continue
            stype = row["statType"]
            if stype == "ATT":
                t["pass_att"] = v
            elif stype == "COMPLETIONS":
                t["pass_comp"] = v
            elif stype == "YDS":
                t["pass_yds"] = v
            elif stype == "TD":
                t["pass_td"] = v
            elif stype == "INT":
                t["int"] = v
    return totals


def _parse_all_plays(raw: str, espn_ids: set[int], resolver: NameResolver) -> dict[tuple[int, int], dict[str, int]]:
    """Parse all CFBD plays, attribute to espn_ids, aggregate per (espn_id, season).

    Returns: { (espn_id, season) -> {pass_att, pass_comp, pass_td, int, sack} }
    """
    keys = sorted(
        k for k in _list_keys(raw, "raw/cfbd/plays/")
        if k.endswith("data.parquet")
    )
    parsed_totals: dict[tuple[int, int], dict[str, int]] = defaultdict(
        lambda: {"pass_att": 0, "pass_comp": 0, "pass_td": 0, "int": 0, "sack": 0}
    )
    n_files = len(keys)
    started = time.monotonic()
    for i, k in enumerate(keys, 1):
        df = _read_parquet(raw, k)
        season = int(k.split("season=")[1].split("/")[0])
        df = df.filter(pl.col("playType").is_in(list(PASS_PLAY_TYPES | RUSH_PLAY_TYPES)))
        for row in df.iter_rows(named=True):
            pp = parse_play(row.get("playType"), row.get("playText"))
            if pp.parsed_type == "other" or pp.parsed_type == "kneel":
                continue
            offense = row.get("offense")
            # Attribute QB plays
            if pp.parsed_type in ("pass_complete", "pass_incomplete", "pass_int", "pass_td", "sack"):
                qb_id = resolver.resolve(season=season, team=offense, name=pp.passer)
                if qb_id is None or qb_id not in espn_ids:
                    continue
                key = (qb_id, season)
                t = parsed_totals[key]
                # Pass attempts: complete, incomplete, int, td (sacks excluded)
                if pp.parsed_type in ("pass_complete", "pass_incomplete", "pass_int", "pass_td"):
                    t["pass_att"] += 1
                if pp.parsed_type == "pass_complete" or pp.parsed_type == "pass_td":
                    t["pass_comp"] += 1
                if pp.parsed_type == "pass_td":
                    t["pass_td"] += 1
                if pp.parsed_type == "pass_int":
                    t["int"] += 1
                if pp.parsed_type == "sack":
                    t["sack"] += 1
        if i % 30 == 0 or i == n_files:
            print(f"    [{i}/{n_files}] {k.split('plays/')[1]:60s} elapsed {(time.monotonic()-started)/60:.1f} min", flush=True)
    return dict(parsed_totals)


def main() -> int:
    raw = os.environ["S3_RAW_BUCKET"]
    cur = os.environ["S3_CURATED_BUCKET"]

    print("Loading cohort QBs...")
    qbs = _load_cohort_qbs(cur)
    print(f"  {len(qbs)} QBs across both cohorts")

    print("Mapping pfr_id → espn_id via ff_playerids...")
    pfr_to_espn = _qb_espn_ids(raw, qbs)
    espn_set = set(pfr_to_espn.values())
    print(f"  resolved {len(espn_set)} espn_ids")

    print("Loading CFBD box totals (player_season_stats)...")
    box = _qb_box_totals(raw, espn_set)
    print(f"  {len(box)} (qb, season) pairs with box totals")

    print("Building name resolver from rosters...")
    t0 = time.monotonic()
    resolver = NameResolver.from_s3(raw)
    print(f"  built in {time.monotonic()-t0:.1f}s")

    print("Parsing all plays + attributing to QBs...")
    parsed = _parse_all_plays(raw, espn_set, resolver)
    print(f"  parsed totals for {len(parsed)} (qb, season) pairs")

    # Reconcile
    print("\n=== Reconciliation (per-QB-season) ===")
    print(f"{'pfr_id':10s} {'name':25s} {'season':6s} {'box_att':>8s} {'parsed_att':>11s} {'pct_att':>8s} {'pct_int':>8s}")
    rows = []
    by_qb: dict[str, list[float]] = defaultdict(list)
    for qb in qbs:
        eid = pfr_to_espn.get(qb.player_id)
        if eid is None:
            continue
        # only seasons where we have both
        for season in range(2014, 2025):
            box_t = box.get((eid, season))
            if box_t is None or box_t["pass_att"] < 50:
                continue
            par_t = parsed.get((eid, season), {"pass_att": 0, "pass_comp": 0, "pass_td": 0, "int": 0, "sack": 0})
            pct_att = 100 * par_t["pass_att"] / box_t["pass_att"] if box_t["pass_att"] else 0
            pct_int = 100 * par_t["int"] / box_t["int"] if box_t["int"] else 100  # if box int=0, treat as full
            rows.append({
                "pfr_id": qb.player_id, "name": qb.name, "season": season,
                "box_att": box_t["pass_att"], "parsed_att": par_t["pass_att"],
                "pct_att": pct_att, "pct_int": pct_int,
                "box_td": box_t["pass_td"], "parsed_td": par_t["pass_td"],
                "box_int": box_t["int"], "parsed_int": par_t["int"],
            })
            by_qb[qb.player_id].append(pct_att)

    rows.sort(key=lambda r: r["pct_att"])
    # Show worst 20 + best 5
    for r in rows[:20] + rows[-5:]:
        print(f"  {r['pfr_id']:10s} {r['name'][:24]:25s} {r['season']:6d} {r['box_att']:>8d} {r['parsed_att']:>11d} {r['pct_att']:>7.1f}% {r['pct_int']:>7.1f}%")

    pcts = [r["pct_att"] for r in rows]
    print(f"\n  N qb-seasons with ≥50 box atts: {len(rows)}")
    print(f"  median pct_att match: {sorted(pcts)[len(pcts)//2] if pcts else 0:.1f}%")
    print(f"  ≥98% match: {sum(1 for p in pcts if p >= 98)}/{len(pcts)} ({100*sum(1 for p in pcts if p >= 98)/len(pcts):.1f}%)")
    print(f"  ≥95% match: {sum(1 for p in pcts if p >= 95)}/{len(pcts)} ({100*sum(1 for p in pcts if p >= 95)/len(pcts):.1f}%)")
    print(f"  <80% match: {sum(1 for p in pcts if p < 80)}/{len(pcts)}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
