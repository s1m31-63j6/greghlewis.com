import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Two-Minute Drill — Methodology · Greg Lewis",
  description:
    "How the endgame engine works: empirical outcome models fit from nflverse play-by-play, a "
    + "Monte Carlo rollout instead of a fitted win probability model, and what the numbers do "
    + "and do not support.",
};

const OBSERVED_LABELS = ["18-29", "30-39", "40-49", "50-59", "60+"];

/** Observed make rate and attempt count, straight from `distributions.json`. */
const OBSERVED: (number | [string, number])[][] = [
    [1999, ["0.953", 296], ["0.795", 298], ["0.676", 318], ["0.506", 85], ["0.000", 2]],
    [2003, ["0.963", 300], ["0.820", 294], ["0.695", 311], ["0.505", 95], ["0.000", 3]],
    [2007, ["0.955", 312], ["0.897", 292], ["0.735", 291], ["0.479", 96], ["0.000", 2]],
    [2011, ["0.966", 324], ["0.870", 277], ["0.744", 309], ["0.659", 135], ["0.143", 7]],
    [2015, ["0.973", 255], ["0.945", 290], ["0.766", 325], ["0.669", 157], ["0.167", 6]],
    [2019, ["0.984", 257], ["0.913", 275], ["0.722", 338], ["0.580", 143], ["0.400", 5]],
    [2022, ["0.977", 256], ["0.924", 302], ["0.805", 318], ["0.713", 216], ["0.385", 13]],
    [2025, ["0.982", 221], ["0.933", 313], ["0.842", 328], ["0.702", 255], ["0.522", 23]],
];

