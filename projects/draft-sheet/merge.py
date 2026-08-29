"""merge.py — join every source onto the consensus spine.

Order matters. The consensus boards are the spine, and ADP is decoration hung
on it: a player with no ADP anywhere still belongs on the board at their
consensus rank, but an ADP that landed on the WRONG player is a defect that
propagates to the printed sheet.

WHAT THE GATE MEASURES. The first version of this file gated on ADP *coverage*
of the top 300 and failed everything, which was the metric's fault rather than
the join's. FFC publishes 271 players, so nobody past about ECR 200 can have an
FFC number, and counting that as a join failure conflates "we lost a row" with
"the source never had one". The gate below therefore measures join QUALITY —
of the rows a source actually published, how many did we attach to a consensus
player — and reports depth separately as information.

Join keys, in order of trust:
  fantasypros_id -> crosswalk -> espn_id / yahoo_id / sleeper_id   (skill + K)
  team abbreviation                                                (DST only)
  normalized name + position                                       (FFC only)

Team defenses get their own path because no id space covers them: FantasyPros
calls one "Houston Texans", ESPN "Texans D/ST", Yahoo "Texans", FFC "Houston
Defense". All four carry a team code, so that is the key.

Usage:
    uv run python merge.py
"""
from __future__ import annotations

import json

import pandas as pd

from common import HERE, norm_name, norm_team

CORE = 300

# Of the rows each source publishes, the fraction we must successfully attach.
MIN_JOIN = {"espn": 0.97, "yahoo": 0.95, "ffc": 0.97}


def consensus_frame() -> pd.DataFrame:
    boards = json.loads((HERE / "data" / "consensus.json").read_text())
    frames = []
    for key, b in boards.items():
        df = pd.DataFrame(b["players"]).rename(columns={
            "player_id": "fpros_id", "player_name": "name",
            "player_short_name": "short_name", "player_team_id": "team",
            "player_position_id": "pos", "player_bye_week": "bye",
            "rank_ecr": f"ecr_{key}", "tier": f"tier_{key}",
            "pos_rank": f"posrank_{key}", "rank_std": f"std_{key}",
            # The most and least optimistic expert on the panel. This is the
            # only genuinely sourced upside/worst-case in the whole dataset —
            # real analysts' real ceilings and floors, not a model's guess.
            "rank_min": f"best_{key}", "rank_max": f"worst_{key}",
            "player_page_url": "news_url",
        })
        keep = ["fpros_id", "name", "short_name", "team", "pos", "bye", "news_url",
                f"ecr_{key}", f"tier_{key}", f"posrank_{key}", f"std_{key}",
                f"best_{key}", f"worst_{key}"]
        frames.append(df[[c for c in keep if c in df.columns]])

    ident = ["fpros_id", "name", "short_name", "team", "pos", "bye", "news_url"]
    base = pd.concat([f[ident] for f in frames]).drop_duplicates("fpros_id")
    for f in frames:
        base = base.merge(f.drop(columns=[c for c in ident if c != "fpros_id"]),
                          on="fpros_id", how="left")
    base["fpros_id"] = base["fpros_id"].astype("string")
    base["team"] = base["team"].map(norm_team)
    return base


