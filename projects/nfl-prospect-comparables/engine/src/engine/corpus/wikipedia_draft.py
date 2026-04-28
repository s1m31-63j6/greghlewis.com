"""Scrape the Wikipedia article for an NFL draft year, returning a draft-picks
DataFrame matching the nflverse `draft_picks` schema closely enough to feed
into engine.profiles.assemble.

Used to build the prediction cohort spine when nflverse `draft_picks` hasn't
updated yet (typically 1-2 weeks of lag after a draft).
"""

from __future__ import annotations

import re

import polars as pl
import requests
from bs4 import BeautifulSoup


WIKI_URL_FMT = "https://en.wikipedia.org/wiki/{year}_NFL_draft"
USER_AGENT = "NFLProspectComparables/0.1 (https://greghlewis.com)"


def _normalize_team(team: str) -> str:
    """Wikipedia uses full team names; nflverse uses 3-letter codes."""
    # Strip footnote markers and trailing whitespace
    team = re.sub(r"\[[a-z]\]", "", team).strip()
    return _TEAM_TO_CODE.get(team, team)


# Wikipedia full team name → nflverse 3-letter code
_TEAM_TO_CODE = {
    "Arizona Cardinals": "ARI",
    "Atlanta Falcons": "ATL",
    "Baltimore Ravens": "BAL",
    "Buffalo Bills": "BUF",
    "Carolina Panthers": "CAR",
    "Chicago Bears": "CHI",
    "Cincinnati Bengals": "CIN",
    "Cleveland Browns": "CLE",
    "Dallas Cowboys": "DAL",
    "Denver Broncos": "DEN",
    "Detroit Lions": "DET",
    "Green Bay Packers": "GB",
    "Houston Texans": "HOU",
    "Indianapolis Colts": "IND",
    "Jacksonville Jaguars": "JAX",
    "Kansas City Chiefs": "KC",
    "Las Vegas Raiders": "LV",
    "Los Angeles Chargers": "LAC",
    "Los Angeles Rams": "LA",
    "Miami Dolphins": "MIA",
    "Minnesota Vikings": "MIN",
    "New England Patriots": "NE",
    "New Orleans Saints": "NO",
    "New York Giants": "NYG",
    "New York Jets": "NYJ",
    "Philadelphia Eagles": "PHI",
    "Pittsburgh Steelers": "PIT",
    "San Francisco 49ers": "SF",
    "Seattle Seahawks": "SEA",
    "Tampa Bay Buccaneers": "TB",
    "Tennessee Titans": "TEN",
    "Washington Commanders": "WAS",
}


def _category_for_position(pos: str) -> str:
    """Match nflverse `category` field used by load_prediction_spine.
    Skill positions = QB, RB, WR, TE; everything else collapses to position."""
    pos_upper = pos.upper().strip()
    skill = {"QB", "RB", "FB", "WR", "TE"}
    if pos_upper in skill:
        return "RB" if pos_upper == "FB" else pos_upper
    return pos_upper


def scrape_draft(year: int) -> pl.DataFrame:
    """Fetch and parse the draft table from the Wikipedia article.

    Returns a polars DataFrame with columns:
      season, round, pick, team, pfr_player_name, position, category, college
    plus an empty `notes` field. ID columns (pfr_player_id, gsis_id,
    cfb_player_id) are filled later via cross-source joins.
    """
    r = requests.get(
        WIKI_URL_FMT.format(year=year),
        headers={"User-Agent": USER_AGENT},
        timeout=20,
    )
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "lxml")
    tables = soup.find_all("table", class_="wikitable")

    # Find the picks table by header signature
    picks_table = None
    for t in tables:
        rows = t.find_all("tr")
        if not rows:
            continue
        headers = [th.get_text(strip=True).lower() for th in rows[0].find_all(["th", "td"])]
        if "rnd." in headers and "pick" in headers and "player" in headers and "college" in headers:
            picks_table = t
            break
    if picks_table is None:
        raise RuntimeError(f"could not locate draft picks table on {year} draft page")

    headers = [
        th.get_text(strip=True).lower()
        for th in picks_table.find_all("tr")[0].find_all(["th", "td"])
    ]
    # Resolve column indices
    def _idx(name_options: tuple[str, ...]) -> int:
        for opt in name_options:
            if opt in headers:
                return headers.index(opt)
        return -1

    i_round = _idx(("rnd.", "round"))
    i_pick = _idx(("pick",))
    i_team = _idx(("team",))
    i_player = _idx(("player",))
    i_pos = _idx(("pos.", "position"))
    i_college = _idx(("college",))
    i_notes = _idx(("notes",))

    rows: list[dict] = []
    current_round: int | None = None
    for tr in picks_table.find_all("tr")[1:]:
        cells = tr.find_all(["th", "td"])
        if not cells:
            continue
        # Some rows are round-header banners (e.g. cells might be all bold/colspan)
        text_cells = [c.get_text(" ", strip=True) for c in cells]
        if len(text_cells) < 6:
            continue

        try:
            rnd = int(re.sub(r"\D", "", text_cells[i_round])) if i_round >= 0 else current_round
        except ValueError:
            rnd = current_round
        if rnd is not None:
            current_round = rnd

        pick_str = text_cells[i_pick] if i_pick >= 0 else ""
        try:
            pick = int(re.sub(r"\D", "", pick_str))
        except ValueError:
            continue

        team_raw = text_cells[i_team] if i_team >= 0 else ""
        # Strip footnote markers
        player_name = re.sub(r"\s*\[[^\]]*\]\s*", "", text_cells[i_player]) if i_player >= 0 else ""
        # Strip "*" Pro Bowl markers / "+ All-Pro" annotations
        player_name = re.sub(r"[*+†‡]+", "", player_name).strip()
        position = text_cells[i_pos] if i_pos >= 0 else ""
        college = text_cells[i_college] if i_college >= 0 else ""
        notes = text_cells[i_notes] if i_notes >= 0 else ""

        rows.append({
            "season": year,
            "round": rnd,
            "pick": pick,
            "team": _normalize_team(team_raw),
            "pfr_player_name": player_name,
            "position": position.upper(),
            "category": _category_for_position(position),
            "college": college,
            "notes": notes,
            "pfr_player_id": None,
            "gsis_id": None,
            "cfb_player_id": None,
            "age": None,
        })

    return pl.DataFrame(rows)


