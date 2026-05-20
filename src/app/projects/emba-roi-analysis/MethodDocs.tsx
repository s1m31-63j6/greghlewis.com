export function MethodDocs() {
  return (
    <article className="emba-doc">
      <h2>The question</h2>
      <p>
        Executive MBA programs sit at the intersection of two big numbers:
        a six-figure cost and an outsized claim on future earnings. Most
        marketing materials answer the &ldquo;is it worth it?&rdquo;
        question with a single anchor — the average post-program salary
        bump, often quoted at 30–50% within five years. That number is
        accurate as an industry average and badly incomplete as a personal
        decision input. It ignores time horizon, savings discipline, market
        returns on the same dollars, and what happens if the program is
        funded out of pocket rather than subsidized by an employer.
      </p>
      <p>
        This calculator runs the full 25-to-30-year projection. Every
        assumption on the left side of the screen is editable; the chart
        and headline numbers recompute live. The intent is not to deliver a
        verdict, but to make the structure of the decision visible — which
        levers actually move the answer, and which ones turn out to barely
        matter.
      </p>

      <h2>How the model works</h2>
      <p>
        Each year of the projection produces four values in real
        (year-0-dollar) terms:
      </p>
      <ul>
        <li>
          <strong>Wages.</strong> Nominal salary grows at the chosen EMBA
          rate for the chosen number of post-program years, then defaults to
          a 4% white-collar trajectory. Wages are deflated to year-0 dollars
          using the chosen inflation rate.
        </li>
        <li>
          <strong>Disposable savings.</strong> Real wages minus tithing, minus
          income tax, multiplied by the household savings rate. This is the
          slice of income that actually enters the investment account each
          year.
        </li>
        <li>
          <strong>Program costs.</strong> Out-of-pocket tuition (net of
          employer reimbursement) plus other education expenses, spread over
          the two years of the program. Subtracted from disposable savings —
          and frequently more than them, which is why the first two years
          show a negative investment-capital figure.
        </li>
        <li>
          <strong>Investment income.</strong> Last year&rsquo;s balance times
          the after-tax market return. Compounded into the principal each
          subsequent year.
        </li>
      </ul>
      <p>
        The headline number is the real-terms retirement nest egg — what the
        investment balance is worth, in today&rsquo;s dollars, at the chosen
        retirement age. The number that drives the editorial story is
        <strong> Δ vs. baseline:</strong> the same projection run with no
        EMBA growth and no program costs, and the gap between the two.
        Absolute nest-egg values are dominated by market returns and
        starting balance; the comparison is the only number that isolates
        what the program actually contributes.
      </p>

      <h2>What actually moves the answer</h2>
      <p>
        Three observations from sweeping the assumptions:
      </p>
      <ul>
        <li>
          <strong>Market return is the dominant assumption.</strong> Stocks
          have returned roughly 9.5% annualized over the last two decades.
          That number sets a high bar for any alternative use of capital,
          including a tuition payment. Dropping the market return to 6%
          flips several scenarios from negative to positive; raising it to
          12% does the opposite.
        </li>
        <li>
          <strong>Program cost is a rounding error.</strong> Across realistic
          tuition ranges ($30k–$120k out of pocket), the long-run delta moves
          by a fraction of what changing the wage-growth assumption does.
          The cost-of-the-program-versus-payoff framing — common in
          marketing copy — misses where the leverage actually lives.
        </li>
        <li>
          <strong>The constant savings rate quietly does most of the work.</strong>
          A 12% savings rate means a $10,000 marginal raise contributes
          roughly $780 to the investment account after tithing and tax. The
          remaining $9,000+ disappears into lifestyle. If a household is
          disciplined enough to bank the marginal gain instead, the
          compounding effect is large enough to flip nearly every scenario
          to a positive verdict. The &ldquo;Save the marginal gain&rdquo;
          toggle in the controls makes this visible.
        </li>
      </ul>

      <h2>What the model doesn&rsquo;t capture</h2>
      <p>
        Three categories of value sit outside any reasonable financial
        model, and each is large enough to invert the strictly monetary
        answer.
      </p>
      <p>
        <strong>Network effects.</strong> EMBA cohorts are designed to compress
        a decade of professional relationship-building into two years.
        Career-altering job offers, board seats, business partnerships, and
        investor introductions show up in salary data eventually, but with
        such a long and noisy lag that no model can reliably attribute them.
        For candidates working remotely or in geographies thin on local
        connections, network is often the largest unmodeled upside.
      </p>
      <p>
        <strong>Optionality.</strong> A degree changes the set of jobs a person
        can credibly apply for, and the resilience of their career to a
        single employer&rsquo;s decisions. Optionality has no clean dollar
        figure, but it is real and often dispositive.
      </p>
      <p>
        <strong>The person becoming who they are becoming.</strong> Two years
        of formal study with peers and demanding instructors produces a
        different professional than two years of the same role at the same
        company. That difference compounds across decades in ways no
        retirement calculator will price correctly.
      </p>

      <h2>Conclusion</h2>
      <p>
        On the numbers alone, an EMBA is a hard sell. The market return
        bar is high, the constant-savings-rate assumption is realistic, and
        only the upper half of plausible wage-growth outcomes meaningfully
        clear the baseline. A breakeven analysis lands somewhere around a
        one-time 30–35% wage step within the first year post-program —
        aggressive, but not impossible for candidates moving into senior
        general-management roles.
      </p>
      <p>
        On the wider lens, the EMBA looks better than the calculator says.
        Network, optionality, and personal development are large categories
        of value that the model deliberately omits and the marketing copy
        deliberately oversells. Reasonable people disagree about how much to
        weight them; the goal of this page is not to settle that, but to
        clear away the bad financial argument so the real one can be made
        honestly.
      </p>
    </article>
  );
}
