# Chess Coach — offline harnesses

Everything here runs on a laptop and is never deployed. It produces committed
JSON artifacts that the site reads, exactly like the other Python projects in
this repo.

| Output | Consumed by |
|---|---|
| `public/chess-coach/ladder.json` | the browser engine — calibrated parameters per difficulty rung |
| `results/tournament.json` | `calibrate.py --from-results`, and the methodology chart |

## Setup

```bash
brew install stockfish     # Stockfish 18+
uv sync --all-groups
```

## The difficulty dial

### Why this exists at all

Stockfish ships two ways to play below full strength. Neither one can drive a
600–2200 dial:

```
$ printf "uci\nquit\n" | stockfish | grep -E "UCI_Elo|Skill"
option name Skill Level type spin default 20 min 0 max 20
option name UCI_Elo type spin default 1320 min 1320 max 3190
```

**`UCI_Elo` bottoms out at 1320.** There is no setting that means "play like a
beginner" — the entire bottom half of the dial is unreachable. `Skill Level`
does go lower, but it weakens by injecting occasional catastrophic blunders into
otherwise near-perfect play. That is *weaker*, not *more human*: a 700-rated
player plays consistently mediocre moves, not grandmaster technique punctuated
by hanging a queen.

So `weakening.py` implements its own policy — depth cap, softmax move sampling
within a centipawn band, and a calibrated blunder rate — all driven by a single
strength scalar `s ∈ [0, 1]`. One scalar rather than four free parameters is
what makes calibration a 1-D curve inversion instead of a 32-dimensional search.

### Calibrating it

```bash
uv run python calibrate.py --smoke        # ~30s, verifies the pipeline only
uv run python calibrate.py                # the real run, ~90 min on 8 workers
uv run python calibrate.py --from-results # refit without replaying games
```

The real run plays 25,344 games: nine points across the weakening curve plus
three `UCI_Elo` anchors, round-robin, 16 openings each way. It then fits
Bradley-Terry ratings with standard errors, shifts the scale onto the anchors,
and inverts the measured curve to find the `s` for each of the eight rungs.

**`--smoke` ratings are noise** (40 games, ±300 Elo). It exists to prove the
pipeline runs, and it writes its ladder to `results/ladder.smoke.json` rather
than `public/`, precisely so a meaningless ladder can never be committed and
shipped looking like a real one.

### The measured result

25,344 games, 12 players (nine curve points + three anchors), ~90 minutes on 8 workers:

| s | depth | blunder % | measured Elo | ±95% |
|---|---|---|---|---|
| 0.000 | 1 | 45.0 | 420 | 33 |
| 0.250 | 2 | 16.4 | 724 | 27 |
| 0.500 | 3 | 6.0 | 1182 | 21 |
| 0.750 | 5 | 2.2 | 1742 | 20 |
| 1.000 | 8 | 0.8 | 2257 | 31 |

Monotone, spanning 420–2257 Elo, so all eight rungs (600–2200) are interpolated
rather than extrapolated. Intervals of 19–33 Elo, comfortably inside the ±50
target.

**The anchors do not agree with themselves.** Stockfish's own `UCI_Elo` settings
measured +60, +76, and −136 against their nominal labels — a 212-Elo spread,
with its nominal 680-point range compressing to 484 measured points. Two
independent runs reproduced this almost exactly (219 vs 212 Elo spread;
`sf2000` landed at 1865 and 1864), so it is a stable property of the option, not
sampling noise. The rungs' *relative* ordering is solid; the absolute Elo labels
inherit that ~200-point uncertainty, and the harness says so rather than
printing a confident number.

### The harness refuses to produce a bad ladder

Two failure modes are checked and are hard errors, because both would otherwise
yield plausible-looking rung parameters that are silently meaningless:

- **Non-monotone curve** — more `s` did not produce more strength. The
  one-parameter family is broken; fix the shapes in `weakening.params_for`.
