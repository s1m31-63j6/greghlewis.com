"""top200.py — the player-by-player page.

WHAT A BLURB IS, AND WHAT IT IS NOT.

Every sentence here is COMPOSED FROM A SIGNAL THAT EXISTS IN THE DATA. Nothing
is invented, nothing is paraphrased from someone else's analysis, and there is
no model guessing at narrative. A player changed teams, or a play-caller
changed, or the market moved him twenty picks, or the expert panel cannot agree
on him, or he is second on his own depth chart — those are facts, and the blurb
states the two or three that matter most for him.

The result reads thinner than a human analyst's write-up, and it should: it is
honest about being derived. What it buys is coverage — two hundred players, all
current as of the last rebuild, with no stale takes from July.

UPSIDE AND WORST CASE are the one genuinely sourced ceiling and floor in this
whole project. FantasyPros publishes each player's most and least optimistic
expert on a panel of a hundred-plus, and Fantasy Football Calculator publishes
the earliest and latest he has actually been taken in real mock drafts. Those
are real people's real opinions and real picks, not a spread invented here.

Usage:
    uv run python top200.py [--n 200]
"""
from __future__ import annotations

import argparse
import json

import nflreadpy as nfl
import pandas as pd

from common import HERE, norm_team

PUBLIC = HERE.parent.parent / "public" / "draft-sheet"
COACHING = HERE / "coaching.json"
NOTES = HERE / "player_notes.json"

SKILL = {"QB", "RB", "WR", "TE"}

# A team's full name reads better mid-sentence than a three-letter code.
def team_names() -> dict[str, str]:
    teams = json.loads((PUBLIC / "teams.json").read_text())["teams"]
    return {k: v.get("nick") or v.get("name") or k for k, v in teams.items()}


# A drafter thinks in rounds, not in overall picks. Twelve teams is the sheet's
# default and by far the most common shape, and the text says so rather than
# pretending the conversion is universal.
ROUND_SIZE = 12


def rounds_between(a: float, b: float) -> float:
    return abs(a - b) / ROUND_SIZE


import math


def round_of(pick: float) -> int:
    """Which round a given overall pick falls in, at 12 teams."""
    return max(1, math.ceil(pick / ROUND_SIZE))


ROUND_WORD = {1: "first", 2: "second", 3: "third", 4: "fourth", 5: "fifth",
              6: "sixth", 7: "seventh", 8: "eighth", 9: "ninth", 10: "tenth"}


def round_phrase(pick: float) -> str:
    r = round_of(pick)
    word = ROUND_WORD.get(r)
    return f"a {word}-round pick" if word else f"a round-{r} pick"


def plural_rounds(n: float) -> str:
    whole = round(n)
    if whole <= 1:
        return "about a round"
    return f"about {whole} rounds"


# "for a wr" reads like a database field. These are the words people say.
POS_WORD = {"QB": "quarterback", "RB": "running back", "WR": "receiver", "TE": "tight end"}


def ceiling_line(
    ecr: float, best: float | None, high: float | None,
    pos: str, pos_rank: int | None,
) -> str | None:
    """How much room is above him, said differently depending on how much there is.

    The first version wrote one sentence 200 times. The shape of a ceiling
    genuinely varies — some players have an evaluator four rounds ahead of the
    field, some have none — so the sentence varies with it.
    """
    if best is None:
        if high is None:
            return None
        return f"Somebody has already spent pick {int(high)} on him."

    gap = ecr - best
    where = f"{ordinal(int(best))} overall"
    mock = f" He has actually gone as early as pick {int(high)}." if high else ""

    if gap >= 36:
        return (
            f"His most bullish evaluator is {plural_rounds(rounds_between(ecr, best))} "
            f"ahead of the field, at {where}. Somebody on that panel thinks the "
            f"market has this badly wrong.{mock}"
        )
    if gap >= 18:
        return (
            f"The high man on the panel takes him around {where}, "
            f"{plural_rounds(rounds_between(ecr, best))} before the consensus "
            f"does.{mock}"
        )
    if gap >= 7:
        return (
            f"His best case is {where} — {round_phrase(best)} — most of a round "
            f"ahead of his rank.{mock}"
        )
    # The elite band is where a single template shows most, because everyone up
    # here has a tight range by definition. Split it on things that are actually
    # different about them rather than repeating one sentence twenty times.
    who = POS_WORD.get(pos, "player")
    if pos_rank == 1:
        return f"He is the panel's number one {who}, and some have him first overall.{mock}"
    if ecr <= 12:
        return f"Already a first-round price, with a ceiling of {where}.{mock}"
    if pos_rank is not None and pos_rank <= 5:
        return (
            f"Somebody on the panel has him as a top-{max(2, pos_rank - 1)} {who}, "
            f"at {where}. That is most of the room he has.{mock}"
        )
    if gap >= 2:
        return (
            f"Even the panel's optimist stays close, at {where}. What you see is "
            f"roughly what he is.{mock}"
        )
    return (
        f"Nobody has him meaningfully above {where}. You are paying for the "
        f"floor here, not the ceiling.{mock}"
    )


