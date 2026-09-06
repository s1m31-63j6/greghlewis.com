"""The career simulation. Mirrored line for line in
src/app/projects/career-paths/engine/engine.ts; parity_test.py holds them to
agreement (exact on every discrete outcome, 1e-9 relative on dollars).

One ball is one career. Each year, in this order:

  1. Leave grad school if the two years are up.
  2. If last year was a milestone, choose (sampled from params.choice, or
     pinned by the sankey).
  3. Grad school year: pay tuition, skip hazards.
  4. Every company the ball still holds equity in rolls: round (dilution and
     stage advance), shutdown, exit, tender. Employer first.
  5. Consequences for the employer: shutdown -> next job; exit -> paid and
     absorbed into the acquirer (corporate); else layoff roll; else
     promotion roll (and, in consulting, the counseled-out roll).
  6. Pay: start * level * ability * noise, plus any equity cash, plus the
     employer's retirement contribution (which vests with tenure).
  7. Wealth: last year's wealth grows at the real return; a share of cash pay
     that steps up with income, about half of any windfall, and the whole
     employer contribution are added; business school tuition is drawn down.

Every `rng.random()` call is annotated with a draw number so the two
implementations can be diffed by eye. Add a draw and the other side must add
the same one in the same place.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any

STAGE_ORDER = ["seed", "seriesAB", "growth"]  # priced-round progression
TENDER_STAGES = ("growth", "pe")
TRACKS3 = ("startup", "corporate", "consulting")
STAGES = ("seed", "seriesAB", "growth", "bootstrapped", "pe")


def normal(rng) -> float:
    """Box-Muller, two uniforms, one normal. Draw order: u1 then u2."""
    u1 = rng.random()
    u2 = rng.random()
    return math.sqrt(-2.0 * math.log(u1 if u1 > 1e-12 else 1e-12)) * math.cos(2.0 * math.pi * u2)


@dataclass
class Company:
    stage: str
    hired_year: int
    pct: float           # fully diluted share held, after every round since hire
    age: int = 0         # years since the ball joined
    alive: bool = True   # still private and operating
    employer: bool = True
    kept: bool = True    # options exercised on departure (or still employed)
    failed: bool = False
    founder: bool = False
    left_year: int | None = None


@dataclass
class Event:
    year: int
    kind: str            # fail | exit | tender | layoff | promote | partner | counseled | mba_done | switch | found | mba
    amount: float = 0.0


@dataclass
class State:
    persona: str
    track: str
    level: int = 0
    ability: float = 1.0
    mult: float = 1.0                    # persistent scar (layoffs) and lift (MBA)
    school_left: int = 0
    landing: str | None = None
    stage: str | None = None             # employer's stage, if a startup
    companies: list[Company] = field(default_factory=list)
    realized: list[float] = field(default_factory=list)
    events: list[Event] = field(default_factory=list)
    milestone_track: list[str] = field(default_factory=list)  # track at each milestone
    milestone_level: list[int] = field(default_factory=list)
    tenure: int = 0                      # years at the current employer, before this year
    wealth: float = 0.0                  # invested savings, real dollars
    wealth_by_year: list[float] = field(default_factory=list)
    retire_by_year: list[float] = field(default_factory=list)  # employer retirement contributions


def employer(s: State) -> Company | None:
    for c in reversed(s.companies):
        if c.employer:
            return c
    return None


def choose_weighted(rng, weights: list[tuple[str, float]]) -> str:
    """Draw one key in proportion to weight. One uniform."""
    total = 0.0
    for _, w in weights:
        total += w
    u = rng.random() * total
    acc = 0.0
    for k, w in weights:
        acc += w
        if u < acc:
            return k
    return weights[-1][0]


def sample_stage(rng, P) -> str:
    return choose_weighted(rng, [(k, P["stageMix"][k]) for k in STAGES])


def legal_choices(track: str, year: int) -> list[str]:
    """What the sankey may offer at the START of `year` (milestone was year-1)."""
    if track == "gradschool":
        return ["stay"]
    opts = ["stay"]
    for t in TRACKS3:
        if t != track:
            opts.append(f"switch:{t}")
    if track == "founder":
        return opts
    if year - 1 <= 5:
        opts += [f"mba:{t}" for t in TRACKS3]
    if 5 <= year - 1 <= 15:
        opts.append("found")
    return opts


def sample_choice(rng, s: State, year: int, milestone_index: int, P) -> str:
    """Two draws at most: the choice, then the MBA landing when needed."""
    if s.track == "gradschool":
        return "stay"
    c = P["choice"][s.track]
    decay = P["choice"]["decayPerMilestone"] ** milestone_index
    legal = legal_choices(s.track, year)
    weights: list[tuple[str, float]] = []
    for opt in legal:
        if opt == "stay":
            weights.append((opt, c["stay"]))
        elif opt.startswith("switch:"):
            weights.append((opt, c[opt[7:]] * decay))
        elif opt.startswith("mba:"):
            continue
        elif opt == "found":
            weights.append((opt, c["found"] * decay))
    if any(o.startswith("mba:") for o in legal):
        weights.append(("mba", c["mba"] * decay))
    pick = choose_weighted(rng, weights)                          # draw: choice
    if pick == "mba":
        landing = choose_weighted(rng, [(t, P["gradschool"]["landing"][t]) for t in TRACKS3])  # draw: landing
        return f"mba:{landing}"
    return pick


def join_startup(rng, s: State, year: int, stage: str | None, P) -> None:
    st = stage if stage is not None else sample_stage(rng, P)    # draw: stage (if not given)
    s.track = "startup"
    s.stage = st
    s.companies.append(Company(stage=st, hired_year=year, pct=P["startup"][st]["grantPctFD"][s.persona]))


def leave_employer(rng, s: State, year: int, P) -> None:
    """Departing a startup: the options are exercised or forfeited. One draw if startup."""
    c = employer(s)
    if c is None:
        return
    c.employer = False
    c.left_year = year
    if c.alive:
        c.kept = rng.random() < P["startup"][c.stage]["pExerciseOnLeave"]   # draw: exercise
    s.stage = None


def apply_choice(rng, s: State, year: int, choice: str, P) -> None:
    if choice == "stay":
        return
    s.tenure = 0
    if s.track in ("startup", "founder"):
        leave_employer(rng, s, year, P)
    if choice.startswith("switch:"):
        parts = choice.split(":")
        target = parts[1]
        if s.track == "consulting" and target == "corporate" and s.level < 4:
            s.level += 1                                  # the consulting exit premium
        s.events.append(Event(year, "switch"))
        if target == "startup":
            join_startup(rng, s, year, parts[2] if len(parts) > 2 else None, P)
        else:
            s.track = target
            s.stage = None
    elif choice.startswith("mba:"):
        s.track = "gradschool"
        s.stage = None
        s.landing = choice[4:]
        s.school_left = P["gradschool"]["years"]
        s.events.append(Event(year, "mba"))
    elif choice == "found":
        s.track = "founder"
        s.stage = "seed"
        s.companies.append(Company(stage="seed", hired_year=year, pct=P["founder"]["pctFD"], founder=True))
        s.events.append(Event(year, "found"))


def vested(c: Company, year: int, P) -> float:
    end = c.left_year if c.left_year is not None else year
    yrs = end - c.hired_year + 1
    if yrs < P["cliffYears"]:
        return 0.0
    v = yrs / P["vestYears"]
    return 1.0 if v > 1.0 else v


def equity_cash(c: Company, year: int, value: float, P, frac: float = 1.0) -> float:
    sp = P["startup"][c.stage]
    common = value - sp["prefStack"]
    if common < 0.0:
        common = 0.0
    return c.pct * frac * vested(c, year, P) * common * (1.0 - sp["strikeFrac"])


def roll_company(rng, s: State, c: Company, year: int, P) -> tuple[str, float]:
    """Round, shutdown, exit, tender. Returns (outcome, cash). Draws: graduate (at round time), fail, exit, tender."""
    sp = P["startup"][c.stage]
    c.age += 1
    ypr = sp["yearsPerRound"]
    if ypr < 100 and c.age % int(math.floor(ypr + 0.5)) == 0 and c.stage in STAGE_ORDER:
        if rng.random() < sp["graduationProb"]:                     # draw: graduate
            c.pct *= 1.0 - sp["dilutionPerRound"]
            i = STAGE_ORDER.index(c.stage)
            if i < len(STAGE_ORDER) - 1:
                c.stage = STAGE_ORDER[i + 1]
                sp = P["startup"][c.stage]
    fail = sp["failHazard"] * (P["founder"]["failMult"] if c.founder else 1.0)
    if rng.random() < fail:                                         # draw: fail
        c.alive = False
        c.failed = True
        return "fail", 0.0
    if rng.random() < sp["exitHazard"]:                             # draw: exit
        value = sp["exitMedian"] * math.exp(sp["exitSigma"] * normal(rng))   # draws: u1, u2
        cash = equity_cash(c, year, value, P) if c.kept else 0.0
        c.alive = False
        return "exit", cash
    if c.stage in TENDER_STAGES and c.employer and sp["secondaryProb"] > 0.0:
        if rng.random() < sp["secondaryProb"]:                      # draw: tender
            cash = equity_cash(c, year, sp["exitMedian"], P, P["secondaryFrac"])
            c.pct *= 1.0 - P["secondaryFrac"]
            return "tender", cash
    return "none", 0.0


def after_job_loss(rng, s: State, year: int, P, pinned: bool) -> None:
    """Employer gone (shutdown or layoff). Draw: rejoin (startup only)."""
    was_startup = s.track == "startup"
    s.track = "corporate"
    s.stage = None
    s.tenure = 0
    if was_startup:
        p = 1.0 if pinned else P["rejoinStartup"]
        if rng.random() < p:                                        # draw: rejoin
            join_startup(rng, s, year, None, P)                     # draw: stage


def simulate(persona: str, first: str, P, rng, *, stage: str | None = None,
             pinned: dict[int, str] | None = None, stay: bool = False,
             horizon: int | None = None) -> State:
    """One career. `first` is the year-1 track; `stage` fixes the first
    startup's stage; `pinned` maps milestone year -> choice id (sankey mode);
    `stay` pins every milestone to "stay" (the plinko's stay-the-course toggle)."""
    H = horizon or P["horizon"]
    milestones = P["milestones"]
    B = P["benefits"]
    s = State(persona=persona, track=first)
    s.ability = math.exp(P["ability"]["sigma"] * normal(rng))       # draws: u1, u2
    if first == "startup":
        join_startup(rng, s, 1, stage, P)                           # draw: stage (if blended)
    cost = P["gradschool"]["annualCost"]

    for year in range(1, H + 1):
        # 1. leave grad school
        if s.track == "gradschool" and s.school_left == 0:
            s.track = s.landing or "corporate"
            s.landing = None
            s.tenure = 0
            if s.level < 4:
                s.level += 1
            s.mult *= P["gradschool"]["postSalaryMult"]
            s.events.append(Event(year, "mba_done"))
            if s.track == "startup":
                s.track = "corporate"     # placeholder so join_startup sees a non-startup state
                join_startup(rng, s, year, None, P)                 # draw: stage

        # 2. milestone choice
        if (year - 1) in milestones and year - 1 < H:
            mi = milestones.index(year - 1)
            if s.track == "gradschool":
                choice = "stay"
            elif pinned is not None and (year - 1) in pinned:
                choice = pinned[year - 1]
            elif stay:
                choice = "stay"
            else:
                choice = sample_choice(rng, s, year, mi, P)
            apply_choice(rng, s, year, choice, P)

        # 3. grad school year
        if s.track == "gradschool":
            s.school_left -= 1
            s.realized.append(-cost)
            s.wealth = s.wealth * (1.0 + B["realReturn"]) - cost
            s.wealth_by_year.append(s.wealth)
            s.retire_by_year.append(0.0)
            if year in milestones:
                s.milestone_track.append("gradschool")
                s.milestone_level.append(s.level)
            continue

        # 4. company rolls
        cash = 0.0
        employer_outcome = "none"
        for c in s.companies:
            if not c.alive or (not c.kept and not c.employer):
                continue
            outcome, amt = roll_company(rng, s, c, year, P)
            if amt > 0.0:
                s.events.append(Event(year, outcome, amt))
                cash += amt
            if c.employer:
                employer_outcome = outcome
                if outcome in ("fail", "exit"):
                    c.employer = False
                    c.left_year = year

        # 5. consequences
        lost_months = 0.0
        if employer_outcome == "fail":
            s.events.append(Event(year, "fail"))
            lost_months = P["layoff"]["unemploymentMonths"]
            s.mult *= 1.0 - P["layoff"]["reentryHaircut"]
            after_job_loss(rng, s, year, P, stay)
        elif employer_outcome == "exit":
            if s.track == "founder" and s.level < 4:
                s.level += P["founder"]["postExitLevelBump"]
            s.track = "corporate"
            s.stage = None
            s.tenure = 0
        else:
            if s.track == "founder":
                hazard = 0.0
            elif s.track == "startup":
                hazard = P["startup"][s.stage]["layoffHazard"]
            else:
                hazard = P["layoff"]["annualHazard"][s.track]
            if hazard > 0.0 and rng.random() < hazard:              # draw: layoff
                s.events.append(Event(year, "layoff"))
                lost_months = P["layoff"]["unemploymentMonths"]
                s.mult *= 1.0 - P["layoff"]["reentryHaircut"]
                if s.level > 0:
                    s.level -= 1
                if s.track == "startup":
                    leave_employer(rng, s, year, P)                 # draw: exercise
                after_job_loss(rng, s, year, P, stay)
            elif s.track != "founder" and s.level < 4:
                ladder = P["promotion"][s.track]
                if rng.random() < 1.0 / ladder["yearsPerRung"][s.level]:   # draw: promote
                    s.level += 1
                    s.events.append(Event(year, "partner" if (s.track == "consulting" and s.level == 4) else "promote"))
                elif s.track == "consulting":
                    if rng.random() < ladder["pCounseledOut"][s.level]:    # draw: counsel
                        s.events.append(Event(year, "counseled"))
                        s.track = "corporate"
                        s.level += 1
                        s.tenure = 0

        # 6. pay
        noise = math.exp(P["ability"]["annualNoise"] * normal(rng))  # draws: u1, u2
        if s.track == "founder":
            base = P["founder"]["salary"] * s.mult * noise
        else:
            pay_track = "corporate" if s.track == "startup" else s.track
            base = P["start"][pay_track][persona] * P["levelMult"][pay_track][persona][s.level] * s.ability * s.mult * noise
            if s.track == "startup":
                base *= 1.0 - P["startup"][s.stage]["salaryDiscount"]
        if lost_months > 0.0:
            base *= 1.0 - lost_months / 12.0
        # 6b. employer retirement contribution, vesting with tenure
        if s.track == "founder":
            pct = 0.0
        elif s.track == "startup":
            pct = B["employerRetirement"]["startup"][s.stage]
        else:
            pct = B["employerRetirement"][s.track][persona]
        kept = s.tenure / B["matchVestYears"]
        if kept > 1.0:
            kept = 1.0
        retire = base * pct * kept
        s.realized.append(base + cash + retire)
        s.retire_by_year.append(retire)
        # 7. wealth: the savings rate steps up with pay
        rate = B["savingsBands"][-1]["rate"]
        for band in B["savingsBands"]:
            if base <= band["upTo"]:
                rate = band["rate"]
                break
        s.wealth = (s.wealth * (1.0 + B["realReturn"]) + base * rate
                    + cash * B["windfallSavingsRate"] + retire)
        s.wealth_by_year.append(s.wealth)
        s.tenure += 1
        if year in milestones:
            s.milestone_track.append(s.track)
            s.milestone_level.append(s.level)
    return s


def avg_first(s: State, n: int) -> float:
    return sum(s.realized[:n]) / n


def ltv(s: State) -> float:
    return sum(s.realized)


def demand(s_track: str, level: int, P) -> tuple[float, float]:
    d = P["demand"].get(s_track) or P["demand"]["corporate"]
    return d["life"][level], d["cash"][level]


PAYDAY = 100_000.0  # equity cash in a block that earns its own "exited" node


def node_key(track: str, level: int, exit_cash: float) -> str:
    """Sankey node at a milestone: a real payday, partner, school, or the track."""
    if exit_cash >= PAYDAY:
        return "exited"
    if track == "consulting" and level == 4:
        return "partner"
    if track == "gradschool":
        return "mba"
    return track


FORCED = ("fail", "layoff", "counseled", "exit")


def milestone_nodes(s: State, P) -> list[str]:
    ms = P["milestones"]
    keys = []
    prev = 0
    for i, y in enumerate(ms):
        cash = sum(e.amount for e in s.events if prev < e.year <= y and e.kind in ("exit", "tender"))
        keys.append(node_key(s.milestone_track[i], s.milestone_level[i], cash))
        prev = y
    return keys


def block_forced(s: State, P) -> list[str | None]:
    """The dominant forced event inside each milestone block, or None."""
    ms = P["milestones"]
    out = []
    prev = 0
    for y in ms:
        kinds = [e.kind for e in s.events if prev < e.year <= y and e.kind in FORCED]
        pick = None
        for k in FORCED:
            if k in kinds:
                pick = k
                break
        out.append(pick)
        prev = y
    return out
