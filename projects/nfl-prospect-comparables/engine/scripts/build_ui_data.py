"""Export the UI data bundle for the 3D force-directed comp graph.

Produces a single JSON consumed by the project page hero (3d-force-graph).

Schema:
{
  "meta": { "generated_at": "ISO-8601", "pool_size": int,
            "visible_cohorts": [...], "weights_used": {...} },
  "nodes": [
    {
      "id": <player_id>,
      "name": str, "position": "QB"|"RB"|"WR"|"TE",
      "cohort": "prediction_2026"|"validation_2021_2025"|...,
      "visible_in_graph": bool,                       # true for visible cohorts
      "highlight": bool,                              # 2026 prospects = true
      "x": float|null, "y": float|null, "z": float|null,    # 3D UMAP+offset; null if not in graph
      "outcome_class": str|null,                      # Bust/Role/Starter/PB/HOF
      "career_av": int|null, "peak_av": int|null,
      "pro_bowls": int|null,
      "bio": { "college": str, "height_in": int, "weight_lb": int, "age_at_draft": float },
      "draft": { "year": int, "round": int, "pick": int, "team": str|null }
    },
    ...
  ],
  "edges": [
    {
      "source": <player_id>, "target": <player_id>,    # both always resolve in `nodes`
      "similarity": float,
      "per_layer": { "BODY": 0.x, "VOLUME": 0.x, "EFFICIENCY": 0.x|null, "TRAITS": 0.x },
      "in_graph": bool   # true iff both endpoints are visible_in_graph (renderable as 3D line)
    },
    ...
  ]
}

Visible cohort = 2021-2026 (per Greg's UI spec 2026-04-30). The frontend renders
only visible_in_graph nodes in the 3D constellation; edges with in_graph=true
become 3D lines. Off-graph nodes (training cohort 2014-2020) are present so
slide-out panels can resolve any comp target's name/team/outcome metadata.

Run from engine/:
    uv run python scripts/build_ui_data.py
    uv run python scripts/build_ui_data.py --top-k-edges 8 --no-publish
"""

from __future__ import annotations

import argparse
import io
import json
import os
import sys
import time
from datetime import datetime, timezone

import boto3
import numpy as np
import polars as pl
from dotenv import load_dotenv

from engine.embedding import comps as comps_mod
from engine.eval.ablation import load_outcomes
from engine.features.catalog import V2_LAYER_WEIGHTS
from engine.schema import Position

load_dotenv()


ALL_COHORTS = ("training_2014_2020", "validation_2021_2025", "prediction_2026")
VISIBLE_COHORTS = ("validation_2021_2025", "prediction_2026")

# Per-position offset in 3D space — keeps the four position clusters
# visually distinguishable while preserving local archetype structure
# from each position's own UMAP. Distances are in arbitrary "constellation
# units" — the force-directed layer in 3d-force-graph will scale to fit.
POSITION_OFFSETS: dict[str, tuple[float, float, float]] = {
    "QB": (-14.0,  0.0,  0.0),
    "RB": ( 0.0, -14.0,  0.0),
    "WR": (14.0,  0.0,  0.0),
    "TE": ( 0.0, 14.0,  0.0),
}


# NFL team logo URL pattern via ESPN CDN. Frontend uses these directly; if a
# given abbreviation 404s, fall back to a generic NFL placeholder. ESPN keys
# are mostly 2-3 letter lowercase. Special cases for franchise relocations /
# rebrands kept here so historical prospects (e.g., drafted by OAK before
# Raiders moved to LV) still resolve to the modern logo.
NFL_TEAM_ABBREV_TO_ESPN: dict[str, str] = {
    # Most teams use the standard abbrev, lowercased
    # Special cases below
    "OAK": "lv",     # Raiders moved 2020
    "STL": "lar",    # Rams moved 2016
    "SD":  "lac",    # Chargers moved 2017
    "WAS": "wsh",    # ESPN uses wsh for Washington
    "JAC": "jax",    # ESPN uses jax
    "LA":  "lar",    # disambiguation
}


def nfl_team_logo_url(team_abbrev: str | None) -> str | None:
    """Return ESPN CDN URL for the team's logo, or None if no team."""
    if not team_abbrev:
        return None
    espn_key = NFL_TEAM_ABBREV_TO_ESPN.get(team_abbrev.upper(), team_abbrev.lower())
    return f"https://a.espncdn.com/i/teamlogos/nfl/500/{espn_key}.png"


