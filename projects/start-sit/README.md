# Start/Sit by the betting market

Weekly NFL player prop lines turned into market-implied fantasy points, with a
floor, a ceiling, and a verdict on who to start. Live at
greghlewis.com/projects/start-sit.

## The one rule

**The market is the projection.** Nothing here forecasts a player. Every number
on the page is a posted line with the vig removed and the lean applied, and the
page says "no line" when there is none rather than filling the gap from last
season or a depth chart.

## Two tiers, never blended

| Tier | Source | Depth | Role |
|---|---|---|---|
| `book` | SportsGameOdds free plan (DraftKings, FanDuel, BetMGM, Caesars, ...) | the players the books price | headline number; median across books |
| `dfs` | Sleeper's pick'em lines, `api.sleeper.app/lines/available?sport=nfl` | ~260 players, down to WR3 / RB2 / every TE1 | fills gaps; labeled "pick'em" on screen |

A pick'em multiplier is a contest payout, not a book's price. It is weaker
evidence and the page treats it that way.

## Run it

```
cd projects/start-sit
uv sync
SGO_API_KEY=... npm run start-sit:daily      # from the repo root
```

Order matters:

| step | script | why |
|---|---|---|
| 1 | `crosswalk.py` | DynastyProcess ids: `gsis_id` for the 2025 stats, `espn_id` for headshots |
| 2 | `sleeper.py` | the player pool (QB/RB/WR/TE with a team, search rank ≤ 1500) |
| 3 | `sigma.py` | per-stat game spread fit from 2025 weekly stats; cached, `--force` to refit |
| 4 | `fetch_sleeper_lines.py` | the pick'em tier |
| 5 | `fetch_sgo.py` | the sportsbook tier; skips with a warning when `SGO_API_KEY` is unset unless `SGO_REQUIRE_KEY=1` |
| 6 | `teams.py`, `publish.py` | the artifacts in `public/start-sit/` |
| 7 | `results/*.mts`, `results/render.cjs` | gates; `day-over-day.mts` compares against the last commit |

`probe.py` prints what the two feeds actually carried, by market and position.

## What the probe found (week 1, 2026-09-12)

Sleeper: 1,141 NFL lines on 263 players across all 14 remaining games.
Receptions for 176 players, receiving yards 160, anytime TD 107, rushing yards
71, passing for 28 QBs. 93% of lines carry an asymmetric pair of multipliers,
so the lean is recoverable. Anytime TD is a two-sided 0.5 line, so it de-vigs
by pairing. Keyed by Sleeper id: no name matching.

SportsGameOdds (free plan, key in `.env`): one request, 14 events, 11 MB, 866
oddIDs on the first game. Six books price players: DraftKings 197 with a
yardage or reception line, FanDuel 190, Bovada 185, Caesars 184, ESPN BET 183,
BetMGM 181 (plus Unibet, PointsBet and William Hill on a handful). Stat ids that
matter: `receiving_receptions` (not `receptions`), `receiving_yards`,
`rushing_yards`, `rushing_attempts`, `passing_yards`, `passing_touchdowns`,
`passing_interceptions`, and `touchdowns` as a **yes/no** market (`-game-yn-yes`,
with a No price on about half). Game lines are `points-all-game-ou-*` and
`points-home-game-sp-home`. `byBookmaker` rows carry `odds`, `overUnder`,
`available`, `lastUpdatedAt`; the event carries a `players` map with `name` and
`teamID` like `NEW_YORK_JETS_NFL`. Books post anytime-TD prices far deeper than
yardage lines, which is where most `td-only` coverage comes from. Name match
rate 99.3% after `aliases.json`; the residue is fullbacks and free agents.

After both tiers: 346 of 767 pool players priced (181 full), 851 sportsbook
stats and 58 pick'em stats, so the pick'em tier is genuinely a gap-filler.

## Refresh cadence (decided 2026-09-12)

