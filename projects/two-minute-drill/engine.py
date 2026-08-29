"""engine.py — the Monte Carlo endgame engine.

Given a game state in the fourth quarter, this rolls the rest of the game
forward thousands of times and reports how often each available decision ends
in a win. It is the reference implementation; `engine/*.ts` in the Next.js app
is a port of it, and `parity_test.py` keeps the two honest.

**What the numbers mean.** A win probability here is the chance of winning if
you take this action now and both teams play like an average NFL team from
there on, where "average NFL team" is the empirical policy in `tendencies.json`.
It is not a claim about optimal play by either side. That framing is a feature:
you are being measured against the league, which is the comparison a coach
actually faces.

**Why rollouts instead of a fitted win-probability model.** The variables that
decide these games are timeouts, whether the clock stopped, and where the
two-minute warning falls. A regression on game state smooths over all three.
Rolling plays forward one at a time models them directly, and the spread across
rollouts gives an honest error bar — which is what lets the app decline to pick
a winner when two options are within noise of each other, rather than
announcing a half-point edge it cannot support.

Overtime is out of scope: a tie at 0:00 is scored as 0.5.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass, replace
from pathlib import Path

import numpy as np

from buckets import diff_band, key, time_band, yardline_band, ytg_band

HERE = Path(__file__).parent

# Phases of play. Scores are followed by a conversion attempt and a kickoff,
# and both are real decisions, so they are states rather than bookkeeping.
PLAY, PAT, KICKOFF = "play", "pat", "kickoff"

# A field goal is snapped seven yards back and the posts are ten yards deep.
FG_SNAP_OVERHEAD = 17

TWO_MINUTE_WARNING = 120

# Actions the offense can pick.
OFF_ACTIONS = ["run", "pass", "pass_sideline", "field_goal", "punt", "spike", "kneel"]
# Actions available to the team without the ball, resolved before the snap.
DEF_ACTIONS = ["none", "timeout", "concede"]


@dataclass(slots=True)
class State:
    """Everything the engine needs, in the frame of whoever has the ball.

    `diff` is the offense's score minus the defense's. On a change of
    possession the sign flips along with everything else, which keeps the step
    function free of "which team am I" branching.
    """
    seconds: int
    phase: str = PLAY
    diff: int = 0
    yardline: int = 75          # yards from the offense to the opponent's goal
    down: int = 1
    ydstogo: int = 10
    off_to: int = 3             # timeouts remaining, offense
    def_to: int = 3
    clock_running: bool = False
    two_minute_done: bool = False
    offense_is_user: bool = True

    @property
    def user_diff(self) -> int:
        return self.diff if self.offense_is_user else -self.diff

    def flip(self, *, yardline: int, down: int = 1, ydstogo: int = 10) -> "State":
        """Hand the ball to the other team, re-expressing the state in their frame."""
        return replace(
            self,
            diff=-self.diff,
            yardline=yardline,
            down=down,
            ydstogo=min(ydstogo, yardline),
            off_to=self.def_to,
            def_to=self.off_to,
            offense_is_user=not self.offense_is_user,
            phase=PLAY,
        )


# ---------------------------------------------------------------------------
# Sampling
# ---------------------------------------------------------------------------

class Pmf:
    """Inverse-CDF sampler over a small integer support."""

    __slots__ = ("v", "c")

    def __init__(self, blob: dict):
        self.v = np.asarray(blob["v"], dtype=np.int32)
        self.c = np.asarray(blob["c"], dtype=np.float64)

    def draw(self, u: float) -> int:
        return int(self.v[min(int(np.searchsorted(self.c, u)), len(self.v) - 1)])


class Models:
    """The fitted distributions and tendencies, in a form the loop can use."""

    def __init__(self, dist: dict, tend: dict, *, season: int = 2025,
                 calib: dict | None = None):
        self.d, self.t, self.season = dist, tend, season
        # Monotone recalibration of the raw rollout frequency. See calibrate.py
        # for why it exists; the short version is that the simulator orders
        # decisions well but is too pessimistic about trailing teams, and a
        # monotone map fixes the level without reordering anything.
        self.calib_grid = np.asarray(calib["grid"], dtype=np.float64) if calib else None
        self.calib_curve = np.asarray(calib["curve"], dtype=np.float64) if calib else None

        self.run_yards = {b: Pmf(p) for b, p in dist["run"]["yards"].items()}
        self.run_yards_all = Pmf(dist["run"]["yards_all"])
        self.pass_yards = {b: Pmf(p) for b, p in dist["pass"]["yards_complete"].items()}
        self.pass_yards_all = Pmf(dist["pass"]["yards_complete_all"])
        self.sack_yards = Pmf(dist["pass"]["sack_yards"])
        self.punt_net = {b: Pmf(p) for b, p in dist["punt"]["net"].items()}
        self.punt_net_all = Pmf(dist["punt"]["net_all"])
        self.ko_start = Pmf(dist["kickoff"]["deep"]["start"])
        self.onside_fail_start = Pmf(dist["kickoff"]["onside"]["fail_start"])
        self.runoff = {
            k: {kind: Pmf(p) for kind, p in v.items()} for k, v in dist["runoff"].items()
        }

        # The kicking model is a season-by-distance surface, so picking a
        # season picks a row. Everything else in the engine is fit on
        # 2016-2025 and does not move with this: choosing 2003 asks what this
        # decision would have looked like if only the kicking had been that of
        # 2003, which is the counterfactual worth being able to see.
        fg = dist["field_goal"]
        self.fg_lo, self.fg_hi = fg["grid_lo"], fg["grid_hi"]
        self.fg_seasons = [int(s) for s in sorted(fg["make_by_season"], key=int)]
        chosen = min(max(int(season), self.fg_seasons[0]), self.fg_seasons[-1])
        self.season = chosen
        self.fg_curve = np.asarray(fg["make_by_season"][str(chosen)], dtype=np.float64)
        self.fg_block = fg["block_rate"]

    # -- lookups ---------------------------------------------------------

    def calibrate(self, p: float) -> float:
        if self.calib_curve is None:
            return p
        return float(np.interp(p, self.calib_grid, self.calib_curve))

    def fg_make(self, distance: int) -> float:
        if distance < self.fg_lo:
            return float(self.fg_curve[0])
        if distance > self.fg_hi:
            return 0.0
        return float(self.fg_curve[distance - self.fg_lo])

    def runoff_seconds(self, klass: str, u: float, *, after_timeout: bool,
                       urgency: str = "neutral", tband: str = "mid") -> int:
        """Seconds from this snap to the next.

        A timeout overrides everything. Otherwise the most specific fitted
        distribution wins: intent crossed with clock, then intent alone, then
        the pooled one.
        """
        entry = self.runoff.get(klass) or self.runoff["run_inbounds"]
        if after_timeout and "after_timeout" in entry:
            return entry["after_timeout"].draw(u)
        pmf = entry.get(f"{urgency}_{tband}") or entry.get(urgency) or entry["normal"]
        return pmf.draw(u)

    def tendency(self, decision: str, state: State) -> dict[str, float]:
        """Walk the specificity levels for a decision, coarsest-last."""
        spec = self.t[decision]
        fields = _tendency_fields(state)
        i = 0
        while f"L{i}" in spec:
            level = spec[f"L{i}"]
            k = key(*[fields[c] for c in level["by"]])
            hit = level["table"].get(k)
            if hit:
                return hit["p"]
            i += 1
        return spec["global"]["p"]


def _tendency_fields(s: State) -> dict[str, str]:
    return {
        "time_b": time_band(s.seconds),
        "diff_b": diff_band(s.diff),
        "ytg_b": ytg_band(s.ydstogo),
        "yl_b": yardline_band(s.yardline),
        "down_s": str(s.down),
        "exact": str(max(-16, min(16, s.diff))),
    }


def load_models(season: int = 2025, root: Path = HERE) -> Models:
    calib_path = root / "calibration.json"
    return Models(
        json.loads((root / "distributions.json").read_text()),
        json.loads((root / "tendencies.json").read_text()),
        season=season,
        # Absent on the first run, before calibrate.py has produced it. The
        # engine works uncalibrated; it is just less honest about the level.
        calib=json.loads(calib_path.read_text()) if calib_path.exists() else None,
    )


def _pick(probs: dict[str, float], u: float) -> str:
    acc = 0.0
    last = "run"
    for name, p in probs.items():
        acc += p
        last = name
        if u < acc:
            return name
    return last


# ---------------------------------------------------------------------------
# Clock
# ---------------------------------------------------------------------------

def _advance_clock(s: State, elapsed: int) -> State:
    """Burn clock, stopping at the two-minute warning the first time we cross it."""
    if not s.two_minute_done and s.seconds > TWO_MINUTE_WARNING:
        to_warning = s.seconds - TWO_MINUTE_WARNING
        if elapsed >= to_warning:
            return replace(s, seconds=TWO_MINUTE_WARNING, two_minute_done=True,
                           clock_running=False)
    seconds = max(0, s.seconds - elapsed)
    two_done = s.two_minute_done or seconds <= TWO_MINUTE_WARNING
    return replace(s, seconds=seconds, two_minute_done=two_done)


# ---------------------------------------------------------------------------
# Play resolution
# ---------------------------------------------------------------------------

def _after_gain(s: State, gain: int, *, klass: str) -> tuple[State, str]:
    """Apply a yardage gain, resolving scores, first downs and turnovers on downs."""
    yardline = s.yardline - gain
    if yardline <= 0:
        return replace(s, diff=s.diff + 6, phase=PAT, clock_running=False), "touchdown"
    if yardline >= 100:
        # Tackled in your own end zone. Two points and a free kick to them.
        return replace(s, diff=s.diff - 2, phase=KICKOFF, yardline=35,
                       clock_running=False), "safety"

    if gain >= s.ydstogo:
        nxt = replace(s, yardline=yardline, down=1, ydstogo=min(10, yardline),
                      clock_running=klass.endswith("inbounds"))
        return nxt, "first_down"
    if s.down == 4:
        return s.flip(yardline=100 - yardline), "downs"
    return replace(s, yardline=yardline, down=s.down + 1, ydstogo=s.ydstogo - gain,
                   clock_running=klass.endswith("inbounds")), "gain"


def resolve(s: State, action: str, m: Models, rng: np.random.Generator,
            *, def_timeout: bool = False) -> tuple[State, str]:
    """Run one play. Returns the next state and a label for what happened."""
    band = ytg_band(s.ydstogo)

    if action == "kneel":
        klass, ev = "kneel", "kneel"
        nxt, _ = _after_gain(s, -1, klass="run_inbounds")

    elif action == "spike":
        klass, ev = "spike", "spike"
        # A spike costs a down. On fourth it is a turnover, which is why the
        # UI has to keep offering it — getting this wrong is a real mistake a
        # player should be allowed to make.
        nxt = (s.flip(yardline=100 - s.yardline) if s.down == 4
               else replace(s, down=s.down + 1, clock_running=False))

    elif action == "run":
        gain = m.run_yards.get(band, m.run_yards_all).draw(rng.random())
        if rng.random() < m.d["run"]["fumble_lost"]:
            nxt, ev = s.flip(yardline=max(1, 100 - (s.yardline - gain))), "fumble"
            klass = "run_inbounds"
        else:
            oob = rng.random() < m.d["run"]["out_of_bounds"]
            klass = "run_oob" if oob else "run_inbounds"
            nxt, ev = _after_gain(s, gain, klass=klass)

    elif action in ("pass", "pass_sideline"):
        pd_ = m.d["pass"]
        if rng.random() < pd_["sack"]:
            gain = m.sack_yards.draw(rng.random())
            klass = "sack"
            nxt, ev = _after_gain(s, gain, klass=klass)
        elif rng.random() < pd_["interception"]:
            nxt, ev = s.flip(yardline=max(1, 100 - s.yardline)), "interception"
            klass = "pass_incomplete"
        else:
            comp = pd_["complete"].get(band, pd_["complete_all"])
            oob_p = pd_["out_of_bounds_given_complete"].get(
                band, pd_["out_of_bounds_given_complete_all"])
            if action == "pass_sideline":
                # Working the sideline trades completion percentage for the
                # clock stopping. The trade is a modelling assumption, not a
                # measurement — nflverse does not label intent — so it is kept
                # small and stated plainly here and in the methodology.
                comp *= 0.90
                oob_p = min(1.0, oob_p * 2.2)
            if rng.random() < comp:
                gain = m.pass_yards.get(band, m.pass_yards_all).draw(rng.random())
                oob = rng.random() < oob_p
                klass = "pass_complete_oob" if oob else "pass_complete_inbounds"
                nxt, ev = _after_gain(s, gain, klass=klass)
            else:
                klass = "pass_incomplete"
                if s.down == 4:
                    nxt, ev = s.flip(yardline=100 - s.yardline), "downs"
                else:
                    nxt = replace(s, down=s.down + 1, clock_running=False)
                    ev = "incomplete"

    elif action == "field_goal":
        distance = s.yardline + FG_SNAP_OVERHEAD
        klass = "field_goal"
        if rng.random() < m.fg_block or rng.random() >= m.fg_make(distance):
            # A miss hands the ball over at the spot of the kick — seven yards
            # behind the line — or the defending team's own 20, whichever is
            # better for them. In their frame that is `93 - yardline`, capped
            # at 80. A block is treated the same way, which understates the
            # occasional scoop-and-score but keeps the branch count sane.
            spot = min(80, 93 - s.yardline)
            nxt, ev = s.flip(yardline=spot), "fg_miss"
        else:
            nxt, ev = replace(s, diff=s.diff + 3, phase=KICKOFF, yardline=35,
                              clock_running=False), "fg_good"

    elif action == "punt":
        klass = "punt"
        net = m.punt_net.get(yardline_band(s.yardline), m.punt_net_all).draw(rng.random())
        landing = s.yardline - net
        # `spot` is the receiving team's distance to the goal they attack. A
        # punt into the end zone is a touchback and puts them on their own 20,
        # which is 80 yards out — not 20. Writing 20 here hands the receiving
        # team a first down in field goal range on every touchback.
        spot = 80 if landing <= 0 else min(99, 100 - landing)
        nxt, ev = s.flip(yardline=spot), "punt"

    else:
        raise ValueError(f"unknown action {action!r}")

    urgency = "hurry" if s.diff < 0 else ("bleed" if s.diff > 0 else "neutral")
    elapsed = m.runoff_seconds(klass, rng.random(), after_timeout=def_timeout,
                               urgency=urgency, tband="late" if s.seconds <= 60 else "mid")
    return _advance_clock(nxt, elapsed), ev


def resolve_pat(s: State, choice: str, m: Models, rng: np.random.Generator) -> State:
    p = m.d["conversion"]["two_point" if choice == "two" else "extra_point"]
    gain = (2 if choice == "two" else 1) if rng.random() < p else 0
    return replace(s, diff=s.diff + gain, phase=KICKOFF, yardline=35, clock_running=False)


def resolve_kickoff(s: State, choice: str, m: Models, rng: np.random.Generator) -> State:
    """The kicking team currently holds `s`; possession flips either way."""
    ko = m.d["kickoff"]
    if choice == "onside":
        if rng.random() < ko["onside"]["recover"]:
            # Recovered: the kicking team keeps the ball, roughly at midfield.
            return replace(s, phase=PLAY, yardline=55, down=1, ydstogo=10,
                           clock_running=False)
        start = m.onside_fail_start.draw(rng.random())
    else:
        start = m.ko_start.draw(rng.random())
    nxt = s.flip(yardline=start)
    return _advance_clock(replace(nxt, clock_running=False), 5)


# ---------------------------------------------------------------------------
# Policy and rollout
# ---------------------------------------------------------------------------

def policy_action(s: State, m: Models, rng: np.random.Generator) -> str:
    """What an average NFL team does here."""
    if s.phase == PAT:
        return _pick(m.tendency("two_point", s), rng.random())
    if s.phase == KICKOFF:
        return _pick(m.tendency("onside", s), rng.random())
    if s.down == 4:
        choice = _pick(m.tendency("fourth_down", s), rng.random())
        return {"go": "pass", "fg": "field_goal", "punt": "punt", "kneel": "kneel"}[choice]
    choice = _pick(m.tendency("play_call", s), rng.random())
    if choice == "fg":
        # Only honor an early-down kick if it is actually kickable from here;
        # the tendency bucket is coarser than the yard line.
        return "field_goal" if s.yardline + FG_SNAP_OVERHEAD <= 68 else "pass"
    return choice if choice in OFF_ACTIONS else "pass"


def rollout(s: State, m: Models, rng: np.random.Generator, *, max_plays: int = 60) -> float:
    """Play the state out to 0:00. Returns 1.0, 0.0 or 0.5 from the user's side."""
    for _ in range(max_plays):
        # The clock expiring ends the *playing*, not the scoring sequence. A
        # touchdown as time runs out is still followed by its conversion, and
        # that conversion decides the game when it is the tying score. Breaking
        # on the clock alone strands those rollouts mid-sequence and books them
        # as ties, which is a large and one-sided bias against trailing teams.
        if s.seconds <= 0 and s.phase == PLAY:
            break
        if s.phase == PAT:
            s = resolve_pat(s, policy_action(s, m, rng), m, rng)
            continue
        if s.phase == KICKOFF:
            s = resolve_kickoff(s, policy_action(s, m, rng), m, rng)
            continue

        # Either side may stop the clock before the snap. Both are modelled:
        # a trailing offense that never spends a timeout takes far too long to
        # move the ball, which shows up directly as trailing win probabilities
        # that are too low.
        used_timeout = False
        if s.clock_running and s.off_to > 0:
            if _pick(m.tendency("offensive_timeout", s), rng.random()) == "timeout":
                s = replace(s, off_to=s.off_to - 1, clock_running=False)
                used_timeout = True
        if s.clock_running and s.def_to > 0:
            if _pick(m.tendency("defensive_timeout", s), rng.random()) == "timeout":
                s = replace(s, def_to=s.def_to - 1, clock_running=False)
                used_timeout = True

        s, _ = resolve(s, policy_action(s, m, rng), m, rng, def_timeout=used_timeout)

    d = s.user_diff
    return 1.0 if d > 0 else (0.0 if d < 0 else 0.5)