def main() -> None:
    df = consensus_frame()
    df["key"] = df["name"].fillna("").map(norm_name)
    is_dst = df["pos"].eq("DST")

    cw = pd.read_parquet(HERE / "data" / "crosswalk.parquet")
    ids = cw[["fantasypros_id", "sleeper_id", "espn_id", "yahoo_id"]].dropna(
        subset=["fantasypros_id"]).drop_duplicates("fantasypros_id")
    df = df.merge(ids, left_on="fpros_id", right_on="fantasypros_id", how="left")

    miss = df["espn_id"].isna() & ~is_dst
    if miss.any():
        by_name = cw.dropna(subset=["key"]).drop_duplicates("key").set_index("key")
        for col in ("sleeper_id", "espn_id", "yahoo_id"):
            df.loc[miss, col] = df.loc[miss, col].fillna(df.loc[miss, "key"].map(by_name[col]))

    def attach(src: pd.DataFrame, id_col: str, drop: list[str]) -> pd.DataFrame:
        """Id join for players, team-code join for defenses."""
        src = src.copy()
        src["team"] = src["team"].map(norm_team)
        # `pos` and `team` exist on the spine already; carrying the source's
        # copy through a merge collides and pandas refuses the suffixes.
        shed = [c for c in drop if c in src] + ["pos"]
        players = src[src["pos"].ne("DST")].drop(columns=shed)
        out = df.merge(players.drop(columns=["team"]), on=id_col, how="left")
        d = src[src["pos"].eq("DST")].drop(columns=shed)
        d = d.drop(columns=[id_col]).drop_duplicates("team")
        val = [c for c in d.columns if c != "team"]
        out = out.merge(d, on="team", how="left", suffixes=("", "_d"))
        # Fill ONLY the defense rows. Merging a team-keyed frame across the
        # whole board and then fillna()-ing would hand every Chief the Chiefs
        # defense's ADP wherever the player's own was missing — which is the
        # precise "right number, wrong player" failure the gate below exists
        # to catch, and did.
        dst_rows = out["pos"].eq("DST")
        for c in val:
            dc = f"{c}_d"
            if dc in out:
                out.loc[dst_rows, c] = out.loc[dst_rows, c].fillna(out.loc[dst_rows, dc])
                out = out.drop(columns=[dc])
        return out

    espn = pd.read_parquet(HERE / "data" / "adp_espn.parquet")
    df = attach(espn, "espn_id", ["name"])

    yh = pd.read_parquet(HERE / "data" / "adp_yahoo.parquet")
    yh = yh.rename(columns={"team_yahoo": "team"})
    yh["pos"] = yh["pos"].replace({"DEF": "DST"})
    df = attach(yh, "yahoo_id", ["name", "bye"])

    # `yahoo_id` is the sparsest column in the crosswalk (5,489 populated
    # against espn_id's 8,156), so the id join alone leaves about a fifth of
    # Yahoo's published rows stranded. Back-fill the residue on normalized
    # name + position, which is safe here because it only ever fills a null.
    yname = yh[yh["yahoo_adp"].notna()].copy()
    yname["key"] = yname["name"].fillna("").map(norm_name)
    ycols = ["yahoo_adp", "yahoo_round", "yahoo_pct_drafted",
             "yahoo_adp_preseason", "yahoo_headshot"]
    yname = yname.drop_duplicates(["key", "pos"])[["key", "pos"] + ycols]
    df = df.merge(yname, on=["key", "pos"], how="left", suffixes=("", "_n"))
    for c in ycols:
        cn = f"{c}_n"
        if cn in df:
            df[c] = df[c].fillna(df[cn])
            df = df.drop(columns=[cn])

    sl = pd.read_parquet(HERE / "data" / "adp_sleeper.parquet")
    df = attach(sl, "sleeper_id", ["name"])

    ffc = pd.read_parquet(HERE / "data" / "adp_ffc.parquet")
    ffc["pos"] = ffc["position"].replace({"PK": "K", "DEF": "DST"})
    ffc["team"] = ffc["team"].map(norm_team)
    ffc["key"] = ffc["name"].fillna("").map(norm_name)
    ffc_p = ffc[ffc["pos"].ne("DST")].drop(columns=["name", "position", "team", "bye"])
    df = df.merge(ffc_p.drop_duplicates(["key", "pos"]), on=["key", "pos"], how="left")
    ffc_d = ffc[ffc["pos"].eq("DST")].drop(columns=["name", "position", "bye", "key"])
    ffc_d = ffc_d.drop_duplicates("team")
    df = df.merge(ffc_d.drop(columns=["pos"]), on="team", how="left", suffixes=("", "_d"))
    dst_rows = df["pos"].eq("DST")
    for c in [c for c in ffc_d.columns if c not in ("team", "pos")]:
        dc = f"{c}_d"
        if dc in df:
            df.loc[dst_rows, c] = df.loc[dst_rows, c].fillna(df.loc[dst_rows, dc])
            df = df.drop(columns=[dc])

    # ── the gate: did we lose rows the sources actually had? ──
    published = {
        "espn": int(espn["espn_adp"].notna().sum()),
        "yahoo": int(yh["yahoo_adp"].notna().sum()),
        "ffc": int(ffc["ffc_adp_ppr"].notna().sum()),
    }
    attached = {
        "espn": int(df["espn_adp"].notna().sum()),
        "yahoo": int(df["yahoo_adp"].notna().sum()),
        "ffc": int(df["ffc_adp_ppr"].notna().sum()),
    }
    print(f"  consensus spine: {len(df):,} players across 5 boards\n")
    print("  join quality — of the rows each source published, how many attached:")
    failed = []
    for k in published:
        rate = attached[k] / published[k] if published[k] else 0.0
        ok = rate >= MIN_JOIN[k]
        print(f"    {k:6s} {attached[k]:4d}/{published[k]:4d} = {rate:6.1%}   "
              f"(floor {MIN_JOIN[k]:.0%}) {'ok' if ok else 'FAIL'}")
        if not ok:
            failed.append(k)

    core = df.sort_values("ecr_ppr", na_position="last").head(CORE)
    print(f"\n  depth (informational) — ADP coverage of the top {CORE} by PPR ECR:")
    for k, col in (("espn", "espn_adp"), ("yahoo", "yahoo_adp"),
                   ("ffc", "ffc_adp_ppr"), ("sleeper", "sleeper_search_rank")):
        print(f"    {k:6s} {core[col].notna().mean():6.1%}")
    none_at_all = core[core[["espn_adp", "yahoo_adp", "ffc_adp_ppr"]].isna().all(axis=1)]
    print(f"    no ADP from any source: {len(none_at_all)}")
    for n in none_at_all["name"].head(8):
        print(f"      {n}")

    df.to_parquet(HERE / "data" / "merged.parquet", index=False)
    print("\nwrote data/merged.parquet")
    if failed:
        raise SystemExit(f"join quality below floor for: {', '.join(failed)}")


if __name__ == "__main__":
    main()
