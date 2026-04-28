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
"""

from __future__ import annotations

from dataclasses import dataclass, field

from engine.schema import Position

ALL = (Position.QB, Position.RB, Position.WR, Position.TE)


@dataclass(frozen=True)
class FeatureSpec:
    name: str
    positions: tuple[Position, ...]
    group: str
    description: str
    formula: str
    requires: tuple[str, ...] = field(default_factory=tuple)


# ---------------------------------------------------------------------------
# Universal features (athletic measurables, schedule context, trajectory)
# ---------------------------------------------------------------------------

UNIVERSAL: list[FeatureSpec] = [
    # --- athletic z-scores / percentiles vs position cohort ---
    FeatureSpec("forty_pct", ALL, "athletic", "40-yard dash percentile vs position cohort", "z-score, then ECDF percentile", ("combine",)),
    FeatureSpec("vertical_pct", ALL, "athletic", "Vertical jump percentile vs position cohort", "z-score → ECDF", ("combine",)),
    FeatureSpec("broad_jump_pct", ALL, "athletic", "Broad jump percentile", "z-score → ECDF", ("combine",)),
    FeatureSpec("three_cone_pct", ALL, "athletic", "3-cone drill percentile (lower raw = better)", "negate → z-score → ECDF", ("combine",)),
    FeatureSpec("shuttle_pct", ALL, "athletic", "Short shuttle percentile (lower raw = better)", "negate → z-score → ECDF", ("combine",)),
    FeatureSpec("bench_pct", ALL, "athletic", "Bench press reps percentile", "z-score → ECDF", ("combine",)),
    FeatureSpec("height_pct", ALL, "athletic", "Height percentile vs position cohort", "z-score → ECDF", ("combine",)),
    FeatureSpec("weight_pct", ALL, "athletic", "Weight percentile vs position cohort", "z-score → ECDF", ("combine",)),
    FeatureSpec("bmi", ALL, "athletic", "Body mass index", "703 * lbs / (in^2)", ("combine",)),
    # --- composite athletic indices ---
    FeatureSpec("ras_score", ALL, "athletic", "Relative Athletic Score (Kent Lee Platte)", "averaged drill percentiles, 0-10 scale", ("ras",)),
    FeatureSpec("speed_score", (Position.RB, Position.WR), "athletic", "Bill Barnwell speed score", "weight * 200 / (40^4)", ("combine",)),
    FeatureSpec("burst_score", ALL, "athletic", "Vertical + broad jump (lower-body explosive index)", "vertical_inches + broad_jump_inches", ("combine",)),
    FeatureSpec("agility_score", ALL, "athletic", "3-cone + shuttle (change-of-direction index)", "three_cone + shuttle (lower = better)", ("combine",)),
    FeatureSpec("catch_radius", (Position.WR, Position.TE), "athletic", "Effective catch radius proxy", "height_inches + arm_length_inches", ("combine",)),
    # --- composite athletic indices (custom) ---
    FeatureSpec("forty_per_pound", (Position.RB, Position.WR, Position.TE), "athletic", "Weight-adjusted forty (size-fast vs flat-fast)", "forty * sqrt(weight / 200)", ("combine",)),
    FeatureSpec("athletic_composite", ALL, "athletic", "Geometric mean of available drill percentiles (own RAS)", "geo_mean over available {forty,vert,broad,cone,shuttle,bench}_pct", ("combine",)),
    # --- recruiting pedigree ---
    FeatureSpec("recruit_composite_pct", ALL, "background", "247Sports composite recruit rating percentile", "ECDF over CFBD recruit rankings", ("cfbd_recruit",)),
    FeatureSpec("recruit_star_rating", ALL, "background", "Star rating out of high school (3-5)", "raw star rating", ("cfbd_recruit",)),
    FeatureSpec("recruiting_to_draft_delta", ALL, "background", "Riser/faller signal: draft capital pct minus recruit composite pct", "draft_capital_pct - recruit_composite_pct (range -1..+1)", ("cfbd_recruit", "nflverse_player")),
    FeatureSpec("weight_change_recruit_to_draft", ALL, "background", "Body-comp development from HS recruiting to combine", "draft_weight_lbs - recruit_weight_lbs", ("cfbd_recruit", "combine")),
    # --- college longevity / context ---
    FeatureSpec("college_seasons", ALL, "background", "Number of seasons played in college", "count of distinct seasons with snap > 0", ("cfbd_box",)),
    FeatureSpec("transferred", ALL, "background", "Whether player transferred during college", "1 if multiple schools in record, else 0", ("cfbd_box",)),
    FeatureSpec("conference_p5", ALL, "background", "Played most career snaps in a Power-5 conference", "1/0 indicator", ("cfbd_box",)),
    FeatureSpec("age_at_draft", ALL, "background", "Age in decimal years at draft date", "draft_date - birth_date", ("nflverse_player",)),
    FeatureSpec("age_at_draft_pct", ALL, "background", "Age-at-draft percentile within position cohort (lower = younger = better)", "1 - ECDF(age_at_draft) within position", ("nflverse_player",)),
    FeatureSpec("days_since_birthday_at_draft", ALL, "background", "Refines age_at_draft with within-year fraction", "draft_date.day_of_year - birth_date.day_of_year (mod 365)", ("nflverse_player",)),
    FeatureSpec("draft_capital_pct", ALL, "background", "Inverse draft pick percentile (higher = earlier)", "1 - (pick / 256)", ("nflverse_player",)),
    # --- schedule strength / opposition quality ---
    FeatureSpec("sos_mean", ALL, "context", "Career mean strength of schedule (SP+ rating of opponents)", "weighted mean opponent SP+ across all games", ("cfbd_box",)),
    FeatureSpec("share_vs_ranked", ALL, "context", "Share of games played against AP-ranked opponents", "ranked_games / total_games", ("cfbd_box",)),
    FeatureSpec("perf_vs_ranked_delta", ALL, "context", "Production rate delta vs ranked opponents", "(rate vs ranked) - (rate vs unranked), normalized", ("cfbd_box",)),
    FeatureSpec("perf_in_bowl_games", ALL, "context", "Production in bowl/playoff games (z vs season avg)", "z-score of bowl-game production vs regular season", ("cfbd_box",)),
    FeatureSpec("perf_road_delta", ALL, "context", "Production rate delta in road games", "(road rate) - (home rate), normalized", ("cfbd_box",)),
    FeatureSpec("team_quality_at_breakout", ALL, "context", "SP+ rating of player's college team during peak season", "sp_rating(team, breakout_season)", ("cfbd_box",)),
    FeatureSpec("returning_production_role", ALL, "context", "Share of team's offensive production in player's final season", "(player rec_yds + rush_yds + 0.5*pass_yds) / team total in final season", ("cfbd_box",)),
    # --- career arc / trajectory ---
    FeatureSpec("career_trend_slope", ALL, "trajectory", "Slope of season-over-season production rate", "linear regression slope of EPA/play (or position-equivalent) by season", ("cfbd_pbp",)),
    FeatureSpec("best_season_age", ALL, "trajectory", "Age at peak-production season", "argmax over season age vs production index", ("cfbd_pbp",)),
    FeatureSpec("final_year_z", ALL, "trajectory", "Final-season production z-score vs college career", "z-score of final season vs all college seasons", ("cfbd_pbp",)),
    FeatureSpec("consistency", ALL, "trajectory", "Inverse coefficient of variation of season production", "1 / (stdev / mean) over college seasons, clipped", ("cfbd_pbp",)),
    FeatureSpec("breakout_age", ALL, "trajectory", "Age at first season with elite production (top-quartile in pos cohort)", "min age where season percentile > 75 in cohort", ("cfbd_pbp",)),
    FeatureSpec("dominator_rating", (Position.WR, Position.TE, Position.RB), "trajectory", "Share of team production captured at peak", "max season share of team's relevant production", ("cfbd_box",)),
    FeatureSpec("late_career_growth", ALL, "trajectory", "Final-year minus rookie-year production rate", "production_rate(final) - production_rate(first)", ("cfbd_pbp",)),
    FeatureSpec("age_adjusted_dominator", (Position.WR, Position.TE, Position.RB), "trajectory", "Dominator weighted by youth at breakout (Hayden Winks-style)", "dominator_rating * (1 + 0.05 * (22 - breakout_age))", ("cfbd_box",)),
    FeatureSpec("production_variance_ratio", ALL, "trajectory", "Coefficient of variation of season-to-season production (boom/bust separator)", "stdev(season_production) / mean(season_production), clipped 0..3", ("cfbd_box",)),
]

# ---------------------------------------------------------------------------
# QB features
# ---------------------------------------------------------------------------

QB_ONLY = (Position.QB,)

QB_FEATURES: list[FeatureSpec] = [
    # --- efficiency: overall ---
    FeatureSpec("qb_epa_per_db", QB_ONLY, "efficiency", "EPA per dropback (career)", "sum(epa where pass_or_scramble) / dropbacks", ("cfbd_pbp",)),
    FeatureSpec("qb_success_rate", QB_ONLY, "efficiency", "Dropback success rate (EPA > 0)", "count(epa>0) / dropbacks", ("cfbd_pbp",)),
    FeatureSpec("qb_completion_pct", QB_ONLY, "efficiency", "Career completion percentage", "completions / attempts", ("cfbd_pbp",)),
    FeatureSpec("qb_cpoe", QB_ONLY, "efficiency", "Completion percentage over expected", "actual_cp - model_expected_cp(aDOT, distance, situation)", ("cfbd_pbp",)),
    FeatureSpec("qb_yards_per_attempt", QB_ONLY, "efficiency", "Career Y/A", "pass_yards / attempts", ("cfbd_pbp",)),
    FeatureSpec("qb_adjusted_ypa", QB_ONLY, "efficiency", "Adjusted Y/A: (yards + 20*TD - 45*INT) / attempts", "PFR formula", ("cfbd_pbp",)),
    FeatureSpec("qb_adot", QB_ONLY, "efficiency", "Average depth of target", "mean(air_yards) over attempts", ("cfbd_pbp",)),
    FeatureSpec("qb_air_yards_per_attempt", QB_ONLY, "efficiency", "Air yards per attempt", "sum(air_yards) / attempts", ("cfbd_pbp",)),
    FeatureSpec("qb_yac_per_completion", QB_ONLY, "efficiency", "YAC per completion", "sum(yac) / completions", ("cfbd_pbp",)),
    # --- efficiency: situational splits ---
    FeatureSpec("qb_epa_per_db_3rd_down", QB_ONLY, "situational", "EPA/dropback on 3rd down", "filter to down=3", ("cfbd_pbp",)),
    FeatureSpec("qb_epa_per_db_4th_down", QB_ONLY, "situational", "EPA/dropback on 4th down", "filter to down=4", ("cfbd_pbp",)),
    FeatureSpec("qb_epa_per_db_red_zone", QB_ONLY, "situational", "EPA/dropback in red zone (yardline ≤ 20)", "filter to yardline_100 ≤ 20", ("cfbd_pbp",)),
    FeatureSpec("qb_epa_per_db_leading", QB_ONLY, "situational", "EPA/dropback when leading (margin > 0)", "filter to score_diff > 0", ("cfbd_pbp",)),
    FeatureSpec("qb_epa_per_db_tied", QB_ONLY, "situational", "EPA/dropback when tied", "filter to score_diff == 0", ("cfbd_pbp",)),
    FeatureSpec("qb_epa_per_db_trailing", QB_ONLY, "situational", "EPA/dropback when trailing", "filter to score_diff < 0", ("cfbd_pbp",)),
    FeatureSpec("qb_epa_per_db_late_close", QB_ONLY, "situational", "EPA/dropback in 4Q within one score", "filter to qtr=4 and abs(score_diff) ≤ 8", ("cfbd_pbp",)),
    FeatureSpec("qb_epa_per_db_garbage_time", QB_ONLY, "situational", "EPA/dropback in garbage time (4Q, margin > 16)", "filter to qtr=4 and abs(score_diff) > 16", ("cfbd_pbp",)),
    FeatureSpec("qb_redzone_td_rate", QB_ONLY, "situational", "TD rate inside the 20", "rz_td_passes / rz_dropbacks", ("cfbd_pbp",)),
    FeatureSpec("qb_third_down_conversion_rate", QB_ONLY, "situational", "Career 3rd-down conversion rate via dropback", "1st downs gained on 3rd down dropbacks / 3rd down dropbacks", ("cfbd_pbp",)),
    # --- efficiency: by depth ---
    FeatureSpec("qb_short_attempt_share", QB_ONLY, "depth", "Share of attempts ≤ 5 air yards", "count(air_yards ≤ 5) / attempts", ("cfbd_pbp",)),
    FeatureSpec("qb_intermediate_attempt_share", QB_ONLY, "depth", "Share of attempts 5-15 air yards", "count(5 < ay ≤ 15) / attempts", ("cfbd_pbp",)),
    FeatureSpec("qb_deep_attempt_share", QB_ONLY, "depth", "Share of attempts > 15 air yards", "count(ay > 15) / attempts", ("cfbd_pbp",)),
    FeatureSpec("qb_deep_completion_pct", QB_ONLY, "depth", "Completion % on > 15-air-yard attempts", "deep_completions / deep_attempts", ("cfbd_pbp",)),
    FeatureSpec("qb_deep_epa_per_attempt", QB_ONLY, "depth", "EPA per deep attempt", "sum(epa) / deep_attempts", ("cfbd_pbp",)),
    # --- play extension / mobility ---
    FeatureSpec("qb_scramble_rate", QB_ONLY, "mobility", "Scrambles per dropback", "scrambles / dropbacks", ("cfbd_pbp",)),
    FeatureSpec("qb_yards_per_scramble", QB_ONLY, "mobility", "Yards per scramble", "scramble_yards / scrambles", ("cfbd_pbp",)),
    FeatureSpec("qb_designed_run_rate", QB_ONLY, "mobility", "Designed runs per offensive snap", "designed_runs / snaps", ("cfbd_pbp",)),
    FeatureSpec("qb_yards_per_designed_run", QB_ONLY, "mobility", "Yards per designed run", "designed_run_yards / designed_runs", ("cfbd_pbp",)),
    FeatureSpec("qb_rush_td_rate", QB_ONLY, "mobility", "Rushing TDs per rush attempt", "rush_tds / rush_attempts", ("cfbd_pbp",)),
    FeatureSpec("qb_sack_rate", QB_ONLY, "mobility", "Sack rate", "sacks / dropbacks", ("cfbd_pbp",)),
    FeatureSpec("qb_pressure_to_sack_proxy", QB_ONLY, "mobility", "Long-developing-play sack rate proxy", "sacks where play_duration > p75 / dropbacks", ("cfbd_pbp",)),
    # --- decision making / risk ---
    FeatureSpec("qb_int_rate", QB_ONLY, "decision", "Interception rate", "interceptions / attempts", ("cfbd_pbp",)),
    FeatureSpec("qb_td_to_int", QB_ONLY, "decision", "Career TD:INT ratio", "pass_tds / interceptions (inf-clipped)", ("cfbd_pbp",)),
    FeatureSpec("qb_btt_rate_proxy", QB_ONLY, "decision", "Big-time-throw rate proxy: deep completions in tight windows", "deep_completions in trafficked situations / attempts", ("cfbd_pbp",)),
    FeatureSpec("qb_twp_rate_proxy", QB_ONLY, "decision", "Turnover-worthy-play rate proxy", "deep incompletions to high-leverage areas + INTs / attempts", ("cfbd_pbp",)),
    # --- volume ---
    FeatureSpec("qb_total_attempts", QB_ONLY, "volume", "Career pass attempts", "sum(attempts)", ("cfbd_pbp",)),
    FeatureSpec("qb_attempts_per_game", QB_ONLY, "volume", "Pass attempts per game", "attempts / games_played", ("cfbd_pbp",)),
    FeatureSpec("qb_dropbacks_per_game", QB_ONLY, "volume", "Dropbacks per game", "dropbacks / games_played", ("cfbd_pbp",)),
    # --- trajectory ---
    FeatureSpec("qb_epa_yoy_slope", QB_ONLY, "trajectory", "Year-over-year slope of EPA/dropback", "linear regression slope across seasons", ("cfbd_pbp",)),
    FeatureSpec("qb_final_year_epa_z", QB_ONLY, "trajectory", "Final-season EPA/dropback z vs prior seasons", "z-score(final, prior_career)", ("cfbd_pbp",)),
]

# ---------------------------------------------------------------------------
# RB features
# ---------------------------------------------------------------------------

RB_ONLY = (Position.RB,)

RB_FEATURES: list[FeatureSpec] = [
    # --- rushing efficiency ---
    FeatureSpec("rb_epa_per_rush", RB_ONLY, "efficiency", "EPA per rush attempt", "sum(epa) / rush_attempts", ("cfbd_pbp",)),
    FeatureSpec("rb_ypc", RB_ONLY, "efficiency", "Career yards per carry", "rush_yards / rush_attempts", ("cfbd_pbp",)),
    FeatureSpec("rb_success_rate", RB_ONLY, "efficiency", "Rush success rate (EPA > 0)", "count(epa>0) / rush_attempts", ("cfbd_pbp",)),
    FeatureSpec("rb_explosive_rate", RB_ONLY, "efficiency", "Explosive run rate (≥10 yards)", "count(rush_yds ≥ 10) / rush_attempts", ("cfbd_pbp",)),
    FeatureSpec("rb_stuff_rate", RB_ONLY, "efficiency", "Stuff rate (≤0 yards)", "count(rush_yds ≤ 0) / rush_attempts", ("cfbd_pbp",)),
    FeatureSpec("rb_yards_over_expected", RB_ONLY, "efficiency", "Yards over expected per rush (custom model)", "actual_yards - expected_yards(box, situation)", ("cfbd_pbp",)),
    # --- situational rushing ---
    FeatureSpec("rb_epa_per_rush_early_down", RB_ONLY, "situational", "EPA/rush on 1st & 2nd down", "filter to down ≤ 2", ("cfbd_pbp",)),
    FeatureSpec("rb_epa_per_rush_third_short", RB_ONLY, "situational", "EPA/rush on 3rd-and-short (≤2)", "filter to down=3 and ydstogo ≤ 2", ("cfbd_pbp",)),
    FeatureSpec("rb_goalline_td_rate", RB_ONLY, "situational", "TD rate from inside the 5", "goalline_tds / goalline_carries", ("cfbd_pbp",)),
    FeatureSpec("rb_perf_vs_stacked_box", RB_ONLY, "situational", "EPA/rush vs ≥8 in box (where data available)", "filter to box_count ≥ 8", ("cfbd_pbp",)),
    FeatureSpec("rb_perf_vs_light_box", RB_ONLY, "situational", "EPA/rush vs ≤6 in box", "filter to box_count ≤ 6", ("cfbd_pbp",)),
    # --- receiving role ---
    FeatureSpec("rb_targets_per_game", RB_ONLY, "receiving", "Targets per game", "targets / games_played", ("cfbd_pbp",)),
    FeatureSpec("rb_catch_rate", RB_ONLY, "receiving", "Catch rate", "receptions / targets", ("cfbd_pbp",)),
    FeatureSpec("rb_yac_per_reception", RB_ONLY, "receiving", "YAC per reception", "sum(yac) / receptions", ("cfbd_pbp",)),
    FeatureSpec("rb_receiving_yards_share", RB_ONLY, "receiving", "Share of team's receiving yards", "rec_yards / team_rec_yards", ("cfbd_pbp",)),
    FeatureSpec("rb_route_participation_proxy", RB_ONLY, "receiving", "Snaps where targeted or in route region (proxy)", "(targets + receiving snaps proxy) / total snaps", ("cfbd_pbp",)),
    # --- workload ---
    FeatureSpec("rb_touches_per_game", RB_ONLY, "volume", "Touches (rush + receptions) per game", "(rush_att + rec) / games_played", ("cfbd_pbp",)),
    FeatureSpec("rb_career_touches", RB_ONLY, "volume", "Total career touches", "sum(rush_att) + sum(rec)", ("cfbd_pbp",)),
    FeatureSpec("rb_snap_share_peak", RB_ONLY, "volume", "Peak season snap share", "max season snap_share", ("cfbd_pbp",)),
    FeatureSpec("rb_workload_concentration", RB_ONLY, "volume", "Backfield share concentration (Gini-style)", "Gini coefficient of touches across team RBs", ("cfbd_pbp",)),
    # --- trajectory ---
    FeatureSpec("rb_yoy_yards_slope", RB_ONLY, "trajectory", "YoY rushing yards/game slope", "linear regression slope across seasons", ("cfbd_pbp",)),
    FeatureSpec("rb_breakout_season", RB_ONLY, "trajectory", "First season > 1000 yards from scrimmage (age)", "min age where total_yards ≥ 1000", ("cfbd_box",)),
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
WR_FEATURES: list[FeatureSpec] = [
    # --- per-team-pass-attempt family (Howard / Campus2Canton / Heath) ---
    FeatureSpec("wr_ryptpa", WR_ONLY, "opportunity", "Receiving yards per team pass attempt — public-data analogue of PFF YPRR", "career rec_yards / team pass attempts (across his team-seasons)", ("cfbd_pbp",)),
    FeatureSpec("wr_tptpa", WR_ONLY, "opportunity", "Targets per team pass attempt — proxy for target-per-route", "career targets / team pass attempts", ("cfbd_pbp",)),
    FeatureSpec("wr_1dptpa", WR_ONLY, "opportunity", "First downs per team pass attempt — Campus2Canton 1DRR analogue", "career first downs via reception / team pass attempts", ("cfbd_pbp",)),
    # --- volume / opportunity ---
    FeatureSpec("wr_targets_per_game", WR_ONLY, "opportunity", "Targets per game", "targets / games_played", ("cfbd_pbp",)),
    # --- production ---
    FeatureSpec("wr_yards_per_game", WR_ONLY, "production", "Receiving yards per game", "rec_yards / games_played", ("cfbd_pbp",)),
    FeatureSpec("wr_rec_per_game", WR_ONLY, "production", "Receptions per game", "receptions / games_played", ("cfbd_pbp",)),
    FeatureSpec("wr_td_per_game", WR_ONLY, "production", "Receiving TDs per game", "rec_tds / games_played", ("cfbd_pbp",)),
    FeatureSpec("wr_big_play_rate", WR_ONLY, "production", "Big-play rate (≥20 yard receptions per game)", "count(rec_yds ≥ 20) / games_played", ("cfbd_pbp",)),
    FeatureSpec("wr_first_down_per_rec", WR_ONLY, "production", "First-down rate per reception", "first_downs_via_rec / receptions", ("cfbd_pbp",)),
    # --- efficiency ---
    FeatureSpec("wr_catch_rate", WR_ONLY, "efficiency", "Catch rate", "receptions / targets", ("cfbd_pbp",)),
    FeatureSpec("wr_epa_per_target", WR_ONLY, "efficiency", "EPA per target — Eric Eager's target-level efficiency metric", "sum(ppa) on attributed targets / targets", ("cfbd_pbp",)),
    FeatureSpec("wr_success_rate", WR_ONLY, "efficiency", "Share of targets with positive EPA", "targets where ppa > 0 / targets", ("cfbd_pbp",)),
    FeatureSpec("wr_rating", WR_ONLY, "efficiency", "Passer rating when targeted (PFF WR Rating concept)", "NFL passer rating formula applied to targets-as-attempts", ("cfbd_pbp",)),
    # --- premium / above-teammate (PlayerProfiler) ---
    FeatureSpec("wr_target_premium", WR_ONLY, "premium", "Player YPT minus teammate YPT — isolates 'is he better than his teammates'", "player yards/target - team yards/target (excl. self)", ("cfbd_pbp",)),
    FeatureSpec("wr_yards_above_teammate_pct", WR_ONLY, "premium", "Career rec yards as fraction of team's top WR — Hog Rate without snap-share", "self_rec_yards / max_teammate_rec_yards (per team-season, then averaged)", ("cfbd_pbp",)),
    # --- situational market share ---
    FeatureSpec("wr_third_down_target_share", WR_ONLY, "situational", "Share of team's 3rd-down targets — trust signal", "self 3rd-down targets / team 3rd-down targets", ("cfbd_pbp",)),
    FeatureSpec("wr_red_zone_target_share", WR_ONLY, "situational", "Share of team's red-zone targets — TD-equity signal", "self RZ targets / team RZ targets", ("cfbd_pbp",)),
    # --- trajectory ---
    FeatureSpec("wr_breakout_age_dominator", WR_ONLY, "trajectory", "Age at first season with dominator ≥ 0.20 (Hayden Winks standard)", "min age where season dominator ≥ 0.20", ("cfbd_pbp",)),
    FeatureSpec("wr_target_share_yoy_slope", WR_ONLY, "trajectory", "YoY target share slope", "linear regression slope across seasons", ("cfbd_pbp",)),
    FeatureSpec("wr_dominator_peak", WR_ONLY, "trajectory", "Peak season dominator rating (rec yds + TDs share)", "max_season((rec_yards_share + rec_td_share) / 2)", ("cfbd_pbp",)),
    FeatureSpec("wr_career_yards_slope", WR_ONLY, "trajectory", "YoY slope of receiving yards per game", "linear regression slope of yds/game by season", ("cfbd_pbp",)),
    FeatureSpec("wr_final_year_dominator", WR_ONLY, "trajectory", "Most recent season's dominator rating — current-state signal", "(rec_yards_share + rec_td_share) / 2 in final season", ("cfbd_pbp",)),
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

TE_FEATURES: list[FeatureSpec] = [
    FeatureSpec("te_inline_rate", TE_ONLY, "role", "Inline (attached) snap rate vs total", "inline_snaps / total_snaps", ("cfbd_pbp",)),
    FeatureSpec("te_flexed_rate", TE_ONLY, "role", "Flexed/slot snap rate", "flexed_snaps / total_snaps", ("cfbd_pbp",)),
    FeatureSpec("te_route_participation", TE_ONLY, "role", "Snaps with a route run / total snaps", "route_snaps / total_snaps", ("cfbd_pbp",)),
    FeatureSpec("te_targets_per_route", TE_ONLY, "opportunity", "Targets per route run", "targets / routes_run", ("cfbd_pbp",)),
    FeatureSpec("te_target_share", TE_ONLY, "opportunity", "Career target share of team passes", "targets / team_pass_attempts", ("cfbd_pbp",)),
    FeatureSpec("te_air_yards_per_route", TE_ONLY, "opportunity", "Air yards per route run", "sum(air_yards) / routes_run", ("cfbd_pbp",)),
    FeatureSpec("te_yards_per_game", TE_ONLY, "production", "Receiving yards per game", "rec_yards / games_played", ("cfbd_box",)),
    FeatureSpec("te_rec_per_game", TE_ONLY, "production", "Receptions per game", "receptions / games_played", ("cfbd_box",)),
    FeatureSpec("te_yac_per_reception", TE_ONLY, "efficiency", "YAC per reception", "sum(yac) / receptions", ("cfbd_pbp",)),
    FeatureSpec("te_red_zone_target_share", TE_ONLY, "situational", "Share of team RZ targets", "rz_targets / team_rz_targets", ("cfbd_pbp",)),
    FeatureSpec("te_blocking_exposure", TE_ONLY, "role", "Inline-and-no-route snap rate (run-block proxy)", "inline_no_route_snaps / total_snaps", ("cfbd_pbp",)),
    FeatureSpec("te_two_way_index", TE_ONLY, "composite", "Composite of receiving production + blocking exposure", "z(rec_production) + 0.5 * z(blocking_exposure)", ("cfbd_pbp",)),
    FeatureSpec("te_target_share_yoy_slope", TE_ONLY, "trajectory", "YoY target share slope", "linear regression slope across seasons", ("cfbd_pbp",)),
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
