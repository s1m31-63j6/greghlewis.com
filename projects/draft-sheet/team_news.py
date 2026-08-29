"""team_news.py — the offseason briefing, for people who stopped watching in January.

The arrow has TWO INPUTS, and the page is explicit about which is which.

1. ROSTER (derived). Skill-position arrivals and departures, from diffing the
   nflverse 2026 roster against 2025 on `gsis_id`, plus 2026 draft picks. Each
   player is priced at what the market thinks of him TODAY — so a running back
   who left is valued on his new team. That yields a reproducible statement:
   "the players they added rank better than the players they lost."

2. COACHING (authored). A new play-caller can matter more to a position's
   production than any single free-agent signing — a pass-first coordinator can
   lift a whole receiving corps without the roster changing at all, and a
   run-heavy hire can quietly end a receiver's WR2 season. A sheet that is
   silent on coaching is missing most of the story, so coaching is weighted
   heavily here rather than shown as a footnote.

   Coaching cannot be derived. `nfldata`'s coach column is partially stale, and
   no free structured source covers offensive coordinators at all. So
   `coaching.json` is hand-authored, carries its sources, and every team without
   an entry contributes ZERO to the arrow rather than a guess.

   The coaching impact score is an editorial judgement informed by reported
   scheme and public expectation. It is labelled as such everywhere it appears.
   It is capped so that it can move an arrow but never dominate a roster change
   that actually happened.

Usage:
    uv run python team_news.py
"""
from __future__ import annotations

import json
from pathlib import Path

import nflreadpy as nfl
import pandas as pd

from common import HERE, norm_team

PUBLIC = HERE.parent.parent / "public" / "draft-sheet"
COACHING = HERE / "coaching.json"
VIBES_FILE = HERE / "vibes.json"

SKILL = {"QB", "RB", "WR", "TE"}

# A transaction only belongs on the card if somebody might actually draft the
# player. Beyond this the card was listing camp bodies, which buried the moves
# that matter.
RELEVANT_ECR = 240
MAX_MOVES = 5

# How much a change of starter matters, by position. A new quarterback rewrites
# every pass-catcher's season; a new tight end mostly rewrites his own.
STARTER_WEIGHT = {"QB": 100, "RB": 62, "WR": 58, "TE": 40}

# A player's worth on today's board, as a simple decreasing function of
# consensus rank. Flat past VALUE_FLOOR: the difference between the 260th and
# 300th ranked player is not a story about an offseason.
VALUE_FLOOR = 220.0

# Net-value thresholds for the five arrow states, in the same units.
T_BIG = 90.0
T_SMALL = 28.0

# What one step of authored coaching impact is worth, in the same value units.
# At 35, a maximal coaching judgement (+/-2) contributes 70 — enough to carry a
# position from "same" past the 28-point threshold and most of the way to the
# 90-point one, but never enough on its own to claim a big move that the roster
# contradicts. Coaching informs the arrow; it does not overrule the roster.
COACH_STEP = 35.0
COACH_MAX = 2


def value_of(ecr: float | None) -> float:
    if ecr is None or pd.isna(ecr):
        return 0.0
    return max(0.0, VALUE_FLOOR - float(ecr))


VALID_ROLES = {"HC", "OC"}
VALID_TREND_KEYS = {"QB", "RB", "WR", "TE"}