def headshot_url_candidates(profile: dict, pfr_to_espn: dict[str, str]) -> list[str]:
    """Return ordered list of headshot URL guesses for a prospect.
    Frontend tries each in order; falls back to placeholder on all-404.

    Sources, in priority:
      1. PFR-format player_id w/ espn_id crosswalk → ESPN NFL headshot CDN
      2. CFBD-format player_id (cfb-XXXXXX) → ESPN College FB headshot
    """
    pid = profile.get("player_id", "")
    candidates: list[str] = []
    # PFR-style (e.g. "MendFe00"): cross-walk to ESPN NFL via ff_playerids
    if pid and not pid.startswith(("cfb-", "draft-")):
        espn_id = pfr_to_espn.get(pid)
        if espn_id:
            candidates.append(
                f"https://a.espncdn.com/i/headshots/nfl/players/full/{espn_id}.png"
            )
    # CFBD-style (e.g. "cfb-4871023"): ESPN College FB headshot
    # (cfb_id is often the ESPN College FB id; works ~50% of the time)
    if pid.startswith("cfb-"):
        cfb_id = pid.replace("cfb-", "")
        candidates.append(
            f"https://a.espncdn.com/i/headshots/college-football/players/full/{cfb_id}.png"
        )
    return candidates


def load_pfr_to_espn(raw_bucket: str) -> dict[str, str]:
    """Build pfr_id → espn_id map from nflverse ff_playerids crosswalk."""
    s3 = boto3.client("s3")
    body = s3.get_object(
        Bucket=raw_bucket, Key="raw/nflverse/ff_playerids/data.parquet"
    )["Body"].read()
    df = pl.read_parquet(io.BytesIO(body))
    out: dict[str, str] = {}
    for row in df.iter_rows(named=True):
        pfr = row.get("pfr_id")
        espn = row.get("espn_id")
        if pfr and espn is not None:
            out[pfr] = str(int(espn)) if isinstance(espn, (int, float)) else str(espn)
    return out


def load_trait_sidecars(curated_bucket: str, player_ids: set[str]) -> dict[str, dict]:
    """Load Sonnet trait sidecars for the given player_ids. Returns
    player_id → {trait_name → {score, quote}} dict. Used to populate the
    slide-out panel's archetype profile + supporting quotes.
    """
    s3 = boto3.client("s3")
    out: dict[str, dict] = {}
    for pid in player_ids:
        try:
            body = s3.get_object(
                Bucket=curated_bucket, Key=f"corpus/sonnet_traits/{pid}.json"
            )["Body"].read()
        except Exception:
            continue
        payload = json.loads(body)
        out[pid] = payload.get("traits", {})
    return out


def compute_umap_coords(pool) -> dict[str, tuple[float, float, float]]:
    """Per-position 3D UMAP from the v2 union+traits sliced vectors, then
    translate each position cluster by POSITION_OFFSETS so positions are
    visually separated in the constellation."""
    import umap

    coords: dict[str, tuple[float, float, float]] = {}
    for pos, M in pool.by_position.items():
        idxs = pool.pos_index[pos]
        n = M.shape[0]
        ox, oy, oz = POSITION_OFFSETS[pos]
        if n < 4:
            for i in idxs:
                coords[pool.df["player_id"][i]] = (ox, oy, oz)
            continue
        reducer = umap.UMAP(
            n_components=3,
            n_neighbors=min(15, n - 1),
            min_dist=0.15,
            random_state=42,
            metric="cosine",
        )
        proj = reducer.fit_transform(M)
        for i, df_i in enumerate(idxs):
            x, y, z = proj[i]
            coords[pool.df["player_id"][df_i]] = (
                float(x + ox),
                float(y + oy),
                float(z + oz),
            )
    return coords


def load_profile_metadata(curated_bucket: str) -> dict[str, dict]:
    """Read profile JSONLs across all cohorts into player_id → profile dict.
    Used for bio/draft/college metadata in the UI bundle."""
    s3 = boto3.client("s3")
    out: dict[str, dict] = {}
    for cohort in ALL_COHORTS:
        try:
            body = s3.get_object(
                Bucket=curated_bucket, Key=f"profiles/{cohort}/data.jsonl"
            )["Body"].read().decode("utf-8")
        except s3.exceptions.NoSuchKey:
            continue
        for line in body.strip().splitlines():
            p = json.loads(line)
            out[p["player_id"]] = p
    return out


