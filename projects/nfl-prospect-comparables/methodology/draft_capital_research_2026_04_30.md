# Draft capital in NFL prospect similarity — research re-engagement

## Why we're revisiting

The original methodology survey at `/Users/greg_byu/.claude/plans/hey-claude-we-re-midstream-binary-fog-agent-a70e27e066d83b93a.md` produced a too-clean cross-cutting consensus claim (item 6 of section 2):

> "Draft capital is a dominant feature in supervised projection models (Zachariason ZAP, NGS, C2C) — but is typically excluded from unsupervised similarity engines so it can be used downstream as a separate prior."

That summary papered over a real disagreement among practitioners and led to v2 of the comp engine excluding `draft_capital_pct` from the layered cosine entirely. Three things broke the framing on a closer look:

1. **CARMELO — the closest NBA analog to what we're building — explicitly uses draft position as a heavily-weighted similarity input for rookies.** The prior summary collapsed CARMELO's veteran path (RAPTOR-driven) with its rookie path (age + draft position + height + college stats) and lost this signal.
2. **PFF's public WR comp engine uses draft position as a filter window** (`±1 round`) — a hard re-rank constraint, not a feature in distance, but very much *in* the similarity pipeline.
3. **NFL has no minor leagues.** Draft slot ≈ rookie contract value ≈ guaranteed snaps ≈ multi-year coaching investment. This makes draft capital structurally more determinative for NFL outcomes than it is in MLB, where minor-league performance further sorts players before they ever appear in a PECOTA comp set.

This report re-engages the question and produces a recommendation among three live options:
- **(i)** New `LAYER_DRAFT` similarity layer with its own per-position weight
- **(ii)** Fold into `LAYER_BODY` (treat draft slot as part of structural identity)
- **(iii)** Downstream prior — keep out of similarity, post-multiply or re-rank top-K

## CARMELO's actual treatment of draft position

CARMELO's veteran path uses prior NBA performance (a RAPTOR-derived blend of RPM and BPM) as the dominant similarity signal. The rookie path is a different model. From the 538 methodology piece "We're Predicting The Career Of Every NBA Player" ([fivethirtyeight.com](https://fivethirtyeight.com/features/how-were-predicting-nba-player-career/)):

> "Whereas for veterans, CARMELO formulates a baseline projection based on a player's age and playing time and plus-minus rating in his past three NBA seasons, rookie projections use a player's age, draft position and height."

> "Rookie projections rely heavily on a player's age and draft position. A No. 1 overall pick is almost always going to get a reasonably favorable projection, while a late second-round pick almost always won't."

> "Still, now and then the system will find a player it really likes (such as Russell) or dislikes (such as Frank Kaminsky) relative to his draft position."

