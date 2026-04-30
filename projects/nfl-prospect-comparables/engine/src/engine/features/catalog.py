"""Canonical feature catalog for the NFL Prospect Comparables Engine.

Every engineered feature lands in `PlayerProfile.features` keyed by the
catalog `name`. This file is the single source of truth for what features
exist, what they mean, what data they need, and which positions they apply
to. Implementations live alongside the catalog and register here as they
ship.

Comprehensive over complete: this catalog is intentionally broader than
v1 will fully implement. Every entry is documented well enough for a
future-Greg or a reviewer to understand intent.

Data source labels (for `requires`):
- `combine`         : NFL Combine + Pro Day measurements
- `cfbd_box`        : CFBD box-score / season aggregates
- `cfbd_pbp`        : CFBD play-by-play (the heavy lift)
- `cfbd_recruit`    : CFBD recruiting rankings (247Sports composite)
- `nflverse_pbp`    : nflverse pro play-by-play (1999+)
- `nflverse_player` : nflverse player meta + stats
- `pfr_award`       : Pro Football Reference awards/All-Pro/Pro Bowl
- `ras`             : Relative Athletic Score (Kent Lee Platte)

Archetype layer (for v2 similarity, per CARMELO + DuPont/RotoViz + QBASE 2.0):
- `BODY`       : athletic measurables, recruiting pedigree, age, size — pure identity
- `VOLUME`     : market-share / per-team-attempt / dominator / breakout — workload identity
- `EFFICIENCY` : EPA, success rate, rate-based — kept ONLY for QB (per QBASE 2.0). Outcome
                 leakage for RB/WR/TE.
- `DRAFT`      : draft capital — opportunity signal (rookie contract, snap leash, coaching
                 investment). Per CARMELO rookie methodology + QBASE 2.0 + The Analytics Say.
                 See methodology/draft_capital_research_2026_04_30.md.
- `TRAJECTORY` : derived production trajectory — light/excluded by default
- `CONTEXT`    : schedule strength, opp adjustments — excluded from similarity
- `EXCLUDED`   : explicitly excluded from similarity (e.g., recruiting_to_draft_delta —
                 redundant with its two endpoints once both are in similarity)
- `OTHER`      : default; un-tagged features land here and get excluded from layered arms
"""

from __future__ import annotations

from dataclasses import dataclass, field

from engine.schema import Position

ALL = (Position.QB, Position.RB, Position.WR, Position.TE)


# Archetype layer constants. See docstring above for definitions.
LAYER_BODY = "BODY"
LAYER_VOLUME = "VOLUME"
LAYER_EFFICIENCY = "EFFICIENCY"
LAYER_DRAFT = "DRAFT"
LAYER_TRAJECTORY = "TRAJECTORY"
LAYER_CONTEXT = "CONTEXT"
LAYER_EXCLUDED = "EXCLUDED"
LAYER_OTHER = "OTHER"
# Sonnet-extracted scouting-archetype trait layer (lives in trait_vectors.parquet,
# not in the engineered feature catalog). Keyed here for the find_comps layered
# combiner to address all five layers uniformly.
LAYER_TRAITS = "TRAITS"
LAYERS = (
    LAYER_BODY,
    LAYER_VOLUME,
    LAYER_EFFICIENCY,
    LAYER_DRAFT,
    LAYER_TRAITS,
    LAYER_TRAJECTORY,
    LAYER_CONTEXT,
    LAYER_EXCLUDED,
    LAYER_OTHER,
)


@dataclass(frozen=True)
class FeatureSpec:
    name: str
    positions: tuple[Position, ...]
    group: str
    description: str
    formula: str
    requires: tuple[str, ...] = field(default_factory=tuple)
    layer: str = LAYER_OTHER


# ---------------------------------------------------------------------------
# Universal features (athletic measurables, schedule context, trajectory)
# ---------------------------------------------------------------------------