- **Uncovered rung targets** — a target Elo falls outside the measured range.
  Interpolation clamps at the ends *silently*, so an unreachable 2200 rung would
  come back as `s = 1.0` looking like a real answer. **This fired on the first
  real run**: the weakest setting measured 744 Elo, putting the 600 rung out of
  reach, and the harness refused to write a ladder rather than quietly clamping
  it. Widening the parameter floor and raising MultiPV to 12 fixed it.
- **A refit against a different parameter family** — `--from-results` compares a
  fingerprint of `params_for` against the one recorded with the results, because
  fitting an old curve and stamping it with today's parameters produces a ladder
  that was never measured and looks entirely legitimate.

It also reports **anchor residuals**: how far each `UCI_Elo` anchor landed from
its nominal label. This is the honest measure of how much the absolute numbers
can be trusted. If the anchors disagree with each other by hundreds of Elo, the
*relative* ordering of the rungs is still sound but the absolute Elo labels
deserve a caveat — and the tool says so rather than printing a confident number.

## Parity: the browser must play the same game

`calibrate.py` measures the **Python** policy, but the browser runs a TypeScript
port (`src/app/projects/chess-coach/engine/weakening.ts`). If those two drift
apart, nothing crashes and nothing looks wrong — the dial just stops meaning
what it says, and every Elo label on the page becomes a quiet lie.

```bash
uv run python parity_test.py
```

It drives both implementations with the *same* deterministic uniform stream over
real Stockfish MultiPV output and requires the chosen moves to match exactly
(1,584 decisions across six strengths). This is why `_sample` is hand-rolled in
both rather than using `random.choices` — an exact comparison is only possible
if both consume one draw per decision and walk the cumulative weights the same
way.

**Run it after touching either file.** It has been mutation-tested: flipping the
sign of the softmax exponent in the TypeScript makes it fail immediately with
move-level diffs.

The other half of the browser engine is UCI protocol parsing, which is where a
realistic bug lives — a missed `multipv` index or a mishandled `score mate`
would silently reorder the candidate list feeding move selection:

```bash
uv run python uci_parse_test.py
```

It replays genuine `info` lines through the exported TypeScript parser and
compares against python-chess, plus synthetic lines for the negative-mate and
mate-distance-ordering branches.

> **Gotcha this test taught us the hard way.** Comparing two Stockfish searches
> requires *identical* `Threads` and `Hash` **and** a cold transposition table.
> A reference engine reused across positions carries a warm table into the next
> search, changing which moves land in the top N — which reads exactly like a
> parser bug. Both sides spawn a fresh process per position for this reason.

## The tactics & strategy library

44 concepts — 22 tactical, 8 endgame, 14 strategic — each with teaching prose
and verified example positions. Output: `public/chess-coach/library.json`.

```bash
# One-time: the puzzle source (290 MB, CC0, gitignored)
curl -L -o data/lichess_db_puzzle.csv.zst https://database.lichess.org/lichess_db_puzzle.csv.zst

uv run python select_puzzles.py           # theme-filtered examples, ~50s over 6.1M puzzles
uv run python build_library.py --strict   # verify everything, emit library.json
```

### The split, and why it is not a stylistic choice

A scan of all **6,057,356** puzzles found rich coverage of every tactical motif
and **zero** puzzles tagged with any positional concept — `outpost`,
`bishopPair`, `minorityAttack`, `prophylaxis`, `openFile`, `isolatedPawn`,
`backwardPawn`, `spaceAdvantage`, `initiative`, `weakSquares` all return 0. The
database is purely tactical.

So 25 concepts get vetted examples for free, and 19 needed positions written by
hand. That roughly doubles the authoring cost for half the library, and it is
worth knowing before planning similar work.

### Two traps in the Lichess dataset

- **The `FEN` column is the position *before* the opponent's move.** The
  position to show a learner is the one after applying `Moves[0]`, and the
  solution starts at `Moves[1]`. Using the raw FEN presents every puzzle one ply
  early, with the "solution" starting on the opponent's own move — wrong in a way
  that still renders as a perfectly valid board.