def win_probability(s: State, m: Models, *, n: int = 4000, seed: int = 0,
                    calibrated: bool = True) -> tuple[float, float]:
    """Win probability for the user from this state, with a standard error.

    `calibrated=False` returns the raw rollout frequency, which is what
    calibrate.py needs to fit the correction in the first place.
    """
    rng = np.random.default_rng(seed)
    wins = 0.0
    sq = 0.0
    for _ in range(n):
        r = rollout(s, m, rng)
        wins += r
        sq += r * r
    p = wins / n
    var = max(0.0, sq / n - p * p)
    se = math.sqrt(var / n)
    if not calibrated:
        return p, se
    # Scale the standard error by the local slope of the calibration curve, so
    # the error bar still describes the number actually being displayed.
    cal = m.calibrate(p)
    slope = (m.calibrate(min(1.0, p + 0.01)) - m.calibrate(max(0.0, p - 0.01))) / 0.02
    return cal, se * max(slope, 0.0)


@dataclass
class Evaluation:
    action: str
    wp: float
    stderr: float
    n: int


def evaluate(s: State, m: Models, actions: list[str] | None = None,
             *, n: int = 4000, seed: int = 0, calibrated: bool = True) -> list[Evaluation]:
    """Win probability for each legal action, best first.

    `calibrated=False` returns raw rollout frequencies. The calibration curve
    is isotonic and therefore flat in places, which is correct for display —
    two options that really are indistinguishable should read as
    indistinguishable — but it makes the raw numbers the right thing to probe
    when testing the simulator's mechanics.
    """
    out = []
    for i, action in enumerate(actions or legal_actions(s)):
        rng = np.random.default_rng(seed + i * 7919)
        wins = sq = 0.0
        for _ in range(n):
            if s.phase == PAT:
                nxt = resolve_pat(s, action, m, rng)
            elif s.phase == KICKOFF:
                nxt = resolve_kickoff(s, action, m, rng)
            elif action == "timeout":
                # A timeout is not a play. It stops the clock and costs a
                # timeout, and then the down is still there to be used, so the
                # rollout picks up from the same down and distance.
                nxt = replace(s, off_to=s.off_to - 1, clock_running=False)
            else:
                nxt, _ = resolve(s, action, m, rng)
            r = rollout(nxt, m, rng)
            wins += r
            sq += r * r
        p = wins / n
        var = max(0.0, sq / n - p * p)
        se = math.sqrt(var / n)
        if not calibrated:
            out.append(Evaluation(action, p, se, n))
            continue
        slope = (m.calibrate(min(1.0, p + 0.01)) - m.calibrate(max(0.0, p - 0.01))) / 0.02
        out.append(Evaluation(action, m.calibrate(p), se * max(slope, 0.0), n))
    return sorted(out, key=lambda e: -e.wp)


