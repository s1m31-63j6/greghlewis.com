# Two-Minute Drill — engine and data pipeline

The offline half of `/projects/two-minute-drill`. Everything here runs on a
laptop, writes JSON into `public/two-minute-drill/`, and is then read by the
browser. There is no server and nothing is provisioned.

```
pbp.py                 nflverse play-by-play with an on-disk cache
buckets.py             state bucketing — shared by the fits, the engine and the TS port
rng.py                 mulberry32, mirrored in engine/rng.ts so parity is possible
publish.py             where artifacts go so the browser can fetch them

fit_distributions.py   -> distributions.json   outcome models (yards, clock, kicks)
fit_tendencies.py      -> tendencies.json      what an average NFL coach does
build_scenarios.py     -> scenarios.json + scenario-plays.json
engine.py                                      the Monte Carlo rollout engine
calibrate.py           -> calibration.json     isotonic correction, fit and held out
validate.py            -> methodology/validation.json

parity_test.py         Python engine == TypeScript engine, exactly
```

## Running it

```sh
uv sync
uv run python pbp.py                 # mirror 2016-2025 parquet into data/ (~200 MB)
uv run python fit_distributions.py
uv run python fit_tendencies.py
uv run python build_scenarios.py
uv run python calibrate.py           # needs the three above
uv run python validate.py
uv run python parity_test.py
```

Order matters: `calibrate.py` runs the engine, so the distributions and
tendencies have to exist first, and `engine.py` picks up `calibration.json` if
it is there and works uncalibrated if it is not.

## Adding the 2026 season

nflverse publishes play-by-play nightly once games begin. When the season is
under way:

```sh
uv run python pbp.py 2026            # cache the new season
# then edit DEFAULT_SEASONS in pbp.py to include it, and re-run the four builds
```

`build_scenarios.py` stratifies by season, so a new season takes its thirty
slots automatically.

## What is checked

- `validate.py` — nine known-answer situations where football has a correct
  answer, plus a reliability curve and Brier score against whether the team
  actually won. Writes `methodology/validation.json`, which the methodology
  page quotes.
- `parity_test.py` — the two engine implementations must agree exactly on
  outcome, resulting state and rollout result for every state-action pair, on a
  shared stream of uniforms. Currently ~3,000 pairs.

The parity test is mutation-tested. All three of these make it fail:

```sh
TS=../../src/app/projects/two-minute-drill/engine
sed -i '' 's/landing <= 0 ? 80 :/landing <= 0 ? 20 :/' $TS/engine.ts        # punt touchback
sed -i '' 's/if (ydstogo <= 3) return "1-3";/if (ydstogo <= 4) return "1-3";/' $TS/buckets.ts
sed -i '' 's/FG_SNAP_OVERHEAD = 17;/FG_SNAP_OVERHEAD = 18;/' $TS/engine.ts
```

It has already caught one real bug that nothing else would have: the fitter and
the engine each defined distance-to-go bands separately and disagreed, so every
distance-conditioned lookup was missing its key and silently falling back to a
pooled distribution — identically in both implementations, so the output looked
fine.

## Notes

- `data/` is gitignored. The parquet is re-fetched on demand.
- Fits are estimated on a hurry-up window, not on all snaps; see the docstrings
  in `fit_distributions.py` for which window and why.
- Clock runoff is measured from consecutive snaps rather than derived from the
  rulebook, split by outcome, urgency and time remaining.
- The engine is calibrated because its raw output was too pessimistic about
  trailing teams. The correction is monotone, so it cannot reorder two options.
