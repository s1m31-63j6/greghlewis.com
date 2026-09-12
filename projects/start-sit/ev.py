"""ev.py — from a price to an expectation. Pure functions, no I/O.

The market posts a line and two prices. The line is the market's median; the
prices say which side it leans. Three steps turn that into a number a fantasy
scorer can use, and they are the same three the published practitioners use
(Vegas Edge Fantasy, Win With Odds):

  1. implied probability from each price, then remove the vig by scaling the
     pair to sum to one;
  2. expected value = line + sigma * Phi^-1(p_over), where sigma is the stat's
     typical game-to-game spread from sigma.py — a 55% lean on receptions moves
     the mean by a tenth of a spread, not by a reception;
  3. touchdowns: the price of "at least one" gives P(>=1); under a Poisson
     count that pins the rate, lambda = -ln(1 - p), and lambda is the expected
     touchdowns.

Run `uv run python ev.py --selftest` to check the identities this rests on.
"""
from __future__ import annotations

import math
import sys
from statistics import NormalDist

_N = NormalDist()


def implied(american: float) -> float:
    """Implied probability of an American price, vig included."""
    a = float(american)
    return 100.0 / (a + 100.0) if a > 0 else -a / (-a + 100.0)


def implied_from_multiplier(mult: float) -> float:
    """Pick'em payout multiplier (1.97 means a $1 pick returns $1.97) -> implied p."""
    return 1.0 / float(mult)


def devig_pair(p_a: float, p_b: float) -> tuple[float, float]:
    """Scale two vig-inclusive probabilities to sum to one."""
    s = p_a + p_b
    if s <= 0:
        return 0.5, 0.5
    return p_a / s, p_b / s


def ev_from_line(line: float, p_over: float, sigma: float) -> float:
    """Mean of a normal with median `line` whose P(X > line) is `p_over`."""
    p = min(0.995, max(0.005, p_over))
    return line + sigma * _N.inv_cdf(p)


def lam_from_p(p_at_least_one: float) -> float:
    """Poisson rate from P(>=1)."""
    p = min(0.995, max(0.0, p_at_least_one))
    return -math.log1p(-p)


def p_from_lam(lam: float) -> float:
    return 1.0 - math.exp(-lam)


def p_two_plus(lam: float) -> float:
    return 1.0 - math.exp(-lam) * (1.0 + lam)


def lam_from_two_plus(p: float) -> float:
    """Invert p_two_plus by bisection; it is monotone in lambda."""
    lo, hi = 0.0, 6.0
    for _ in range(60):
        mid = (lo + hi) / 2
        if p_two_plus(mid) < p:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def scale_field(lams: dict[str, float], team_expected: float) -> float:
    """Factor that brings a team's summed touchdown rates down to its implied
    total. Never scales up: players the market did not price own the rest."""
    total = sum(lams.values())
    if total <= 0 or team_expected <= 0:
        return 1.0
    return min(1.0, team_expected / total)


def _selftest() -> None:
    assert abs(implied(-110) - 0.5238) < 1e-3
    assert abs(implied(+120) - 0.4545) < 1e-3
    a, b = devig_pair(implied(-110), implied(-110))
    assert abs(a - 0.5) < 1e-9 and abs(b - 0.5) < 1e-9
    a, b = devig_pair(implied_from_multiplier(1.97), implied_from_multiplier(1.62))
    assert a < b and abs(a + b - 1) < 1e-9
    assert ev_from_line(6.5, 0.5, 2.0) == 6.5
    assert ev_from_line(6.5, 0.6, 2.0) > 6.5 > ev_from_line(6.5, 0.4, 2.0)
    for lam in (0.1, 0.5, 1.2):
        assert abs(lam_from_p(p_from_lam(lam)) - lam) < 1e-9
        assert abs(lam_from_two_plus(p_two_plus(lam)) - lam) < 1e-6
    assert p_two_plus(0.5) < p_two_plus(1.0)
    assert scale_field({"a": 1.0, "b": 1.0}, 3.0) == 1.0
    assert abs(scale_field({"a": 2.0, "b": 2.0}, 3.0) - 0.75) < 1e-9
    print("ev.py selftest: ok")


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        _selftest()
    else:
        print(__doc__)