UNIVERSAL: list[FeatureSpec] = [
    # --- athletic z-scores / percentiles vs position cohort (BODY: pure identity) ---
    FeatureSpec("forty_pct", ALL, "athletic", "40-yard dash percentile vs position cohort", "z-score, then ECDF percentile", ("combine",), layer=LAYER_BODY),
    FeatureSpec("vertical_pct", ALL, "athletic", "Vertical jump percentile vs position cohort", "z-score → ECDF", ("combine",), layer=LAYER_BODY),
    FeatureSpec("broad_jump_pct", ALL, "athletic", "Broad jump percentile", "z-score → ECDF", ("combine",), layer=LAYER_BODY),
    FeatureSpec("three_cone_pct", ALL, "athletic", "3-cone drill percentile (lower raw = better)", "negate → z-score → ECDF", ("combine",), layer=LAYER_BODY),
    FeatureSpec("shuttle_pct", ALL, "athletic", "Short shuttle percentile (lower raw = better)", "negate → z-score → ECDF", ("combine",), layer=LAYER_BODY),
    FeatureSpec("bench_pct", ALL, "athletic", "Bench press reps percentile", "z-score → ECDF", ("combine",), layer=LAYER_BODY),
    FeatureSpec("height_pct", ALL, "athletic", "Height percentile vs position cohort", "z-score → ECDF", ("combine",), layer=LAYER_BODY),
    FeatureSpec("weight_pct", ALL, "athletic", "Weight percentile vs position cohort", "z-score → ECDF", ("combine",), layer=LAYER_BODY),
    FeatureSpec("bmi", ALL, "athletic", "Body mass index", "703 * lbs / (in^2)", ("combine",), layer=LAYER_BODY),
    # --- composite athletic indices ---
    FeatureSpec("ras_score", ALL, "athletic", "Relative Athletic Score (Kent Lee Platte)", "averaged drill percentiles, 0-10 scale", ("ras",), layer=LAYER_BODY),
    FeatureSpec("speed_score", (Position.RB, Position.WR), "athletic", "Bill Barnwell speed score", "weight * 200 / (40^4)", ("combine",), layer=LAYER_BODY),
    FeatureSpec("burst_score", ALL, "athletic", "Vertical + broad jump (lower-body explosive index)", "vertical_inches + broad_jump_inches", ("combine",), layer=LAYER_BODY),
    FeatureSpec("agility_score", ALL, "athletic", "3-cone + shuttle (change-of-direction index)", "three_cone + shuttle (lower = better)", ("combine",), layer=LAYER_BODY),
    FeatureSpec("catch_radius", (Position.WR, Position.TE), "athletic", "Effective catch radius proxy", "height_inches + arm_length_inches", ("combine",), layer=LAYER_BODY),
    # --- composite athletic indices (custom) ---
    FeatureSpec("forty_per_pound", (Position.RB, Position.WR, Position.TE), "athletic", "Weight-adjusted forty (size-fast vs flat-fast)", "forty * sqrt(weight / 200)", ("combine",), layer=LAYER_BODY),
    FeatureSpec("athletic_composite", ALL, "athletic", "Geometric mean of available drill percentiles (own RAS)", "geo_mean over available {forty,vert,broad,cone,shuttle,bench}_pct", ("combine",), layer=LAYER_BODY),
    # --- recruiting pedigree (BODY: identity / pre-college signal) ---
    FeatureSpec("recruit_composite_pct", ALL, "background", "247Sports composite recruit rating percentile", "ECDF over CFBD recruit rankings", ("cfbd_recruit",), layer=LAYER_BODY),
    FeatureSpec("recruit_star_rating", ALL, "background", "Star rating out of high school (3-5)", "raw star rating", ("cfbd_recruit",), layer=LAYER_BODY),
    FeatureSpec("recruiting_to_draft_delta", ALL, "background", "Riser/faller signal: draft capital pct minus recruit composite pct", "draft_capital_pct - recruit_composite_pct (range -1..+1)", ("cfbd_recruit", "nflverse_player"), layer=LAYER_EXCLUDED),
    FeatureSpec("weight_change_recruit_to_draft", ALL, "background", "Body-comp development from HS recruiting to combine", "draft_weight_lbs - recruit_weight_lbs", ("cfbd_recruit", "combine"), layer=LAYER_BODY),
    # --- college longevity / context (BODY: identity facts about player) ---
    FeatureSpec("college_seasons", ALL, "background", "Number of seasons played in college", "count of distinct seasons with snap > 0", ("cfbd_box",), layer=LAYER_BODY),
    FeatureSpec("transferred", ALL, "background", "Whether player transferred during college", "1 if multiple schools in record, else 0", ("cfbd_box",), layer=LAYER_BODY),
    FeatureSpec("conference_p5", ALL, "background", "Played most career snaps in a Power-5 conference", "1/0 indicator", ("cfbd_box",), layer=LAYER_BODY),
    FeatureSpec("age_at_draft_pct", ALL, "background", "Age-at-draft percentile within position cohort (lower = younger = better)", "1 - ECDF(age_at_draft) within position", ("nflverse_player",), layer=LAYER_BODY),
    FeatureSpec("days_since_birthday_at_draft", ALL, "background", "Refines age_at_draft with within-year fraction", "draft_date.day_of_year - birth_date.day_of_year (mod 365)", ("nflverse_player",), layer=LAYER_BODY),
    # DRAFT layer — opportunity signal. CARMELO uses draft position as a heavily-weighted
    # rookie-similarity input; QBASE 2.0 uses expected draft position as a core QB input;
    # The Analytics Say's NFL similarity dashboard includes draft pick as a feature. The
    # PlayerProfiler "double-counting" critique (draft slot encodes physical+production
    # measurables that are already in similarity) is real — addressed by giving DRAFT its
    # own layer with its own weight, so grid search resolves the trade-off empirically per
    # position. NFL is structurally different from MLB (PECOTA's domain): no minor leagues,
    # so draft slot ≈ rookie contract ≈ guaranteed snaps ≈ coaching investment, making it
    # a leading indicator of opportunity rather than a lagging perception signal.
    # Three complementary dims so the per-layer cosine is granular: a single-feature layer
    # would be sign-binary (all top-half-pick candidates would cosine to +1.0 against
    # each other, losing within-tier differentiation). See
    # methodology/draft_capital_research_2026_04_30.md.
    FeatureSpec("draft_capital_pct", ALL, "background", "Inverse draft pick percentile (higher = earlier)", "1 - (pick / 256)", ("nflverse_player",), layer=LAYER_DRAFT),
    FeatureSpec("draft_round_normalized", ALL, "background", "Draft round 1-7 with UDFA=8 (z-scored downstream)", "round number; UDFA → 8", ("nflverse_player",), layer=LAYER_DRAFT),
    FeatureSpec("day_one_indicator", ALL, "background", "Round-1 (top 32) indicator — 5th-year option + guaranteed contract identity", "1 if draft_round == 1 else 0", ("nflverse_player",), layer=LAYER_DRAFT),
    # --- schedule strength / opposition quality (CONTEXT: excluded from similarity) ---
    FeatureSpec("sos_mean", ALL, "context", "Career mean strength of schedule (SP+ rating of opponents)", "weighted mean opponent SP+ across all games", ("cfbd_box",), layer=LAYER_CONTEXT),
    FeatureSpec("share_vs_ranked", ALL, "context", "Share of games played against AP-ranked opponents", "ranked_games / total_games", ("cfbd_box",), layer=LAYER_CONTEXT),
    FeatureSpec("perf_vs_ranked_delta", ALL, "context", "Production rate delta vs ranked opponents", "(rate vs ranked) - (rate vs unranked), normalized", ("cfbd_box",), layer=LAYER_CONTEXT),
    FeatureSpec("perf_in_bowl_games", ALL, "context", "Production in bowl/playoff games (z vs season avg)", "z-score of bowl-game production vs regular season", ("cfbd_box",), layer=LAYER_CONTEXT),
    FeatureSpec("perf_road_delta", ALL, "context", "Production rate delta in road games", "(road rate) - (home rate), normalized", ("cfbd_box",), layer=LAYER_CONTEXT),
    FeatureSpec("team_quality_at_breakout", ALL, "context", "SP+ rating of player's college team during peak season", "sp_rating(team, breakout_season)", ("cfbd_box",), layer=LAYER_CONTEXT),
    FeatureSpec("returning_production_role", ALL, "context", "Share of team's offensive production in player's final season", "(player rec_yds + rush_yds + 0.5*pass_yds) / team total in final season", ("cfbd_box",), layer=LAYER_VOLUME),
    # --- career arc / trajectory ---
    # Trajectory features split: market-share / breakout signals → VOLUME (DuPont/Siegele
    # canonical features). Slope/variance derived from EFFICIENCY metrics → TRAJECTORY,
    # excluded from non-QB similarity.
    FeatureSpec("career_trend_slope", ALL, "trajectory", "Slope of season-over-season production rate", "linear regression slope of EPA/play (or position-equivalent) by season", ("cfbd_pbp",), layer=LAYER_TRAJECTORY),
    FeatureSpec("best_season_age", ALL, "trajectory", "Age at peak-production season", "argmax over season age vs production index", ("cfbd_pbp",), layer=LAYER_TRAJECTORY),
    FeatureSpec("final_year_z", ALL, "trajectory", "Final-season production z-score vs college career", "z-score of final season vs all college seasons", ("cfbd_pbp",), layer=LAYER_TRAJECTORY),
    FeatureSpec("consistency", ALL, "trajectory", "Inverse coefficient of variation of season production", "1 / (stdev / mean) over college seasons, clipped", ("cfbd_pbp",), layer=LAYER_TRAJECTORY),
    FeatureSpec("breakout_age", ALL, "trajectory", "Age at first season with elite production (top-quartile in pos cohort)", "min age where season percentile > 75 in cohort", ("cfbd_pbp",), layer=LAYER_VOLUME),
    FeatureSpec("dominator_rating", (Position.WR, Position.TE, Position.RB), "trajectory", "Share of team production captured at peak", "max season share of team's relevant production", ("cfbd_box",), layer=LAYER_VOLUME),
    FeatureSpec("late_career_growth", ALL, "trajectory", "Final-year minus rookie-year production rate", "production_rate(final) - production_rate(first)", ("cfbd_pbp",), layer=LAYER_TRAJECTORY),
    FeatureSpec("production_variance_ratio", ALL, "trajectory", "Coefficient of variation of season-to-season production (boom/bust separator)", "stdev(season_production) / mean(season_production), clipped 0..3", ("cfbd_box",), layer=LAYER_TRAJECTORY),
]