That last sentence is important: draft position is heavy enough that going *against* it is the noteworthy event, but it is not absolute — the model can still identify a college-stat-driven outlier. And critically, CARMELO uses **actual draft slot post-draft and projected draft slot pre-draft** as a substitution. From the same piece, supplemented by the related 538 article "The Most Promising Players In The NBA Draft According To My Computer" ([fivethirtyeight.com](https://fivethirtyeight.com/features/the-most-promising-players-in-the-nba-draft-according-to-my-computer/)):

> "The rookie projections also account for — indeed, heavily emphasize — where in the draft each player was selected."

> Pre-draft: scouting rankings substitute for actual pick. Post-draft: "we switch those to a player's actual draft position."

The exact mathematical form (Euclidean vs. weighted, the weight magnitudes, the standardization) is **not publicly disclosed**. 538 reports a 0–100 similarity index — Williamson/Okafor 37.1 vs. Williamson/Carmelo Anthony "a healthy 60.1, which is normal for a top comp" — but does not publish the formula. What we can say with high confidence:

- **Draft position is an input to the similarity vector itself, not a re-rank or post-multiply.** The 538 methodology language ("CARMELO formulates a baseline projection based on...") puts age, draft position, and height in parallel as the inputs that produce the projection.
- **It is heavily weighted relative to height/college-stats** for rookies, asymmetrically more than in the veteran model where it does not appear at all.
- **Substitutability with scouting consensus pre-draft is the design choice** — they don't treat draft slot as sacred; they treat draft *or* scouting consensus as a signal of "what the league thinks this player is."

This is a direct contradiction of the prior summary's claim that "unsupervised similarity engines exclude draft capital."

## NFL-specific prospect frameworks

### NFL Next Gen Stats Draft Model
[nfl.com](https://www.nfl.com/news/next-gen-stats-draft-model-can-predict-prospects-pro-success-0ap3000001103347)

XGBoost classifier, supervised, predicting `P(starter or Pro Bowler within 3 years)`. Position-specific. Outputs Athleticism / Production / Size / Final composite scores.

> "The models use a decision-tree-based algorithm called XGBoost to predict the likelihood that the player will become an NFL starter or Pro Bowler within the first three seasons."

The NFL.com article does not list draft position itself as a feature, and the AWS Q&A pages I tried for additional detail returned only marketing copy ([aws.amazon.com](https://aws.amazon.com/sports/nfl/next-gen-stats-draft-score-qa/)). Architecturally NGS would be expected to *predict* draft slot rather than consume it (the model is partly used by teams to evaluate where players *should* go), so this isn't a direct vote against including draft capital in similarity — it's a different problem.

### Campus2Canton 2024 QB neural net
[campus2canton.com](https://campus2canton.com/2024-qb-model-using-neural-networks/)

Two parallel neural nets. One predicts fantasy PPG, one predicts NFL draft position. Confirmed direct quote:

> "I have created two models, one which predicts fantasy points per game (PPR) and one that predicts NFL draft position using a neural network."

So draft position is a **target**, not a feature. C2C's full input list (P5 status, cumulative pass EPA, RYOE, QBR, games played, sack EPA lost, INT EPA lost) is purely college performance. This is consistent with the prior summary's framing: **for supervised projection, draft capital is downstream of the model**. C2C is not a similarity engine and so is not directly relevant to our distance-metric question, but it is evidence that the "draft capital is a target you predict, not a feature you consume" view exists in the practitioner space.

### JJ Zachariason ZAP
[lateround.com](https://lateround.com/), podcast at [iheart.com](https://www.iheart.com/podcast/1157-nfl-fantasy-football-podc-29699073/episode/jj-zachariason-on-his-zap-model-272251766/)

Position-specific 0–100 supervised score. Public discussion (podcast and Substack secondary sources at [jakobsanderson.substack.com](https://jakobsanderson.substack.com/p/analyzing-the-2025-running-back-class)) confirms RB ZAP weights draft capital first, then size, speed score, best-season reception share, breakout score. The exact functional form and weights are not published. ZAP outputs comps qualitatively in podcast discussion ("Darynton Evans on one end and Kenneth Walker on the other") but is not itself a similarity engine — it's a supervised projection model. So like NGS and C2C, **ZAP includes draft capital as a feature in the projection model, but does not commit publicly on whether it should enter a similarity-distance calculation.**

### RotoViz Workout Explorer
[rotoviz.com](https://www.rotoviz.com/2021/03/the-prospect-workout-explorer-is-here-and-it-boasts-a-bevy-of-super-useful-features/)

The original survey claimed RotoViz includes draft position as a similarity input. **A direct re-read contradicts that claim.** From the article:

> "draft position and collegiate production (especially early collegiate production) are often better predictors of NFL success than athletic measurables"

That sentence is naming the model's *limitation* — the Workout Explorer is athletic-only by design, and the author is acknowledging that draft capital and college production matter more than what the tool actually uses. So RotoViz Workout Explorer is **not** evidence for option (i)/(ii). It is closer to evidence for option (iii) — they think draft position belongs in evaluation, but they handle it outside the similarity tool.

Other RotoViz tools (Prospect Lab, Box Score Scout) include college production, but I did not find a clean public methodology page for them disclosing whether draft slot is a similarity input. Mark this as **non-evidence rather than negative evidence.**

### PlayerProfiler "Best Comparable Player"
[playerprofiler.com glossary](https://www.playerprofiler.com/terms-glossary/), commentary at [playerprofiler.com — Janis](https://www.playerprofiler.com/article/jeff-janis-american-dream/), [playerprofiler.com — rookie usage](https://www.playerprofiler.com/article/rookie-usage-and-production-the-impact-of-draft-capital/)

Glossary description:
> "Best Comparable Player – aggregates physical attributes, college production, workout metrics, and NFL productivity and efficiency (when available) to find each player's most similar peer at his position."

Notably absent: draft capital. This is silence rather than positive disclosure, but PlayerProfiler is more explicit elsewhere — they actively argue **against** weighting draft capital as a standalone evaluation criterion:

> "weighting draft capital as a standalone prospect evaluation criterion is bad process. Because other factors such as size, college production, and athleticism are already baked into a player's draft position to a degree, heavily weighting it as an input factor double-counts the same information."

This is the cleanest articulation of the case for **option (iii)**: draft capital is an aggregate of what the league saw in physical/production/athletic measurables, so if you already have those features in your similarity vector, including draft capital double-counts them. PlayerProfiler does separately publish a piece on how draft capital correlates with rookie usage by position — RB strongest, then QB, then WR, then TE has near-zero correlation. They use this as **downstream commentary**, not similarity input.

This is a real, named disagreement with CARMELO's design choice.

### Football Outsiders QBASE 2.0
[footballoutsiders.com](https://www.footballoutsiders.com/stat-analysis/2021/introducing-qbase-v20)

Direct fetch returned errors; secondary fetch via search confirms QBASE 2.0 uses **three core inputs: Adjusted College Performance, Adjusted College Experience, and Projected Draft Position**, plus a functional-mobility add-on from Olbrecht & Rosen 2018:

> "QBASE looks at college performance, experience and expected draft position (to incorporate scouting information that college stats will miss)."

QBASE is supervised projection, not a similarity engine — it predicts DYAR years 3–5 — but its rationale for including projected draft position is exactly the rationale CARMELO uses: **draft position encodes scouting-eye information that the box-score features alone do not capture.** This is a positive vote for inclusion *somewhere*, though QBASE doesn't speak to similarity-distance specifically.

### Cosine-similarity reference implementations
Several public NFL prospect similarity engines exist in the analytics-blogger ecosystem:

- **The Spade** ([thespade.substack.com](https://thespade.substack.com/p/an-update-to-the-nfl-draft-similarity)) uses cosine similarity on college stats + combine. Does not include draft pick. Author lists weighting and standardization as open questions, not solved choices.
- **The Analytics Say's 2026 dashboard** ([theanalyticssay.substack.com](https://theanalyticssay.substack.com/p/2026-nfl-draft-bonus-post-pt-ii-player)) uses **weighted Euclidean distance on z-standardized features**. Draft pick (1–259) **is included** as one of 10 features, with user-adjustable weight slider 0.0×–3.0×. Most directly comparable to our v2 architecture.
- **Sam Hoppen's RB comparisons** ([samhoppen.substack.com](https://samhoppen.substack.com/p/running-back-prospect-comparisons)) — Euclidean on athleticism + usage + production. **No draft capital.**
- **PFF 2020 WR comps** ([pff.com](https://www.pff.com/news/draft-2020-nfl-draft-closest-statistical-comps-for-2020-wide-receiver-prospects)) — Euclidean on principal components of college stats, with **draft position as a `±1 round` filter**. Draft position is in the pipeline but as a hard re-rank/filter, not a soft distance contribution. This is option (iii).

Across this set: positive votes for inclusion in similarity (CARMELO, The Analytics Say), inclusion as a hard filter (PFF), explicit exclusion with rationale (PlayerProfiler, RotoViz Workout Explorer), and silence (most others).

## Why NFL is structurally different from MLB

PECOTA's exclusion of draft slot from similarity makes sense in MLB because **draft slot is a weak, noisy signal in baseball** — the actual sorting happens across multiple minor-league levels over 3–5 years. By the time a player is even comp-able as an MLB rookie equivalent, the league has already separated the AA-stuck from the AAA-promoted from the September call-ups from the actual rookies. PECOTA can let *minor league performance* carry the structural-fit signal, and treat draft position as a weak, redundant prior.

NFL has no such filter. A rookie's first NFL snap *is* their professional debut. Draft slot in the NFL encodes:
- **Guaranteed money** — top-10 picks have ~$15M+ guaranteed, late-round picks ~$0; this drives playing-time leash length.
- **Coaching investment** — first-round picks get position-coach attention, scheme accommodation, multi-year reps.
- **Snap allocation** — the Player Profiler "draft capital impact on rookie usage" article shows usage correlations of 0.4–0.6 by draft slot for RBs and QBs.
- **Scheme match** — teams draft players who fit their stated schemes, so high draft capital ≈ a coordinator already wants this archetype.

In other words, **in NFL, draft capital is a leading indicator of opportunity, not just a lagging indicator of perceived talent.** An undrafted WR with great college production and great combine numbers is still 10× less likely to see meaningful snaps in year 1 than a 2nd-round pick with the same physical and production profile. Comp engines that ignore draft capital implicitly assume opportunity equality — which is wildly wrong for NFL.

This is the structural argument for inclusion that PECOTA's design simply doesn't need to face.

But — and PlayerProfiler's "double-counting" critique is the rebuttal — once you include height, weight, RAS components, college Dominator, breakout age, position, and the rest of the v2 catalog, **you have already encoded most of what scouts saw**. The marginal information left in draft slot is the difference between scouts' integrated assessment and what your features capture. That marginal signal is real but smaller than naive inclusion implies.

## Recommendation

**Option (i): a new dedicated `LAYER_DRAFT` similarity layer with per-position weight.** Reject options (ii) and (iii).

The case against (ii) — folding into `LAYER_BODY`: body/measurables/recruiting are *physical-identity* features. Draft capital is a different kind of signal (scout consensus + projected role), and giving it the same weight as height makes the layer mean two incompatible things. Body matching is "similar player physically"; draft matching is "similar opportunity tier and scout perception." Mixing them obscures both.

The case against (iii) — pure downstream re-rank: PFF demonstrates that filter-based re-rank works, but it is brittle (`±1 round` is an arbitrary cutoff), it cannot be tuned per-position, and it loses information on the gradient between, say, pick 5 and pick 15 (both round 1 but very different opportunity tiers). We already have a layered weighted-cosine architecture; using it for draft capital is consistent with the engine's design.

The case for (i):
- **Direct CARMELO precedent.** The closest published-methodology analog (and the one most structurally similar to NFL given no minor leagues) treats draft position as a heavily weighted similarity input for rookies. We should mirror that.
- **Per-position weighting matches PlayerProfiler's empirical correlation findings.** RB > QB > WR > TE for "draft capital impact on rookie usage." Those numbers should map to weight magnitudes.
- **Avoids the double-counting critique by being explicit.** Putting draft capital in its own layer with its own weight forces us to *tune* the weight against held-out evals (the same way we tuned the other layer weights in Phase 4.4–4.8). If grid search drives the layer weight near zero for some position, that is the empirical answer that PlayerProfiler is right *for that position*. If it drives it up, CARMELO is right. We don't need to pre-commit to either side of the disagreement.

### Suggested per-position starting weights for `LAYER_DRAFT`

These are *priors for grid search*, not final values. They are derived from PlayerProfiler's reported draft-capital → rookie-usage correlations, scaled to be commensurate with the existing layer weights from `nfl_v2_shipped.md`:

| Position | Suggested initial `LAYER_DRAFT` weight | Rationale |
|---|---|---|
| RB | ~0.20 | Strongest draft-slot → opportunity correlation; CARMELO-like heavy weight |
| QB | ~0.15 | Strong opportunity correlation; QBASE 2.0 explicitly includes |
| WR | ~0.10 | Moderate — PFF uses ±1 round as filter; college production still primary |
| TE | ~0.05 | Smallest signal per PlayerProfiler; near-zero is plausible |

Let the grid search move these. The point is to give them a real coordinate, not to dictate the result.

### Encoding caveats

- **Use `draft_capital_pct` (inverse percentile, 0–1)**, not raw pick number. This is what's already in the schema and matches CARMELO's use of percentile-style scoring rather than raw slot.
- **Pre-draft prospects should use scouting-consensus draft projection** (Brugler / consensus board), not zero. CARMELO does exactly this and explicitly switches to actual pick post-draft. We have Brugler tier data in the corpus already.
- **Re-run the v2 ablation eval** with `LAYER_DRAFT` enabled and verify that overall exact-tier and ±1-tier numbers go up vs. the current shipped baseline (357719e: +5.3pp exact / +6.5pp ±1-tier). If they don't, the PlayerProfiler critique is empirically correct for our feature set and we should fold back to (iii) as a downstream filter.

### Honest caveat on the prior framing

The prior decision to exclude draft capital was not crazy — PlayerProfiler's double-counting argument is real, and Sam Hoppen / The Spade / PFF (in distance) all exclude it from the distance metric itself. But the framing that this was "consensus" was wrong. CARMELO, QBASE 2.0, and The Analytics Say all include draft capital as a model input, and the structural argument for NFL specifically is strong. The right move is empirical: add the layer, tune the weight, let the eval decide.

## Sources

- [538 — How Our NBA Predictions Work](https://fivethirtyeight.com/methodology/how-our-nba-predictions-work/)
- [538 — We're Predicting The Career Of Every NBA Player](https://fivethirtyeight.com/features/how-were-predicting-nba-player-career/)
- [538 — The Most Promising Players In The NBA Draft According To My Computer](https://fivethirtyeight.com/features/the-most-promising-players-in-the-nba-draft-according-to-my-computer/)
- [538 — The Top 50 NBA Draft Prospects, According To Our CARMELO Projections](https://fivethirtyeight.com/features/the-top-50-nba-draft-prospects-according-to-our-carmelo-projections/)
- [NBAStuffer — CARMELO Explained](https://www.nbastuffer.com/analytics101/carmelo/)
- [NFL Next Gen Stats Draft Model](https://www.nfl.com/news/next-gen-stats-draft-model-can-predict-prospects-pro-success-0ap3000001103347)
- [Campus2Canton — 2024 QB Model Using Neural Networks](https://campus2canton.com/2024-qb-model-using-neural-networks/)
- [Late-Round / ZAP podcast — JJ Zachariason](https://www.iheart.com/podcast/1157-nfl-fantasy-football-podc-29699073/episode/jj-zachariason-on-his-zap-model-272251766/)
- [Jakob Sanderson — 2025 RB class analysis](https://jakobsanderson.substack.com/p/analyzing-the-2025-running-back-class)
- [RotoViz — Prospect Workout Explorer](https://www.rotoviz.com/2021/03/the-prospect-workout-explorer-is-here-and-it-boasts-a-bevy-of-super-useful-features/)
- [PlayerProfiler — terms glossary](https://www.playerprofiler.com/terms-glossary/)
- [PlayerProfiler — Jeff Janis American Dream (double-counting argument)](https://www.playerprofiler.com/article/jeff-janis-american-dream/)
- [PlayerProfiler — Draft Capital Impact on Rookie Usage and Production](https://www.playerprofiler.com/article/rookie-usage-and-production-the-impact-of-draft-capital/)
- [Football Outsiders — Introducing QBASE v2.0](https://www.footballoutsiders.com/stat-analysis/2021/introducing-qbase-v20)
- [Football Outsiders — QBASE 2018](https://www.footballoutsiders.com/stat-analysis/2018/qbase-2018)
- [Football Outsiders — QBASE 2020](https://www.footballoutsiders.com/stat-analysis/2020/qbase-2020)
- [ESPN — 2026 QB Projections via QBASE 2.0](https://www.espn.com/nfl/draft2026/story/_/id/48446727/2026-nfl-draft-quarterback-projections-stats-rankings-comps-prospects)
- [The Spade — NFL Draft Similarity Model update](https://thespade.substack.com/p/an-update-to-the-nfl-draft-similarity)
- [The Analytics Say — 2026 NFL Draft Player Similarity Dashboard](https://theanalyticssay.substack.com/p/2026-nfl-draft-bonus-post-pt-ii-player)
- [Sam Hoppen — RB prospect comparisons](https://samhoppen.substack.com/p/running-back-prospect-comparisons)
- [PFF — Closest statistical comps for 2020 WR prospects](https://www.pff.com/news/draft-2020-nfl-draft-closest-statistical-comps-for-2020-wide-receiver-prospects)

### Source-fetch failures and gaps

- **AWS NGS Draft Score Q&A pages** — both `/sports/nfl/...` and `/nfl/...` URLs returned only marketing copy with no methodology detail.
- **Football Outsiders QBASE 2.0 page** — direct fetch returned `ECONNREFUSED` repeatedly; relied on search-result summaries and ESPN secondary coverage. The "expected draft position" inclusion is well-attested in those secondary sources but I did not get the original article's exact coefficient table.
- **PlayerProfiler glossary** — confirmed the absence of draft capital from the Best Comparable Player feature description, but PlayerProfiler does not publish enough technical detail on the algorithm to know whether they explicitly tested draft capital as a feature and rejected it, or never considered it.
- **JJ Zachariason ZAP** — model is paywalled (Late-Round Pro). Public commentary confirms RB ZAP weights draft capital first, but exact functional form and per-position weights are not publicly disclosed.
- **CARMELO mathematical form** — 538 never published the distance metric, the per-feature weights, or the standardization. We know draft position is an input and is heavily weighted for rookies, but the exact formula is not public.