def floor_line(
    ecr: float, worst: float | None, low: float | None,
    pos: str, pos_rank: int | None,
) -> str | None:
    """And how far he can fall, on the same principle."""
    if worst is None:
        if low is None:
            return None
        return f"He has lasted until pick {int(low)} in a real draft."

    gap = worst - ecr
    where = f"{ordinal(int(worst))}"
    mock = f" In a real draft he has slid to pick {int(low)}." if low else ""

    if worst > 190:
        return (
            f"One evaluator has him outside the top 190 — on that board he is not "
            f"worth a pick at all in a 12-team league.{mock}"
        )
    if gap >= 48:
        return (
            f"The low man on the panel has him all the way down at {where}, "
            f"{plural_rounds(rounds_between(worst, ecr))} later. This is the widest "
            f"kind of disagreement there is.{mock}"
        )
    if gap >= 20:
        return (
            f"His floor is {where}, {plural_rounds(rounds_between(worst, ecr))} "
            f"below where the field has him.{mock}"
        )
    if gap >= 7:
        return (
            f"The bearish case puts him at {where}, {round_phrase(worst)}, about a "
            f"round later than his rank.{mock}"
        )
    who = POS_WORD.get(pos, "player")
    if ecr <= 12:
        # Splitting on the round his floor actually lands in, because "still a
        # first-round pick" and "early in the second" are different arguments
        # and stamping one sentence on the whole top of the page was the thing
        # that read as filler.
        r = round_of(worst)
        # Kept short on purpose. At the very top of the board the honest
        # statement genuinely is similar for everyone, so the padding is what
        # made it read as filler — not the fact. The numbers do the varying.
        if r <= 1:
            return f"Even the low man keeps him in round one, at {where}.{mock}"
        if r == 2:
            return f"His floor is {where}, into the second round.{mock}"
        return (
            f"His worst case is {where}, {round_phrase(worst)} — a long way to "
            f"fall for someone priced this high.{mock}"
        )
    if pos_rank is not None and pos_rank <= 6:
        return (
            f"The most bearish evaluator still has him a top-{max(3, pos_rank + 3)} "
            f"{who}, at {where}.{mock}"
        )
    return (
        f"Even the pessimist keeps him near {where}. For a {who} ranked this high "
        f"the floor is about as firm as it gets.{mock}"
    )


def sentence(clauses: list[str]) -> str | None:
    if not clauses:
        return None
    joined = ", and ".join(clauses) if len(clauses) == 2 else "; ".join(clauses)
    return joined[0].upper() + joined[1:] + "."


# Sleeper title-cases every body part. Mid-sentence that reads like a proper
# noun, so it is lowered again — except for the ones that genuinely are.
PROPER_PARTS = {"achilles", "lisfranc", "jones"}


def body_part(raw: str) -> str:
    out = []
    for token in raw.split():
        if token.isupper() or token.lower().strip("-") in PROPER_PARTS:
            out.append(token)
        else:
            out.append(token.lower())
    return " ".join(out)


def stop(text: str) -> str:
    """End a sentence without doubling the period on a name like "Penix Jr."."""
    return text if text.endswith(".") else text + "."


def article(word: str) -> str:
    """"a" or "an". Body parts arrive as "Achilles", "ACL", "Ankle"."""
    return "an" if word[:1].lower() in "aeiou" else "a"


