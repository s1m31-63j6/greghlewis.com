# Findings log

The weekly return, after the games. Each entry: what the evidence said, what
changed in the method because of it, what is on watch, and the question for
next week. The numbers come from `results/eval-wNN.md`; this file is the
judgment about them. The method changes only when this log says why.

Standing targets: band holds 60% of outcomes (20% below, 20% above); a call is
made only at gaps where the favorite has won at least 60%; touchdown prices
calibrate by bucket; our total beats last season's average on error and matches
the books' own fantasy-score line.

---

## Week 1 (games of Sep 10–14, evaluated Sep 14 on 15 of 16 games)

**What happened.** Scoring ran hot: actual half-PPR points came in +2.0 per
player above the market across 164 fully priced players (MAE 5.3). Every
position was hot, quarterbacks and backs most (+3.4, +3.5 full PPR). The
market's own fantasy-score line was equally hot, so this was the week, not our
arithmetic.

**The band.** Held 49% against a 60% target: 18% below the floor, 33% above
the ceiling. The simulated head-to-head odds are overconfident the same way
(where the sim said 88%, the favorite won 78%; said 62%, won 54%). Two readings
are possible and both matter: the fitted game-to-game spread from 2025
understates real variance, or week 1 is simply the wildest week. **Decision:
no change to the spread until week 2. If coverage is under 55% again, widen
the spread fit (a multiplier on sigma, chosen to hit 60% on weeks 1–2).**

**On "the bands are milquetoast."** The evidence points the other way: the
band is too narrow. Hedging in the display should be reduced by leading with
the confident number (the head-to-head percentage and the calibrated gap), not
by shrinking a band that already fails to contain a third of outcomes.

**The verdict.** Hit rate by projected gap (same-position pairs, n=4,095):
under 1 pt 51%, 1–2 54%, 2–3 64%, 3–5 70%, over 5 78%. First bucket to clear
60% is a 2-point gap (64% of 557). The current rule (2 combined SE or under 1
point) is a guess; **once week 2 lands, `MIN_GAP` becomes the measured value,
published in the banner with its n.**

**Touchdowns.** 262 priced players, 22% scored. The raw vig-inclusive price
predicted 22%; the field-scaled price predicted 18%. Brier 0.137 raw vs 0.141
scaled. In a hot week the raw price winning is expected; **the scaling stays,
on watch. If raw beats scaled again in week 2, the scaling factor is capped
(e.g. no lower than 0.85) or replaced by a fixed hold estimate.**

**Who predicted best.** Ours vs the books' fantasy-score line: within 0.1
points of MAE at every position. Both beat the 2025 per-game average on error
(WR 5.1 vs 6.0). By book, mean absolute error of the posted line: DraftKings
11.6, Caesars 11.8, Bovada 12.3, ESPN BET 12.3, BetMGM 13.3, FanDuel 13.3; the
spread is widest on rushing yards (DK 14.3 vs Caesars 17.6). One week; the
per-book archive (`lines.json`) starts with week 2 so this can accumulate.

**Timing.** Saturday's lines MAE 5.40, Sunday morning 5.32, Sunday final 5.31.
The final is worth a tenth of a point so far; keep the cadence, keep measuring.

**Per market.** Every over/under market except interceptions and carries went
over more than half the time (receiving yards 55%, rushing yards 56%, passing
TDs 58%); receptions and carries sat at 50%. Consistent with a hot week rather
than a biased line.

**Changed this week.** Conviction shown per line (firm / moving / thin /
pick'em); per-book lines archived every run; Tuesday evaluation automated;
track-record page (unlinked) renders it all.

**Questions for week 2.**
1. Does band coverage recover toward 60%, or is the spread fit too tight?
2. Does the 2-point gap hold as the 60% threshold?
3. Raw vs scaled touchdown price: which calibrates?
4. Do "moving" lines (moved a unit since open) predict better than "firm" ones?
   (Needs the archive; not measurable for week 1.)
5. Does DraftKings stay the sharpest book on rushing yards?

## Week 2, Wednesday (2026-09-16): the passing-yards gate

The first week 2 refresh failed in the publisher's sanity gate: passing-yards
EV ranked against the 2025 per-game average at 0.458, under the 0.6 floor.
The lines were fine. Twenty-five starters priced between 189 and 270 yards,
with the largest gaps being matchup stories (Mahomes 218.5 against a 256
average; Dart 212.5 against a rookie's 162). Week 1 had passed at 0.684, so
the floor was already marginal for this stat. Benchmark from 2025: the actual
weekly passing yards of the top 25 quarterbacks ranked against their season
average at a median 0.31 and never above 0.66, so the market's 0.46 to 0.68 is
already better than outcomes manage. The floor is now per stat: 0.6 for
rushing yards, receiving yards and receptions (running 0.78 to 0.92), 0.3 for
passing yards. A broken inversion lands near zero or negative, which 0.3
still catches. Nothing about the method changed.