def validate_coaching(coaching: dict) -> None:
    """A malformed coaching entry must fail the build, not render as nonsense.

    This is the only hand-authored input in the whole pipeline, so it is the
    only place a typo can reach the page without an upstream source catching it
    first. Every field is checked, and an unknown key is an error rather than
    being ignored — a `posimpact` that silently did nothing would be very hard
    to notice on a 32-card page.
    """
    known = {"HC", "OC", "playCaller", "playCallerNew", "major", "impact",
             "posImpact", "note", "source", "firstTimeCaller"}
    problems: list[str] = []
    for team, entry in coaching.items():
        if not isinstance(entry, dict):
            problems.append(f"{team}: not an object")
            continue
        for key in entry:
            if key not in known:
                problems.append(f"{team}: unknown key {key!r}")
        for role in VALID_ROLES:
            staff = entry.get(role)
            if staff is None:
                continue
            if not isinstance(staff, dict) or not staff.get("in"):
                problems.append(f"{team}.{role}: needs an 'in' name")
                continue
            if staff.get("new") and not staff.get("out"):
                problems.append(f"{team}.{role}: marked new but no 'out' predecessor")
        pc = entry.get("playCaller")
        if pc is not None and pc not in VALID_ROLES:
            problems.append(f"{team}.playCaller: must be HC or OC, got {pc!r}")
        if pc and not (entry.get(pc) or {}).get("in"):
            problems.append(f"{team}.playCaller={pc} but no {pc} named")
        imp = entry.get("impact")
        if imp is not None and not (isinstance(imp, (int, float)) and -2 <= imp <= 2):
            problems.append(f"{team}.impact: must be a number in [-2, 2], got {imp!r}")
        pi = entry.get("posImpact") or {}
        if not isinstance(pi, dict):
            problems.append(f"{team}.posImpact: must be an object")
        else:
            for k, v in pi.items():
                if k not in VALID_TREND_KEYS:
                    problems.append(f"{team}.posImpact: unknown position {k!r}")
                elif not (isinstance(v, (int, float)) and -2 <= v <= 2):
                    problems.append(f"{team}.posImpact.{k}: must be in [-2, 2], got {v!r}")
        # Play-calling authority can move with NO title change — Carolina handed
        # it from the head coach to a coordinator who kept his job. That is one
        # of the most fantasy-relevant changes there is and the easiest to miss,
        # so it counts as a change in its own right.
        pcn = entry.get("playCallerNew")
        if pcn is not None and not isinstance(pcn, bool):
            problems.append(f"{team}.playCallerNew: must be true or false")

        # `major` gates whether the card shows coaching at all. A note nobody
        # will ever see is dead weight, and a major flag with nothing to say is
        # an empty promise.
        maj = entry.get("major")
        if maj is not None and not isinstance(maj, bool):
            problems.append(f"{team}.major: must be true or false")
        if maj and not entry.get("note"):
            problems.append(f"{team}: marked major but has no note explaining why")
        if entry.get("note") and not maj:
            problems.append(f"{team}: has a note but is not marked major, so it will never render")

        # An impact score with no coaching change behind it is an unsupported
        # claim, which is exactly what this file exists to avoid.
        changed = (
            entry.get("HC", {}).get("new")
            or entry.get("OC", {}).get("new")
            or pcn
        )
        if (imp or pi) and not changed:
            problems.append(
                f"{team}: has an impact score but no coaching change "
                "(set HC/OC 'new', or 'playCallerNew' if the calls moved without a title change)"
            )
    if problems:
        raise SystemExit(
            "coaching.json is malformed:\n  " + "\n  ".join(problems)
        )


# Letter grades by rank across the 32 teams. Eleven buckets reads like a report
# card without pretending to more precision than the inputs support.
GRADE_BANDS = [
    (2, "A+"), (5, "A"), (8, "A-"), (11, "B+"), (14, "B"), (18, "B-"),
    (21, "C+"), (24, "C"), (27, "C-"), (30, "D+"), (32, "D"),
]


def grade(rank: int) -> str:
    """`rank` is 1 (best) through 32 (worst)."""
    for cutoff, letter in GRADE_BANDS:
        if rank <= cutoff:
            return letter
    return "D"


def rank_map(scores: dict[str, float], *, high_is_good: bool) -> dict[str, str]:
    order = sorted(scores, key=lambda t: -scores[t] if high_is_good else scores[t])
    return {team: grade(i + 1) for i, team in enumerate(order)}