What a snapshot costs, measured: one SportsGameOdds request of 14–16 objects
(one per game) against a free plan of 2,500 a month; one Sleeper request;
free CSVs; a free Actions run; and one Amplify build (~4 min, ~$0.04) when the
data changed. The feed updates every 10 minutes on the free plan.

| Cadence | Snapshots/wk | SGO objects/mo | Amplify/mo | Misses |
|---|---|---|---|---|
| Weekly, Sat night | 1 | ~70 (3%) | ~$0.17 | Sunday-morning props, the snapshot people need |
| Wed, Sat, Sun final | 3 | ~210 (8%) | ~$0.50 | Thu/Fri moves |
| **Daily Wed–Sun + Sun 15:30 UTC final** | 6 | ~415 (17%) | ~$1.00 | Sunday late-window inactives |
| Every 6h + Sunday hourly | ~27 | ~1,850 (74%) | ~$4.60 | nothing, but no rerun headroom |

Dollars do not separate these; captured line-moving moments, build count and
headroom under the cap do. Decision: **daily Wed–Sun plus the Sunday
late-morning final, on GitHub Actions committing the JSON.** Every snapshot is
a commit, so line history is `git log -- public/start-sit/players.json`.

Because the feed reports no usage, `publish.py` keeps a ledger in
`meta.usage` (previous committed count plus this run's events), and
`fetch_sgo.py` exits 78 when the month would pass 2,300 objects; the workflow
treats 78 as "skipped, not failed". Transient feed errors retry three times
(`common.get_with_retry`); a 4xx other than 429 fails at once.

## The arithmetic

- De-vig a pair by scaling to sum to one.
- `ev = line + sigma × Φ⁻¹(p_over)`, `sigma = a + b × line` fit on 2025 with a
  floor; passing yards uses a constant because the level explains none of the
  variance across 37 quarterbacks.
- Touchdowns: `λ = −ln(1 − p)` from P(≥1). No book on the plan posts a No price,
  so each team's Σλ is scaled to its implied touchdowns (team total × 0.1045);
  the published `p` is `1 − e^−λ`, the raw vig price is kept as `pRaw`.
- Interceptions score −1, as the books do.
- Gate: the books' own fantasy-score line (`fantasyScore` statID, consensus
  `bookOverUnder`) vs our full-PPR total — r ≥ 0.98 and |mean gap| ≤ 0.5 or the
  build fails. First build: r = 0.996, gap +0.04, n = 172.
- Points and the simulated band are computed in the browser
  (`src/lib/start-sit/`). The verdict names the highest mean and marks rivals
  within `2 × combined SE` or under one point as too close to call.

## Things that will bite you

- **nflverse `spread_line` is home minus away.** Positive means the home team is
  favored. The published `spread` uses the betting sign (negative = home
  favored). Getting this backwards flips every implied team total.
- **A 0.5-yard rushing line is a yes/no prop, not a projection.** One book posted
  it on a receiver with a heavy under lean and the normal inversion produced
  negative yards. Yardage lines under `MIN_YARD_LINE` are dropped and every
  expectation is clamped at zero.
- **The `.headers.json` sidecar sorts after the data file.** A bare
  `glob("sgo-w*.json")[-1]` picks it up; filter it out.
- **Sleeper's game id is opaque.** Lines are matched to the schedule by the pair
  of team codes on the lines themselves.
- **Sleeper posts lines only for `pre_game` games.** After Thursday night, that
  game's players show as `played`, not `none`.
- **The pool is capped at search rank 1500.** A player with a line but outside
  the pool is dropped silently by design; the probe counts them.
- **Passing yards' spread fit has a negative slope on raw data.** `MIN_R2` turns
  it into a constant. Do not "fix" the slope by hand.
- **Never cache `data/` in CI.** A warm cache lets a dead feed serve yesterday.
- **The key is a header, never a query parameter.** It must not reach a cache
  filename or a log line; `fetch_sgo.py` redacts it from error text.
