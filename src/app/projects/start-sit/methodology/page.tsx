import type { Metadata } from "next";
import Link from "next/link";

import WantMore from "@/app/_subscribe/WantMore";

export const metadata: Metadata = {
  title: "Start/Sit by the Betting Market — Methodology · Greg Lewis",
  description:
    "How prop lines become fantasy points: two tiers of market evidence, the vig, "
    + "the inversion from a line to an expectation, Poisson touchdowns, a simulated "
    + "band, and the rule for calling a start/sit too close.",
};

export default function Page() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
      <nav className="mb-8 flex items-center justify-between gap-4">
        <Link
          href="/projects/start-sit"
          className="text-xs uppercase tracking-wider text-slate-500 transition hover:text-slate-900"
        >
          ← Back to the advisor
        </Link>
        <WantMore project="start-sit" />
      </nav>

      <header className="mb-8">
        <h1 className="font-serif text-3xl leading-tight text-slate-900 sm:text-4xl">
          Methodology
        </h1>
        <p className="mt-3 text-base leading-relaxed text-slate-600">
          The market is the projection. Everything below is the arithmetic that turns a
          posted line into a number of fantasy points, and the rules for what the page is
          allowed to say when the arithmetic runs out.
        </p>
      </header>

      <section className="space-y-8 text-[15px] leading-relaxed text-slate-700">
        <div>
          <h2 className="mb-2 font-serif text-xl text-slate-900">1. Why the market</h2>
          <p>
            A prop line is priced by people with money at risk, moved by every bettor who
            disagrees, and repriced the moment an injury report changes. No projection
            system updates that fast or answers to that much accountability. The published
            services that build projections this way (Vegas Edge Fantasy, Win With Odds,
            Fantasy Alarm&rsquo;s weekly column) all start from the same observation, and so
            does this page.
          </p>
          <p className="mt-3">
            It is also a limited signal. The market prices about two hundred players a week,
            so a deep bench player has no line, and the page says so rather than inventing
            one. The market also carries no opinion about your league&rsquo;s roster
            construction, your opponent, or whether you need a ceiling or a floor. Those are
            yours.
          </p>
        </div>

        <div>
          <h2 className="mb-2 font-serif text-xl text-slate-900">2. Two tiers of evidence</h2>
          <p>
            <strong>Sportsbook lines</strong> are the headline number. For each market the
            page reads every book on the feed, works each one out separately, and takes the
            median. The number of books behind a line is shown on every row.
          </p>
          <p className="mt-3">
            <strong>Pick&rsquo;em lines</strong> come from Sleeper&rsquo;s own pick&rsquo;em
            product and go considerably deeper: a team&rsquo;s third receiver and second back
            usually have a receptions and a yardage line there when no book has posted one.
            A pick&rsquo;em payout is a contest multiplier rather than a book&rsquo;s price, so
            the lean it encodes is weaker evidence. The page uses it only where no sportsbook
            line exists, labels the row <em>pick&rsquo;em</em>, and never averages it into the
            sportsbook consensus.
          </p>
        </div>

        <div>
          <h2 className="mb-2 font-serif text-xl text-slate-900">3. From a line to an expectation</h2>
          <p>
            A line is the market&rsquo;s median: the point where over and under are equally
            likely once the prices are equal. The prices are rarely equal. Receptions at 5.5
            with the over at −139 and the under at +119 say the true center sits above 5.5.
            Three steps recover it.
          </p>
          <div className="mt-3 overflow-x-auto">
            <pre className="w-full bg-slate-50 p-3 text-[12.5px] font-mono text-slate-800">
{`p_over  = implied(over) / (implied(over) + implied(under))   remove the vig
ev      = line + sigma × Φ⁻¹(p_over)                           apply the lean
sigma   = a + b × line, floored                                 the stat's game spread`}
            </pre>
          </div>
          <p className="mt-3">
            The spread is measured, not assumed. Every 2025 player with eight or more games
            contributes his mean and his game-to-game standard deviation for each stat; the
            spread grows with the level, so it is fit as a line in the level, weighted by games
            played, and floored so a tiny line cannot get a spread near zero. Passing yards is
            the exception: across 37 quarterbacks the level explains almost none of the
            variance, so the spread there is a constant. A 55% lean on a receptions line moves
            the expectation by about a tenth of a spread, which is roughly a quarter of a
            reception. The lean is a small correction, and it should be.
          </p>
        </div>

        <div>
          <h2 className="mb-2 font-serif text-xl text-slate-900">4. Touchdowns</h2>
          <p>
            Touchdowns are priced as a probability of scoring at least once, not as a line.
            Under a Poisson count that one number pins the rate:{" "}
            <span className="font-mono text-[13px]">λ = −ln(1 − p)</span>, and λ is the
            expected touchdowns. A 46% chance to score is 0.62 expected touchdowns, which is
            3.7 points. The Poisson assumption matters mostly at the top: a player priced at
            70% to score is credited with 1.2 expected touchdowns, because a 70% scorer
            sometimes scores twice.
          </p>
          <p className="mt-3">
            The books on this feed post only a Yes price, so the vig cannot be removed by
            pairing. Instead each team&rsquo;s summed rates are scaled down to its implied
            touchdowns from the spread and the total, at the league&rsquo;s touchdowns per
            point. That takes about a fifth off the raw figures, which is the size of the
            hold in anytime-touchdown markets. The probability shown on a card is the one the
            scaled rate implies, not the raw price. Quarterbacks&rsquo; anytime lines are
            rushing touchdowns; passing touchdowns are their own market.
          </p>
        </div>

        <div>
          <h2 className="mb-2 font-serif text-xl text-slate-900">5. Points, and the band around them</h2>
          <p>
            Expected points are the expectations weighted by your scoring: 0.1 per yard, 0.04
            per passing yard, 4 or 6 per passing touchdown, −1 per interception, 6 per
            touchdown, and 0, ½ or 1 per reception. Carries carry no points and stay on the
            card as context. Not modeled: fumbles, two-point conversions and yardage bonuses.
          </p>
          <p className="mt-3">
            The floor and ceiling are simulated. Each selected player is drawn as one game
            five thousand times: yards from a gamma distribution with the market&rsquo;s mean
            and the fitted spread, which is never negative and is right-skewed the way real
            yardage is; receptions and carries around their expectations at the fitted
            spread; touchdowns and interceptions as Poisson counts. The band is the 20th to
            80th percentile of the total. The draws are shared across players, so the
            head-to-head figure in the verdict is simply how often one player&rsquo;s total
            beat the other&rsquo;s. The build fails if the simulated mean drifts more than
            half a point from the closed-form expectation.
          </p>
          <p className="mt-3">
            Players are drawn independently. Two receivers on the same team are in fact
            correlated through their quarterback, and the band slightly overstates how often
            one beats the other. That is a known gap in this version.
          </p>
        </div>

        <div>
          <h2 className="mb-2 font-serif text-xl text-slate-900">6. When the answer is &ldquo;too close to call&rdquo;</h2>
          <p>
            The highest expected total is always named. Any rival whose gap to it is inside
            two combined standard errors, or under one point, is marked too close to call
            beside it. The standard error of a line is the disagreement between books,
            carried through the scoring weights; with a single source there is no
            disagreement to measure, so each stat gets a floor of roughly how far a line moves
            in an ordinary week. This mirrors the rule the two-minute drill uses for its
            fourth-down calls, and for the same reason: a page that names a winner over a
            half-point gap is claiming a precision the inputs do not have.
          </p>
        </div>

        <div>
          <h2 className="mb-2 font-serif text-xl text-slate-900">7. What the page refuses to do</h2>
          <p>
            A player with no line is shown with that fact, excluded from the verdict, and not
            ranked last as if zero were a projection. A player with only a touchdown price
            gets a partial total flagged as partial. Nothing is imputed from last season,
            from a depth chart, or from the other players on the page. The build checks that
            the market numbers still track last season&rsquo;s per-game averages (rank
            correlation above 0.6 for yards and receptions), that no expectation sits more
            than one and a half spreads from its line, and that every priced player is on a
            team in a game that week. It also checks the whole chain against an answer key
            the market supplies: the books post their own fantasy-score line for most fully
            priced players, and the page&rsquo;s full-PPR total must agree with it at a
            correlation above 0.98 and within half a point on average. At the first build it
            agreed at 0.996 and 0.04 points. If any check fails, the previous lines stay live.
          </p>
        </div>

        <div>
          <h2 className="mb-2 font-serif text-xl text-slate-900">8. The waiver report</h2>
          <p>
            A Sleeper league id names every roster in the league, and every roster names its
            players in the same id space this page uses. &ldquo;Best available&rdquo; is every
            priced player on none of them, ranked by expected points for the scoring set on
            the page, eight per position. The league is read from Sleeper&rsquo;s public API in
            your browser and stored nowhere else. The report knows nothing about waiver order,
            claim priority or who on your roster is droppable; it answers one question, which
            of the unowned players the market expects to score this week.
          </p>
        </div>

        <div>
          <h2 className="mb-2 font-serif text-xl text-slate-900">9. Sources and cadence</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Sportsbook player props and game lines — SportsGameOdds, as posted by the books on the plan.</li>
            <li>Pick&rsquo;em lines, player metadata and injury designations — Sleeper.</li>
            <li>Schedule, spreads and totals, 2025 weekly stats and team marks — nflverse. Marks and headshots served by ESPN&rsquo;s CDN.</li>
            <li>Cross-platform player ids — DynastyProcess.</li>
          </ul>
          <p className="mt-3">
            Lines are refreshed each morning Wednesday through Sunday and once more late
            Sunday morning, after the props for questionable players post. The timestamp in
            the toolbar is the snapshot you are reading. Nothing on the page is a bet
            recommendation.
          </p>
        </div>
      </section>
    </main>
  );
}