# ---------------------------------------------------------------------------
# QB features
# ---------------------------------------------------------------------------

QB_ONLY = (Position.QB,)

# Audited 2026-04-28 against the QB-analyst community (Ben Baldwin / OSF,
# Hayden Winks, Eric Eager, PFF, Steve Palazzolo, Brian Burke / Total QBR,
# Football Outsiders DVOA, Bill Connelly / SP+, Kevin Cole / Unexpected
# Points, Cynthia Frelund). The hard public-data ceiling is air yards,
# pressure data, and PFF charting (BTT% / TWP% / CPOE / aDOT). QB_DEFERRED
# below enumerates those plus model-based v1.1 candidates (xPass PROE,
# EPA-over-expected baseline regression).
# NOTE: QB is the deliberate exception in v2 — efficiency stats stay in the similarity input
# per QBASE 2.0 / Campus2Canton consensus. Rushing/mobility is part of the QB efficiency
# layer per QBASE 2.0 ("functional mobility" alongside passing). Other positions drop
# efficiency entirely (it leaks the outcome).
QB_FEATURES: list[FeatureSpec] = [
    # --- volume (workload identity) ---
    FeatureSpec("qb_total_attempts", QB_ONLY, "volume", "Career pass attempts", "sum(attempts)", ("cfbd_pbp",), layer=LAYER_VOLUME),
    FeatureSpec("qb_dropbacks_per_game", QB_ONLY, "volume", "Dropbacks per game", "dropbacks / games_played", ("cfbd_pbp",), layer=LAYER_VOLUME),
    # --- efficiency (kept for QB per QBASE 2.0) ---
    FeatureSpec("qb_epa_per_db", QB_ONLY, "efficiency", "EPA per dropback (career) — foundational", "sum(ppa where pass_or_sack) / dropbacks", ("cfbd_pbp",), layer=LAYER_EFFICIENCY),
    FeatureSpec("qb_success_rate", QB_ONLY, "efficiency", "Dropback success rate (EPA > 0)", "count(ppa > 0) / dropbacks", ("cfbd_pbp",), layer=LAYER_EFFICIENCY),
    FeatureSpec("qb_adjusted_ypa", QB_ONLY, "efficiency", "Adjusted Y/A — PFR formula, dominates raw YPA", "(yards + 20*TD - 45*INT) / attempts", ("cfbd_pbp",), layer=LAYER_EFFICIENCY),
    FeatureSpec("qb_int_rate", QB_ONLY, "efficiency", "Interception rate — unique predictive content vs efficiency (PFF/Cole)", "interceptions / attempts", ("cfbd_pbp",), layer=LAYER_EFFICIENCY),
    FeatureSpec("qb_isoppp_pass", QB_ONLY, "efficiency", "Mean EPA on successful dropbacks only — pure explosiveness (Connelly / SP+)", "mean(ppa where ppa > 0 AND dropback)", ("cfbd_pbp",), layer=LAYER_EFFICIENCY),
    FeatureSpec("qb_early_down_epa_per_db", QB_ONLY, "efficiency", "EPA/dropback on 1st & 2nd down — Baldwin's cleanest passer-quality signal", "filter dropbacks to down ≤ 2", ("cfbd_pbp",), layer=LAYER_EFFICIENCY),
    FeatureSpec("qb_clutch_weighted_epa_per_db", QB_ONLY, "efficiency", "Continuous WP-leverage-weighted EPA (Burke / Total QBR) — replaces leading/tied/trailing/late_close/garbage splits", "sum(weight × ppa) / sum(weight); weight = exp(-|score_diff|/14) × period_multiplier", ("cfbd_pbp",), layer=LAYER_EFFICIENCY),
    FeatureSpec("qb_opponent_adj_epa_per_db", QB_ONLY, "efficiency", "Per-play EPA residual against opponent's season pass-defense baseline (Burke / Connelly schedule strength)", "mean(ppa - opp_pass_d_mean_ppa) per dropback", ("cfbd_pbp",), layer=LAYER_EFFICIENCY),
    # --- situational (QB efficiency in down/red-zone splits) ---
    FeatureSpec("qb_epa_per_db_3rd_down", QB_ONLY, "situational", "EPA/dropback on 3rd down — high-leverage situational", "filter to down=3", ("cfbd_pbp",), layer=LAYER_EFFICIENCY),
    FeatureSpec("qb_epa_per_db_red_zone", QB_ONLY, "situational", "EPA/dropback in red zone — distinct situational signal", "filter to yards_to_goal ≤ 20", ("cfbd_pbp",), layer=LAYER_EFFICIENCY),
    FeatureSpec("qb_redzone_td_rate", QB_ONLY, "situational", "TD rate inside the 20 — TD-equity signal", "rz_td_passes / rz_dropbacks", ("cfbd_pbp",), layer=LAYER_EFFICIENCY),
    # --- mobility (QB-specific: pocket vs scrambler is identity, not just outcome) ---
    FeatureSpec("qb_rush_rate", QB_ONLY, "mobility", "Rush attempts as share of total dropbacks + rushes", "rush_att / (dropbacks + rush_att)", ("cfbd_pbp",), layer=LAYER_EFFICIENCY),
    FeatureSpec("qb_yards_per_rush", QB_ONLY, "mobility", "Yards per rush attempt", "rush_yards / rush_attempts", ("cfbd_pbp",), layer=LAYER_EFFICIENCY),
    FeatureSpec("qb_rush_td_rate", QB_ONLY, "mobility", "Rushing TDs per rush attempt", "rush_tds / rush_attempts", ("cfbd_pbp",), layer=LAYER_EFFICIENCY),
    FeatureSpec("qb_sack_rate", QB_ONLY, "mobility", "Sack rate", "sacks / dropbacks", ("cfbd_pbp",), layer=LAYER_EFFICIENCY),
    # --- trajectory ---
    FeatureSpec("qb_epa_yoy_slope", QB_ONLY, "trajectory", "Year-over-year slope of EPA/dropback", "linear regression slope across seasons", ("cfbd_pbp",), layer=LAYER_TRAJECTORY),
    FeatureSpec("qb_final_year_epa_z", QB_ONLY, "trajectory", "Final-season EPA/dropback z vs prior seasons (clipped ±5)", "z-score(final, prior_career)", ("cfbd_pbp",), layer=LAYER_TRAJECTORY),
]