def legal_defense_actions(s: State) -> list[str]:
    """What the team without the ball gets to decide before the snap."""
    # During a conversion or a kickoff the decision belongs to the other team —
    # they pick two-or-kick, they pick onside-or-deep. The defense just watches.
    if s.phase != PLAY:
        return ["defend"]
    acts = ["defend"]
    if s.def_to > 0 and s.clock_running:
        acts.append("timeout")
    # Deliberately allowing a touchdown is only ever a real option when you are
    # ahead and would rather have the ball back with time on it.
    if s.diff > 0:
        acts.append("concede")
    return acts


def resolve_defense(s: State, action: str, m: Models,
                    rng: np.random.Generator) -> tuple[State, str, str]:
    """Apply the defense's pre-snap choice, then let the offense run its play.

    Returns the resulting state, what the play produced, and *which* play the
    offense chose. That third value is the whole point: standing on defense you
    are watching someone else's offense, and an interface that can only say
    "you played it out" is not telling you what happened.
    """
    if s.phase == PAT:
        choice = policy_action(s, m, rng)
        return resolve_pat(s, choice, m, rng), "conversion", choice
    if s.phase == KICKOFF:
        choice = policy_action(s, m, rng)
        return resolve_kickoff(s, choice, m, rng), "kickoff", choice
    if action == "concede":
        # Wave them into the end zone to get the ball back with clock left.
        return replace(s, diff=s.diff + 6, phase=PAT, clock_running=False), "touchdown", "run"
    used = False
    if action == "timeout" and s.def_to > 0:
        s = replace(s, def_to=s.def_to - 1, clock_running=False)
        used = True
    off_action = policy_action(s, m, rng)
    nxt, ev = resolve(s, off_action, m, rng, def_timeout=used)
    return nxt, ev, off_action


