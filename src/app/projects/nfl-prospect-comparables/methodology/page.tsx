import Link from "next/link";

export const metadata = {
  title: "Methodology — NFL Prospect Comparables",
};

export default function MethodologyPage() {
  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <Link
          href="/projects/nfl-prospect-comparables"
          className="text-xs text-stone-500 hover:text-stone-900 transition-colors"
        >
          ← back to the graph
        </Link>

        <h1 className="mt-8 text-3xl font-semibold tracking-tight">
          Methodology
        </h1>
        <p className="mt-2 text-sm text-stone-500">
          How the comparables engine and ScoutBot work, end-to-end.
        </p>

        <div className="mt-12 space-y-10 text-stone-700 leading-relaxed">
          <section>
            <h2 className="text-sm uppercase tracking-wider text-stone-500 mb-2">
              The shape of the problem
            </h2>
            <p>
              Coming soon. The full methodology writeup will cover the
              feature catalog, the v3 layered comp engine, the cluster-based
              archetype derivation, and how ScoutBot grounds its answers.
            </p>
          </section>

          <section>
            <h2 className="text-sm uppercase tracking-wider text-stone-500 mb-3">
              Sources
            </h2>
            <p className="text-sm text-stone-600 mb-4">
              ScoutBot answers are grounded in a curated corpus of
              pre-draft scouting from twelve named analysts and three
              reference layers. Every claim in an answer is traceable
              back to one or more of these sources. ScoutBot itself writes
              as a single editorial voice, but the underlying retrieval is
              source-tagged and transparent.
            </p>
            <p className="text-sm text-stone-600 mb-4">
              An important distinction: the chat retrieval corpus and the
              comp-engine&rsquo;s similarity embeddings are{' '}
              <em>separate pipelines</em>. The similarity engine uses
              snapshot-only pre-draft sources (Brugler, Walter Football,
              etc.) — Wikipedia and other living-document sources are
              excluded there because retrospective revisionism would leak
              post-draft signal into a &ldquo;pre-draft&rdquo; embedding.
              Chat retrieval has no such constraint and uses Wikipedia
              freely as a current-info layer.
            </p>
            <dl className="space-y-4 text-sm">
              <div>
                <dt className="font-medium text-stone-800">
                  Dane Brugler — &ldquo;The Beast&rdquo; (The Athletic)
                </dt>
                <dd className="text-stone-600 mt-0.5">
                  Brugler&rsquo;s annual draft guide. Comprehensive
                  per-prospect profiles covering archetype, strengths,
                  concerns, and analyst comp. Considered the gold-standard
                  single source by NFL front offices. Licensed material —
                  paraphrased, never quoted verbatim.
                </dd>
              </div>
              <div>
                <dt className="font-medium text-stone-800">
                  B/R Scouting Dept (Bleacher Report)
                </dt>
                <dd className="text-stone-600 mt-0.5">
                  Brandon Thorn, Dame Parson, Daniel Harms and Matt Holder
                  spent eight months evaluating the 2026 class. Densest
                  source in the corpus: dedicated multi-paragraph
                  scouting articles per prospect plus position-group
                  rankings, a final big board, and a final mock.
                </dd>
              </div>
              <div>
                <dt className="font-medium text-stone-800">
                  NFL Network (NFL.com)
                </dt>
                <dd className="text-stone-600 mt-0.5">
                  Three analyst voices, distinguished at retrieval time:{' '}
                  <strong>Daniel Jeremiah</strong> (Top 50 + Top 150 big
                  boards),{' '}
                  <strong>Lance Zierlein</strong> (mock drafts 2.1 / 3.0
                  / 4.0 + position-group rankings), and{' '}
                  <strong>Bucky Brooks</strong> (final mock + top-five
                  by position).
                </dd>
              </div>
              <div>
                <dt className="font-medium text-stone-800">
                  ESPN
                </dt>
                <dd className="text-stone-600 mt-0.5">
                  Five analyst boards bundled under one source tag:{' '}
                  <strong>Mel Kiper Jr.</strong> (top 150),{' '}
                  <strong>Matt Miller</strong> (top 481),{' '}
                  <strong>Jordan Reid</strong> (top 499), and{' '}
                  <strong>Jeff Legwold</strong> (top 100). Plus ESPN&rsquo;s
                  first-round grades-with-comps article and a
                  trait-by-trait standouts piece (&ldquo;most accurate
                  passer&rdquo;, &ldquo;best deep-ball thrower&rdquo;,
                  etc.) that yields per-trait observations the bot can
                  surface for skill-specific questions.
                </dd>
              </div>
              <div>
                <dt className="font-medium text-stone-800">
                  CBS Sports
                </dt>
                <dd className="text-stone-600 mt-0.5">
                  Two analyst voices:{' '}
                  <strong>Mike Renner</strong> (top 250 + top 150 big
                  boards) and <strong>Ryan Wilson</strong> (top 125 +
                  final big board vs. consensus). Renner is positional-
                  value-aware; Wilson&rsquo;s commentary frames each
                  ranking against the industry consensus number.
                </dd>
              </div>
              <div>
                <dt className="font-medium text-stone-800">
                  Connor Rogers (Rotoworld / NBC Sports)
                </dt>
                <dd className="text-stone-600 mt-0.5">
                  Position-by-position rankings (QB / RB / WR / TE / OL)
                  with film-room tape-grade commentary. Stronger on
                  athletic-traits descriptions than draft-capital
                  projection.
                </dd>
              </div>
              <div>
                <dt className="font-medium text-stone-800">
                  Walter Football
                </dt>
                <dd className="text-stone-600 mt-0.5">
                  Public per-prospect scouting profiles from
                  walterfootball.com. Strengths / Weaknesses / Summary
                  format that mirrors Brugler&rsquo;s structure. Useful
                  second voice on lower-profile prospects where the
                  premium services are thin.
                </dd>
              </div>
              <div>
                <dt className="font-medium text-stone-800">
                  Wikipedia (chat retrieval only)
                </dt>
                <dd className="text-stone-600 mt-0.5">
                  Reference layer used to surface current biographical and
                  career-context facts for any prospect (historical or
                  2026). Excluded from the comp engine&rsquo;s similarity
                  embeddings to prevent retrospective leakage — the policy
                  split is documented above.
                </dd>
              </div>
            </dl>
            <p className="mt-4 text-xs text-stone-500 italic">
              Two additional outlets (Pro Football Network, The 33rd Team)
              were attempted but use Cloudflare bot protection that
              rejects direct scraping. They&rsquo;re queued for a future
              pass with a stealth fetcher. PFF is paywalled and would
              require manual ingestion; not currently in scope.
            </p>
          </section>

          <section>
            <h2 className="text-sm uppercase tracking-wider text-stone-500 mb-2">
              What you can do today
            </h2>
            <p>
              Click around the 3D graph. Open prospects to see their top
              comparables and defining traits, or chat with ScoutBot about
              any player&rsquo;s profile. A long-form writeup of the
              underlying model will live here.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