# QB specs that need air yards, pressure data, charting, or model regressions
# that are not in scope for Phase 1. Documented for the methodology page.
QB_DEFERRED: list[FeatureSpec] = [
    # PFF / SIS charting
    FeatureSpec("qb_cpoe", QB_ONLY, "deferred", "Completion percentage over expected", "actual_cp - model_expected_cp(aDOT, distance, situation)", ("PFF/nflverse",)),
    FeatureSpec("qb_btt_rate_proxy", QB_ONLY, "deferred", "Big-time-throw rate (PFF concept)", "PFF charting", ("PFF",)),
    FeatureSpec("qb_twp_rate_proxy", QB_ONLY, "deferred", "Turnover-worthy-play rate (PFF concept)", "PFF charting", ("PFF",)),
    # Air yards (no air-yard data in CFBD)
    FeatureSpec("qb_adot", QB_ONLY, "deferred", "Average depth of target", "mean(air_yards)", ("PFF/nextgen",)),
    FeatureSpec("qb_air_yards_per_attempt", QB_ONLY, "deferred", "Air yards per attempt", "sum(air_yards) / attempts", ("PFF/nextgen",)),
    FeatureSpec("qb_deep_attempt_share", QB_ONLY, "deferred", "Share of attempts > 15 air yards", "count(ay > 15) / attempts", ("PFF/nextgen",)),
    FeatureSpec("qb_deep_completion_pct", QB_ONLY, "deferred", "Completion % on deep attempts", "deep_completions / deep_attempts", ("PFF/nextgen",)),
    FeatureSpec("qb_deep_epa_per_attempt", QB_ONLY, "deferred", "EPA per deep attempt", "sum(epa) / deep_attempts", ("PFF/nextgen",)),
    FeatureSpec("qb_yac_per_completion", QB_ONLY, "deferred", "YAC per completion — needs catch location", "sum(yac) / completions", ("PFF/nextgen",)),
    FeatureSpec("qb_yac_adjusted_epa_per_db", QB_ONLY, "deferred", "QB EPA isolated from receiver YAC contribution", "sum(epa - expected_yac_epa)", ("PFF/nextgen",)),
    # Pre-snap intent
    FeatureSpec("qb_scramble_rate", QB_ONLY, "deferred", "Scrambles per dropback (vs designed runs)", "scrambles / dropbacks", ("PFF/nextgen",)),
    FeatureSpec("qb_designed_run_rate", QB_ONLY, "deferred", "Designed runs per offensive snap", "designed_runs / snaps", ("PFF/nextgen",)),
    # Pressure data
    FeatureSpec("qb_pressure_to_sack", QB_ONLY, "deferred", "Sack rate when pressured", "sacks / pressures", ("PFF",)),
    # Model-based v1.1 candidates
    FeatureSpec("qb_xpass_proe", QB_ONLY, "deferred", "Pass rate over expected (Baldwin xPass) — needs trained model", "actual_pass_rate - model_expected_pass_rate", ("model_v1_1",)),
    FeatureSpec("qb_epa_over_expected_per_db", QB_ONLY, "deferred", "DVOA-style EPA residual against situation baseline — needs trained model", "ppa - expected_ppa(down, distance, yardline, score, time)", ("model_v1_1",)),
]

# ---------------------------------------------------------------------------
# RB features
# ---------------------------------------------------------------------------

RB_ONLY = (Position.RB,)

# Audited 2026-04-28 against the RB-analyst frameworks (JJ Zachariason,
# Hayden Winks, Eric Eager, Bill Connelly / SP+, Mike Clay / 4for4, Kevin
# Cole / OSF, PlayerProfiler, Pat Thorman, FFFaceoff PSI). The hard public-
# data ceiling is contact charting (PFF YACO / forced missed tackles /
# elusive rating) and defensive context (box count, snap share). RB_DEFERRED
# below enumerates those.
# NOTE: RB efficiency (EPA, success rate, opportunity rate) is OUTCOME LEAKAGE for v2 —
# it conflates production with archetype. RotoViz / PlayerProfiler / Zachariason ZAP all
# build similarity from VOLUME / market-share signals (College Dominator, weighted
# opportunity, yards-per-team-play) plus athletic profile, not efficiency. Efficiency
# features stay computed (for ablation/eval/methodology) but are excluded from similarity.
RB_FEATURES: list[FeatureSpec] = [
    # --- rushing efficiency (EXCLUDED from v2 similarity — outcome leakage) ---
    FeatureSpec("rb_epa_per_rush", RB_ONLY, "efficiency", "EPA per rush attempt — Eric Eager's preferred RB metric", "sum(ppa) / rush_attempts", ("cfbd_pbp",), layer=LAYER_EFFICIENCY),
    FeatureSpec("rb_success_rate", RB_ONLY, "efficiency", "Rush success rate (EPA > 0)", "count(ppa > 0) / rush_attempts", ("cfbd_pbp",), layer=LAYER_EFFICIENCY),
    FeatureSpec("rb_explosive_rate", RB_ONLY, "efficiency", "Explosive run rate (≥10 yards)", "count(rush_yds ≥ 10) / rush_attempts", ("cfbd_pbp",), layer=LAYER_EFFICIENCY),
    FeatureSpec("rb_stuff_rate", RB_ONLY, "efficiency", "Stuff rate (≤0 yards)", "count(rush_yds ≤ 0) / rush_attempts", ("cfbd_pbp",), layer=LAYER_EFFICIENCY),
    FeatureSpec("rb_opportunity_rate", RB_ONLY, "efficiency", "Opportunity rate — % of carries gaining ≥5 yards (Connelly / SP+)", "count(rush_yds ≥ 5) / rush_attempts", ("cfbd_pbp",), layer=LAYER_EFFICIENCY),
    FeatureSpec("rb_highlight_yards_per_opportunity", RB_ONLY, "efficiency", "Highlight yards / opportunity carry — RB-driven yards isolated from line yards (Connelly)", "sum(max(rush_yds - 5, 0)) on opportunity carries / opportunity carries", ("cfbd_pbp",), layer=LAYER_EFFICIENCY),
    # --- situational efficiency (EXCLUDED) ---
    FeatureSpec("rb_epa_per_rush_early_down", RB_ONLY, "situational", "EPA/rush on 1st & 2nd down", "filter to down ≤ 2", ("cfbd_pbp",), layer=LAYER_EFFICIENCY),
    FeatureSpec("rb_epa_per_rush_third_short", RB_ONLY, "situational", "EPA/rush on 3rd-and-short (≤2)", "filter to down=3 and ydstogo ≤ 2", ("cfbd_pbp",), layer=LAYER_EFFICIENCY),
    FeatureSpec("rb_expected_tds_minus_actual", RB_ONLY, "situational", "Actual TDs minus expected from yardline distribution (Mike Clay TD regression)", "actual_tds - sum(P(TD | yards_to_goal_bucket)) over career touches", ("cfbd_pbp",), layer=LAYER_EFFICIENCY),
    # --- receiving role: targets/game = volume; catch rate / yards/rec = efficiency ---
    FeatureSpec("rb_targets_per_game", RB_ONLY, "receiving", "Targets per game", "targets / games_played", ("cfbd_pbp",), layer=LAYER_VOLUME),
    FeatureSpec("rb_catch_rate", RB_ONLY, "receiving", "Catch rate", "receptions / targets", ("cfbd_pbp",), layer=LAYER_EFFICIENCY),
    FeatureSpec("rb_yards_per_reception", RB_ONLY, "receiving", "Yards per reception", "rec_yards / receptions", ("cfbd_pbp",), layer=LAYER_EFFICIENCY),
    FeatureSpec("rb_receiving_yards_per_game", RB_ONLY, "receiving", "Receiving yards per game — Cole: 3× the predictive coefficient of rushing yards/game", "rec_yards / games_played", ("cfbd_pbp",), layer=LAYER_VOLUME),
    FeatureSpec("rb_receiving_yards_share", RB_ONLY, "receiving", "Share of team's receiving yards", "rec_yards / team_rec_yards", ("cfbd_pbp",), layer=LAYER_VOLUME),
    # --- workload (VOLUME — Mike Clay / Zachariason canonical) ---
    FeatureSpec("rb_weighted_opportunity_per_game", RB_ONLY, "volume", "Weighted opportunity per game (Mike Clay) — gold-standard RB workload", "(rush_att + 2 × targets) / games_played", ("cfbd_pbp",), layer=LAYER_VOLUME),
    FeatureSpec("rb_workload_concentration", RB_ONLY, "volume", "Average season share of team rushing yards — bell-cow vs committee proxy", "mean over seasons of player_rush_yds / team_rush_yds", ("cfbd_pbp",), layer=LAYER_VOLUME),
    FeatureSpec("rb_yards_per_team_play", RB_ONLY, "volume", "Career scrimmage yards per team play — Zachariason's #1 single predictor", "career (rush_yds + rec_yds) / team plays during team-seasons", ("cfbd_pbp",), layer=LAYER_VOLUME),
    # --- trajectory: final-year dominator is market share = VOLUME ---
    FeatureSpec("rb_final_year_dominator", RB_ONLY, "trajectory", "Final-season scrimmage-yards share of team — current-state signal (Cole, Winks)", "(rush_yds + rec_yds) / team scrimmage yards in final season", ("cfbd_pbp",), layer=LAYER_VOLUME),
]


