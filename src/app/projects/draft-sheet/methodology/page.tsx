import type { Metadata } from "next";
import Link from "next/link";

import WantMore from "@/app/_subscribe/WantMore";

export const metadata: Metadata = {
  title: "Draft Sheet — Methodology · Greg Lewis",
  description:
    "How the draft sheet is built: expert consensus as the spine, a bounded "
    + "positional adjustment, four ADP sources joined on a player-id crosswalk, "
    + "and what the offseason arrows can and cannot see.",
};

export default function Page() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
      <nav className="mb-8 flex items-center justify-between gap-4">
        <Link
          href="/projects/draft-sheet"
          className="text-xs uppercase tracking-wider text-slate-500 transition hover:text-slate-900"
        >
          ← Back to the sheet
        </Link>
        <WantMore project="draft-sheet" />
      </nav>

      <header className="mb-8">
        <h1 className="font-serif text-3xl leading-tight text-slate-900 sm:text-4xl">
          Methodology
        </h1>
        <p className="mt-3 text-base leading-relaxed text-slate-600">
          This sheet is about reading the market, not beating it. Everything below is in
          service of one rule: you should always be able to tell which parts are the
          consensus of a hundred analysts and which parts are arithmetic.
        </p>
      </header>

      <section className="space-y-8 text-[15px] leading-relaxed text-slate-700">
        <div>
          <h2 className="mb-2 font-serif text-xl text-slate-900">1. Consensus is the spine</h2>
          <p>
            There is no projection engine here, deliberately. Markets are driven by vibes,
            and a board that quietly &ldquo;improves&rdquo; on consensus into a tier of bad
            recommendations is worse than no board at all — flexibility that produces awful
            picks in some corner of the settings is not flexibility, it is a liability
            wearing a settings panel.
          </p>
          <p className="mt-3">
            So the board you see <em>is</em> the published expert consensus board for your
            format, tiers included, exactly where the analysts put them. FantasyPros
            publishes five: standard, half-PPR, full PPR, superflex, and half-PPR superflex,
            each built from more than a hundred analysts. Your settings pick one.
          </p>
        </div>

        <div>
          <h2 className="mb-2 font-serif text-xl text-slate-900">
            2. What your settings are allowed to change
          </h2>
          <p>
            <strong>Within a position, order never changes.</strong> Two receivers keep the
            order the market put them in, whatever your league does. The market&rsquo;s
            opinion of two receivers is better than anything computed here.
          </p>
          <p className="mt-3">
            <strong>Across positions, interleaving responds to your roster.</strong> Whether
            the 24th receiver goes before or after the 18th running back genuinely depends
            on how many of each your league starts, and a published board cannot personalise
            that for a 14-team superflex league. That shift is a single bounded term:
          </p>
          <div className="mt-3 overflow-x-auto">
            <pre className="w-full border-collapse bg-slate-50 p-3 text-[12.5px] font-mono text-slate-800">
{`offset(pos) = 14 × ln( demand_baseline(pos) / demand_yourLeague(pos) )
adjusted    = clamp(consensusRank + offset, ±18 ranks)`}
            </pre>
          </div>
          <p className="mt-3">
            It has three properties that are asserted in the build and fail it on violation.
            It <strong>reproduces consensus exactly</strong> when your league matches what the
            board assumes — the ratio is one, the logarithm is zero, the offset vanishes. It
            is <strong>monotone</strong>: more demand for a position can only move it up. And
            it is <strong>bounded</strong> at 18 ranks, so no combination of settings can
            manufacture a garbage tier. The sheet tells you, above the board, which board it
            snapped to and how far your settings pulled away from it.
          </p>
          <p className="mt-3">
            One assumption is stated rather than buried: a FLEX slot is spent 35% on running
            backs, 50% on receivers and 15% on tight ends; a superflex slot 75% on
            quarterbacks. Those are allocation assumptions, not a model.
          </p>
        </div>

        <div>
          <h2 className="mb-2 font-serif text-xl text-slate-900">
            3. Four markets, compared within position
          </h2>
          <p>
            ADP comes from Yahoo, ESPN, Sleeper and an aggregate of public mock drafts. Each
            row carries one cell per platform: the number is where that platform actually
            drafts him, and the tint is whether that is a bargain or a reach against the
            expert consensus.
          </p>
          <p className="mt-3">
            <strong>The comparison is made within position, and it has to be.</strong> The
            first version differenced each platform&rsquo;s overall rank against the overall
            consensus rank, and it painted almost every quarterback as a screaming reach on
            Sleeper — median gap of eighteen places. That was not a market edge, it was
            Sleeper&rsquo;s own ordering: <code>search_rank</code> surfaces quarterbacks far
            higher than a PPR consensus board ranks them. Comparing within position cancels
            that bias entirely (median gap: one place) and is the more useful question
            anyway, since you are choosing between running backs, not against the whole board.
          </p>
          <p className="mt-3">
            Color thresholds scale with positional depth. Three places between running backs
            is a great deal at RB5 and noise at RB50, and a flat cutoff lit up a third of the
            board at full strength. About seven per cent of cells now carry a strong tint.
          </p>
          <p className="mt-3">
            Two source traps are handled explicitly. <strong>ESPN&rsquo;s ADP saturates</strong>:
            roughly 720 players share a value near 170, which is a clamp rather than a market
            signal, so it is discarded past that point. And <strong>Sleeper publishes no ADP
            at all</strong> — its cell is where Sleeper ranks a player within his position,
            shown in italics and marked with an asterisk, never presented as a pick number.
          </p>
          <p className="mt-3">
            Joining four platforms needs a player-id crosswalk, because naive name matching
            fails on about 15% of the pool — every suffix case and every team defense. Team
            defenses have no id anywhere, so they are joined on team code.
          </p>
        </div>

        <div>
          <h2 className="mb-2 font-serif text-xl text-slate-900">4. Offseason movement</h2>
          <p>
            The arrow at the end of each row is thirty days of ADP movement: up means being
            drafted earlier than a month ago. It replaced a per-row sparkline, which was
            honest but cost 28px on every row to answer a question with three possible
            answers — a bad trade on a board whose whole argument is density.
          </p>
          <p className="mt-3">
            Thirty days is long enough that one noisy day cannot flip an arrow and short
            enough to still be news on draft weekend; the neutral band is six picks, against
            a median move of about five. The underlying series only becomes genuinely daily
            from around July — measured across the top 150, just 8% of players have any data
            point by March 1 and 29% by June 1, against 89% by July 1 — so a player with too
            little history gets no arrow rather than a fabricated flat one.
          </p>
        </div>

        <div>
          <h2 className="mb-2 font-serif text-xl text-slate-900">
            5. The team arrows — roster plus coaching
          </h2>
          <p>
            Each arrow blends two inputs, and they are kept separate on purpose. Hovering an
            arrow shows the split.
          </p>
          <p className="mt-3">
            <strong>Roster is derived.</strong> It compares the current consensus value of the
            players a team added against the players it lost at that position. A running back
            who left is priced at what the market thinks of him today, on his new team. That
            is reproducible arithmetic.
          </p>
          <p className="mt-3">
            <strong>Coaching is authored, and weighted heavily.</strong> A new play-caller can
            matter more to a position&rsquo;s production than any single signing — a pass-first
            coordinator can lift a whole receiving corps without the roster changing at all,
            and a run-heavy hire can quietly end a receiver&rsquo;s season as a WR2. A sheet
            that stayed silent on coaching would be missing most of the story, so it is not a
            footnote here.
          </p>
          <p className="mt-3">
            Coaching cannot be derived. The one free structured source for 2026 coaching is
            partially stale — it catches roughly six of the ten head-coach changes, still
            lists departed coaches and misspells others — and nothing free covers offensive
            coordinators, where about twenty teams changed. So each entry is hand-authored,
            carries its source, and is validated at build time. <strong>A team with no entry
            contributes zero to the arrow rather than a guess.</strong>
          </p>
          <p className="mt-3">
            The impact score is an editorial judgement in the range −2 to +2, informed by
            reported scheme and public expectation, and it is capped: one full step is worth
            35 value points against thresholds of 28 and 90, so coaching can carry a position
            across one boundary but can never manufacture a big move that the roster
            contradicts. Where a hire is good news for one position and bad for another — a
            pass-first coordinator is not equally good news for a running back — the score is
            set per position.
          </p>
          <p className="mt-3">
            <strong>Coaching is only written up where it plausibly moves production</strong> —
            ten teams, one sentence each. An earlier version led all thirty-two cards with a
            head coach, a coordinator, a scheme lineage and a paragraph, which buried the
            players. Every team still carries its staff behind the scenes so the arrows stay
            honest; the card just does not spend your attention on a coordinator swap that
            changes nothing.
          </p>
          <p className="mt-3">
            The three letter grades on each card are derived and each says exactly one thing.
            <strong> Offense</strong> is the consensus value of that team&rsquo;s projected
            skill starters — only the starters, since a third running back does not make an
            offense better. <strong>Defense</strong> is where the market ranks that team
            defense. <strong>Schedule</strong> is the average strength of the defenses that
            offense has to face, so an A is the easiest schedule. All three are graded against
            the other 31 teams, so a C means mid-league rather than bad, and none of them is a
            power ranking.
          </p>
          <p className="mt-3">
            What none of it can see: scheme fit for a specific player, a return from injury, a
            second-year leap, or a rookie the market has not priced yet.
          </p>
        </div>

        <div>
          <h2 className="mb-2 font-serif text-xl text-slate-900">
            6. The Top 200, and what a blurb is
          </h2>
          <p>
            Every blurb on the player page is <strong>composed from a signal that exists in
            the data</strong>: a change of team, a new play-caller, how far the market has
            moved him in thirty days, whether the expert panel is unusually split on him, his
            depth-chart spot, his injury designation. Nothing is borrowed from someone
            else&rsquo;s analysis and nothing is invented. Where a player genuinely has no
            news, it says so rather than manufacturing a story.
          </p>
          <p className="mt-3">
            That reads thinner than a human analyst would write, and it should. What it buys
            is coverage: two hundred players, all current as of the last rebuild, with no
            stale July takes hiding among them.
          </p>
          <p className="mt-3">
            <strong>Upside and worst case are the genuinely sourced part.</strong> They are
            not a model&rsquo;s spread — they are the most and least optimistic of the 100+
            experts on the consensus panel, and the earliest and latest a player has actually
            been taken in public mock drafts. Those are real people&rsquo;s real opinions and
            real picks.
          </p>
          <p className="mt-3">
            Injury tags come from Sleeper&rsquo;s designation. The tooltip leads with the
            injury itself rather than the label, because Sleeper lists a player who has had
            ACL surgery as &ldquo;Questionable&rdquo; and reading that first would mislead
            you. Sleeper publishes no return date, so none is invented: the text says what the
            designation guarantees under the roster rules and stops there.
          </p>
        </div>

        <div>
          <h2 className="mb-2 font-serif text-xl text-slate-900">7. Your data</h2>
          <p>
            There are no accounts. Your settings, stars and removed players live in your own
            browser&rsquo;s storage and are never sent anywhere. That is the right trade for
            a thing you use once a year in a basement on bad wifi — but it means clearing
            site data, or opening the sheet on a different device, starts fresh. The
            &ldquo;Share settings&rdquo; button encodes your league setup into a link so you
            can carry it across devices.
          </p>
          <p className="mt-3">
            Removed players drop out <em>before</em> replacement level is computed, so marking
            twenty keepers genuinely moves where each position runs dry. That is the one thing
            a printed sheet from the internet can never do for you.
          </p>
        </div>

        <div>
          <h2 className="mb-2 font-serif text-xl text-slate-900">8. Sources</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Expert consensus rankings and tiers — FantasyPros.</li>
            <li>
              ADP — Fantasy Football Calculator (free for personal and commercial use with
              attribution), Yahoo Fantasy, and ESPN Fantasy public endpoints.
            </li>
            <li>Player metadata and search rank — Sleeper.</li>
            <li>Cross-platform player id crosswalk — DynastyProcess.</li>
            <li>Rosters, draft picks and team marks — nflverse. Marks served by ESPN&rsquo;s CDN.</li>
          </ul>
        </div>
      </section>
    </main>
  );
}
