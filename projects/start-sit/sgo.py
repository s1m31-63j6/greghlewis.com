"""sgo.py — read the SportsGameOdds snapshot into per-book prices.

Isolated from publish.py because the response shape was designed against the
public documentation before a key existed. probe.py prints what the feed
actually returns; anything this parser does not recognise is counted and
reported rather than silently dropped.

Output rows: {name, team, stat, book, line, price_over, price_under} for the
over/under markets, and {name, team, stat: "td", book, p} for anytime
touchdowns (paired with the No price where one is posted). Team is the SGO
team id when the event carries one, else None.
"""
from __future__ import annotations

import collections
import json
import re
from pathlib import Path

from common import norm_name, norm_team
from ev import devig_pair, implied

# SGO statID -> the advisor's stat key.
STAT_IDS = {
    "passing_yards": "pass_yds",
    "passing_touchdowns": "pass_tds",
    "passing_interceptions": "ints",
    "interceptions": "ints",
    "rushing_yards": "rush_yds",
    "rushing_attempts": "rush_att",
    "receptions": "rec",
    "receiving_receptions": "rec",
    "receiving_yards": "rec_yds",
    "touchdowns": "td",
}

# SGO spells a team id as its full name in caps: KANSAS_CITY_CHIEFS_NFL.
_TEAM_WORDS = re.compile(r"_NFL$")


def _team_from_id(team_id: str | None, names: dict[str, str]) -> str | None:
    if not team_id:
        return None
    key = _TEAM_WORDS.sub("", str(team_id)).replace("_", " ").title()
    return names.get(key) or norm_team(team_id)


def _player_name(player_id: str, players: dict) -> str:
    p = players.get(player_id) or {}
    for k in ("name", "displayName", "fullName"):
        if p.get(k):
            return str(p[k])
    # FIRST_LAST_1_NFL -> "First Last"
    parts = [w for w in player_id.split("_") if not w.isdigit() and w != "NFL"]
    return " ".join(w.capitalize() for w in parts)


def _price(o: dict) -> float | None:
    for k in ("odds", "bookOdds", "price"):
        v = o.get(k)
        if v not in (None, ""):
            try:
                return float(str(v).replace("+", ""))
            except ValueError:
                return None
    return None


def _line(o: dict) -> float | None:
    for k in ("overUnder", "bookOverUnder", "line", "point"):
        v = o.get(k)
        if v not in (None, ""):
            try:
                return float(v)
            except ValueError:
                return None
    return None


def load(path: Path, team_names: dict[str, str]) -> tuple[list[dict], list[dict], dict]:
    """Returns (player rows, game rows, diagnostics)."""
    doc = json.loads(path.read_text())
    events = doc.get("events", [])
    rows: list[dict] = []
    games: list[dict] = []
    unknown: collections.Counter = collections.Counter()
    books: collections.Counter = collections.Counter()

    for ev in events:
        players = ev.get("players") or {}
        teams = ev.get("teams") or {}
        home = _team_from_id((teams.get("home") or {}).get("teamID"), team_names)
        away = _team_from_id((teams.get("away") or {}).get("teamID"), team_names)
        odds = ev.get("odds") or {}
        # Player over/under pairs share everything but the last segment.
        pairs: dict[tuple, dict[str, dict]] = collections.defaultdict(dict)
        game: dict = {"home": home, "away": away, "spread": None, "total": None, "books": 0}
        for odd_id, o in odds.items():
            parts = odd_id.split("-")
            if len(parts) < 5:
                continue
            stat, entity, period, bet, side = parts[0], parts[1], parts[2], parts[3], parts[-1]
            if period != "game":
                continue
            if stat == "points" and entity == "all" and bet == "ou" and side == "over":
                game["total"] = _line(o) if _line(o) is not None else o.get("fairOverUnder")
                game["books"] = len(o.get("byBookmaker") or {})
                continue
            if stat == "points" and entity == "home" and bet == "sp" and side == "home":
                game["spread"] = _line(o) if _line(o) is not None else o.get("fairSpread")
                continue
            # The books' own fantasy-score line. The free plan hides the
            # per-book prices but publishes the consensus line, which is the
            # best external check on everything else in this file.
            if stat == "fantasyScore" and bet == "ou" and side == "over" and entity not in ("home", "away", "all"):
                fs_line = o.get("bookOverUnder") or o.get("fairOverUnder")
                if fs_line not in (None, ""):
                    name = _player_name(entity, players)
                    rows.append({"name": name, "key": norm_name(name),
                                 "team": _team_from_id((players.get(entity) or {}).get("teamID"), team_names),
                                 "home": home, "away": away, "stat": "fantasy_score",
                                 "book": "consensus", "line": float(fs_line)})
                continue
            key = STAT_IDS.get(stat)
            if key is None:
                if entity not in ("home", "away", "all"):
                    unknown[stat] += 1
                continue
            if entity in ("home", "away", "all"):
                continue
            pairs[(entity, key, bet)][side] = o

        for (entity, key, bet), sides in pairs.items():
            name = _player_name(entity, players)
            pteam = _team_from_id((players.get(entity) or {}).get("teamID"), team_names)
            by_book: dict[str, dict] = collections.defaultdict(dict)
            for side, o in sides.items():
                for book, b in (o.get("byBookmaker") or {}).items():
                    if b.get("available") is False:
                        continue
                    by_book[book][side] = b
            for book, bs in by_book.items():
                books[book] += 1
                if key == "td":
                    yes = bs.get("over") or bs.get("yes")
                    no = bs.get("under") or bs.get("no")
                    if not yes or _price(yes) is None:
                        continue
                    if key == "td" and _line(yes) not in (None, 0.5):
                        continue
                    p_yes = implied(_price(yes))
                    if no and _price(no) is not None:
                        p_yes, _ = devig_pair(p_yes, implied(_price(no)))
                        paired = True
                    else:
                        paired = False
                    rows.append({"name": name, "key": norm_name(name), "team": pteam,
                                 "home": home, "away": away, "stat": "td", "book": book,
                                 "p": p_yes, "paired": paired})
                else:
                    over, under = bs.get("over"), bs.get("under")
                    if not over or not under:
                        continue
                    line = _line(over)
                    po, pu = _price(over), _price(under)
                    if line is None or po is None or pu is None:
                        continue
                    rows.append({"name": name, "key": norm_name(name), "team": pteam,
                                 "home": home, "away": away, "stat": key, "book": book,
                                 "line": line, "p_over": devig_pair(implied(po), implied(pu))[0]})
        if home and away:
            games.append(game)

    diag = {"events": len(events), "rows": len(rows), "books": dict(books),
            "unknownStats": dict(unknown.most_common(30)), "fetchedAt": doc.get("fetchedAt")}
    return rows, games, diag
