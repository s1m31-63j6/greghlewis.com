export function MethodDocs() {
  return (
    <article className="exit-doc">
      <h2>The question</h2>
      <p>
        A founder-led B2B services firm, roughly $25M in annual revenue and
        doubling year over year, sat at a familiar inflection. The current
        cashflow comfortably supported a strategic sale today. The same
        cashflow, compounded for three years, would support a much larger
        one. The question the founders were actually asking was not
        &ldquo;sell or hold?&rdquo; — they had already decided to sell. The
        question was when, and what the company needed to look like at that
        moment for a buyer to pay a number that justified the wait.
      </p>
      <p>
        This page is the analytical contribution to that decision. It is one
        of five workstreams in a broader strategic engagement; the model
        below sits alongside competitive analysis, customer research, and
        organizational design that don&rsquo;t appear here. What it does is
        isolate the financial structure of the timing question so the rest of
        the decision can be made on its merits, not on a misread of the
        math.
      </p>

      <h2>How the model works</h2>
      <p>
        Each month of the projection produces four values, all in nominal
        terms (this is a 3-year horizon, so inflation is folded into the
        choice of EBITDA multiple rather than modeled explicitly):
      </p>
      <ul>
        <li>
          <strong>ARR.</strong> Compounded forward from the prior month at a
          monthly growth rate. The rate has two components: a baseline
          organic rate (4.17%/mo ≈ 60% annualized, set to the firm&rsquo;s
          observed trailing-twelve-month pace), and a restructure lift that
          comes online over a ramp curve.
        </li>
        <li>
          <strong>EBITDA.</strong> ARR × a constant margin. The firm in
          question runs near a 20% margin and the analysis holds that
          flat — adding management infrastructure costs people, but the
          additional revenue it unlocks holds the ratio.
        </li>
        <li>
          <strong>Exit value.</strong> Annualized EBITDA × a constant
          multiple (5× as the default, the typical mid-market services
          exit). This is the headline number on the chart and the only
          number that drives the timing comparison.
        </li>
        <li>
          <strong>Headcount.</strong> Tracked descriptively as new ARR ÷ ARR
          per contractor. Useful for sanity-checking what the company would
          have to look like operationally at the sale date, but not part of
          the financial logic.
        </li>
      </ul>
      <p>
        The headline metric is the <strong>delta vs. sell now</strong>: how
        much additional valuation each reinvestment path produces over
        taking today&rsquo;s EBITDA at today&rsquo;s multiple. Absolute exit
        values are dominated by the choice of multiple — a meaningful
        analysis isolates what the founder&rsquo;s actions, not the market,
        contribute.
      </p>

      <h2>The restructure lift, and why it matters more than it looks</h2>
      <p>
        The lever this model exposes — a roughly one-point-per-month
        addition to the growth rate, ramped over ten months as new
        managers and directors come up to speed — looks unremarkable in
        isolation. Five percent monthly growth instead of four percent is
        the kind of difference a glance at a trailing chart would never
        catch. Over a 33-month build, it compounds to a 50% higher exit
        valuation.
      </p>
      <p>
        That compounding is the whole story. Three observations from
        sweeping the assumptions:
      </p>
      <ul>
        <li>
          <strong>Time is the dominant lever.</strong> Holding the lift at
          1.3%/mo and moving the sale date from 24 to 42 months changes the
          delta vs. sell-now by more than doubling the lift while keeping
          the date fixed. Founders who underestimate the cost of waiting
          tend to overestimate the cost of restructuring.
        </li>
        <li>
          <strong>The first 10 months of ramp are the expensive part.</strong>
          A faster ramp curve (six months vs. ten) closes most of the gap
          between the median build and the aggressive case. Most of the
          execution risk in a build-to-sell strategy sits in those first
          months, when management costs are real and revenue lift is
          partial.
        </li>
        <li>
          <strong>The multiple matters less than expected.</strong> Moving
          the EBITDA multiple from 4× to 6× changes exit value linearly
          across all paths — which means it doesn&rsquo;t change the
          <em> delta</em> between them. The argument for restructuring is
          not multiple-dependent.
        </li>
      </ul>

      <h2>What the model deliberately doesn&rsquo;t capture</h2>
      <p>
        Three categories of risk sit outside this kind of model, and each
        is large enough to invert the strictly-numeric answer.
      </p>
      <p>
        <strong>Execution risk on the lift itself.</strong> The 1.3%/mo
        figure isn&rsquo;t observed — it&rsquo;s the lift required to match
        the team&rsquo;s qualitative case for what management
        infrastructure would unlock. If the new directors don&rsquo;t hit
        the productivity assumptions, or if onboarding stretches from ten
        months to eighteen, the build path can underperform the organic
        glide by enough to make the wait actively painful. The model
        presents the bull case for restructure cleanly; the bear case is
        what the rest of the engagement was designed to manage.
      </p>
      <p>
        <strong>Market timing.</strong> Multiples for mid-market services
        firms compressed by roughly 30% from late-2021 peaks to late-2023
        troughs. A model that holds the multiple constant across a 3-year
        horizon is making a strong implicit claim about either market
        stability or the founders&rsquo; ability to time the sale. Neither
        is reliably true.
      </p>
      <p>
        <strong>Founder fatigue.</strong> The argument for selling now is
        often not the argument the spreadsheet makes. It is that the
        founders have been running the company for seven years and would
        prefer to do something else. That preference compounds, just like
        revenue does, and is not in the model. The point of running the
        numbers is to make sure the non-numeric answer is being chosen
        with eyes open.
      </p>

      <h2>Conclusion</h2>
      <p>
        On the numbers alone, building to sell beats selling now by a wide
        margin under any reasonable parameter set. The compounding window
        is long enough that even a half-strength restructure lift more
        than doubles the founder&rsquo;s exit value at three years. The
        comparison the model is built for — sell now vs. take the time —
        is one-sided enough that it is mostly useful as a refutation of
        the simpler argument.
      </p>
      <p>
        The argument worth having, the one the engagement actually
        centered, is whether the firm can execute the build. That is a
        question about leadership capacity, hiring quality, and the
        company&rsquo;s ability to codify the founder&rsquo;s tacit
        knowledge into a process that scales without them. The model
        doesn&rsquo;t answer it. It just clears the bad financial
        argument out of the way so the real one can be made honestly.
      </p>
    </article>
  );
}