# RB specs that need contact charting, box count, or snap data — none of
# which exist in free public PBP. Documented here for the methodology page
# to render the explicit public-data gap. NOT included in CATALOG.
RB_DEFERRED: list[FeatureSpec] = [
    # PFF / SIS contact charting
    FeatureSpec("rb_pff_rushing_grade", RB_ONLY, "deferred", "PFF rushing grade (play-by-play graded)", "PFF play-graded sum", ("PFF",)),
    FeatureSpec("rb_forced_missed_tackles_per_attempt", RB_ONLY, "deferred", "Forced missed tackles per attempt — primary RB-driven yards signal", "FMT / attempts", ("PFF",)),
    FeatureSpec("rb_yards_after_contact_per_attempt", RB_ONLY, "deferred", "Yards after contact per attempt", "YACO / attempts", ("PFF",)),
    FeatureSpec("rb_elusive_rating", RB_ONLY, "deferred", "PFF Elusive Rating composite", "(FMT / touches) × (YACO × 100)", ("PFF",)),
    # Defensive box count not in CFBD
    FeatureSpec("rb_yards_over_expected", RB_ONLY, "deferred", "Yards over expected per rush — needs box count + expected-yards model", "actual_yards - expected_yards(box, situation)", ("nflverse_nextgen",)),
    FeatureSpec("rb_perf_vs_stacked_box", RB_ONLY, "deferred", "EPA/rush vs 8+ in box", "filter to box ≥ 8", ("nflverse_nextgen",)),
    FeatureSpec("rb_perf_vs_light_box", RB_ONLY, "deferred", "EPA/rush vs ≤6 in box", "filter to box ≤ 6", ("nflverse_nextgen",)),
    # Snap data not in CFBD
    FeatureSpec("rb_snap_share_peak", RB_ONLY, "deferred", "Peak season snap share", "max season snap_share", ("PFF",)),
    FeatureSpec("rb_route_participation_proxy", RB_ONLY, "deferred", "Snaps with a route run / total snaps", "route_snaps / total_snaps", ("PFF",)),
    # YAC not derivable from playText
    FeatureSpec("rb_yac_per_reception", RB_ONLY, "deferred", "YAC per reception", "sum(yac) / receptions", ("PFF/SIS",)),
]

# ---------------------------------------------------------------------------
# WR features
# ---------------------------------------------------------------------------

WR_ONLY = (Position.WR,)

