"""A small PRNG that Python and TypeScript can both reproduce exactly.

numpy's default generator is excellent and completely unusable for this
purpose: reproducing PCG64 in a browser is not a reasonable thing to attempt.
The parity test needs both implementations to consume the *same* stream of
uniforms in the *same* order, so the engine takes its randomness from an
injected object with a single `random()` method, and this is the version both
sides implement.

mulberry32 is chosen because it is four lines, has no 64-bit arithmetic, and
maps cleanly onto JavaScript's 32-bit bitwise operators. Statistical quality is
adequate for Monte Carlo rollouts and irrelevant to the parity argument, which
only cares that the two streams are identical.

Mirrored in `src/app/projects/two-minute-drill/engine/rng.ts`. Change one and
`parity_test.py` will tell you about it.
"""

from __future__ import annotations

MASK = 0xFFFFFFFF


def _imul(a: int, b: int) -> int:
    """32-bit multiply with wraparound, matching JavaScript's Math.imul."""
    return (a * b) & MASK


class Mulberry32:
    __slots__ = ("a",)

    def __init__(self, seed: int = 0):
        self.a = seed & MASK

    def random(self) -> float:
        self.a = (self.a + 0x6D2B79F5) & MASK
        t = self.a
        t = _imul(t ^ (t >> 15), 1 | t)
        t = (t + _imul(t ^ (t >> 7), 61 | t)) & MASK ^ t
        return ((t ^ (t >> 14)) & MASK) / 4294967296.0