- **Solution moves are "only moves"** except for mate-in-1, where any mating
  move counts. That is what makes these safe to use unreviewed.

### Nothing ships unverified

Lichess examples are replayed move by move. Hand-authored positions additionally
carry machine-checkable `assert` claims (`verify.py`) — not just "is this legal"
but "does this position actually contain the feature it teaches": is that pawn
really isolated, is that square really an outpost, is that file really open, does
the engine really agree this is won.

**This caught four real errors on the first run**, all of which would otherwise
have shipped looking fine:

| Concept | What was wrong |
|---|---|
| `king-activity`, `rook-activity` | FENs with no black king — flatly illegal |
| `outpost` | Not an outpost: Black's f7 pawn could still play ...f6 and hit e5 |
| `opposition` | Both eval claims inverted — `4k3/8/8/4K3/…` puts the black king on **e8**, not e7, shifting turn parity by one |

The opposition case is the instructive one: the chess reasoning was right and the
FEN was wrong, which is precisely the error a human reviewer skims past.

## Performance

`bench.py` exists because the calibration run is tens of thousands of games and
a wrong guess about the bottleneck is the difference between an overnight run
and a week.

```bash
uv run python bench.py
```

Two measured results drive constants elsewhere, both counterintuitive:

- **Depth dominates; MultiPV width is nearly free.** Per-move cost goes 12 ms
  (depth 5) → 57 ms (depth 8) → **901 ms** (depth 12), while MultiPV 1 → 12 at
  depth 8 barely moves. Hence `MAX_DEPTH = 8`. The top rung is only 2200 Elo and
  Stockfish at depth 8 is already far stronger than that, so at the top of the
  range strength is set by sampling noise, not search horizon — depth beyond 8
  buys nothing and costs 16×.

- **Probe cost is very sensitive to transposition-table warmth.** A depth-10
  probe benchmarked right after other searches of the same position reads
  ~1.7 ms; cold, it is ~11 ms. The referee runs in its own process with a cold
  table, so the cold figure is the one that applies. Adjudication uses depth 8.

## Gotcha worth knowing before you touch `tournament.py`

**Never set `MultiPV` through `engine.configure()`.** python-chess treats it as
a *managed* option and raises `EngineError: cannot set MultiPV which is
automatically managed` — it sets MultiPV itself from the `multipv=` argument to
`analyse()`.

This one is unusually nasty: raised inside a pool worker, python-chess's
background engine threads keep the worker process alive, so the symptom is the
entire tournament hanging rather than a traceback. It cost an hour of chasing
the wrong bottleneck. `tournament._smoke_configure` now probes the option set in
the parent process before any work is scheduled, so it fails in a second with a
clear message instead.

## Files

| File | Role |
|---|---|
| `weakening.py` | the move-selection policy — the thing being calibrated |
| `openings.py` | 16-opening book, validated at import so a typo fails loudly |
| `tournament.py` | round-robin self-play, multiprocessing, adjudication |
| `rating.py` | Bradley-Terry MLE, Fisher-information standard errors, anchoring |
| `calibrate.py` | orchestrator — measure, fit, invert, emit `ladder.json` |
| `provisional_ladder.py` | uncalibrated stand-in so the UI isn't blocked on a 4h run |
| `library/concepts.yaml` | the 44 concepts and their teaching prose |
| `library/positions.yaml` | hand-authored example positions + their claims |
| `select_puzzles.py` | theme-filtered examples from the Lichess DB |
| `verify.py` | machine-checkable claims about a position |
| `build_library.py` | verify everything, emit `library.json` |
| `parity_test.py` | the browser policy must match the calibrated Python policy |
| `uci_parse_test.py` | the browser's UCI parser must match python-chess |
| `bench.py` | where the time goes; run before changing a perf constant |

## Licensing

Stockfish is **GPL-3.0**. This directory only *invokes* the installed binary, so
nothing here triggers distribution obligations — but the WASM build shipped to
browsers does. See the attribution note in the methodology page and the repo
README.
