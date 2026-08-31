"""news.py — a headline wire, so a player's page can say what happened to him.

WHY THIS EXISTS. Every other source in this project reports a NUMBER. Between
them they are very good at showing that a player has moved and useless at
saying why: when Josh Jacobs went to the commissioner's exempt list, the board
correctly dropped him twenty-eight places at running back and could not tell
anyone what had occurred. Consensus is a lagging summary of the news, and a
reader looking at a cliff in the rankings deserves the sentence behind it.

WHAT IS STORED, AND WHAT IS NOT. Headline, link, publisher and timestamp. Never
the article body. This is an index that points at the people who did the
reporting; it is not a copy of their work, and every item on the page is a link
out to them with their name on it.

HOW PLAYERS ARE MATCHED. On the full name, at a word boundary, against players
who are actually on the board. A surname alone is not enough — "Jacobs put on
exempt list" is about a different person than a headline about a linebacker of
the same name, and the sheet has no business guessing. A name that resolves to
more than one player is skipped rather than attached to the wrong one.

WHY IT ACCUMULATES. Each feed is a rolling window of a day or so, so a single
pull is a snapshot. The file is merged forward and aged out, the same shape as
adp_history.py, which is what turns four snapshots into a week of context.

Usage:
    uv run python news.py [--force]
"""
from __future__ import annotations

import argparse
import json
import re
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime

from common import HERE, cached_text, raw_path

PUBLIC = HERE.parent.parent / "public" / "draft-sheet"
OUT = PUBLIC / "news.json"

# Three wires, all anonymous, all published as RSS for syndication. PFT is the
# transaction desk of record — cuts, IR, PUP, suspensions — and the other two
# round out the national stories it treats as too obvious to write up.
#
# ESPN IS DELIBERATELY ABSENT. Their feed answers this project's User-Agent with
# 202 and an empty body, and a browser's with the articles. That is a block, and
# the way around it would be to stop saying who we are — so we do not take it.
# The three below serve the same headline to anyone who asks honestly.
FEEDS = {
    "ProFootballTalk": "https://profootballtalk.nbcsports.com/feed/",
    "CBS Sports": "https://www.cbssports.com/rss/headlines/nfl/",
    "Yahoo Sports": "https://sports.yahoo.com/nfl/rss.xml",
}

# Below this, assume something is wrong with us rather than with the news.
MIN_LIVE_WIRES = 2

# Long enough to cover a reader who last looked before the weekend, short
# enough that nothing on a player's page is stale news presented as current.
WINDOW_DAYS = 14
# Per player. A roster move gets written up by all four wires on the same day,
# and four near-identical headlines is not four pieces of information.
MAX_ITEMS = 4


def clean(s: str) -> str:
    """RSS titles carry entities and the odd stray tag."""
    s = re.sub(r"<[^>]+>", "", s or "")
    s = (s.replace("&amp;", "&").replace("&#039;", "'").replace("&apos;", "'")
          .replace("&quot;", '"').replace("&nbsp;", " ").replace("&#8217;", "’"))
    return re.sub(r"\s+", " ", s).strip()


def when(raw: str | None) -> str | None:
    if not raw:
        return None
    try:
        d = parsedate_to_datetime(raw)
    except (TypeError, ValueError):
        return None
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    return d.astimezone(timezone.utc).isoformat(timespec="seconds")


def pull(force: bool) -> tuple[list[dict], int]:
    items, live = [], 0
    for source, url in FEEDS.items():
        try:
            body = cached_text(f"news-{source}.xml", url, force=force)
            if not body.strip():
                # A 202 with an empty body is a success as far as
                # `raise_for_status` is concerned, and it had already been
                # written to the cache — so a later run would reuse the silence
                # and report nothing wrong. Throw the poisoned file away.
                raw_path(f"news-{source}.xml").unlink(missing_ok=True)
                raise ValueError("empty body — the wire answered but said nothing")
            root = ET.fromstring(body)
        except Exception as e:
            # One dead wire is not a reason to publish nothing. The gate counts
            # sources, so a feed that stays dark is caught there rather than by
            # failing the whole nightly run over somebody else's outage.
            print(f"  ! {source}: {e}")
            continue
        live += 1
        found = 0
        for it in root.findall(".//item"):
            title, link = clean(it.findtext("title") or ""), (it.findtext("link") or "").strip()
            ts = when(it.findtext("pubDate"))
            if title and link.startswith("http") and ts:
                items.append({"headline": title, "url": link, "source": source, "ts": ts})
                found += 1
        print(f"  {source:16} {found:3} headlines")
    return items, live


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--force", action="store_true")
    force = ap.parse_args().force

    board = json.loads((PUBLIC / "players.json").read_text())
    players = board["players"] if isinstance(board, dict) else board

    # Only players who are actually rankable. A name match against the long
    # tail of the player universe is mostly noise, and nothing renders it.
    #
    # DEFENCES ARE EXCLUDED. A team defence is named after its team, so
    # "Tennessee Titans" matched every headline about the Titans — "Will Levis
    # cut among 33 players waived" is not news about the defence, it is news
    # about a quarterback who happens to share their employer. Team-level
    # context has its own tab.
    by_name: dict[str, list[str]] = {}
    for p in players:
        if p.get("pos") == "DST":
            continue
        if p.get("name") and any(v is not None for v in (p.get("ecr") or {}).values()):
            by_name.setdefault(p["name"], []).append(p["id"])
    # A name that is not unique cannot be resolved from a headline.
    names = {n: ids[0] for n, ids in by_name.items() if len(ids) == 1}
    patterns = {n: re.compile(rf"\b{re.escape(n)}\b") for n in names}

    print(f"pulling {len(FEEDS)} wires")
    items, live = pull(force)
    if live < MIN_LIVE_WIRES:
        raise SystemExit(
            f"only {live} of {len(FEEDS)} wires answered — refusing to age out "
            "real headlines and replace them with a quiet outage"
        )
    print(f"  {len(items)} headlines, matching against {len(names)} rankable players")

    fresh: dict[str, list[dict]] = {}
    for item in items:
        for name, pat in patterns.items():
            if pat.search(item["headline"]):
                fresh.setdefault(names[name], []).append(item)

    previous = json.loads(OUT.read_text())["news"] if OUT.exists() else {}
    cutoff = (datetime.now(timezone.utc) - timedelta(days=WINDOW_DAYS)).isoformat()

    # Carried-forward entries are re-checked against the current eligible set,
    # not merely aged. A player who stops being matchable — cut, retired, or a
    # rule change like dropping defences — would otherwise keep whatever the
    # file already held about him, forever.
    eligible = set(names.values())

    news: dict[str, list[dict]] = {}
    for pid in (set(previous) | set(fresh)) & eligible:
        seen, merged = set(), []
        for item in (fresh.get(pid, []) + previous.get(pid, [])):
            if item["url"] in seen or item["ts"] < cutoff:
                continue
            seen.add(item["url"])
            merged.append(item)
        merged.sort(key=lambda i: i["ts"], reverse=True)
        if merged:
            news[pid] = merged[:MAX_ITEMS]

    OUT.write_text(json.dumps({
        "built": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "windowDays": WINDOW_DAYS,
        "sources": sorted(FEEDS),
        "wiresLive": live,
        "news": news,
    }, separators=(",", ":")))
    total = sum(len(v) for v in news.values())
    print(f"wrote news.json — {total} headlines across {len(news)} players "
          f"({OUT.stat().st_size / 1024:.0f}KB)")


if __name__ == "__main__":
    main()