# Audited 2026-04-28 against the WR-analyst frameworks (Reception Perception,
# Hayden Winks, JJ Zachariason, Eric Eager / SumerSports, PFF, PlayerProfiler,
# Mockdraftable, Open Source Football, Peter Howard, Campus2Canton, Ryan Heath,
# Jakob Sanderson). The hard public-data ceiling is route counts and coverage
# labels (man/zone/press/off) — neither exists in CFBD. The community's
# workaround is per-team-pass-attempt denominators (RYPTPA / TPTPA / 1DPTPA)
# as the college analogue of PFF's per-route metrics. WR_DEFERRED below
# enumerates the specs we cannot compute without paid charting.
# NOTE: WR similarity in v2 is anchored on market-share / per-team-pass-attempt features
# (DuPont, Siegele, Howard, Campus2Canton, Heath consensus). Per-target efficiency (EPA,
# success rate, rating, target premium) is excluded — it leaks the outcome we're trying
# to project. Per-team-attempt features (RYPTPA / TPTPA / 1DPTPA) are the public-data
# analogue of PFF's per-route metrics and ARE volume-context, not efficiency.
WR_FEATURES: list[FeatureSpec] = [
    # --- per-team-pass-attempt family (VOLUME — Howard / C2C / Heath canonical) ---
    FeatureSpec("wr_ryptpa", WR_ONLY, "opportunity", "Receiving yards per team pass attempt — public-data analogue of PFF YPRR", "career rec_yards / team pass attempts (across his team-seasons)", ("cfbd_pbp",), layer=LAYER_VOLUME),
    FeatureSpec("wr_tptpa", WR_ONLY, "opportunity", "Targets per team pass attempt — proxy for target-per-route", "career targets / team pass attempts", ("cfbd_pbp",), layer=LAYER_VOLUME),
    FeatureSpec("wr_1dptpa", WR_ONLY, "opportunity", "First downs per team pass attempt — Campus2Canton 1DRR analogue", "career first downs via reception / team pass attempts", ("cfbd_pbp",), layer=LAYER_VOLUME),
    # --- volume / opportunity ---
    FeatureSpec("wr_targets_per_game", WR_ONLY, "opportunity", "Targets per game", "targets / games_played", ("cfbd_pbp",), layer=LAYER_VOLUME),
    # --- production (per-game = workload-context, VOLUME) ---
    FeatureSpec("wr_yards_per_game", WR_ONLY, "production", "Receiving yards per game", "rec_yards / games_played", ("cfbd_pbp",), layer=LAYER_VOLUME),
    FeatureSpec("wr_rec_per_game", WR_ONLY, "production", "Receptions per game", "receptions / games_played", ("cfbd_pbp",), layer=LAYER_VOLUME),
    FeatureSpec("wr_td_per_game", WR_ONLY, "production", "Receiving TDs per game", "rec_tds / games_played", ("cfbd_pbp",), layer=LAYER_VOLUME),
    FeatureSpec("wr_big_play_rate", WR_ONLY, "production", "Big-play rate (≥20 yard receptions per game)", "count(rec_yds ≥ 20) / games_played", ("cfbd_pbp",), layer=LAYER_VOLUME),
    FeatureSpec("wr_first_down_per_rec", WR_ONLY, "production", "First-down rate per reception", "first_downs_via_rec / receptions", ("cfbd_pbp",), layer=LAYER_EFFICIENCY),
    # --- efficiency (EXCLUDED — outcome leakage) ---
    FeatureSpec("wr_catch_rate", WR_ONLY, "efficiency", "Catch rate", "receptions / targets", ("cfbd_pbp",), layer=LAYER_EFFICIENCY),
    FeatureSpec("wr_epa_per_target", WR_ONLY, "efficiency", "EPA per target — Eric Eager's target-level efficiency metric", "sum(ppa) on attributed targets / targets", ("cfbd_pbp",), layer=LAYER_EFFICIENCY),
    FeatureSpec("wr_success_rate", WR_ONLY, "efficiency", "Share of targets with positive EPA", "targets where ppa > 0 / targets", ("cfbd_pbp",), layer=LAYER_EFFICIENCY),
    FeatureSpec("wr_rating", WR_ONLY, "efficiency", "Passer rating when targeted (PFF WR Rating concept)", "NFL passer rating formula applied to targets-as-attempts", ("cfbd_pbp",), layer=LAYER_EFFICIENCY),
    # --- premium / above-teammate ---
    FeatureSpec("wr_target_premium", WR_ONLY, "premium", "Player YPT minus teammate YPT — isolates 'is he better than his teammates'", "player yards/target - team yards/target (excl. self)", ("cfbd_pbp",), layer=LAYER_EFFICIENCY),
    FeatureSpec("wr_yards_above_teammate_pct", WR_ONLY, "premium", "Career rec yards as fraction of team's top WR — Hog Rate without snap-share", "self_rec_yards / max_teammate_rec_yards (per team-season, then averaged)", ("cfbd_pbp",), layer=LAYER_VOLUME),
    # --- situational market share (VOLUME — share of team's targets in high-leverage spots) ---
    FeatureSpec("wr_third_down_target_share", WR_ONLY, "situational", "Share of team's 3rd-down targets — trust signal", "self 3rd-down targets / team 3rd-down targets", ("cfbd_pbp",), layer=LAYER_VOLUME),
    FeatureSpec("wr_red_zone_target_share", WR_ONLY, "situational", "Share of team's red-zone targets — TD-equity signal", "self RZ targets / team RZ targets", ("cfbd_pbp",), layer=LAYER_VOLUME),
    # --- trajectory: dominator + breakout = VOLUME (DuPont/Siegele); slopes = TRAJECTORY ---
    FeatureSpec("wr_breakout_age_dominator", WR_ONLY, "trajectory", "Age at first season with dominator ≥ 0.20 (Hayden Winks standard)", "min age where season dominator ≥ 0.20", ("cfbd_pbp",), layer=LAYER_VOLUME),
    FeatureSpec("wr_target_share_yoy_slope", WR_ONLY, "trajectory", "YoY target share slope", "linear regression slope across seasons", ("cfbd_pbp",), layer=LAYER_TRAJECTORY),
    FeatureSpec("wr_dominator_peak", WR_ONLY, "trajectory", "Peak season dominator rating (rec yds + TDs share)", "max_season((rec_yards_share + rec_td_share) / 2)", ("cfbd_pbp",), layer=LAYER_VOLUME),
    FeatureSpec("wr_career_yards_slope", WR_ONLY, "trajectory", "YoY slope of receiving yards per game", "linear regression slope of yds/game by season", ("cfbd_pbp",), layer=LAYER_TRAJECTORY),
    FeatureSpec("wr_final_year_dominator", WR_ONLY, "trajectory", "Most recent season's dominator rating — current-state signal", "(rec_yards_share + rec_td_share) / 2 in final season", ("cfbd_pbp",), layer=LAYER_VOLUME),
]


# WR specs we could compute with paid charting / route data but cannot derive
# from free public play-by-play. Documented here so the methodology page can
# render the public-data ceiling explicitly. NOT included in CATALOG.
WR_DEFERRED: list[FeatureSpec] = [
    # No air yards in CFBD playText (only final yardline).
    FeatureSpec("wr_air_yards_share", WR_ONLY, "deferred", "Career air yards share", "sum(air_yards) / team_air_yards", ("PFF/SIS",)),
    FeatureSpec("wr_wopr", WR_ONLY, "deferred", "Hermsmeyer WOPR — depends on air_yards_share", "1.5*tgt_share + 0.7*ay_share", ("PFF/SIS",)),
    FeatureSpec("wr_adot", WR_ONLY, "deferred", "Average depth of target", "mean(air_yards) over targets", ("PFF/SIS",)),
    # No route counts in CFBD.
    FeatureSpec("wr_yprr", WR_ONLY, "deferred", "Yards per route run — PFF flagship metric", "rec_yards / routes_run", ("PFF",)),
    FeatureSpec("wr_targets_per_route", WR_ONLY, "deferred", "Targets per route run", "targets / routes_run", ("PFF",)),
    # No YAC signal in CFBD playText (final yardline only, not catch location).
    FeatureSpec("wr_yac_per_reception", WR_ONLY, "deferred", "YAC per reception", "sum(yac) / receptions", ("PFF/SIS",)),
    FeatureSpec("wr_yac_over_expected", WR_ONLY, "deferred", "Baldwin's xYAC residual — needs catch location + defender model", "actual_yac - model_yac", ("nflverse_nextgen",)),
    # No catchable / contested labels in any free source.
    FeatureSpec("wr_drop_rate_proxy", WR_ONLY, "deferred", "Drop rate", "drops / catchable targets", ("PFF/SIS",)),
    # No formation data in CFBD.
    FeatureSpec("wr_slot_rate_proxy", WR_ONLY, "deferred", "Slot snap share", "slot_snaps / total_offensive_snaps", ("PFF/nextgen",)),
    FeatureSpec("wr_outside_rate_proxy", WR_ONLY, "deferred", "Wide/outside snap share", "outside_snaps / total_offensive_snaps", ("PFF/nextgen",)),
    FeatureSpec("wr_personnel_11_share", WR_ONLY, "deferred", "Share of snaps in 11 personnel", "snaps_in_11 / total_snaps", ("PFF/nextgen",)),
    FeatureSpec("wr_motion_rate_proxy", WR_ONLY, "deferred", "Pre-snap motion rate", "motion_snaps / total_snaps", ("PFF/nextgen",)),
    # Replaced by wr_breakout_age_dominator (Winks standard) — YPRR-anchored
    # version requires route counts.
    FeatureSpec("wr_breakout_age_yprr", WR_ONLY, "deferred", "Age at first 2.0+ YPRR season", "min age where season YPRR ≥ 2.0", ("PFF",)),
]

# ---------------------------------------------------------------------------
# TE features (limited public data — fewer features but still meaningful)
# ---------------------------------------------------------------------------

TE_ONLY = (Position.TE,)