def build_node(profile: dict, cohort: str,
               coords: tuple[float, float, float] | None,
               outcome_row: dict | None,
               visible_in_graph: bool,
               pfr_to_espn: dict[str, str],
               traits: dict | None) -> dict:
    bio = profile.get("bio") or {}
    draft = profile.get("draft") or {}
    x, y, z = (coords if coords is not None and visible_in_graph else (None, None, None))
    return {
        "id": profile["player_id"],
        "name": profile["name"],
        "position": profile["position"],
        "cohort": cohort,
        "visible_in_graph": visible_in_graph,
        "highlight": cohort == "prediction_2026",
        "x": x, "y": y, "z": z,
        "outcome_class": (outcome_row or {}).get("outcome_class"),
        "career_av": (outcome_row or {}).get("career_av"),
        "peak_av": (outcome_row or {}).get("peak_av"),
        "pro_bowls": (outcome_row or {}).get("pro_bowls"),
        "bio": {
            "college": bio.get("college"),
            "height_in": bio.get("height_in"),
            "weight_lb": bio.get("weight_lb"),
            "age_at_draft": bio.get("age_at_draft"),
        },
        "draft": {
            "year": draft.get("draft_year"),
            "round": draft.get("draft_round"),
            "pick": draft.get("draft_pick"),
            "team": draft.get("draft_team"),
            "team_logo_url": nfl_team_logo_url(draft.get("draft_team")),
        },
        "headshot_candidates": headshot_url_candidates(profile, pfr_to_espn),
        # Sonnet-extracted trait scores (1-5) + supporting quotes from
        # Brugler/Walter Football. Populated only for visible prospects to
        # keep the bundle compact; off-graph nodes serve as comp-target
        # metadata only and don't show their own slide-out panel. Each entry
        # is { trait_name: {score, quote} }.
        "traits": traits,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--top-k-edges", type=int, default=5,
                    help="top-K comp edges per prospect (default: 5)")
    ap.add_argument("--out-local", default=None,
                    help="local output path (default: methodology/ui_data.json)")
    ap.add_argument("--no-publish", action="store_true",
                    help="skip S3 publish; write local only")
    args = ap.parse_args()

    cur = os.environ["S3_CURATED_BUCKET"]
    raw = os.environ["S3_RAW_BUCKET"]
    out_local = args.out_local or "../methodology/ui_data.json"

    print(f"Loading feature_v2_traits pool over {ALL_COHORTS}...")
    pool = comps_mod.load_pool(cur, cohorts=ALL_COHORTS, arm="feature_v2_traits")
    print(f"  {pool.df.height} prospects across {len(pool.by_position)} positions")
    for pos, M in pool.by_position.items():
        print(f"    {pos}: {M.shape[0]} prospects, {M.shape[1]} dim")

    print("\nLoading outcomes...")
    outcomes_by_cohort = {}
    for c in ALL_COHORTS:
        try:
            outcomes_by_cohort[c] = load_outcomes(cur, c)
        except Exception:
            outcomes_by_cohort[c] = {}
        print(f"  {c}: {len(outcomes_by_cohort[c])} outcome records")
    # outcomes parquet has additional columns — load full row for AV/PB display
    s3 = boto3.client("s3")
    outcome_rows_by_cohort: dict[str, dict[str, dict]] = {}
    for c in ALL_COHORTS:
        try:
            body = s3.get_object(Bucket=cur, Key=f"outcomes/{c}/data.parquet")["Body"].read()
            df = pl.read_parquet(io.BytesIO(body))
            outcome_rows_by_cohort[c] = {
                row["pfr_player_id"]: row
                for row in df.iter_rows(named=True)
                if row.get("pfr_player_id")
            }
        except Exception:
            outcome_rows_by_cohort[c] = {}

    print("\nLoading profile metadata...")
    profiles = load_profile_metadata(cur)
    print(f"  {len(profiles)} profile records")

    print("\nLoading pfr_id → espn_id crosswalk (ff_playerids)...")
    pfr_to_espn = load_pfr_to_espn(raw)
    print(f"  {len(pfr_to_espn)} crosswalk entries")

    # Identify visible-cohort prospects up-front (for trait sidecar load)
    visible_pids_pre: set[str] = set()
    for row in pool.df.iter_rows(named=True):
        if row["cohort"] in VISIBLE_COHORTS:
            visible_pids_pre.add(row["player_id"])
    print(f"\nLoading Sonnet trait sidecars for {len(visible_pids_pre)} visible prospects...")
    traits_by_pid = load_trait_sidecars(cur, visible_pids_pre)
    print(f"  {len(traits_by_pid)} sidecars found ({100*len(traits_by_pid)/max(1,len(visible_pids_pre)):.1f}% coverage)")

    print("\nComputing 3D UMAP per position (with position offsets)...")
    t0 = time.monotonic()
    coords = compute_umap_coords(pool)
    print(f"  UMAP done in {time.monotonic() - t0:.1f}s, {len(coords)} prospects placed")

    print("\nBuilding nodes (all cohorts; visible_in_graph flag for filter)...")
    nodes = []
    visible_pids: set[str] = set()
    for row in pool.df.iter_rows(named=True):
        cohort = row["cohort"]
        pid = row["player_id"]
        profile = profiles.get(pid)
        if profile is None:
            continue
        visible = cohort in VISIBLE_COHORTS
        c = coords.get(pid) if visible else None
        outcome_row = outcome_rows_by_cohort.get(cohort, {}).get(pid)
        node_traits = traits_by_pid.get(pid) if visible else None
        nodes.append(build_node(profile, cohort, c, outcome_row, visible, pfr_to_espn, node_traits))
        if visible:
            visible_pids.add(pid)
    print(f"  {len(nodes)} total nodes; {len(visible_pids)} visible_in_graph")

    print(f"\nComputing top-{args.top_k_edges} comp edges per visible prospect...")
    edges = []
    started = time.monotonic()
    for i, pid in enumerate(visible_pids, 1):
        # The cohort exclusion: 2026 prospects don't comp to other 2026
        # (no settled outcomes); validation prospects can comp to anyone.
        cohort = pool.df.filter(pl.col("player_id") == pid)["cohort"][0]
        exclude = {"prediction_2026"} if cohort == "prediction_2026" else None
        results = comps_mod.find_comps(
            pool, query_player_id=pid, top_k=args.top_k_edges,
            exclude_cohorts=exclude,
        )
        for c in results:
            edges.append({
                "source": pid,
                "target": c.player_id,
                "similarity": round(c.similarity, 4),
                "per_layer": {
                    layer: round(val, 4)
                    for layer, val in (c.per_layer or {}).items()
                },
                # in_graph: source is always visible (we iterate visible_pids);
                # in_graph requires the target to be visible too — frontend
                # uses this flag to decide whether to render as a 3D edge.
                "in_graph": c.player_id in visible_pids,
            })
        if i % 100 == 0:
            elapsed = time.monotonic() - started
            print(f"  {i}/{len(visible_pids)} prospects ({elapsed:.1f}s)")
    print(f"  {len(edges)} edges total")

    payload = {
        "meta": {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "pool_size": pool.df.height,
            "visible_cohorts": list(VISIBLE_COHORTS),
            "all_cohorts": list(ALL_COHORTS),
            "top_k_edges": args.top_k_edges,
            "weights_used": {
                pos.name: V2_LAYER_WEIGHTS[pos]
                for pos in (Position.QB, Position.RB, Position.WR, Position.TE)
            },
            "position_offsets_3d": POSITION_OFFSETS,
        },
        "nodes": nodes,
        "edges": edges,
    }

    body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    if args.no_publish:
        print(f"\n--no-publish set; skipping S3 upload")
    else:
        key = "ui/comp_graph.json"
        s3.put_object(
            Bucket=cur, Key=key, Body=body,
            ContentType="application/json", CacheControl="max-age=300",
        )
        print(f"\n→ s3://{cur}/{key} ({len(body) / 1024:.1f} KB)")

    # Always write local for diff/inspection
    out_path = os.path.abspath(out_local)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "wb") as f:
        f.write(body)
    print(f"→ {out_path}")
    print(f"\nSummary: {len(nodes)} nodes ({sum(n['highlight'] for n in nodes)} highlighted 2026), {len(edges)} edges")
    return 0


if __name__ == "__main__":
    sys.exit(main())