def evaluate_defense(s: State, m: Models, actions: list[str] | None = None,
                     *, n: int = 4000, seed: int = 0,
                     calibrated: bool = True) -> list[Evaluation]:
    """Win probability for each defensive option, best first."""
    out = []
    for i, action in enumerate(actions or legal_defense_actions(s)):
        rng = np.random.default_rng(seed + i * 7919)
        wins = sq = 0.0
        for _ in range(n):
            nxt, _, _ = resolve_defense(s, action, m, rng)
            r = rollout(nxt, m, rng)
            wins += r
            sq += r * r
        p = wins / n
        se = math.sqrt(max(0.0, sq / n - p * p) / n)
        if not calibrated:
            out.append(Evaluation(action, p, se, n))
            continue
        slope = (m.calibrate(min(1.0, p + 0.01)) - m.calibrate(max(0.0, p - 0.01))) / 0.02
        out.append(Evaluation(action, m.calibrate(p), se * max(slope, 0.0), n))
    return sorted(out, key=lambda e: -e.wp)


def legal_actions(s: State) -> list[str]:
    if s.phase == PAT:
        return ["kick", "two"]
    if s.phase == KICKOFF:
        return ["deep", "onside"]

    acts = ["run", "pass", "pass_sideline"]
    # 68 yards is past the longest kick anyone attempts with a straight face.
    if s.yardline + FG_SNAP_OVERHEAD <= 68:
        acts.append("field_goal")
    if s.down == 4:
        acts.append("punt")
    # Spiking is only a decision while the clock is running and a down is
    # available to spend; with the clock already stopped it is a wasted down.
    if s.down < 4 and s.clock_running:
        acts.append("spike")
    if s.off_to > 0 and s.clock_running:
        acts.append("timeout")
    # Level counts: kneeling out a tie to reach overtime is a real call.
    if s.diff >= 0:
        acts.append("kneel")
    return acts