# CFBD playText doesn't differentiate TE from WR — no formation, blocking,
# or route data. Same 22 receiver-math features as WR (te_ prefix); the
# position-conditioned cohort distributions in Phase 2 will let the embedding
# distinguish a TE getting 8 yds/target from a WR getting 8 yds/target.
# Position-specific TE features (in-line/flexed/blocking) live in
# TE_DEFERRED — public-data-impossible.
# TE follows the same WR layering — VOLUME (per-team-attempt + market share + dominator)
# carries the similarity weight; per-target efficiency is excluded as outcome leakage.
TE_FEATURES: list[FeatureSpec] = [
    # --- per-team-pass-attempt family ---
    FeatureSpec("te_ryptpa", TE_ONLY, "opportunity", "Receiving yards per team pass attempt", "career rec_yards / team pass attempts", ("cfbd_pbp",), layer=LAYER_VOLUME),
    FeatureSpec("te_tptpa", TE_ONLY, "opportunity", "Targets per team pass attempt", "career targets / team pass attempts", ("cfbd_pbp",), layer=LAYER_VOLUME),
    FeatureSpec("te_1dptpa", TE_ONLY, "opportunity", "First downs per team pass attempt", "career first downs / team pass attempts", ("cfbd_pbp",), layer=LAYER_VOLUME),
    # --- volume / opportunity ---
    FeatureSpec("te_targets_per_game", TE_ONLY, "opportunity", "Targets per game", "targets / games_played", ("cfbd_pbp",), layer=LAYER_VOLUME),
    # --- production (per-game = workload-context, VOLUME) ---
    FeatureSpec("te_yards_per_game", TE_ONLY, "production", "Receiving yards per game", "rec_yards / games_played", ("cfbd_pbp",), layer=LAYER_VOLUME),
    FeatureSpec("te_rec_per_game", TE_ONLY, "production", "Receptions per game", "receptions / games_played", ("cfbd_pbp",), layer=LAYER_VOLUME),
    FeatureSpec("te_td_per_game", TE_ONLY, "production", "Receiving TDs per game", "rec_tds / games_played", ("cfbd_pbp",), layer=LAYER_VOLUME),
    FeatureSpec("te_big_play_rate", TE_ONLY, "production", "Big-play rate (≥20 yard receptions per game)", "count(rec_yds ≥ 20) / games_played", ("cfbd_pbp",), layer=LAYER_VOLUME),
    FeatureSpec("te_first_down_per_rec", TE_ONLY, "production", "First-down rate per reception", "first_downs_via_rec / receptions", ("cfbd_pbp",), layer=LAYER_EFFICIENCY),
    # --- efficiency (EXCLUDED) ---
    FeatureSpec("te_catch_rate", TE_ONLY, "efficiency", "Catch rate", "receptions / targets", ("cfbd_pbp",), layer=LAYER_EFFICIENCY),
    FeatureSpec("te_epa_per_target", TE_ONLY, "efficiency", "EPA per target", "sum(ppa) / targets", ("cfbd_pbp",), layer=LAYER_EFFICIENCY),
    FeatureSpec("te_success_rate", TE_ONLY, "efficiency", "Share of targets with positive EPA", "targets where ppa > 0 / targets", ("cfbd_pbp",), layer=LAYER_EFFICIENCY),
    FeatureSpec("te_rating", TE_ONLY, "efficiency", "Passer rating when targeted (PFF Rating concept)", "NFL passer rating formula on targets-as-attempts", ("cfbd_pbp",), layer=LAYER_EFFICIENCY),
    # --- premium / above-teammate ---
    FeatureSpec("te_target_premium", TE_ONLY, "premium", "Player YPC minus teammate YPC — isolates 'better than his teammates'", "player yards/rec - team yards/rec (excl. self)", ("cfbd_pbp",), layer=LAYER_EFFICIENCY),
    FeatureSpec("te_yards_above_teammate_pct", TE_ONLY, "premium", "Career rec yards as fraction of team's top non-self receiver", "self_rec_yards / max_teammate_rec_yards (per team-season, then averaged)", ("cfbd_pbp",), layer=LAYER_VOLUME),
    # --- situational market share ---
    FeatureSpec("te_third_down_target_share", TE_ONLY, "situational", "Share of team's 3rd-down targets", "self 3rd-down targets / team 3rd-down targets", ("cfbd_pbp",), layer=LAYER_VOLUME),
    FeatureSpec("te_red_zone_target_share", TE_ONLY, "situational", "Share of team's red-zone targets", "self RZ targets / team RZ targets", ("cfbd_pbp",), layer=LAYER_VOLUME),
    # --- trajectory: dominator + breakout = VOLUME; slopes = TRAJECTORY ---
    FeatureSpec("te_breakout_age_dominator", TE_ONLY, "trajectory", "Age at first season with dominator ≥ 0.20", "min age where season dominator ≥ 0.20", ("cfbd_pbp",), layer=LAYER_VOLUME),
    FeatureSpec("te_target_share_yoy_slope", TE_ONLY, "trajectory", "YoY target share slope", "linear regression slope across seasons", ("cfbd_pbp",), layer=LAYER_TRAJECTORY),
    FeatureSpec("te_dominator_peak", TE_ONLY, "trajectory", "Peak season dominator rating (rec yds + TDs share)", "max_season((rec_yards_share + rec_td_share) / 2)", ("cfbd_pbp",), layer=LAYER_VOLUME),
    FeatureSpec("te_career_yards_slope", TE_ONLY, "trajectory", "YoY slope of receiving yards per game", "linear regression slope of yds/game by season", ("cfbd_pbp",), layer=LAYER_TRAJECTORY),
    FeatureSpec("te_final_year_dominator", TE_ONLY, "trajectory", "Most recent season's dominator rating", "(rec_yards_share + rec_td_share) / 2 in final season", ("cfbd_pbp",), layer=LAYER_VOLUME),
]


# TE-specific specs that need formation, snap, or blocking data. Public PBP
# has none of this. Documented for the methodology page.
TE_DEFERRED: list[FeatureSpec] = [
    FeatureSpec("te_inline_rate", TE_ONLY, "deferred", "Inline (attached) snap rate", "inline_snaps / total_snaps", ("PFF/nextgen",)),
    FeatureSpec("te_flexed_rate", TE_ONLY, "deferred", "Flexed/slot snap rate", "flexed_snaps / total_snaps", ("PFF/nextgen",)),
    FeatureSpec("te_route_participation", TE_ONLY, "deferred", "Snaps with a route run / total snaps", "route_snaps / total_snaps", ("PFF",)),
    FeatureSpec("te_blocking_exposure", TE_ONLY, "deferred", "Inline-and-no-route snap rate (run-block proxy)", "inline_no_route_snaps / total_snaps", ("PFF",)),
    FeatureSpec("te_two_way_index", TE_ONLY, "deferred", "Composite of receiving production + blocking exposure", "z(rec_production) + 0.5 * z(blocking_exposure)", ("PFF",)),
    FeatureSpec("te_targets_per_route", TE_ONLY, "deferred", "Targets per route run", "targets / routes_run", ("PFF",)),
    FeatureSpec("te_air_yards_per_route", TE_ONLY, "deferred", "Air yards per route run", "sum(air_yards) / routes_run", ("PFF/SIS",)),
    FeatureSpec("te_yac_per_reception", TE_ONLY, "deferred", "YAC per reception", "sum(yac) / receptions", ("PFF/SIS",)),
]

