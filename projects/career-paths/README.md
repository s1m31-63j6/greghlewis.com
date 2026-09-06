# Should You Join a Startup?

A sourced Monte Carlo of a new graduate's first job. Three thousand simulated
careers (a thousand each for a startup, a corporate and a consulting start)
are dropped through thirty-five years of pay, promotions, layoffs, shutdowns,
exits and the occasional decision to do something else. The site shows them
as a plinko board, a choose-your-own sankey, and a plain-English brief on
funding stages with a Bedrock-backed question box.

Live: https://greghlewis.com/projects/career-paths

## Pipeline

```
research/sources_comp.md      pay curves, attrition, layoffs, MBA, founding (24 searches)
research/sources_startup.md   stages, exits, grants, dilution, exercise, tenders, PE (25 searches)
research/sources_benefits.md  401(k) contributions by employer type, vesting, real returns, savings rates, SCF wealth (20 searches)
        |
params.py       -> params.json       every number as {value, source, url, kind, note}
engine.py                            the career simulation (mirrored in engine/engine.ts)
rng.py                               mulberry32, byte-identical to engine/rng.ts
simulate.py     -> reference.json    32 cohorts x 1,000 careers under fixed seeds
                -> flows.json        sankey nodes and links from 20,000 careers per track
verify.py       -> validation.json   14 benchmarks the model must land inside; nonzero exit on miss
parity_test.py                       500 careers, Python vs TypeScript, exact on events, 1e-9 on dollars
tie_out.mts                          re-runs the reference cohorts through the shipped TS; fails on 0.5% drift
thumbnail.py    -> public/landing/career-paths.png
publish.py                           every JSON is written here and into public/career-paths/
```

```
npm run career-paths:build   params -> simulate -> verify   (needs uv)
npm run career-paths:check   parity -> tie-out              (run before every publish)
```

## The model in one paragraph

Each year a ball may leave school, choose at a milestone (3, 5, 10, 15, 20,
30), then every company it holds equity in rolls for a round, a shutdown, an
exit or a tender; the employer's outcome decides whether the ball is paid,
laid off, absorbed into an acquirer or promoted (and, in consulting, counseled
out); then pay is starting pay x rung multiplier x a persistent ability draw x
any scar or lift x annual noise, plus any equity turned into cash, plus the
employer's retirement contribution once it vests. Equity is a lottery ticket:
vested x diluted x max(0, exit - preference stack) x (1 - strike), and only if
the options were exercised. Invested wealth compounds at a real return, adding
a savings share that steps up with income, about half of any windfall, and the
employer contribution; business school tuition draws it down. See
`src/app/projects/career-paths/methodology/page.tsx` for the full walk-through.

## Gotchas

- Python's `round()` is banker's rounding and JavaScript's is not; the engines
  use `floor(x + 0.5)` for years-per-round on both sides.
- `Math.log`/`Math.cos`/`Math.exp` differ from CPython's libm in the last ulp,
  so parity is exact on discrete outcomes and 1e-9 relative on dollars.
- `stats.ts` and `simulate.py` derive cohort seeds from the same string hash;
  change one and the tie-out will tell you.
- `flows.json` and `reference.json` are inputs to the site, not build products
  of it: Amplify's build box has no `uv`, so run `career-paths:build` locally
  and commit the JSON.
