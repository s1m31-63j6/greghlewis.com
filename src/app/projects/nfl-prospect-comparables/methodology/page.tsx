import Link from "next/link";
import WantMore from "@/app/_subscribe/WantMore";

export const metadata = {
  title: "Methodology — NFL Prospect Comparables",
};

export default function MethodologyPage() {
  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <div className="flex items-center justify-between gap-4">
          <Link
            href="/projects/nfl-prospect-comparables"
            className="text-xs text-stone-500 hover:text-stone-900 transition-colors"
          >
            ← back to the graph
          </Link>
          <WantMore project="nfl-prospect-comparables" />
        </div>

        <h1 className="mt-8 text-3xl font-semibold tracking-tight">
          Methodology
        </h1>
        <p className="mt-2 text-sm text-stone-500">
          Five-layer vector decomposition over 1,048 skill prospects (2014–2026),
          weighted by constrained grid search on a held-out validation cohort.
        </p>

        <div className="mt-12 space-y-12 text-stone-700 leading-relaxed">
          <section>
            <h2 className="text-sm uppercase tracking-wider text-stone-500 mb-3">
              Cohort and corpus
            </h2>
            <p>
              The pool is 1,048 skill-position prospects (QB / RB / WR / TE)
              drafted between 2014 and 2026. The cohort is split three ways
              for evaluation: <strong>2014–2020</strong> as training (settled
              career outcomes), <strong>2021–2025</strong> as validation
              (partial outcomes), and <strong>2026</strong> as the live
              prediction cohort.
            </p>
            <p className="mt-4">
              The corpus combines two strictly separated pipelines.
              Quantitative features are sourced 100% from public play-by-play
              and counting data (nflverse, CFBD, nflverse/combine). The
              language layer — the trait scores and the chat retrieval — uses
              a curated set of pre-draft scouting voices: Brugler&rsquo;s
              &ldquo;The Beast&rdquo;, Bleacher Report&rsquo;s scouting
              department, NFL Network (Daniel Jeremiah, Lance Zierlein, Bucky
              Brooks), ESPN (Kiper, Miller, Reid, Legwold), CBS Sports
              (Renner, Wilson), Connor Rogers (Rotoworld), and Walter
              Football. Wikipedia is admitted to chat retrieval only;
              retrospective revisionism would leak post-draft signal into a
              pre-draft embedding, so it is excluded from the similarity
              pipeline.
            </p>
          </section>

          <section>
            <h2 className="text-sm uppercase tracking-wider text-stone-500 mb-3">
              Feature construction
            </h2>
            <p>
              Each prospect is represented in five layered subspaces. Three
              are deterministic transforms of public quantitative data:
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
                normalized to a per-game form and a career-arc-velocity form
                so a five-game freshman season does not register as a
                four-year workload.
              </li>
              <li>
                <span className="font-medium text-stone-800">EFFICIENCY</span>{" "}
                — EPA-per-attempt splits, CPOE, success rate by down and
                distance, schedule-adjusted production, aDOT, and
                pressure-handling rates. ~30–50 features per position
                computed directly from the play-by-play parquet.
              </li>
            </ul>
            <p className="mt-4">
              The remaining two layers encode draft capital and a scouting-
              text-derived trait vector:
            </p>
            <ul className="mt-4 space-y-3 text-sm">
              <li>
                <span className="font-medium text-stone-800">DRAFT</span>{" "}
                — three features encoding the prospect&rsquo;s actual draft
                slot: capital percentile, round normalization, and a
                Day-1 indicator.
              </li>
              <li>
                <span className="font-medium text-stone-800">TRAITS</span>{" "}
                — a 10–14-dimension scouting vector per position
                (accuracy_short, contact_balance, route_tree_breadth, etc.),
                each scored 1–5 by an LLM trait-extraction protocol
                (next section).
              </li>
            </ul>
            <p className="mt-4">
              Total catalog: 131 named features in
              <code className="mx-1 rounded bg-stone-100 px-1 py-0.5 text-xs">
                engine/features/catalog.py
              </code>
              (70 QB / 54 RB / 56 WR / 45 TE) plus the per-position trait
              dimensions.
            </p>
          </section>

          <section>
            <h2 className="text-sm uppercase tracking-wider text-stone-500 mb-3">
              Trait extraction protocol
            </h2>
            <p>
              The TRAITS layer is produced by Sonnet 4.6 reading every
              analyst chunk in the corpus for a given prospect and emitting
              a per-trait 1–5 score with a supporting evidence quote. Trait
              dimensions are fixed per position and the prompt is held
              constant across runs, so the scores are deterministic given
              the same input chunks.
            </p>
            <p className="mt-4">
              Two operational choices preserve auditability. First, the
              prospect&rsquo;s name and school are anonymized to{" "}
              <code className="rounded bg-stone-100 px-1 py-0.5 text-xs">
                &lt;PROSPECT&gt;
              </code>{" "}
              and{" "}
              <code className="rounded bg-stone-100 px-1 py-0.5 text-xs">
                &lt;SCHOOL&gt;
              </code>{" "}
              tokens before scoring, removing one channel of name-based
              bias. Second, every score is stored alongside the analyst
              quote that supports it, so any rendered trait observation in
              the side panel is traceable back to the source sentence.
            </p>
          </section>

          <section>
            <h2 className="text-sm uppercase tracking-wider text-stone-500 mb-3">
              Similarity model and weighting
            </h2>
            <p>
              Each layer is L2-normalized within its subspace and reduced to
              a per-pair cosine similarity. The five layer similarities are
              combined into a single score by per-position weights:
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
              Three of the per-position weights warrant explanation.
              <strong> QB BODY = 0</strong>: above the broad athletic
              floor, measurables do not separate professional outcomes at
              quarterback. <strong>RB VOLUME = 0</strong>: workload
              archetype is already encoded in the trait vector
              (workhorse / scatback / three-down), so an explicit volume
              lens double-counts and inflates close comp similarities.
              <strong> WR DRAFT = 0.05</strong>: receiver draft slot is
              the noisiest outcome correlate among the four positions, and
              the design objective for WR comp sets is archetype similarity
              rather than draft-tier similarity.
            </p>
          </section>

          <section>
            <h2 className="text-sm uppercase tracking-wider text-stone-500 mb-3">
              Weight selection: grid search with two constraints
            </h2>
            <p>
              Per-position weights are selected by grid search across the
              five-layer simplex, with the validation cohort&rsquo;s
              exact-tier outcome accuracy as the optimization objective.
              Two constraints are imposed when the unconstrained search
              produces winners that score well on the metric but degrade
              archetype quality in qualitative review.
            </p>
            <div className="mt-4 space-y-4 text-sm">
              <div>
                <div className="font-medium text-stone-800">
                  Constraint 1: DRAFT ≤ 0.30
                </div>
                <p className="text-stone-600 mt-1">
                  Without a cap, the search drives DRAFT to 0.80–0.90 for
                  QB and WR. The model collapses into a draft-tier predictor —
                  draft slot is a leakage-strong outcome proxy in the
                  validation cohort. Capping DRAFT at 0.30 forces the
                  remaining four layers to do the work. The cap is a
                  methodological choice, not an empirical optimum.
                </p>
              </div>
              <div>
                <div className="font-medium text-stone-800">
                  Constraint 2: WR TRAITS ≥ 0.30 (override)
                </div>
                <p className="text-stone-600 mt-1">
                  After the DRAFT cap, the unconstrained WR winner had
                  VOLUME = 0.65 and TRAITS = 0.15. Qualitative review
                  surfaced a bust-cluster collapse: aged-out college
                  producers crowded the top of the WR comp space, so
                  archetype-similar but bust-tier prospects clustered with
                  headline names. The TRAITS-floor override resolves the
                  collapse at a cost of 3.7 percentage points of exact
                  outcome accuracy. The trade is deliberate: archetype
                  fidelity is prioritized over outcome accuracy at WR
                  specifically.
                </p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-sm uppercase tracking-wider text-stone-500 mb-3">
              Archetype clustering
            </h2>
            <p>
              The 3D layout in the graph is UMAP over the trait vectors,
              force-nudged by the explicit comp edges. Sub-cluster labels
              within each position (&ldquo;Pocket processor&rdquo;,
              &ldquo;Power back&rdquo;, &ldquo;Vertical threat&rdquo;,
              etc.) come from k-means on the same trait vectors, with k
              chosen per position by archetype distinctness in football
              terms:
            </p>
            <ul className="mt-4 space-y-1 text-sm">
              <li><strong>QB:</strong> k=3 (pocket processor, dual-threat, big-arm)</li>
              <li><strong>RB:</strong> k=3 (power back, three-down back, scatback)</li>
              <li><strong>WR:</strong> k=4 (big-body X, slot separator, vertical threat, route technician)</li>
              <li><strong>TE:</strong> k=3 (inline Y, move TE, receiving F)</li>
            </ul>
            <p className="mt-4">
              Cluster labels are assigned from a small heuristic table keyed
              on which trait the cluster centroid most over-indexes against
              the position-wide average. Clustering is computed in the
              browser at page load (~80ms over 1,000 prospects); changing
              k or relabeling does not require a data rebuild.
            </p>
          </section>

          <section>
            <h2 className="text-sm uppercase tracking-wider text-stone-500 mb-3">
              Chat synthesis pipeline
            </h2>
            <p>
              ScoutBot is a Bedrock Knowledge Base retrieval (Titan v2
              embeddings, hybrid search) feeding a custom Sonnet 4.6
              synthesis call. Retrieval and generation are split
              deliberately. The managed{" "}
              <code className="mx-1 rounded bg-stone-100 px-1 py-0.5 text-xs">
                RetrieveAndGenerate
              </code>{" "}
              path permits verbatim quoting of retrieved chunks, which would
              violate Brugler licensing. Splitting the calls returns full
              control of the synthesis prompt to the application.
            </p>
            <p className="mt-4">
              The system prompt enforces nine rules. The two with the most
              enforcement weight are:
            </p>
            <ul className="mt-4 space-y-3 text-sm">
              <li>
                <span className="font-medium text-stone-800">
                  Paraphrase, never quote.
                </span>{" "}
                Never reproduce more than four consecutive words from any
                retrieved chunk. All scouting text is treated as licensed
                third-party material.
              </li>
              <li>
                <span className="font-medium text-stone-800">
                  Ground every claim or stop.
                </span>{" "}
                If the retrieved chunks do not describe the prospect being
                asked about, the bot says so and stops, instead of
                synthesizing a profile from incidental mentions in other
                reports. This is the rule that prevents fabricated school
                affiliations and biographical details.
              </li>
            </ul>
            <p className="mt-4">
              Four query intents are detected before retrieval and route to
              different pipelines: (1) <em>regular</em> by-name questions
              (RAG over scouting chunks scoped to the resolved player_id);
              (2) <em>find-style</em> queries (&ldquo;find a Saquon-style
              runner&rdquo;) which look up cross-cohort comp edges from the
              engine and re-anchor retrieval on the 2026 matches rather
              than the historical reference; (3) <em>class</em> queries
              (&ldquo;how does the 2026 WR class compare to 2025?&rdquo;)
              which compose a structured class summary from the bundle —
              qualitative tier labels, prevalence-ordered traits, headline
              names — and skip RAG retrieval; and (4) <em>superlative</em>{" "}
              queries (&ldquo;fastest QB in 2026&rdquo;, &ldquo;tallest
              WR&rdquo;, &ldquo;biggest TE&rdquo;) which run a deterministic
              top-N query against the bundle&rsquo;s combine + bio fields,
              with a coverage disclaimer when N-of-M prospects in the
              cohort have the requested measurable. Per-player chat from
              the side panel skips intent detection and always answers
              about the pinned subject.
            </p>
            <p className="mt-4">
              Retrieval fans out to one Bedrock call per pinned subject at
              numResults=14, then enforces a per-source cap of 2 chunks in
              post-processing — voice diversity without 12 round trips.
              Responses stream token-by-token via SSE; perceived latency
              from typed question to first token is 1.5–4 seconds.
            </p>
          </section>

          <section>
            <h2 className="text-sm uppercase tracking-wider text-stone-500 mb-3">
              Validation
            </h2>
            <p>
              On the validation cohort (n = 398), the locked v3 weights
              produce <strong>56.0% exact-tier accuracy</strong> against
              published expert comp sets, <strong>89.7% within ±1
              tier</strong>, F1 = 0.352, and Jaccard agreement of 16.1%.
              Versus the v2 architecture, this is +11 percentage points on
              exact-tier accuracy and +6.8 points on Jaccard.
            </p>
            <p className="mt-4">
              By position, exact-tier accuracy resolves to QB 63.8% / RB
              60.0% / TE 53.4% / WR 51.9%. The WR tail is consistent with
              the trait-floor override design choice — archetype fidelity
              over outcome accuracy at the noisiest position.
            </p>
          </section>

          <section>
            <h2 className="text-sm uppercase tracking-wider text-stone-500 mb-3">
              Source ledger
            </h2>
            <p className="text-sm text-stone-600 mb-4">
              Every retrieved claim is traceable back to one or more named
              sources. ScoutBot answers as a single editorial voice; the
              underlying retrieval is source-tagged and transparent. As
              noted above, the chat retrieval corpus and the comp-engine
              similarity embeddings are separate pipelines — the engine
              uses pre-draft snapshot sources only, while chat retrieval
              admits Wikipedia as a current-info layer.
            </p>
            <dl className="space-y-4 text-sm">
              <div>
                <dt className="font-medium text-stone-800">
                  Dane Brugler — &ldquo;The Beast&rdquo; (The Athletic)
                </dt>
                <dd className="text-stone-600 mt-0.5">
                  Annual draft guide. Comprehensive per-prospect profiles
                  covering archetype, strengths, concerns, and analyst comp.
                  Considered the gold-standard single source by NFL front
                  offices. Licensed material — paraphrased, never quoted
                  verbatim.
                </dd>
              </div>
              <div>
                <dt className="font-medium text-stone-800">
                  B/R Scouting Dept (Bleacher Report)
                </dt>
                <dd className="text-stone-600 mt-0.5">
                  Brandon Thorn, Dame Parson, Daniel Harms, and Matt Holder
                  spent eight months evaluating the 2026 class. Densest
                  source in the corpus: dedicated multi-paragraph scouting
                  articles per prospect plus position-group rankings, a
                  final big board, and a final mock.
                </dd>
              </div>
              <div>
                <dt className="font-medium text-stone-800">
                  NFL Network (NFL.com)
                </dt>
                <dd className="text-stone-600 mt-0.5">
                  Three analyst voices, distinguished at retrieval time:{" "}
                  <strong>Daniel Jeremiah</strong> (Top 50 + Top 150 big
                  boards), <strong>Lance Zierlein</strong> (mock drafts
                  2.1 / 3.0 / 4.0 + position-group rankings), and{" "}
                  <strong>Bucky Brooks</strong> (final mock + top-five by
                  position).
                </dd>
              </div>
              <div>
                <dt className="font-medium text-stone-800">ESPN</dt>
                <dd className="text-stone-600 mt-0.5">
                  Five analyst boards bundled under one source tag:{" "}
                  <strong>Mel Kiper Jr.</strong> (top 150),{" "}
                  <strong>Matt Miller</strong> (top 481),{" "}
                  <strong>Jordan Reid</strong> (top 499), and{" "}
                  <strong>Jeff Legwold</strong> (top 100). Plus
                  ESPN&rsquo;s first-round grades-with-comps article and a
                  trait-by-trait standouts piece (&ldquo;most accurate
                  passer&rdquo;, &ldquo;best deep-ball thrower&rdquo;,
                  etc.) yielding per-trait observations the bot can surface
                  for skill-specific questions.
                </dd>
              </div>
              <div>
                <dt className="font-medium text-stone-800">CBS Sports</dt>
                <dd className="text-stone-600 mt-0.5">
                  Two analyst voices: <strong>Mike Renner</strong> (top
                  250 + top 150 big boards) and{" "}
                  <strong>Ryan Wilson</strong> (top 125 + final big board
                  vs. consensus). Renner is positional-value-aware;
                  Wilson&rsquo;s commentary frames each ranking against the
                  industry consensus number.
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
                <dt className="font-medium text-stone-800">Walter Football</dt>
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
                  embeddings to prevent retrospective leakage.
                </dd>
              </div>
            </dl>
            <p className="mt-4 text-xs text-stone-500 italic">
              Two additional outlets (Pro Football Network, The 33rd Team)
              were attempted but use Cloudflare bot protection that rejects
              direct scraping. They are queued for a future ingest pass.
              PFF is paywalled and is not currently in scope.
            </p>
          </section>

          <section>
            <h2 className="text-sm uppercase tracking-wider text-stone-500 mb-3">
              Limitations
            </h2>
            <ul className="mt-2 space-y-3 text-sm">
              <li>
                <strong>The eval objective does not capture archetype
                quality directly.</strong> Outcome-tier accuracy is what
                the grid search optimizes; Jaccard against expert comps is
                a sanity check. Neither metric measures whether a comp set
                reads as football-similar to a human reviewer. The WR
                trait-floor override is the explicit acknowledgment of this
                gap — accuracy and archetype fidelity diverged, and the
                latter was prioritized.
              </li>
              <li>
                <strong>Trait extraction is bounded by the analyst input.</strong>{" "}
                When every analyst hedges on a particular trait for a given
                prospect, the resulting score reflects that hedge.
                Sparse-coverage prospects produce noisier trait vectors
                than well-covered headline names.
              </li>
              <li>
                <strong>The 2026 cohort has uncertain draft slots at
                ingest time.</strong> The DRAFT layer uses projected slots
                where actual outcomes do not exist yet. The
                prediction-cohort vectors should be rebuilt with resolved
                slots once the actual draft completes.
              </li>
              <li>
                <strong>Combine measurables are partial for the 2026
                cohort.</strong> 32 of 81 2026 prospects have a recorded
                40, 46 of 81 have height/weight, fewer have three-cone or
                shuttle. The BODY layer falls back to position-mean
                imputation when measurables are missing, which under-
                differentiates prospects in those rows. Refresh of the
                BODY layer is on the post-ship list.
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
