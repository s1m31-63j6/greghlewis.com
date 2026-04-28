"""Map parsed playText names → espn_id given (team, season) context.

Strategy:
  1. Build a per-(season, team) index from cfbd/rosters: each player's
     normalized full name, last name, and "first-initial.last" form.
  2. Resolver tries exact full-name match first, then last-name (within team
     and season), then first-initial.lastname.
  3. Returns espn_id or None. We don't fuzzy-match; the parser's output is
     already normalized, and CFBD's roster ids are the source of truth.

Per-team disambiguation: many teams have multiple players sharing a last name.
We track those and return None when ambiguous (preserving correctness over recall).
"""

from __future__ import annotations

import io
import os
from collections.abc import Iterable
from dataclasses import dataclass, field

import polars as pl

from engine.io import s3 as s3io
from engine.parse.playtext import normalize_name


@dataclass
class _TeamSeasonIndex:
    full_to_id: dict[str, int] = field(default_factory=dict)
    last_to_ids: dict[str, list[int]] = field(default_factory=dict)
    first_init_last_to_ids: dict[str, list[int]] = field(default_factory=dict)


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


class NameResolver:
    """(season, team, name) → espn_id."""

    def __init__(self):
        self._idx: dict[tuple[int, str], _TeamSeasonIndex] = {}
        # team aliases — CFBD uses one canonical team name in rosters but
        # play-by-play `offense` can vary. We'll populate via a simple cache
        # keyed by season,offense.
        self._team_alias_cache: dict[tuple[int, str], str] = {}
        self._all_teams: dict[int, set[str]] = {}

    @classmethod
    def from_s3(cls, raw_bucket: str) -> "NameResolver":
        rv = cls()
        keys = sorted(
            k for k in _list_keys(raw_bucket, "raw/cfbd/rosters/")
            if k.endswith("data.parquet")
        )
        for k in keys:
            df = _read_parquet(raw_bucket, k)
            season = int(k.split("season=")[1].split("/")[0])
            rv._all_teams[season] = set(df["team"].unique().to_list())
            for row in df.iter_rows(named=True):
                rid = row.get("id")
                fn = row.get("firstName") or ""
                ln = row.get("lastName") or ""
                team = row.get("team") or ""
                if not rid or not team:
                    continue
                try:
                    espn_id = int(rid)
                except (ValueError, TypeError):
                    continue
                key = (season, team)
                idx = rv._idx.setdefault(key, _TeamSeasonIndex())
                full = normalize_name(f"{fn} {ln}")
                last = normalize_name(ln)
                first_init = (fn[0].lower() if fn else "")
                fil = f"{first_init}.{last}" if last and first_init else None

                # CFBD often has duplicate roster rows: a real positive ESPN id
                # plus a negative placeholder. Always prefer the positive id.
                if full:
                    existing = idx.full_to_id.get(full)
                    if existing is None or (existing < 0 and espn_id > 0):
                        idx.full_to_id[full] = espn_id
                if last:
                    idx.last_to_ids.setdefault(last, []).append(espn_id)
                if fil:
                    idx.first_init_last_to_ids.setdefault(fil, []).append(espn_id)
        # Dedupe last-name lists, keeping only positive IDs when both exist
        # (a positive + negative for the same player collapses to the positive).
        for idx in rv._idx.values():
            for d in (idx.last_to_ids, idx.first_init_last_to_ids):
                for k2, ids in d.items():
                    pos = [i for i in ids if i > 0]
                    if pos:
                        d[k2] = list(set(pos))
                    else:
                        d[k2] = list(set(ids))
        return rv

    def resolve(self, *, season: int, team: str, name: str | None) -> int | None:
        if not name or not team:
            return None
        idx = self._idx.get((season, team))
        if idx is None:
            return None
        norm = normalize_name(name)
        if not norm:
            return None
        # exact full match
        if norm in idx.full_to_id:
            return idx.full_to_id[norm]
        # last-token fallback — handles nickname/full-name mismatches like
        # "Cameron Ward" (playText) vs "Cam Ward" (roster).
        tokens = norm.split()
        if len(tokens) >= 2:
            last = tokens[-1]
            ids = idx.last_to_ids.get(last)
            if ids and len(ids) == 1:
                return ids[0]
            # If multiple players share the last name, try first-initial.last
            if ids and len(ids) > 1 and tokens[0]:
                fil = f"{tokens[0][0]}.{last}"
                ids2 = idx.first_init_last_to_ids.get(fil)
                if ids2 and len(ids2) == 1:
                    return ids2[0]
        # last-name only (single-token input, e.g. "Mahomes")
        elif len(tokens) == 1:
            ids = idx.last_to_ids.get(tokens[0])
            if ids and len(ids) == 1:
                return ids[0]
        # first-initial.lastname (handles "P. Mahomes")
        if "." in norm:
            ids = idx.first_init_last_to_ids.get(norm)
            if ids and len(ids) == 1:
                return ids[0]
        return None
