"""Shared plumbing for the draft-sheet fetchers.

Every upstream here is either undocumented (ESPN's `lm-api-reads`, Yahoo's
`pub-api-ro`, Fantasy Football Calculator's graph endpoint) or scraped under a
crawl delay (FantasyPros). Two consequences shape this module:

  1. Raw responses are cached to `data/raw/` and re-used unless `--force`. A
     rebuild during draft season should not re-hammer four services, and having
     the raw bytes on disk is what makes a parser bug debuggable after the fact.
  2. Nothing is fetched without a real User-Agent and a timeout. The endpoints
     that are not documented are exactly the ones that will start returning 403
     or hang, and a build that hangs at 2am the night before a draft is worse
     than one that fails.
"""
from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any

import httpx

HERE = Path(__file__).parent
RAW = HERE / "data" / "raw"

# A real, identifiable agent. Several of these hosts 403 an empty or python-ish
# UA, and an honest one is the right thing to send at a service we are reading
# without a contract.
UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/128.0 Safari/537.36 "
    "(+greghlewis.com/projects/draft-sheet)"
)

TIMEOUT = httpx.Timeout(30.0, connect=10.0)


def raw_path(name: str) -> Path:
    RAW.mkdir(parents=True, exist_ok=True)
    return RAW / name


def cached_text(
    name: str,
    url: str,
    *,
    force: bool = False,
    headers: dict[str, str] | None = None,
    delay: float = 0.0,
) -> str:
    """Fetch `url` to `data/raw/<name>`, reusing the cache unless `force`."""
    p = raw_path(name)
    if p.exists() and not force:
        return p.read_text()
    if delay:
        time.sleep(delay)
    h = {"User-Agent": UA, **(headers or {})}
    with httpx.Client(timeout=TIMEOUT, follow_redirects=True, headers=h) as c:
        r = c.get(url)
        r.raise_for_status()
        p.write_text(r.text)
        return r.text


def cached_json(name: str, url: str, **kw: Any) -> Any:
    return json.loads(cached_text(name, url, **kw))


def norm_name(name: str) -> str:
    """Normalize a player name for fallback matching.

    The crosswalk is the primary join; this is only for the residue. Suffixes
    are the entire problem — `Marvin Harrison Jr.`, `James Cook III`,
    `Kyle Pitts Sr.` — and they account for most of the 15% naive-match failure
    rate measured across FFC and Sleeper.
    """
    s = name.lower().strip()
    for ch in ".,'`’-":
        s = s.replace(ch, " " if ch == "-" else "")
    parts = [p for p in s.split() if p not in {"jr", "sr", "ii", "iii", "iv", "v"}]
    return " ".join(parts)


# ── team codes ───────────────────────────────────────────────────────────────
# Four sources, four opinions about how to abbreviate a team. Team defenses are
# joined on the abbreviation rather than a player id (no id space covers them),
# so this table is load-bearing for 19 of the top 300.

TEAM_FIX = {
    "WAS": "WSH", "JAC": "JAX", "LA": "LAR", "SD": "LAC", "OAK": "LV",
    "STL": "LAR", "ARZ": "ARI", "BLT": "BAL", "CLV": "CLE", "HST": "HOU",
    "GNB": "GB", "KAN": "KC", "NWE": "NE", "NOR": "NO", "SFO": "SF",
    "TAM": "TB", "LVR": "LV", "NNO": "NO",
}

# ESPN's proTeamId space, needed because ESPN names defenses "Texans D/ST"
# rather than by team code.
ESPN_TEAM = {
    1: "ATL", 2: "BUF", 3: "CHI", 4: "CIN", 5: "CLE", 6: "DAL", 7: "DEN",
    8: "DET", 9: "GB", 10: "TEN", 11: "IND", 12: "KC", 13: "LV", 14: "LAR",
    15: "MIA", 16: "MIN", 17: "NE", 18: "NO", 19: "NYG", 20: "NYJ", 21: "PHI",
    22: "ARI", 23: "PIT", 24: "LAC", 25: "SF", 26: "SEA", 27: "TB", 28: "WSH",
    29: "CAR", 30: "JAX", 33: "BAL", 34: "HOU",
}


def norm_team(abbr: object) -> str | None:
    if abbr is None:
        return None
    s = str(abbr).strip().upper()
    if not s or s in {"NAN", "NONE", "FA"}:
        return None
    return TEAM_FIX.get(s, s)