# ---------------------------------------------------------------------------
# Aggregate registry
# ---------------------------------------------------------------------------

CATALOG: list[FeatureSpec] = (
    UNIVERSAL + QB_FEATURES + RB_FEATURES + WR_FEATURES + TE_FEATURES
)


def features_for(position: Position) -> list[FeatureSpec]:
    """All features applicable to a given position."""
    return [f for f in CATALOG if position in f.positions]


def features_by_group(group: str) -> list[FeatureSpec]:
    """All features in a given group across positions."""
    return [f for f in CATALOG if f.group == group]


def features_by_source(source: str) -> list[FeatureSpec]:
    """All features that depend on a given data source."""
    return [f for f in CATALOG if source in f.requires]


def feature_names_for(position: Position) -> set[str]:
    """Just the names — handy for validation against `PlayerProfile.features`."""
    return {f.name for f in features_for(position)}


def features_in_layer(layer: str, position: Position) -> list[FeatureSpec]:
    """All catalog features in a given archetype layer for one position."""
    return [f for f in features_for(position) if f.layer == layer]


def feature_names_in_layer(layer: str, position: Position) -> set[str]:
    """Just the names of catalog features in a given archetype layer for one position."""
    return {f.name for f in features_in_layer(layer, position)}


# Per-position similarity layer composition for v2.
# BODY + VOLUME + DRAFT + TRAITS for all positions; QB additionally includes EFFICIENCY
# (per QBASE 2.0). TRAITS is the Sonnet-extracted scouting archetype layer (replaces blunt
# Titan-on-prose). DRAFT carries the opportunity signal (CARMELO precedent + QBASE 2.0).
# TRAJECTORY/CONTEXT/EXCLUDED stay out of similarity but remain computed for ablation.
V2_SIMILARITY_LAYERS: dict[Position, tuple[str, ...]] = {
    Position.QB: (LAYER_BODY, LAYER_VOLUME, LAYER_EFFICIENCY, LAYER_DRAFT, LAYER_TRAITS),
    Position.RB: (LAYER_BODY, LAYER_VOLUME, LAYER_DRAFT, LAYER_TRAITS),
    Position.WR: (LAYER_BODY, LAYER_VOLUME, LAYER_DRAFT, LAYER_TRAITS),
    Position.TE: (LAYER_BODY, LAYER_VOLUME, LAYER_DRAFT, LAYER_TRAITS),
}


def v2_similarity_layers(position: Position) -> tuple[str, ...]:
    """Layers that participate in v2 similarity for a given position."""
    return V2_SIMILARITY_LAYERS.get(position, (LAYER_BODY, LAYER_VOLUME))


# Per-position layer weights for v2 similarity. Locked 2026-04-30 PM.
#
# Sourced from a constrained grid search over the validation cohort (n=398
# across 4 positions, 0.05-increment grid summing to 1.0, DRAFT capped at 0.30
# to prevent outcome-leakage collapse — see methodology/draft_capital_research
# _2026_04_30.md for the rationale). The unconstrained search optimum drove
# DRAFT to 0.80-0.90 for QB/WR, which would collapse the engine into a
# draft-tier predictor — the exact PlayerProfiler "double-counting" failure
# mode. Capping at 0.30 keeps draft capital as a meaningful contributor
# without letting it dominate the archetype signal. Sensitivity table:
# methodology/weight_sensitivity_capped_20260430.txt.
#
# Surprises worth flagging on the methodology page:
#   - QB BODY=0: athletic measurables do not help QB outcome prediction (cf.
#     QBASE 2.0 which deprioritizes size for QB).
#   - RB VOLUME=0: contrary to the DuPont/Siegele "workload IS RB identity"
#     framework — the grid finds Sonnet trait scores capture the bell-cow vs
#     committee distinction implicitly, making explicit volume features
#     redundant for outcome prediction.
#   - WR DRAFT=0.05: WR is the only position where high DRAFT weight does not
#     beat a balanced production-heavy config; consistent with WR draft slot
#     being a noisier outcome signal than QB/RB/TE.
V2_LAYER_WEIGHTS: dict[Position, dict[str, float]] = {
    # QB (5 layers): EFFICIENCY + TRAITS + DRAFT + VOLUME, no BODY.
    # Grid winner: capped DRAFT, balanced rest. QBASE 2.0 alignment (efficiency
    # central + draft position central + size de-prioritized).
    Position.QB: {
        LAYER_DRAFT: 0.30,
        LAYER_EFFICIENCY: 0.25,
        LAYER_TRAITS: 0.25,
        LAYER_VOLUME: 0.20,
        LAYER_BODY: 0.00,
    },
    # RB: TRAITS-dominant, DRAFT-capped, BODY-light, VOLUME=0. Trait scores
    # encode workload archetype implicitly; explicit volume features add no
    # marginal lift on outcome prediction.
    Position.RB: {
        LAYER_TRAITS: 0.60,
        LAYER_DRAFT: 0.25,
        LAYER_BODY: 0.15,
        LAYER_VOLUME: 0.00,
    },
    # WR: TRAITS + VOLUME co-dominant, BODY light, DRAFT minimal.
    # Override note: the unconstrained grid search winner (VOLUME=0.65,
    # TRAITS=0.15) optimized outcome accuracy but produced bust-cluster
    # collapse on the elite Tate smoke query (5/10 comps were busts). Re-ran
    # the WR grid with TRAITS ≥ 0.30 floor (methodologically anchored to
    # Reception Perception + DuPont's emphasis on archetype + market share);
    # picked the best config in that subspace that also keeps DRAFT > 0
    # (architectural consistency). Cost: ~5pp WR outcome accuracy vs grid
    # winner. Win: visibly better elite WR archetype clusters.
    # Sensitivity: methodology/weight_sensitivity_WR_traits_min_20260430.txt.
    Position.WR: {
        LAYER_TRAITS: 0.45,
        LAYER_VOLUME: 0.35,
        LAYER_BODY: 0.15,
        LAYER_DRAFT: 0.05,
    },
    # TE: TRAITS + DRAFT (capped) + VOLUME, BODY-light. Receiving-TE archetype
    # captured well by Sonnet traits; draft tier matters at the cap; modest
    # volume signal.
    Position.TE: {
        LAYER_TRAITS: 0.45,
        LAYER_DRAFT: 0.30,
        LAYER_VOLUME: 0.20,
        LAYER_BODY: 0.05,
    },
}


def v2_layer_weights(position: Position) -> dict[str, float]:
    """Per-layer weights for the v2 similarity combiner. Sum to 1.0."""
    return V2_LAYER_WEIGHTS.get(
        position,
        {LAYER_VOLUME: 0.65, LAYER_BODY: 0.15, LAYER_TRAITS: 0.15, LAYER_DRAFT: 0.05},
    )