def enrich_with_combine(spine: pl.DataFrame, combine_2026: pl.DataFrame) -> pl.DataFrame:
    """Match scraped picks to nflverse combine 2026 by (player_name, school) →
    enriches with pfr_player_id."""
    # Normalize names for matching
    def _norm(s: str) -> str:
        return re.sub(r"[^a-z]", "", s.lower()) if s else ""

    combine_idx: dict[tuple[str, str], str] = {}
    for r in combine_2026.iter_rows(named=True):
        if not r.get("pfr_id"):
            continue
        key = (_norm(r["player_name"]), _norm(r["school"]))
        combine_idx[key] = r["pfr_id"]

    pfr_ids: list[str | None] = []
    for r in spine.iter_rows(named=True):
        key = (_norm(r["pfr_player_name"]), _norm(r["college"]))
        pfr_ids.append(combine_idx.get(key))
    return spine.with_columns(pl.Series(name="pfr_player_id", values=pfr_ids))


def enrich_with_crosswalk(spine: pl.DataFrame, ff_playerids: pl.DataFrame) -> pl.DataFrame:
    """Use ff_playerids to fill gsis_id + cfb_player_id via pfr_id bridge."""
    bridge: dict[str, dict[str, str | None]] = {}
    for r in ff_playerids.iter_rows(named=True):
        pid = r.get("pfr_id")
        if not pid:
            continue
        bridge[pid] = {
            "gsis_id": r.get("gsis_id"),
            "cfb_player_id": r.get("cfb_id"),
        }

    gsis = []
    cfbid = []
    for r in spine.iter_rows(named=True):
        b = bridge.get(r.get("pfr_player_id") or "", {})
        gsis.append(b.get("gsis_id"))
        cfbid.append(b.get("cfb_player_id"))
    # Cast to Utf8 even when all-None so downstream join keys match the
    # crosswalk's typed columns.
    return spine.with_columns([
        pl.Series(name="gsis_id", values=gsis, dtype=pl.Utf8),
        pl.Series(name="cfb_player_id", values=cfbid, dtype=pl.Utf8),
    ])


def enrich_with_cfbd_recruits(
    spine: pl.DataFrame, recruits: pl.DataFrame
) -> pl.DataFrame:
    """Fall back to CFBD recruits name+committedTo match for cfb_player_id
    when ff_playerids hasn't updated yet (typical for fresh draft years).
    `recruits.athleteId` is the ESPN id, the same as `cfb_player_id`.
    """
    def _norm(s: str | None) -> str:
        return re.sub(r"[^a-z]", "", (s or "").lower())

    # name+college → athleteId (ESPN id)
    idx: dict[tuple[str, str], str] = {}
    for r in recruits.iter_rows(named=True):
        if not r.get("athleteId"):
            continue
        key = (_norm(r["name"]), _norm(r["committedTo"]))
        idx.setdefault(key, str(r["athleteId"]))

    cfbid = list(spine["cfb_player_id"].to_list())
    n_filled = 0
    for i, r in enumerate(spine.iter_rows(named=True)):
        if cfbid[i]:
            continue
        key = (_norm(r["pfr_player_name"]), _norm(r["college"]))
        match = idx.get(key)
        if match:
            cfbid[i] = match
            n_filled += 1
    print(f"  CFBD recruits fallback filled {n_filled} cfb_player_id values")
    return spine.with_columns(pl.Series(name="cfb_player_id", values=cfbid, dtype=pl.Utf8))