export default function Methodology() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
      <nav className="mb-8">
        <Link
          href="/projects/two-minute-drill"
          className="text-xs uppercase tracking-wider text-slate-500 transition hover:text-slate-900"
        >
          ← Back to the drill
        </Link>
      </nav>

      <header className="mb-8">
        <h1 className="font-serif text-3xl leading-tight text-slate-900 sm:text-4xl">
          Methodology
        </h1>
        <p className="mt-3 text-base leading-relaxed text-slate-600">
          The engine behind Two-Minute Drill simulates the rest of the game rather than looking
          up a fitted win probability. This page covers how it is built, how well it is
          calibrated against what actually happened, and the places where it relies on an
          assumption.
        </p>
      </header>

      <section className="space-y-8 text-[15px] leading-relaxed text-slate-700">
        <div>
          <h2 className="mb-2 font-serif text-xl text-slate-900">1. The situation</h2>
          <p>
            Every scenario is a real NFL game picked up at a real snap in the fourth quarter with
            two minutes or less on the clock and the score inside one possession, meaning a margin
            of eight points or fewer. Across 2016 to 2025 there are{" "}
            <strong>15,376 such snaps in 1,550 games</strong>, of which 724 saw points scored
            inside the window. The app ships 300 of them, thirty per season, chosen within each
            season by how much actually happened in the window.
          </p>
          <p className="mt-2">
            Each scenario carries the full sequence of plays that followed, so the game can be
            replayed rather than merely set up.
          </p>
        </div>

        <div>
          <h2 className="mb-2 font-serif text-xl text-slate-900">
            2. Why the engine simulates instead of fitting
          </h2>
          <p>
            The public fourth-down tools — <em>nfl4th</em>, ESPN&apos;s decision model, the old
            New York Times bot — evaluate a decision by looking up a fitted win probability for
            the state each option leads to. That works well for a first-quarter fourth-and-two.
            It works less well here, because the variables that decide these games are timeouts,
            whether the clock is moving, and where the two-minute warning falls, and a regression
            on game state smooths across all three.
          </p>
          <p className="mt-2">
            This engine instead rolls the remaining game forward one play at a time, a few
            thousand times per option, and counts how often each ends in a win. Clock mechanics
            are modelled directly because the simulation has to advance a clock to run at all. The
            spread across rollouts also produces a standard error for free, which is what lets the
            app decline to name a winner when two options are inside the noise.
          </p>
        </div>

        <div>
          <h2 className="mb-2 font-serif text-xl text-slate-900">3. What the numbers mean</h2>
          <p>
            A win probability here is the chance of winning{" "}
            <em>if you take this action now and both teams then play like an average NFL team</em>.
            The &ldquo;average NFL team&rdquo; is a specific thing: a table of conditional action
            frequencies fit from the fourth quarter of ten seasons, covering
            fourth-down choices, run-pass mix, spikes, kneels, timeout usage by both sides,
            two-point decisions and onside declarations.
          </p>
          <p className="mt-2">
            That is a deliberate choice, and it bounds what the grade can claim. The engine
            reports how your call would fare against the league. It does not attempt to solve the
            game or to reconstruct what a perfect coach would do.
          </p>
        </div>

        <div>
          <h2 className="mb-2 font-serif text-xl text-slate-900">4. The outcome models</h2>
          <p>
            Every distribution the simulator samples from is estimated from nflverse play-by-play.
            Nothing is hand-tuned.
          </p>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[14px]">
            <li>
              <strong>Passing and running.</strong> Yards gained, completion rate, sack rate and
              interception rate, conditioned on distance to go, fit on the last five minutes of
              either half with the game inside sixteen points — 43,852 dropbacks and 21,205 runs.
              Fitting on all snaps would describe a different game.
            </li>
            <li>
              <strong>Field goals.</strong> A logistic surface over distance and season, fit on
              27,772 attempts from 1999 to 2025 — quadratic in distance so it does not under-fit
              the flat region inside forty yards, linear in season because kicking has improved
              steadily. Section 5 has the evidence.
            </li>
            <li>
              <strong>Punts and kickoffs.</strong> Net punt distance by field position. Kickoff
              field position from the 2025 season alone, because the touchback spot moved from the
              30 to the 35 between 2024 and 2025 and pooling the two would describe a rule set
              nobody plays under.
            </li>
            <li>
              <strong>Clock runoff is measured from the data.</strong> Rather than encoding the
              stoppage rules, the engine measures the actual elapsed time between consecutive
              snaps and samples it, split by outcome, by whether a timeout intervened, by whether
              the offence is chasing or protecting a lead, and by how much clock is left. Those
              splits matter: after a completed pass that stays inbounds, a trailing offence takes
              a median of 14 seconds to snap again inside the final minute, 21 seconds inside two
              minutes, and 27 seconds with three to five minutes left. A leading offence takes 43.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="mb-2 font-serif text-xl text-slate-900">5. The kicking season slider</h2>
          <p>
            Kicking has improved steadily and substantially, and not only at long range. Here is
            the raw matrix the model is fit on — observed make rate with attempt count, by
            distance and season:
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full border-collapse text-[12.5px]">
              <thead>
                <tr className="border-b border-slate-300 text-left text-slate-500">
                  <th className="py-1.5 pr-3 font-normal">Season</th>
                  {OBSERVED_LABELS.map((b) => (
                    <th key={b} className="py-1.5 pr-3 font-normal">{b} yds</th>
                  ))}
                </tr>
              </thead>
              <tbody className="font-mono">
                {OBSERVED.map(([season, ...cells]) => (
                  <tr key={season as number} className="border-b border-slate-100">
                    <td className="py-1.5 pr-3">{season as number}</td>
                    {(cells as [string, number][]).map(([p, n], i) => (
                      <td key={i} className="py-1.5 pr-3">
                        {p}
                        <span className="ml-1 text-slate-400">({n})</span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3">
            The 18-29 column looks flat, going from .953 to .982. That is a ceiling effect and it
            hides the real change: the miss rate on those kicks fell from 5.6% to 2.0%. Read on
            the odds scale rather than the probability scale, a chip shot improved about as much
            as a fifty-yarder did.
          </p>
          <p className="mt-2">
            That turns out to be the whole story. Fitting make probability against distance and
            season over all 27,772 attempts, and comparing specifications by cross-validated log
            loss:
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-slate-300 text-left text-slate-500">
                  <th className="py-1.5 pr-4 font-normal">Specification</th>
                  <th className="py-1.5 pr-4 font-normal">Parameters</th>
                  <th className="py-1.5 font-normal">CV log loss</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {[
                  ["distance only", "2", "0.40106"],
                  ["distance + linear season", "3", "0.39492"],
                  ["distance + season + interaction", "4", "0.39492"],
                  ["distance + free per-season effects", "28", "0.39524"],
                  ["distance + per-season interactions", "54", "0.39554"],
                ].map(([a, b, c], i) => (
                  <tr key={a} className={`border-b border-slate-100 ${i === 1 ? "bg-slate-50" : ""}`}>
                    <td className="py-1.5 pr-4">{a}</td>
                    <td className="py-1.5 pr-4">{b}</td>
                    <td className="py-1.5">{c}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3">
            Three things fall out of that table. A season term earns its place. A
            season-by-distance interaction does not — the fitted interaction is &minus;0.005
            log-odds per season per ten yards, indistinguishable from zero, so the yearly gain
            lifts every distance by the same factor on the odds scale. And letting each season
            have its own free effect is <em>worse</em> out of sample than drawing a straight line
            through them, which says the year-to-year wiggle in the matrix above is noise and the
            trend is the signal. A quadratic season term and a knot at 2012 were both tried; neither
            improved on the straight line, so there is no evidence of a plateau.
          </p>
          <p className="mt-2">
            The engine therefore uses{" "}
            <code>logit(p) = &beta;₀ + &beta;₁d + &beta;₂d² + &beta;₃(season &minus; 2012)</code>,
            with &beta;₃ = <strong>+0.041 log-odds per season</strong>. Across the window that is
            +1.06, meaning the odds of making any given kick are roughly 2.9 times what they were
            in 1999. The slider picks a row off that surface:
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-slate-300 text-left text-slate-500">
                  <th className="py-1.5 pr-4 font-normal">Attempt</th>
                  {[1999, 2010, 2018, 2025].map((y) => (
                    <th key={y} className="py-1.5 pr-4 font-normal">{y}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="font-mono">
                {[
                  ["25 yards", "94.4%", "96.2%", "97.4%", "98.0%"],
                  ["35 yards", "83.3%", "88.2%", "91.7%", "93.5%"],
                  ["45 yards", "63.2%", "72.2%", "79.3%", "83.2%"],
                  ["55 yards", "41.1%", "51.4%", "61.0%", "66.8%"],
                  ["62 yards", "29.1%", "38.1%", "47.7%", "54.2%"],
                ].map((r) => (
                  <tr key={r[0]} className="border-b border-slate-100">
                    {r.map((c, i) => (
                      <td key={i} className="py-1.5 pr-4">{c}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3">
            One caveat on reading the slider. Only the kicking moves with it. The passing, the
            clock behaviour and what coaches choose to do all stay fit on 2016 to 2025, so setting
            it to 2003 asks what this decision would look like with a 2003 kicker and nothing else
            changed. That is the counterfactual worth being able to see, and it is not a
            simulation of the 2003 NFL.
          </p>
          <p className="mt-2">
            A separate note on the 2025 season specifically. The rule change to how teams prepare
            kicking balls arrived that year and the popular version is that kicks got longer.
            Conversion at a fixed distance barely moved year over year — 50 to 54 yarders were
            made 75.1% of the time in 2024 and 72.7% in 2025. What did move is where teams are
            willing to kick from: median attempt distance went from 39 yards in 2018 to 41 in
            2025, the 95th percentile from 54 to 57, and attempts from 60 or beyond went from six
            to twenty-three. The slider captures the long trend well; it is not the instrument for
            isolating a single season&apos;s rule change, and one season of data would not settle
            that question anyway.
          </p>
        </div>

        <div>
          <h2 className="mb-2 font-serif text-xl text-slate-900">6. Onside kicks</h2>
          <p>
            Onside attempts are identified from the play description rather than by kick distance.
            The distance shortcut is tempting and wrong: a leading team&apos;s squib is also a
            short kick, so thresholding on distance reports teams ahead by nine or more as the
            league&apos;s most eager onside kickers.
          </p>
          <p className="mt-2">
            Under the dynamic kickoff, declared onside attempts have been recovered{" "}
            <strong>8 times in 107 tries</strong> across 2024 and 2025, or 7.5%, against 10.2% on
            492 attempts under the old rules. The direction is clear, but two seasons pin the
            magnitude down poorly: a Wilson interval on 8 of 107 runs from roughly 3.9% to 14.0%. The engine uses the point
            estimate and the app quotes it, but two seasons is not enough to pin down the number.
          </p>
        </div>

        <div>
          <h2 className="mb-2 font-serif text-xl text-slate-900">7. Calibration</h2>
          <p>
            A simulator can rank options correctly and still be wrong about the level, and this
            one was. Its raw output was systematically too pessimistic about trailing teams,
            reporting about 17% where the observed rate for matched situations was 23%.
          </p>
          <p className="mt-2">
            The correction is a monotone map from raw rollout frequency to observed win rate,
            fit on 2,500 real states from 2016 to 2023 and scored on 1,250 states from 2024 and
            2025 that the fit never saw. Because the map is monotone it cannot reorder two
            options: whichever the simulator preferred, it still prefers.
          </p>
          <p className="mt-2">
            The map is a two-parameter Platt fit, logistic in the log-odds of the raw estimate.
            Isotonic regression is the more obvious choice and was tried first. Held out, it was
            worse on both counts that matter:
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-slate-300 text-left text-slate-500">
                  <th className="py-1.5 pr-4 font-normal">Correction</th>
                  <th className="py-1.5 pr-4 font-normal">Held-out Brier</th>
                  <th className="py-1.5 font-normal">Flat cells in the curve</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {[
                  ["none (raw)", "0.15203", "—"],
                  ["isotonic", "0.15106", "171 of 200"],
                  ["Platt, linear in logit", "0.15030", "0"],
                ].map(([a, b, c], i) => (
                  <tr key={a} className={`border-b border-slate-100 ${i === 2 ? "bg-slate-50" : ""}`}>
                    <td className="py-1.5 pr-4">{a}</td>
                    <td className="py-1.5 pr-4">{b}</td>
                    <td className="py-1.5">{c}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3">
            Isotonic came out barely better than not calibrating at all, having overfit the
            training set into a staircase, and it was flat across most of its range. That
            flatness had a visible cost. With the kicking slider set from 2010 to 2025 — a range
            over which a 59-yard attempt goes from 44% to 60% — the isotonic curve reported the
            same win probability for all four seasons, because every one of those raw values
            landed on the same step. A two-parameter fit generalises better and has a strictly
            positive slope everywhere, so a real difference in the raw estimate survives to the
            screen.
          </p>
          <p className="mt-2">
            Measured on 1,500 real endgame states against whether that team went on to win:
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-slate-300 text-left text-slate-500">
                  <th className="py-1.5 pr-4 font-normal">Model</th>
                  <th className="py-1.5 pr-4 font-normal">Brier score</th>
                  <th className="py-1.5 font-normal">Skill over base rate</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                <tr className="border-b border-slate-100">
                  <td className="py-1.5 pr-4">This engine</td>
                  <td className="py-1.5 pr-4">0.143</td>
                  <td className="py-1.5">+42.2%</td>
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="py-1.5 pr-4">nflfastR vegas_wp</td>
                  <td className="py-1.5 pr-4">0.136</td>
                  <td className="py-1.5">+45.1%</td>
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="py-1.5 pr-4">Always guess the base rate</td>
                  <td className="py-1.5 pr-4">0.248</td>
                  <td className="py-1.5">—</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3">
            Across those 1,500 states the engine&apos;s reliability curve tracks the diagonal
            closely — it says 4.2% where the observed rate is 5.0%, 25.0% against 29.0%, 74.8%
            against 78.0%, 97.0% against 97.1% — and it agrees with nflfastR at r = 0.96 with a
            mean absolute difference of 0.070.
            It is a little behind nflfastR on accuracy, which is the expected result: nflfastR
            fits win probability directly against outcomes, while this engine derives it from a
            forward simulation. What the simulation buys in exchange is the ability to evaluate
            options a fitted model has no column for — spiking, working the sideline, spending a
            timeout, waving the opponent into the end zone.
          </p>
        </div>

        <div>
          <h2 className="mb-2 font-serif text-xl text-slate-900">8. Grading, and when it declines</h2>
          <p>
            A call is graded on the win probability it gave up against the engine&apos;s preferred
            option: under three points is reasonable, three to ten is costly, ten or more is a big
            mistake. Before any of that applies, the gap is compared against the search&apos;s own
            standard error, and if it is inside two of them the call is marked{" "}
            <em>too close to call</em> and counts for nothing.
          </p>
          <p className="mt-2">
            That band exists because of a specific criticism of this genre of tool. Baldwin and
            Bornn&apos;s work, and more pointedly{" "}
            <em>Analytics, have some humility</em> (Lopez et al., arXiv 2311.03490), show that the
            uncertainty in a fourth-down recommendation is routinely much larger than the
            confidence with which it gets presented. A Monte Carlo engine has no excuse for
            hiding this, since it produces the error bar as a by-product.
          </p>
        </div>

        <div>
          <h2 className="mb-2 font-serif text-xl text-slate-900">9. Two implementations</h2>
          <p>
            The engine exists twice: a Python reference implementation and a TypeScript port that
            runs in a Web Worker so the page stays responsive. Two implementations of one model give two
            chances to be wrong, and the failure mode is quiet: a mistyped constant produces an
            engine that still looks plausible and grades every decision slightly off.
          </p>
          <p className="mt-2">
            So both are driven from the same stream of pseudo-random numbers and required to agree
            exactly: same state, same action, same seed, same outcome, same resulting state, same
            rollout result. The check currently covers 2,479 state-action pairs. It is
            mutation-tested — flipping a bucket boundary, changing the field goal snap distance by
            a yard, or reverting a fixed bug all make it fail.
          </p>
          <p className="mt-2">
            That test earned its place. It passed when it should not have, and the reason was that
            the distribution fitter and the engine each defined their distance-to-go bands
            separately and disagreed, so every distance-conditioned lookup was silently missing
            its key and falling back to a pooled distribution. Both implementations did it
            identically, so nothing looked wrong.
          </p>
        </div>

        <div>
          <h2 className="mb-2 font-serif text-xl text-slate-900">10. Limitations</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[14px]">
            <li>
              <strong>No teams.</strong> Every offence and defence is league average. Playing the
              2021 Chiefs and playing a replacement quarterback produce identical models.
            </li>
            <li>
              <strong>Overtime is a coin flip.</strong> A tie at 0:00 scores 0.5. Real overtime
              has a possession structure worth modelling and this does not model it.
            </li>
            <li>
              <strong>Working the sideline is an assumption.</strong> nflverse does not label
              intent, so the sideline throw is modelled as a 10% relative reduction in completion
              rate for roughly double the chance of stopping the clock. That trade is the one
              number here that is not measured.
            </li>
            <li>
              <strong>Blocked kicks end the play.</strong> A blocked field goal is treated as a
              miss, which understates the occasional return for a score.
            </li>
            <li>
              <strong>Penalties are absorbed into the fits.</strong> They appear in the fitted
              yardage and clock distributions but cannot be called or drawn.
            </li>
            <li>
              <strong>The 2026 season is not in it.</strong> nflverse publishes play-by-play
              nightly once games begin; the corpus runs through 2025 and gains the new season by
              re-running the build.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="mb-2 font-serif text-xl text-slate-900">11. Sources and stack</h2>
          <p>
            Play-by-play from <em>nflverse</em> via nflreadpy, 2016 to 2025. Models fit in Python
            with pandas, scikit-learn and NumPy; the engine ships as TypeScript running in a
            browser Web Worker with no backend and no per-request cost. Prior art that shaped the
            approach: Ben Baldwin&apos;s <em>nfl4th</em>, Brian Burke&apos;s work on fourth downs
            and the value of timeouts, FootballCommentary&apos;s Markov formulation of clock
            management, and the Yale Undergraduate Sports Analytics Group&apos;s study of timeout
            tendencies.
          </p>
        </div>
      </section>
    </main>
  );
}
