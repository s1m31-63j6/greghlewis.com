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
          How a 2026 prospect ends up as a vector, where the comparisons come
          from, and what ScoutBot is allowed to say.
        </p>

        <div className="mt-12 space-y-12 text-stone-700 leading-relaxed">
          <section>
            <h2 className="text-sm uppercase tracking-wider text-stone-500 mb-3">
              The shape of the problem
            </h2>
            <p>
              Pre-draft comparables are an old genre. Every analyst has a
              preferred &ldquo;X reminds me of Y&rdquo; line, and every model
              has a preferred way of formalizing it. The interesting question
              isn&rsquo;t whether comps work — it&rsquo;s how to build them
              from material that doesn&rsquo;t require a $500/year scouting
              subscription.
            </p>
            <p className="mt-4">
              The engine here uses 100% public play-by-play (nflverse + CFBD)
              for engineered features, plus seven free analyst voices and one
              paywalled one (Brugler&rsquo;s &ldquo;The Beast&rdquo;) for the
              language layer. The point isn&rsquo;t to beat PFF or Brugler.
              It&rsquo;s to show what falls out when you take public data
              seriously, layer it intentionally, and let the eval metrics
              tell you when an architectural choice is masking a problem.
            </p>
            <p className="mt-4">
              Pool: 1,048 prospects across 2014–2026, skill positions only
              (QB / RB / WR / TE). 2014–2020 is the training cohort
              (settled outcomes), 2021–2025 is the validation cohort
              (partial outcomes), 2026 is the prediction cohort.
            </p>
          </section>

          <section>
            <h2 className="text-sm uppercase tracking-wider text-stone-500 mb-3">
              From play-by-play to a player vector
            </h2>
            <p>
              Each prospect ends up as a vector in five layered subspaces.
              Three of them are deterministic transforms of public data:
            </p>
            <ul className="mt-4 space-y-3 text-sm">
              <li>
                <span className="font-medium text-stone-800">BODY</span>{" "}
                — combine and pro-day measurables (height, weight, 40, RAS).
                3–7 features per position.
              </li>
              <li>
                <span className="font-medium text-stone-800">VOLUME</span>{" "}
                — career counting stats (snaps, attempts, targets, yards),
                normalized to a per-game and a career-arc-velocity form so
                a five-game freshman season doesn&rsquo;t read as a four-year
                workload.
              </li>
              <li>
                <span className="font-medium text-stone-800">EFFICIENCY</span>{" "}
                — the heart of the engine. EPA-per-attempt splits, CPOE,
                success rate by down and distance, schedule-adjusted
                production, aDOT, pressure-handling rates. ~30–50 features
                per position computed directly from the play-by-play parquet.
              </li>
              <li>
                <span className="font-medium text-stone-800">DRAFT</span>{" "}
                — three features encoding the prospect&rsquo;s actual draft
                slot: capital percentile, round normalization, and a Day-1
                indicator. New in v3 (more on the methodology choice below).
              </li>
              <li>
                <span className="font-medium text-stone-800">TRAITS</span>{" "}
                — a 10–14-dimension scouting vector per position
                (accuracy_short, contact_balance, route_tree_breadth, etc.),
                each scored 1–5 by Sonnet 4.6 reading every analyst chunk
                we have for that prospect. The scores are deterministic
                given the same input chunks; the prompt asks for evidence
                quotes so each score is auditable in the side panel.
              </li>
            </ul>
            <p className="mt-4">
              Total catalog: 131 named features in
              <code className="mx-1 rounded bg-stone-100 px-1 py-0.5 text-xs">
                engine/features/catalog.py
              </code>
              (70 QB / 54 RB / 56 WR / 45 TE) plus the trait dimensions.
              Engineered features are the &ldquo;cake&rdquo; — Brugler-in-RAG
              is the cherry on top.
            </p>
          </section>

          <section>
            <h2 className="text-sm uppercase tracking-wider text-stone-500 mb-3">
              Five lenses, weighted into one similarity score
            </h2>
            <p>
              Each layer is L2-normalized inside its own subspace, then
              cosine-compared. The five layer similarities are then combined
              by per-position weights:
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="text-sm w-full">
                <thead>
                  <tr className="text-xs uppercase tracking-wider text-stone-500">
                    <th className="text-left pb-2">Position</th>
                    <th className="text-right pb-2 font-normal">BODY</th>
                    <th className="text-right pb-2 font-normal">VOLUME</th>
                    <th className="text-right pb-2 font-normal">EFFICIENCY</th>
                    <th className="text-right pb-2 font-normal">DRAFT</th>
                    <th className="text-right pb-2 font-normal">TRAITS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200 font-mono">
                  <tr>
                    <td className="py-1.5 font-sans">QB</td>
                    <td className="text-right text-stone-400">0.00</td>
                    <td className="text-right">0.20</td>
                    <td className="text-right">0.25</td>
                    <td className="text-right">0.30</td>
                    <td className="text-right">0.25</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 font-sans">RB</td>
                    <td className="text-right">0.15</td>
                    <td className="text-right text-stone-400">0.00</td>
                    <td className="text-right text-stone-400">0.00</td>
                    <td className="text-right">0.25</td>
                    <td className="text-right">0.60</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 font-sans">WR</td>
                    <td className="text-right">0.15</td>
                    <td className="text-right">0.35</td>
                    <td className="text-right text-stone-400">0.00</td>
                    <td className="text-right">0.05</td>
                    <td className="text-right">0.45</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 font-sans">TE</td>
                    <td className="text-right">0.05</td>
                    <td className="text-right">0.20</td>
                    <td className="text-right text-stone-400">0.00</td>
                    <td className="text-right">0.30</td>
                    <td className="text-right">0.45</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-4">
              A few weights demand explanation. <strong>QB BODY = 0</strong>{" "}
              — once a QB clears the broad athletic floor, measurables
              don&rsquo;t separate professional outcomes. <strong>RB
              VOLUME = 0</strong> — workload archetype is already encoded
              in the trait scores (workhorse vs. scatback vs. three-down),
              so an explicit volume lens double-counts and inflates close
              comps. <strong>WR DRAFT = 0.05</strong> — receiver draft slot
              is the noisiest outcome correlate of the four positions, and
              we want the comp set to read as archetype-similar, not
              draft-tier-similar.
            </p>
          </section>

          <section>
            <h2 className="text-sm uppercase tracking-wider text-stone-500 mb-3">
              The grid search, with two guardrails
            </h2>
            <p>
              An earlier version of the engine used eyeball-tuned weights.
              v3 replaces them with a grid search across the layer space,
              evaluated on the validation cohort by exact-tier outcome
              accuracy. Two constraints were added when the unconstrained
              search produced winners that scored well on the metric but
              behaved badly in the smoke test.
            </p>
            <div className="mt-4 space-y-4 text-sm">
              <div>
                <div className="font-medium text-stone-800">DRAFT ≤ 0.30</div>
                <p className="text-stone-600 mt-1">
                  Without a cap, the search drove DRAFT to 0.80–0.90 for QB
                  and WR. The model was no longer a comparables engine —
                  it had learned that draft slot is a leakage-strong outcome
                  proxy and was collapsing into a draft-tier predictor.
                  Capping DRAFT at 0.30 forces the other layers to do the
                  work. The cap is a methodological choice, not an
                  empirical optimum.
                </p>
              </div>
              <div>
                <div className="font-medium text-stone-800">
                  WR TRAITS ≥ 0.30 (override)
                </div>
                <p className="text-stone-600 mt-1">
                  After the DRAFT cap, the unconstrained WR winner had
                  VOLUME = 0.65 and TRAITS = 0.15. In smoke-testing this
                  produced Carnell Tate&rsquo;s top-5 comp set as five
                  busts — the volume lens favored prospects who simply
                  played a lot, and aged-out college producers crowd out
                  the top of the WR pool. The TRAITS-floor override fixes
                  the bust-cluster collapse at a cost of 3.7pp of exact
                  outcome accuracy. The trade is deliberate: archetype
                  quality over outcome accuracy, specifically for WR.
                </p>
              </div>
            </div>
            <p className="mt-4">
              On the validation cohort (n=398), the locked v3 weights
              produce <strong>56.0% exact-tier accuracy</strong> and{" "}
              <strong>89.7% within ±1 tier</strong>, with F1 = 0.352 and
              Jaccard agreement against published expert comp sets of 16.1%.
              That&rsquo;s +11 percentage points on exact-tier and +6.8
              points on Jaccard over the v2 architecture. By position,
              feature_v2_traits resolves to QB 63.8% / RB 60.0% / TE 53.4%
              / WR 51.9%.
            </p>
          </section>

          <section>
            <h2 className="text-sm uppercase tracking-wider text-stone-500 mb-3">
              Archetypes are k-means clusters in trait space
            </h2>
            <p>
              The 3D layout you see in the graph is UMAP over the trait
              vectors, force-nudged by explicit comp edges. The labeled
              sub-clusters within each position (&ldquo;Pocket processor&rdquo;,
              &ldquo;Power back&rdquo;, &ldquo;Vertical threat&rdquo;,
              etc.) come from k-means on the same trait vectors, with k
              chosen per position by what makes football sense:
            </p>
            <ul className="mt-4 space-y-1 text-sm">
              <li><strong>QB:</strong> k=3 (pocket processor, dual-threat, big-arm)</li>
              <li><strong>RB:</strong> k=3 (power back, three-down back, scatback)</li>
              <li><strong>WR:</strong> k=4 (big-body X, slot separator, vertical threat, route technician)</li>
              <li><strong>TE:</strong> k=3 (inline Y, move TE, receiving F)</li>
            </ul>
            <p className="mt-4">
              Labels are picked from a small heuristic table keyed on which
              trait the cluster centroid most over-indexes against the
              position-wide average. The clusters are computed in the
              browser at page load (~80ms over 1,000 prospects) so changing
              k or relabeling doesn&rsquo;t require a data rebuild.
            </p>
          </section>

          <section>
            <h2 className="text-sm uppercase tracking-wider text-stone-500 mb-3">
              ScoutBot is a wrapper around discipline, not magic
            </h2>
            <p>
              The chat is a Bedrock Knowledge Base retrieval (Titan v2
              embeddings, hybrid search) plus a custom Sonnet 4.6 synthesis
              call. The split is deliberate. Bedrock&rsquo;s managed
              <code className="mx-1 rounded bg-stone-100 px-1 py-0.5 text-xs">
                RetrieveAndGenerate
              </code>{" "}
              path lets the model freely quote retrieved chunks verbatim,
              which would be a Brugler licensing violation. Splitting the
              calls gives us full control over the synthesis prompt.
            </p>
            <p className="mt-4">
              The system prompt enforces eight rules. The two with real
              teeth are:
            </p>
            <ul className="mt-4 space-y-3 text-sm">
              <li>
                <span className="font-medium text-stone-800">Paraphrase, never quote.</span>{" "}
                Never reproduce more than four consecutive words from any
                retrieved chunk. All scouting text is treated as licensed
                third-party material.
              </li>
              <li>
                <span className="font-medium text-stone-800">Ground every claim or stop.</span>{" "}
                If the retrieved chunks don&rsquo;t describe the prospect
                being asked about, ScoutBot says so and stops, instead of
                synthesizing a profile from incidental mentions in other
                reports. This is the rule that prevents the &ldquo;made up
                a school affiliation&rdquo; class of failure.
              </li>
            </ul>
            <p className="mt-4">
              Three query intents are detected before retrieval: (1) regular
              by-name questions, (2) <em>find-style</em> queries
              (&ldquo;find a Saquon-style runner&rdquo;), which look up
              cross-cohort comp edges from the engine instead of routing
              to the historical reference player, and (3) <em>class</em>{" "}
              queries (&ldquo;how does the 2026 WR class compare to
              2025?&rdquo;), which compose a structured class summary from
              the bundle (headline prospects, dominant trait counts,
              average ceiling/floor) and skip RAG retrieval entirely. Per-
              player chat from the side panel always answers about the
              pinned subject.
            </p>
            <p className="mt-4">
              Retrieval fans out to one Bedrock call per pinned subject at
              numResults=14, then enforces a per-source cap of 2 chunks in
              post-processing — voice diversity without 12 round trips.
              Responses stream token-by-token via SSE; perceived latency
              from typed-question to first-token is 1.5–4 seconds.
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
              comp-engine&rsquo;s similarity embeddings are{" "}
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
                  Three analyst voices, distinguished at retrieval time:{" "}
                  <strong>Daniel Jeremiah</strong> (Top 50 + Top 150 big
                  boards),{" "}
                  <strong>Lance Zierlein</strong> (mock drafts 2.1 / 3.0
                  / 4.0 + position-group rankings), and{" "}
                  <strong>Bucky Brooks</strong> (final mock + top-five
                  by position).
                </dd>
              </div>
              <div>
                <dt className="font-medium text-stone-800">
                  ESPN
                </dt>
                <dd className="text-stone-600 mt-0.5">
                  Five analyst boards bundled under one source tag:{" "}
                  <strong>Mel Kiper Jr.</strong> (top 150),{" "}
                  <strong>Matt Miller</strong> (top 481),{" "}
                  <strong>Jordan Reid</strong> (top 499), and{" "}
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
                  Two analyst voices:{" "}
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
            <h2 className="text-sm uppercase tracking-wider text-stone-500 mb-3">
              What this can&rsquo;t do yet
            </h2>
            <p>
              A few honest limitations the eval doesn&rsquo;t paper over:
            </p>
            <ul className="mt-4 space-y-3 text-sm">
              <li>
                <strong>The eval objective doesn&rsquo;t capture archetype
                quality.</strong> Outcome-tier accuracy is what the grid
                search optimizes; Jaccard against expert comps is a sanity
                check. Neither directly measures &ldquo;does this comp set
                read as football-similar to a human?&rdquo; The WR override
                exists because outcome accuracy and archetype quality
                pulled in opposite directions and we picked the latter.
              </li>
              <li>
                <strong>Trait extraction is only as good as the analyst
                input.</strong> If every analyst hedges on a prospect&rsquo;s
                pocket presence, Sonnet&rsquo;s score reflects that hedge.
                Sparse-coverage prospects get noisier trait vectors than
                Mendoza or Love do.
              </li>
              <li>
                <strong>The 2026 cohort has uncertain draft slots.</strong>{" "}
                The DRAFT layer uses projected draft positions where actual
                outcomes don&rsquo;t exist yet. Once the actual draft happens
                the prediction-cohort vectors should be rebuilt with
                resolved slots.
              </li>
              <li>
                <strong>No combine measurables for some 2026
                prospects.</strong> The BODY layer falls back to
                position-mean imputation when measurables are missing,
                which under-differentiates prospects in those rows.
                Combine-day refresh of the BODY layer is on the post-ship
                list.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-sm uppercase tracking-wider text-stone-500 mb-3">
              Stack
            </h2>
            <p className="text-sm text-stone-600">
              Engine: Python 3.12 (uv-managed), polars / pandas / pyarrow
              for feature work, Bedrock Titan v2 for trait-text embeddings,
              scikit-learn for clustering. Storage: Postgres + pgvector on
              RDS{" "}
              <code className="rounded bg-stone-100 px-1 py-0.5 text-xs">
                t4g.micro
              </code>{" "}
              for kNN comps; Aurora Serverless v2 (min ACU = 0) backing a
              Bedrock Knowledge Base for chat. Site: Next.js 16 + React 19,{" "}
              <code className="rounded bg-stone-100 px-1 py-0.5 text-xs">
                3d-force-graph
              </code>{" "}
              + Three.js for the hero visualization, Tailwind 4 for layout.
              Synthesis: Sonnet 4.6 for chat, streaming via SSE.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