# Preseason mood, in six steps. DERIVED, and the page says so: it blends how
# the roster changed with how good that roster is, which is not the same thing
# as fan sentiment and is not sold as it. A team can be "steady" and excellent,
# or "buzzing" and bad, because the two inputs measure different things.
VIBES = [
    (2.6, "Buzzing"),
    (1.2, "Optimistic"),
    (-0.4, "Steady"),
    (-1.6, "Uncertain"),
    (-3.0, "Skeptical"),
    (-99.0, "Bleak"),
]

ARROW_SCORE = {
    "much-better": 2, "better": 1, "same": 0, "worse": -1, "much-worse": -2,
}


# What a hurt starter costs the mood. A team whose receivers are all on the
# report is not "steady" however good the names look on paper — that was the
# single worst call the first version made.
INJURY_COST = {"out": 1.6, "doubtful": 1.1, "questionable": 0.5}


# The mood may never outrun the roster. A D-grade offense that churned a lot of
# names is still a D-grade offense, and letting it read "Optimistic" told the
# reader something the grade beside it flatly contradicted.
GRADE_CEILING = {"A": 0, "B": 0, "C": 1, "D": 2, "F": 3}


def clamp_to_grade(vibe: str, offense_grade: str) -> str:
    words = [w for _, w in VIBES]
    floor = GRADE_CEILING.get(offense_grade[:1], 0)
    idx = words.index(vibe) if vibe in words else floor
    return words[max(idx, floor)]


def vibe_of(
    trend: dict[str, str],
    offense_rank: int,
    injury_load: float,
    first_time_caller: bool,
) -> str:
    movement = sum(ARROW_SCORE.get(v, 0) for v in trend.values())
    # A top-five offense that stood pat should not read as flat, and a bottom
    # -five one that improved a little should not read as buzzing.
    # Weighted so a genuinely bad offense cannot read as "steady" just because
    # it churned a few names — a D-grade roster reading Steady was the second
    # worst call the first version made.
    quality = (16.5 - offense_rank) / 6.0
    # A coordinator who has never called plays is real uncertainty, whatever the
    # roster says.
    unknown = 0.7 if first_time_caller else 0.0
    score = movement * 0.7 + quality - injury_load - unknown
    for cutoff, word in VIBES:
        if score >= cutoff:
            return word
    return "Bleak"


def bucket(net: float) -> str:
    if net <= -T_BIG:
        return "much-worse"
    if net <= -T_SMALL:
        return "worse"
    if net >= T_BIG:
        return "much-better"
    if net >= T_SMALL:
        return "better"
    return "same"