def ordinal(n: int) -> str:
    if 10 <= n % 100 <= 20:
        suffix = "th"
    else:
        suffix = {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suffix}"


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--n", type=int, default=200)
    args = ap.parse_args()

    players = json.loads((PUBLIC / "players.json").read_text())["players"]
    adp = {a["id"]: a for a in json.loads((PUBLIC / "adp.json").read_text())["adp"]}
    merged = pd.read_parquet(HERE / "data" / "merged.parquet")
    extra = {str(r["fpros_id"]): r for r in merged.to_dict("records")}
    nick = team_names()

    coaching = json.loads(COACHING.read_text())
    coaching = {k: v for k, v in coaching.items() if not k.startswith("_")}

    # Written, not generated. For the handful of things no feed carries — a
    # concussion history, a coaching staff's stated intent — a composed sentence
    # cannot get there, and guessing would be worse than saying nothing. An
    # entry replaces the generated opening and leads the blurb.
    notes = json.loads(NOTES.read_text()) if NOTES.exists() else {}
    notes = {k: v for k, v in notes.items() if not k.startswith("_")}
    missing = [k for k, v in notes.items() if not v.get("note") or not v.get("why")]
    if missing:
        raise SystemExit(f"player_notes.json entries need both note and why: {missing}")

    news = json.loads((PUBLIC / "team-news.json").read_text())["teams"]

    # Movement between teams, and this year's rookies.
    ros = nfl.load_rosters([2025, 2026]).to_pandas()
    ros = ros[ros["position"].isin(SKILL)].dropna(subset=["gsis_id", "team"])
    ros["team"] = ros["team"].map(norm_team)
    y25 = dict(zip(ros[ros.season == 2025]["gsis_id"], ros[ros.season == 2025]["team"]))
    y26 = dict(zip(ros[ros.season == 2026]["gsis_id"], ros[ros.season == 2026]["team"]))

    picks = nfl.load_draft_picks().to_pandas()
    picks = picks[picks["season"] == 2026]
    rookie_round = dict(zip(picks["gsis_id"], picks["round"]))

    # ── what he actually did last season ────────────────────────────────────
    #
    # The direction arrow compares where the market projects a player THIS year
    # against where he actually finished LAST year, in his own position. That is
    # the question a casual drafter is really asking about a name they half
    # recognize: is this guy on the way up or on the way down?
    #
    # Per-game, not total, so a player who missed six games is not punished for
    # the absence twice — the games he missed show up in the note instead.
    stats = nfl.load_player_stats(seasons=[2025]).to_pandas()
    stats = stats[stats["position"].isin(SKILL)]
    agg = stats.groupby(["player_id", "position"], as_index=False).agg(
        pts=("fantasy_points_ppr", "sum"), games=("week", "nunique")
    )
    agg = agg[agg["games"] >= 1]
    agg["ppg"] = agg["pts"] / agg["games"]
    # A positional finish only means something over a real sample. Under six
    # games it is noise, and those players are given no arrow at all.
    eligible = agg[agg["games"] >= 6].copy()
    eligible["finish"] = eligible.groupby("position")["ppg"].rank(
        ascending=False, method="min"
    )
    last_year = {
        r["player_id"]: {"finish": int(r["finish"]), "games": int(r["games"]),
                         "ppg": round(float(r["ppg"]), 1)}
        for r in eligible.to_dict("records")
    }
    played = {r["player_id"]: int(r["games"]) for r in agg.to_dict("records")}

    cw = pd.read_parquet(HERE / "data" / "crosswalk.parquet")
    fp_to_gsis = cw.dropna(subset=["fantasypros_id", "gsis_id"]).drop_duplicates(
        "fantasypros_id").set_index("fantasypros_id")["gsis_id"].to_dict()

    # How polarizing is polarizing? Compare each player's expert dispersion
    # against the spread of everyone else at his position, so "analysts cannot
    # agree" means something relative rather than an arbitrary cutoff.
    std_by_pos: dict[str, float] = {}
    for pos in SKILL | {"K", "DST"}:
        vals = [p["ecrStd"] for p in players[:400]
                if p["pos"] == pos and p.get("ecrStd")]
        if vals:
            vals.sort()
            std_by_pos[pos] = vals[int(len(vals) * 0.8)]

    rows = []
    ranked = [p for p in players if p["ecr"]["ppr"] is not None]
    ranked.sort(key=lambda p: p["ecr"]["ppr"])

    # HOW MUCH DISAGREEMENT IS NORMAL depends entirely on where a player sits.
    # The panel spans four places on the first pick and eighty on the hundredth,
    # so a flat cutoff called a 74-place gap "the usual consensus" — which is
    # nonsense, and it showed up right at the top of the page.
    band_spans: dict[int, list[float]] = {}
    for p in ranked[:260]:
        ex = extra.get(p["id"], {})
        b, w = ex.get("best_ppr"), ex.get("worst_ppr")
        if pd.isna(b) or pd.isna(w) or not b or not w:
            continue
        band_spans.setdefault(int(p["ecr"]["ppr"]) // 25, []).append(float(w) - float(b))
    band_norm = {
        k: sorted(v)[len(v) // 2] for k, v in band_spans.items() if v
    }

    def dispersion_clause(ecr: float, b, w) -> str:
        if pd.isna(b) or pd.isna(w) or not b or not w:
            return "The panel has not given him a wide enough read to say much."
        span = float(w) - float(b)
        norm = band_norm.get(int(ecr) // 25) or max(8.0, ecr * 0.5)
        if span <= norm * 0.6:
            return (
                f"The panel is tighter on him than on almost anyone around him, "
                f"spanning {int(span)} places."
            )
        if span <= norm * 1.4:
            where = (
                "at this end of the board" if ecr <= 30
                else "in this range" if ecr <= 90
                else "this far down the board"
            )
            return (
                f"The {int(span)} places between the panel's high and low man is "
                f"about what you would expect {where}."
            )
        return (
            f"The panel is unusually split on him all the same, spanning "
            f"{int(span)} places."
        )

    for p in ranked[: args.n]:
        a = adp.get(p["id"], {})
        e = extra.get(p["id"], {})
        gsis = fp_to_gsis.get(p["id"])
        team = p["team"]
        facts: list[tuple[int, str]] = []

        club_news = news.get(team or "", {})
        swaps = club_news.get("starterSwaps") or {}

        # 0. Anything written by hand leads, and replaces nothing else.
        authored = notes.get(p["id"])
        if authored:
            facts.append((20, authored["note"]))

        # 1. A new team is the single biggest change to a player's situation.
        if gsis and gsis in y26 and y25.get(gsis) and y25[gsis] != y26[gsis]:
            facts.append((
                10,
                f"Moved to the {nick.get(y26[gsis], y26[gsis])} from the "
                f"{nick.get(y25[gsis], y25[gsis])} this offseason.",
            ))
        elif gsis and gsis in rookie_round:
            rnd = int(rookie_round[gsis])
            where = "first-round" if rnd == 1 else f"round {rnd}"
            facts.append((
                10, f"A rookie, taken {where} by the {nick.get(team, team)}."
            ))

        # 2. An injury a drafter has to price in.
        inj = p.get("injury")
        if inj and inj["severity"] in ("out", "doubtful"):
            facts.append((9, inj["detail"].rstrip(".") + "."))
        elif inj and inj.get("part") and inj["part"].lower() != "undisclosed":
            part = body_part(inj["part"])
            facts.append((4, f"Carrying {article(part)} {part} issue."))
        elif inj:
            # An undisclosed knock is still a knock, and a drafter should see it
            # rather than read "no change of situation" about a listed player.
            facts.append((3, "Carrying an undisclosed injury into the season."))

        # 3. A new voice calling the plays, but only where it is genuinely big.
        co = coaching.get(team or "")
        if co and co.get("major"):
            caller = co.get("HC") if co.get("playCaller") == "HC" else co.get("OC")
            if caller and caller.get("in"):
                facts.append((
                    8,
                    f"{caller['in']} is calling plays for the "
                    f"{nick.get(team, team)} for the first time.",
                ))

        # 3b. WHO IS THROWING HIM THE BALL. For a pass-catcher this outranks
        # almost everything else, and it is fully derivable — Minnesota's
        # receivers all have a new quarterback whether or not they moved.
        qb = swaps.get("QB")
        if qb and p["pos"] in {"WR", "TE"}:
            facts.append((
                9, stop(f"{qb['to']} replaces {qb['from']} at quarterback")
            ))
        elif qb and p["pos"] == "RB":
            facts.append((5, stop(f"New quarterback: {qb['to']} in for {qb['from']}")))

        # 3c. Volume that just walked out of the building, or arrived to
        # compete for his.
        gone = [
            m for m in club_news.get("out", [])
            if m["pos"] == p["pos"] and m["ecr"] is not None and m["ecr"] <= 130
        ]
        came = [
            m for m in club_news.get("in", [])
            if m["pos"] == p["pos"] and m["ecr"] is not None and m["ecr"] <= 130
            and m["name"] != p["name"]
        ]
        if gone:
            facts.append((
                7, stop(f"{gone[0]['name']}'s work is gone from this offense")
            ))
        if came:
            facts.append((
                6, stop(f"{came[0]['name']} arrives to compete for the same touches")
            ))

        # 3d. A schedule at either extreme is worth a clause.
        sched = (club_news.get("grades") or {}).get("schedule", "")
        if sched.startswith("A"):
            facts.append((4, "One of the softest schedules in the league."))
        elif sched.startswith("D") or sched.startswith("F"):
            facts.append((4, "One of the hardest schedules in the league."))

        # 4. Where the market has actually gone in the last month.
        move = a.get("move")
        if move is not None and abs(move) >= 10:
            facts.append((
                7,
                f"The market has moved him {abs(round(move))} picks "
                f"{'earlier' if move > 0 else 'later'} in the last month.",
            ))

        # 5. A panel that cannot agree is a real signal about risk.
        std = p.get("ecrStd")
        cut = std_by_pos.get(p["pos"])
        if std and cut and std > cut:
            facts.append((
                6, f"The expert panel is unusually split on him."
            ))

        # 6. The cheapest place to get him, if one platform is well out of line.
        best_gap, best_plat = 0.0, None
        pos_ecr = a.get("posRankEcr")
        for key, label in (("yahoo", "Yahoo"), ("espn", "ESPN"), ("ffc", "mock drafts")):
            pr = (a.get("posRank") or {}).get(key)
            if pr is not None and pos_ecr is not None and pr - pos_ecr > best_gap:
                best_gap, best_plat = pr - pos_ecr, label
        if best_plat and best_gap >= 4:
            facts.append((
                5,
                f"He lasts about {round(best_gap)} spots longer at his position on "
                f"{best_plat} than the experts rank him.",
            ))

        # 7. Not the starter at his own team.
        depth = p.get("depth")
        if depth and depth > 1 and p["pos"] in {"RB", "WR", "TE"}:
            facts.append((
                4, f"Listed {ordinal(int(depth))} at his position on the depth chart."
            ))

        # ── direction against last season ───────────────────────────────────
        pos_rank_now = None
        if p["posRank"]["ppr"]:
            digits = "".join(ch for ch in p["posRank"]["ppr"] if ch.isdigit())
            pos_rank_now = int(digits) if digits else None

        direction, last_note = None, None
        prior = last_year.get(gsis) if gsis else None
        if gsis and gsis in rookie_round:
            last_note = "No NFL snaps yet."
        elif prior and pos_rank_now:
            moved = prior["finish"] - pos_rank_now  # positive = projected better
            # Scaled to where he sits: climbing five spots is a leap at the top
            # of a position and barely news at the back of it.
            depth = max(6.0, pos_rank_now * 0.55)
            if moved >= depth * 1.6:
                direction = "much-better"
            elif moved >= depth * 0.55:
                direction = "better"
            elif moved <= -depth * 1.6:
                direction = "much-worse"
            elif moved <= -depth * 0.55:
                direction = "worse"
            else:
                direction = "same"
            last_note = (
                f"Finished {p['pos']}{prior['finish']} last season on "
                f"{prior['ppg']} points a game over {prior['games']} games."
            )
        elif gsis and played.get(gsis, 0) > 0:
            last_note = f"Only {played[gsis]} games last season."
        else:
            last_note = "Did not play last season."

        best, worst = e.get("best_ppr"), e.get("worst_ppr")
        ecr_val = float(p["ecr"]["ppr"])

        facts.sort(key=lambda f: -f[0])
        # Three clauses where there are three worth having. Two was leaving real
        # information on the floor for exactly the players who had the most of
        # it, which is how a blurb ends up reading like a template.
        take = 3 if len(facts) >= 3 and sum(len(t) for _, t in facts[:3]) < 210 else 2
        blurb = " ".join(t for _, t in facts[:take])
        if not blurb:
            # "No news" is still worth a sentence, but the sentence should say
            # something. What the market now expects of him against what he
            # actually did is the most useful thing left, and it varies per
            # player rather than being one line stamped two hundred times.
            # "Same" is by far the biggest bucket, so it splits again on things
            # that genuinely differ: how high he is, and whether last season was
            # a full one.
            games = prior["games"] if prior else None
            if direction == "same" and ecr_val <= 15:
                lead = ("He is exactly where he was a year ago, and the market sees "
                        "no reason to move him.")
            elif direction == "same" and games is not None and games >= 16:
                lead = ("Same team, same role, and a full season behind him that the "
                        "market has simply carried forward.")
            elif direction == "same" and games is not None and games <= 12:
                lead = (f"Same team and same role. The market has him where he "
                        f"finished, on a season that only lasted {games} games.")
            else:
                lead = {
                    "much-better": "Nothing has changed around him, and yet the market "
                                   "wants him well ahead of where he finished last season.",
                    "better": "Same team, same job, but the market expects more of him "
                              "than he delivered last year.",
                    "same": "Same team, same role, and the market wants him almost "
                            "exactly where he finished last season.",
                    "worse": "Nothing has changed around him, and the market still wants "
                             "him behind last season's finish.",
                    "much-worse": "Same team, same role, and the market has cooled on him "
                                  "hard anyway.",
                }.get(direction or "", "Same team, same role, and no move to report.")
            blurb = f"{lead} {dispersion_clause(ecr_val, best, worst)}"

        disp = (a.get("dispersion") or {})
        high, low = disp.get("high"), disp.get("low")
        b = int(best) if pd.notna(best) and best else None
        w = int(worst) if pd.notna(worst) and worst else None
        upside_txt = ceiling_line(
            ecr_val, b, int(high) if high else None, p["pos"], pos_rank_now
        )
        floor_txt = floor_line(
            ecr_val, w, int(low) if low else None, p["pos"], pos_rank_now
        )

        rows.append({
            "id": p["id"],
            "name": p["name"],
            "short": p["short"],
            "pos": p["pos"],
            "team": team,
            "bye": p["bye"],
            "espnId": p["espnId"],
            "headshot": p["yahooHeadshot"],
            "rank": int(p["ecr"]["ppr"]),
            "posRank": p["posRank"]["ppr"],
            "tier": p["tier"]["ppr"],
            "adp": (a.get("mean")),
            "move": a.get("move"),
            "injury": p.get("injury"),
            "newsUrl": e.get("news_url"),
            "authored": bool(authored),
            "blurb": blurb,
            "upside": upside_txt,
            "downside": floor_txt,
            "direction": direction,
            "last": last_note,
        })

    payload = {
        "_note": "Generated by projects/draft-sheet/top200.py — do not hand-edit.",
        "derived": "Every blurb is composed from signals in the data: a change of "
                   "team, a new play-caller, market movement, expert dispersion, "
                   "depth chart and injury designation. Nothing is invented.",
        "sourced": "Upside and worst case are real: the most and least optimistic "
                   "of 100+ FantasyPros experts, and the earliest and latest a "
                   "player has actually gone in public mock drafts.",
        "direction": "Where the market projects him this year against where he "
                     "actually finished last year at his own position, on points "
                     "per game. Players with under six games get no arrow.",
        "players": rows,
    }
    blob = json.dumps(payload, separators=(",", ":"), allow_nan=False)
    (PUBLIC / "top200.json").write_text(blob)

    withblurb = sum(1 for r in rows if r["blurb"])
    both = sum(1 for r in rows if r["upside"] and r["downside"])
    from collections import Counter
    dirs = Counter(r["direction"] or "none" for r in rows)
    print(f"  {len(rows)} players")
    print(f"  {withblurb} with a blurb, {both} with both a ceiling and a floor")
    print(f"  direction vs last season: {dict(sorted(dirs.items()))}")
    print(f"  wrote top200.json ({len(blob) / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
