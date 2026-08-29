# Draft Sheet for Casuals — data pipeline

Consensus tiers for any league setting, ADP from four markets, offseason movement,
and a one-page printable sheet. Live at `/projects/draft-sheet`.

## The one rule

**Consensus is the spine.** There is no projection engine. The board a user sees IS
the published expert consensus board for their format, tiers included. Configuration
is only allowed to shift positions *against each other*, never to reorder players
within a position, and even that is capped at 18 ranks and asserted by a harness that
fails the build.

If you change anything in `src/lib/draft-sheet/board.ts`, run `npm run draft-sheet:check`
before you do anything else.

## Run it

```bash
npm run draft-sheet:daily      # ~2 min. The whole thing, exactly as the cron runs it.
```

That chains fetch → history → publish → gates → day-over-day → thumbnail. Then
commit `public/draft-sheet/` and push; Amplify rebuilds in about three minutes.

The pieces, if you need one on its own:

```bash
npm run draft-sheet:fetch      # sources + merge, writes data/*.parquet
npm run draft-sheet:history    # ~80s, 270 sequential calls to an undocumented endpoint
npm run draft-sheet:publish    # writes public/draft-sheet/
npm run draft-sheet:check      # tie-out, import, coaching, top200, server-render
npm run draft-sheet:drift      # compares against the last committed artifacts
node projects/draft-sheet/results/thumbnail.cjs
```

**Order is load-bearing.** `adp_history.py` needs `merged.parquet`, and `publish.py`
reads `adp-history.json` to compute every trend arrow — so history sits BETWEEN merge
and publish. It used to run last, which meant `move` was always a day stale and, on a
cold machine, silently absent.

## The daily cron

`.github/workflows/draft-sheet-refresh.yml` runs this at **03:00 UTC (11pm Eastern)**,
commits only if every gate passes, and opens a GitHub issue if one does not. It needs
no secrets — every source is anonymous.

- **It expires on 2026-09-08**, enforced in the job rather than in anyone's calendar.
  To stop it sooner, delete the workflow file or disable it in the Actions tab.
- **ADP history refreshes weekly**, not daily: the job checks how old the committed
  `adp-history.json` is and only spends the 270 calls when it is 7+ days stale.
- **`data/` is never cached in CI, deliberately.** The fetchers reuse a cached file
  rather than refetching, so a warm cache could mask a dead endpoint. A cold runner
  every night is the guard.
- **The commit is path-scoped** to `public/draft-sheet/`. This branch can carry
  unrelated work in progress and an unattended `commit -a` would ship it to a live site.

## Order matters

| Step | Script | Why here |
| --- | --- | --- |
| 1 | `crosswalk.py` | The id spine. Everything joins through DynastyProcess ids. |
| 2 | `rankings_fpros.py` | The five consensus boards. **This is the product.** |
| 3 | `adp_espn.py` `adp_yahoo.py` `adp_ffc.py` `adp_sleeper.py` | Four markets, independent. |
| 4 | `merge.py` | Joins onto the spine. **Fails the build on a bad join rate.** |
| 5 | `publish.py` | Rank-normalizes the platforms, writes `public/draft-sheet/`. |
| 6 | `teams.py` `team_news.py` | Team marks and the offseason briefing. |
| — | `adp_history.py` | Independent; writes `adp-history.json` on its own cadence. |

## Things that will bite you

**ESPN ADP saturates.** About 720 of 1,027 players share a value near 170. That is a
clamp, not a market signal — `adp_espn.py` detects the shared-value buckets and nulls
them, falling back to `draftRanksByRankType.PPR.rank`. Averaging a fake 170 against a
real Yahoo 144 would drag every late-round player toward a consensus nobody holds.

**Never use `itertuples()` on these frames.** Pandas renames any column that is not a
valid Python identifier to a positional `_N`. `half-superflex` has a hyphen, and on the
first run that silently published a board with **zero players** and nothing complained.
`publish.py` iterates records and asserts every board is non-empty.

**Team defenses have no id in any crosswalk.** FantasyPros says "Houston Texans", ESPN
"Texans D/ST", Yahoo "Texans", FFC "Houston Defense". They join on team code — and that
join must be masked to DST rows only. Merging a team-keyed frame across the whole board
and then `fillna`-ing hands every Chief the Chiefs defense's ADP. The join-quality gate
caught exactly this, which is what it is for.

**Yahoo needs no OAuth.** `pub-api-ro.fantasysports.yahoo.com` answers a bare game key.
It is undocumented and could vanish; callers must tolerate a stale file rather than
failing the board. Yahoo's terms require the attribution carried in `meta.json`.

**Sleeper has no ADP.** `search_rank` is their own ordering, correlating with real draft
position at about 0.87. It is labelled a rank everywhere it appears and must never be
described as ADP.

**Respect FantasyPros' `Crawl-delay: 5`.** Five pages, twenty-five seconds. Their
robots.txt disallows `/ajax/`, `/api/`, `/json/`, `/xml/` and `/nfl/ranker/`, but not
`/nfl/rankings/`. Their ADP *pages* server-render only five rows and are not usable —
use the four ADP sources above instead.

## What is authored rather than derived

`coaching.json` is hand-written, covers all 32 teams, and carries a source on every
entry. It has to be: nflverse's coach column caught only **7 of the 10** 2026 head-coach
changes (it misses Arizona, Atlanta and Buffalo, and misspells Klint Kubiak), and no free
structured source covers offensive coordinators at all, where **21 teams** changed.

Each entry records the head coach, the coordinator, **who actually calls the plays**, and
an `impact` judgement in [-2, 2] with optional per-position overrides. Coaching feeds the
arrows at 35 value points per step against thresholds of 28 and 90 — enough to carry a
position across one boundary, never enough to overrule a roster change that happened.

Three things the schema exists to get right:

- **Play-calling can move with no title change.** Carolina handed the calls from Dave
  Canales to Brad Idzik while both kept their jobs. That is one of the most
  fantasy-relevant changes of the offseason and invisible in any staff list, so
  `playCallerNew` counts as a change in its own right.
- **The coordinator is often not the play-caller.** Arizona, Las Vegas, Cleveland and
  Buffalo all have a new OC who does not call plays; assuming otherwise gets the causality
  backwards. 18 teams have a new play-caller against 21 new coordinators.
- **An impact score with no coaching change behind it is an unsupported claim** and fails
  the build, in both the Python validator and `results/coaching.mts`, which re-checks the
  published artifact.

Two stale-page traps worth knowing if you re-research this: search surfaces a January
**2025** "Patriots to hire Josh McDaniels" story and a **2022** "Matt Nagy returns to
Chiefs" story, both of which read as current and are not.

Everything else on the offseason tab is derived — arrivals, departures, draft picks, and
the roster half of each arrow.