def main() -> None:
    merged = pd.read_parquet(HERE / "data" / "merged.parquet")
    ecr_by_gsis: dict[str, float] = {}
    name_by_gsis: dict[str, str] = {}

    cw = pd.read_parquet(HERE / "data" / "crosswalk.parquet")
    fp_to_gsis = cw.dropna(subset=["fantasypros_id", "gsis_id"]).drop_duplicates(
        "fantasypros_id").set_index("fantasypros_id")["gsis_id"].to_dict()
    for r in merged.to_dict("records"):
        g = fp_to_gsis.get(str(r.get("fpros_id")))
        if not g:
            continue
        ecr_by_gsis[g] = r.get("ecr_ppr")
        name_by_gsis[g] = r.get("name")

    # Who actually played last season, so "the starter" means the man who took
    # the snaps rather than the man who was nominally listed first.
    stats = nfl.load_player_stats(seasons=[2025]).to_pandas()
    stats = stats[stats["position"].isin(SKILL)]
    prod25 = stats.groupby("player_id", as_index=False)["fantasy_points_ppr"].sum()
    points25 = dict(zip(prod25["player_id"], prod25["fantasy_points_ppr"]))

    ros = nfl.load_rosters([2025, 2026]).to_pandas()
    ros = ros[ros["position"].isin(SKILL)].copy()
    ros["team"] = ros["team"].map(norm_team)
    ros = ros.dropna(subset=["gsis_id", "team"])

    y25 = ros[ros["season"] == 2025]
    y26 = ros[ros["season"] == 2026]
    prev = {(r["team"], r["gsis_id"]) for _, r in y25.iterrows()}
    now = {(r["team"], r["gsis_id"]) for _, r in y26.iterrows()}
    prev_team = dict(zip(y25["gsis_id"], y25["team"]))
    now_team = dict(zip(y26["gsis_id"], y26["team"]))

    picks = nfl.load_draft_picks().to_pandas()
    picks = picks[(picks["season"] == 2026) & (picks["position"].isin(SKILL))].copy()
    picks["team"] = picks["team"].map(norm_team)

    coaching = json.loads(COACHING.read_text()) if COACHING.exists() else {}
    coaching = {k: v for k, v in coaching.items() if not k.startswith("_")}
    validate_coaching(coaching)

    # Some moods the data genuinely cannot see. A team can be a punchline in
    # August for reasons no roster diff captures, so a small authored override
    # file wins over the derivation — with a reason attached, always.
    overrides = json.loads(VIBES_FILE.read_text()) if VIBES_FILE.exists() else {}
    overrides = {k: v for k, v in overrides.items() if not k.startswith("_")}
    VIBE_WORDS = {w for _, w in VIBES}
    bad = [f"{t}: {v.get('vibe')!r}" for t, v in overrides.items()
           if v.get("vibe") not in VIBE_WORDS or not v.get("why")]
    if bad:
        raise SystemExit(
            "vibes.json entries must use a known vibe and give a reason: "
            + ", ".join(bad)
        )
    unknown_teams = sorted(set(coaching) - {norm_team(t) for t in coaching})
    if unknown_teams:
        raise SystemExit(f"coaching.json has non-canonical team codes: {unknown_teams}")

    # ── projected starters and grades ───────────────────────────────────────
    #
    # All three grades are DERIVED, and each says exactly one thing:
    #   Offense  — the consensus value of the skill players actually rostered.
    #   Defense  — where the market ranks that team's team defense.
    #   Schedule — the average strength of the defenses this offense must face.
    # None is a power ranking, and the page says so. Grades are relative to the
    # other 31 teams, so a "C" means mid-league, not mediocre in the abstract.
    y26_all = y26.copy()
    y26_all["ecr"] = y26_all["gsis_id"].map(ecr_by_gsis)

    STARTER_SLOTS = [("QB", 1), ("RB", 2), ("WR", 2), ("TE", 1)]
    starters: dict[str, list[dict]] = {}
    offense_score: dict[str, float] = {}
    for team in sorted(set(y26_all["team"].dropna())):
        roster = y26_all[y26_all["team"] == team]
        picked: list[dict] = []
        for pos, n in STARTER_SLOTS:
            at_pos = roster[(roster["position"] == pos) & roster["ecr"].notna()]
            for r in at_pos.nsmallest(n, "ecr").to_dict("records"):
                picked.append({
                    "id": r["gsis_id"],
                    "name": name_by_gsis.get(r["gsis_id"], r["full_name"]),
                    "pos": pos,
                    "ecr": round(float(r["ecr"]), 1),
                })
        starters[team] = picked
        # Only the projected starters count. A team's third running back does
        # not make its offense better, and counting the whole roster would just
        # reward depth nobody starts.
        offense_score[team] = sum(value_of(p["ecr"]) for p in picked)

    dst_ecr: dict[str, float] = {}
    for r in merged.to_dict("records"):
        if r.get("pos") == "DST" and r.get("team"):
            dst_ecr[norm_team(r["team"])] = r.get("ecr_ppr")
    defense_score = {t: value_of(dst_ecr.get(t)) for t in offense_score}

    sched = nfl.load_schedules().to_pandas()
    sched = sched[(sched["season"] == 2026) & (sched["game_type"] == "REG")]
    opponents: dict[str, list[str]] = {t: [] for t in offense_score}
    for r in sched.to_dict("records"):
        h, a = norm_team(r["home_team"]), norm_team(r["away_team"])
        if h in opponents and a:
            opponents[h].append(a)
        if a in opponents and h:
            opponents[a].append(h)
    # Higher = tougher defenses faced = worse for this offense.
    sos_score = {
        t: (sum(defense_score.get(o, 0.0) for o in opps) / len(opps)) if opps else 0.0
        for t, opps in opponents.items()
    }

    offense_rank = {
        t: i + 1
        for i, t in enumerate(sorted(offense_score, key=lambda x: -offense_score[x]))
    }
    # Injury load among the projected starters, which is what a preseason mood
    # actually turns on.
    injury_by_gsis: dict[str, str] = {}
    for r in merged.to_dict("records"):
        g = fp_to_gsis.get(str(r.get("fpros_id")))
        status = r.get("sleeper_injury")
        if g and isinstance(status, str) and status:
            injury_by_gsis[g] = status
    SEVERITY = {
        "IR": "out", "PUP": "out", "NA": "out", "DNR": "out", "Sus": "out",
        "Out": "out", "Doubtful": "doubtful", "Questionable": "questionable",
        "COV": "questionable",
    }
    injury_load: dict[str, float] = {}
    for t, picked in starters.items():
        injury_load[t] = sum(
            INJURY_COST.get(SEVERITY.get(injury_by_gsis.get(sp["id"], ""), ""), 0.0)
            for sp in picked
        )

    off_grade = rank_map(offense_score, high_is_good=True)
    def_grade = rank_map(defense_score, high_is_good=True)
    sos_grade = rank_map(sos_score, high_is_good=False)

    # Last season's starter is the man who actually produced; this season's is
    # the man the market ranks highest on the current roster.
    prev_starter: dict[tuple[str, str], dict] = {}
    for r in y25.to_dict("records"):
        key = (r["team"], r["position"])
        pts = points25.get(r["gsis_id"], 0.0)
        cur = prev_starter.get(key)
        if cur is None or pts > cur["pts"]:
            prev_starter[key] = {
                "id": r["gsis_id"],
                "name": name_by_gsis.get(r["gsis_id"], r["full_name"]),
                "pts": pts,
                "ecr": ecr_by_gsis.get(r["gsis_id"]),
            }
    new_starter: dict[tuple[str, str], dict] = {}
    for team_code, picked in starters.items():
        for sp in picked:
            key = (team_code, sp["pos"])
            if key not in new_starter:
                new_starter[key] = sp

    teamsjson = json.loads((PUBLIC / "teams.json").read_text())["teams"]
    nick_of = lambda code: (teamsjson.get(code or "", {}) or {}).get("nick") or (code or "")

    teams: dict[str, dict] = {}
    for team in sorted({t for t, _ in now}):
        arrivals, departures = [], []
        for (t, g) in now:
            if t != team or (t, g) in prev:
                continue
            row = y26[(y26["team"] == team) & (y26["gsis_id"] == g)].iloc[0]
            arrivals.append({
                "id": g,
                "name": name_by_gsis.get(g, row["full_name"]),
                "pos": row["position"],
                "from": prev_team.get(g),
                "ecr": None if pd.isna(ecr_by_gsis.get(g)) else ecr_by_gsis.get(g),
                "rookie": bool((picks["gsis_id"] == g).any()),
            })
        for (t, g) in prev:
            if t != team or (t, g) in now:
                continue
            row = y25[(y25["team"] == team) & (y25["gsis_id"] == g)].iloc[0]
            departures.append({
                "id": g,
                "name": name_by_gsis.get(g, row["full_name"]),
                "pos": row["position"],
                "to": now_team.get(g),
                "ecr": None if pd.isna(ecr_by_gsis.get(g)) else ecr_by_gsis.get(g),
            })

        coach = coaching.get(team) or {}
        team_impact = max(-COACH_MAX, min(COACH_MAX, float(coach.get("impact", 0) or 0)))
        pos_impact = coach.get("posImpact") or {}

        trend, net_by_pos, roster_by_pos, coach_by_pos = {}, {}, {}, {}
        for pos in sorted(SKILL):
            gain = sum(value_of(a["ecr"]) for a in arrivals if a["pos"] == pos)
            loss = sum(value_of(d["ecr"]) for d in departures if d["pos"] == pos)
            roster_net = gain - loss

            # A per-position override replaces the team figure for that position:
            # a pass-first hire is not equally good news for a running back.
            step = float(pos_impact.get(pos, team_impact) or 0)
            step = max(-COACH_MAX, min(COACH_MAX, step))
            coach_net = step * COACH_STEP

            net = roster_net + coach_net
            roster_by_pos[pos] = round(roster_net, 1)
            coach_by_pos[pos] = round(coach_net, 1)
            net_by_pos[pos] = round(net, 1)
            trend[pos] = bucket(net)

        # Only the moves worth reading. A camp body who never ranked anywhere is
        # not an offseason story, and 32 teams x 40 transactions is not a page.
        # Only players somebody might draft. A camp body who never ranked
        # anywhere is not an offseason story, and thirty of them per team is
        # not a page.
        notable = lambda xs: sorted(
            [x for x in xs
             if (x["ecr"] is not None and x["ecr"] <= RELEVANT_ECR) or x.get("rookie")],
            key=lambda x: (x["ecr"] if x["ecr"] is not None else 999),
        )[:MAX_MOVES]

        # THE HEADLINE.
        #
        # The first version printed a single transaction, which produced lines
        # like "Added WR Omar Cooper Jr." for a Jets team whose actual story was
        # a new quarterback. So the headline is built from CHANGES OF STARTER
        # first — the man who took the snaps last season against the man the
        # market expects to take them this season — and only then from the
        # biggest arrival or departure.
        #
        # Deliberately never the coaching change: major coaching has its own
        # block directly below, and printing the same sentence twice wasted the
        # most valuable row on the card.
        stop = lambda t: t if t.endswith(".") else t + "."
        team_name = nick_of(team)
        clauses: list[tuple[int, str]] = []

        for pos in ("QB", "RB", "WR", "TE"):
            was = prev_starter.get((team, pos))
            # NOT `now` — that name already holds the league-wide roster set,
            # and shadowing it here silently broke the departure loop below.
            takes = new_starter.get((team, pos))
            if not was or not takes or was["id"] == takes["id"]:
                continue
            # The incoming man must be genuinely NEW to this team. Last
            # season's "starter" is whoever scored most, so an injured starter
            # gets out-scored by his own backup — which produced the line
            # "Jayden Daniels takes over at quarterback from Marcus Mariota"
            # about a quarterback who already had the job.
            if (team, takes["id"]) in prev:
                continue
            # Only worth saying if the incoming man is someone you would draft,
            # or the outgoing man was.
            if not (
                (takes["ecr"] is not None and takes["ecr"] <= RELEVANT_ECR)
                or (was["ecr"] is not None and was["ecr"] <= RELEVANT_ECR)
            ):
                continue
            role = {"QB": "at quarterback", "RB": "in the backfield",
                    "WR": "as the top receiver", "TE": "at tight end"}[pos]
            clauses.append((
                STARTER_WEIGHT[pos],
                stop(f"{takes['name']} takes over {role} from {was['name']}"),
            ))

        best_in = min((a for a in arrivals if a["ecr"] is not None and a["ecr"] <= RELEVANT_ECR),
                      key=lambda a: a["ecr"], default=None)
        best_out = min((d for d in departures if d["ecr"] is not None and d["ecr"] <= RELEVANT_ECR),
                       key=lambda d: d["ecr"], default=None)
        named = {c for _, c in clauses}
        if best_out and not any(best_out["name"] in c for c in named):
            where = best_out.get("to")
            clauses.append((
                int(90 - min(best_out["ecr"], 89)),
                stop(f"{best_out['name']} is gone"
                     + (f" to the {nick_of(where)}" if where else " in free agency")),
            ))
        if best_in and not any(best_in["name"] in c for c in named):
            clauses.append((
                int(88 - min(best_in["ecr"], 87)),
                stop(f"{best_in['pos']} {best_in['name']} arrives"),
            ))

        clauses.sort(key=lambda c: -c[0])
        head = " ".join(c for _, c in clauses[:2])
        if not head:
            head = f"A quiet offseason for the {team_name} at the skill positions."

        teams[team] = {
            "in": notable(arrivals),
            "out": notable(departures),
            "starterChanges": [c for _, c in clauses],
            # Structured, so the player page can say "Kyler Murray replaces
            # J.J. McCarthy" on every receiver on the roster rather than only
            # on the team card.
            "starterSwaps": {
                pos: {
                    "from": prev_starter[(team, pos)]["name"],
                    "to": new_starter[(team, pos)]["name"],
                }
                for pos in ("QB", "RB", "WR", "TE")
                if prev_starter.get((team, pos))
                and new_starter.get((team, pos))
                and prev_starter[(team, pos)]["id"] != new_starter[(team, pos)]["id"]
                and (team, new_starter[(team, pos)]["id"]) not in prev
            },
            "narrative": head,
            # An authored override is a deliberate judgement and is left alone;
            # only the derived value is clamped.
            "vibe": overrides.get(team, {}).get("vibe") or clamp_to_grade(
                vibe_of(
                    trend,
                    offense_rank.get(team, 16),
                    injury_load.get(team, 0.0),
                    bool(coach.get("firstTimeCaller")),
                ),
                off_grade.get(team, "C"),
            ),
            "vibeNote": overrides.get(team, {}).get("why"),
            "injuredStarters": round(injury_load.get(team, 0.0), 1),
            "trend": trend,
            "net": net_by_pos,
            "rosterNet": roster_by_pos,
            "coachNet": coach_by_pos,
            "coaching": coach or None,
            "starters": starters.get(team, []),
            "grades": {
                "offense": off_grade.get(team, "C"),
                "defense": def_grade.get(team, "C"),
                "schedule": sos_grade.get(team, "C"),
            },
        }

    PUBLIC.mkdir(parents=True, exist_ok=True)
    payload = {
        "_note": "Generated by projects/draft-sheet/team_news.py — do not hand-edit.",
        "derived": "Roster movement and the directional arrows are computed from "
                   "nflverse rosters and today's expert consensus ranks.",
        "authored": "Coaching changes and their impact score are hand-authored in "
                    "coaching.json with sources. A team without an entry "
                    "contributes zero to the arrow rather than a guess.",
        "coachStep": COACH_STEP,
        "vibes": "Preseason mood, derived by blending how much the roster changed "
                 "with how good it is. Not a measure of fan sentiment.",
        "narrative": "The single item that most changed this team's offense, chosen "
                     "in a fixed order: a new play-caller, then the best player "
                     "added, then the best player lost.",
        "grades": "Offense is the consensus value of a team's projected skill "
                  "starters; Defense is where the market ranks its team defense; "
                  "Schedule is the average strength of the defenses this offense "
                  "faces. All three are graded against the other 31 teams.",
        "teams": teams,
    }
    blob = json.dumps(payload, separators=(",", ":"), allow_nan=False)
    (PUBLIC / "team-news.json").write_text(blob)

    counts = {t: len(v["in"]) + len(v["out"]) for t, v in teams.items()}
    arrows = {}
    for v in teams.values():
        for a in v["trend"].values():
            arrows[a] = arrows.get(a, 0) + 1
    hc = sum(1 for v in coaching.values() if (v or {}).get("HC"))
    oc = sum(1 for v in coaching.values() if (v or {}).get("OC"))
    moved = sum(1 for t, v in teams.items()
                if any(v["coachNet"][p] for p in v["coachNet"]))
    print(f"  {len(teams)} teams, {sum(counts.values())} notable moves")
    print(f"  arrow distribution: {dict(sorted(arrows.items()))}")
    print(f"  coaching authored: {len(coaching)}/32 teams "
          f"({hc} with HC, {oc} with OC); {moved} teams where it moves an arrow")
    print(f"  wrote team-news.json ({len(blob) / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
