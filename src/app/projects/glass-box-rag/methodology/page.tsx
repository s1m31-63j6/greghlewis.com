import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Glass Box RAG — Methodology · Greg Lewis",
  description:
    "How a legal precedent retrieval system was built and measured: corpus construction from two incompatible sources, hybrid retrieval, cross-encoder reranking, an agentic citation loop, and the ablation results — including the ones that argue against the design.",
};

export default function Methodology() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
      <nav className="mb-8">
        <Link
          href="/projects/glass-box-rag"
          className="text-xs uppercase tracking-wider text-stone-500 transition hover:text-stone-900"
        >
          ← Back to the demo
        </Link>
      </nav>

      <header className="mb-8">
        <h1 className="font-serif text-3xl leading-tight text-stone-900 sm:text-4xl">
          Methodology
        </h1>
        <p className="mt-3 text-base leading-relaxed text-stone-600">
          How the corpus was built, what each retrieval stage is worth when you actually
          measure it, and which parts of the design the measurements argued against.
        </p>
      </header>

      <section className="space-y-8 text-[15px] leading-relaxed text-stone-700">
        <div>
          <h2 className="mb-2 font-serif text-xl text-stone-900">1. The shape of the problem</h2>
          <p>
            Legal research has a failure mode that generic retrieval does not. If a system
            asked &ldquo;does market dilution defeat fair use?&rdquo; returns five passages that
            all say yes, the answer reads as authoritative and is wrong — because two federal
            judges reached opposite conclusions on that question within two days of each other.
            Missing the case that cuts the other way is not a thinner answer; it is a bad one.
          </p>
          <p className="mt-2">
            That makes AI-and-copyright a good test domain. It is genuinely unsettled, the
            disagreements are recent and sharp, and the opinions are public domain.
          </p>
        </div>

        <div>
          <h2 className="mb-2 font-serif text-xl text-stone-900">2. Building the corpus</h2>
          <p>
            28 published opinions, ~415,000 words: the three decisions that have actually
            reached the merits on AI training and fair use, the adjacent rulings on pleading
            and DMCA §1202, and the doctrinal lineage they argue over.
          </p>
          <p className="mt-2">
            The awkward discovery was that these need <strong>two incompatible pipelines</strong>.
            The doctrinal ancestors live in CourtListener&apos;s case-law database with clean
            text, parallel citations, and citation edges attached. The modern AI decisions are
            not there at all — they come from govinfo&apos;s USCOURTS packages or the courts&apos;
            own sites as PDFs, with no citation metadata. One of them, <em>NYT v. OpenAI</em>,
            has zero govinfo granules because the Southern District of New York does not feed
            that docket to GPO.
          </p>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[14px]">
            <li>
              <strong>Resolving a case is harder than it looks.</strong> Searching CourtListener
              for the citation string <code>&ldquo;510 U.S. 569&rdquo;</code> returns opinions
              that <em>cite</em> Campbell, not Campbell — the first attempt silently ingested an
              unrelated 2025 case. Searching by name is also insufficient: Campbell&apos;s top
              two hits are the 1993 cert-stage entries, not the 1994 merits decision. The
              fetcher now requires an exact parallel-citation match and refuses to guess.
            </li>
            <li>
              <strong>Chunking on structure, not characters.</strong> Opinions have parts and
              subsections; splitting on them means a chunk tends to hold a complete piece of
              reasoning. An early version of the heading regex made the trailing period
              optional, which matched ordinary prose — <em>Warhol</em> alone produced 63
              fabricated section labels before that was caught.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="mb-2 font-serif text-xl text-stone-900">3. Retrieval, stage by stage</h2>
          <p>
            Every stage is a separate function so the evaluation harness can switch it off and
            price it. BM25 is written out rather than imported, and checked against{" "}
            <code>rank_bm25</code>: they agree to three decimals on rare terms and diverge on
            common ones, because the reference implementation clamps negative IDF to a floor
            and collapses &ldquo;fair&rdquo; and &ldquo;use&rdquo; to identical weights.
          </p>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[14px]">
            <li>
              <strong>Two lanes.</strong> BM25 for exact terms of art; dense vectors (Titan
              Text Embeddings v2) for meaning.
            </li>
            <li>
              <strong>Reciprocal Rank Fusion</strong> combines them by rank rather than score —
              BM25 scores and cosine similarities live on incomparable scales.
            </li>
            <li>
              <strong>A temporal filter</strong> drops opinions that did not exist yet.
            </li>
            <li>
              <strong>A cross-encoder</strong> (Cohere Rerank 3.5) rescores each passage against
              the question, reading both together rather than comparing two independent vectors.
            </li>
            <li>
              <strong>Per-case diversification</strong> caps how many passages any one opinion
              contributes — and runs <em>after</em> the reranker, not before.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="mb-2 font-serif text-xl text-stone-900">4. What the measurements said</h2>
          <p>
            Scored against a 19-question golden set with case-level ground truth. The headline
            metric is <strong>critical recall</strong> — the fraction of must-have cases
            retrieved — because that is the one whose failure produces a confidently wrong
            answer.
          </p>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[14px]">
            <li>
              <strong>BM25 alone beat dense retrieval alone</strong> (0.895 vs 0.789). Legal
              writing is thick with exact terms of art, and this corpus is small enough that
              semantic bridging has little room to help.
            </li>
            <li>
              <strong>Hybrid was worse than BM25 alone</strong> (0.868). Fusion diluted a strong
              sparse signal. Combining retrievers is not automatically an improvement.
            </li>
            <li>
              <strong>Diversification was the single biggest win</strong> (0.868 → 0.921) and is
              the only reason the two-days-apart disagreement surfaces at all.
            </li>
            <li>
              <strong>Stage order mattered as much as stage choice.</strong> Reranking selects
              the top-N <em>passages</em>, which re-concentrates onto a few opinions and
              silently undoes an earlier diversification pass. Moving diversification after the
              reranker recovered 0.895 → 0.921.
            </li>
            <li>
              <strong>Only the temporal filter prevents anachronism.</strong> Asked what the law
              was in 2015, every other configuration confidently retrieved a 2023 decision.
            </li>
          </ul>
          <p className="mt-2">
            One caution the numbers themselves impose: with 19 questions, differences under
            about 0.05 are inside the noise. A 0.026 gap is roughly one question changing its
            mind, which is not a finding.
          </p>
        </div>

        <div>
          <h2 className="mb-2 font-serif text-xl text-stone-900">
            5. Query transformation, and a result still in dispute
          </h2>
          <p>
            HyDE — drafting a hypothetical judicial passage and searching with that instead of
            the bare question — improved overall recall, precision, and mean reciprocal rank,
            but cost critical recall (0.921 → 0.895). On the market-dilution question it
            retrieved the case on one side and dropped the case on the other.
          </p>
          <p className="mt-2">
            It was switched off on that basis and then switched back on, because the reasoning
            was too quick. The delta is one case out of roughly thirty-eight — inside the noise
            band above. And both this result and BM25&apos;s win over dense retrieval have a
            simpler explanation than &ldquo;the technique does not work&rdquo;: seventeen of
            twenty-eight opinions <em>are</em> the doctrinal ancestors, so
            &ldquo;HyDE drifts toward the ancestors&rdquo; largely means &ldquo;drifts toward
            most of the corpus.&rdquo; Both techniques earn their keep by bridging across
            breadth this corpus does not yet have. Widening it and re-running the grid is the
            real experiment.
          </p>
        </div>

        <div>
          <h2 className="mb-2 font-serif text-xl text-stone-900">
            5b. A corpus that can grade itself is not a test
          </h2>
          <p>
            The first version of this corpus was all fair use — 28 opinions arguing the same
            doctrine. That is a problem for evaluation, not just for coverage: when every
            document is about the same thing, high retrieval scores prove nothing, because
            everything is plausibly relevant. A retriever that returns &ldquo;a fair-use
            case&rdquo; for a fair-use question looks perfect whether or not it actually
            understood the question.
          </p>
          <p className="mt-2">
            So six deliberately unrelated AI cases were added as a control group: three on
            algorithmic health-insurance denials (ERISA and Medicare-Act preemption), two on
            whether an AI can hold a copyright or a patent, and their vocabularies share almost
            nothing with fair use. Adding them dropped the corpus&apos;s mean inter-case
            similarity from 0.27 to 0.24 — and, more to the point, gave every query something it
            was supposed to <em>reject</em>.
          </p>
          <p className="mt-2">
            The retriever passed. A patent-inventorship question returns the patent case first;
            an insurance question returns the three insurance cases; the authorship question
            ranks the AI-registration cases above the fair-use cases even though both are
            copyright. And the fair-use questions stayed clean — asked about intermediate
            copying, the system returned five fair-use cases and zero insurance or patent
            distractors. That last result is the one that matters: it is the difference between a
            retriever that discriminates and a corpus that was flattering itself.
          </p>
        </div>

        <div>
          <h2 className="mb-2 font-serif text-xl text-stone-900">6. The agentic loop</h2>
          <p>
            After retrieving, the model is asked a narrow question: is this enough, or does it
            turn on a precedent you have not been given? If the latter, it follows an edge in
            the citation graph — built from the opinions themselves — and retrieves again,
            bounded at three hops. Asked what authority <em>Ross</em> relied on, it retrieves
            <em> Ross</em>, judges itself insufficient, follows the citation to{" "}
            <em>Warhol</em>, then stops.
          </p>
          <p className="mt-2">
            The prompt pushes toward stopping. An answer grounded in a few directly relevant
            opinions beats one padded with tangential authority, and an agent that always finds
            a reason to keep going is just an expensive way to add noise.
          </p>
        </div>

        <div>
          <h2 className="mb-2 font-serif text-xl text-stone-900">7. Why it runs where it runs</h2>
          <p>
            The pipeline runs in a dedicated Lambda behind a Function URL in{" "}
            <code>RESPONSE_STREAM</code> mode, not in the site&apos;s Next.js runtime. That was
            not a preference — it was measured. AWS Amplify&apos;s SSR platform{" "}
            <strong>buffers</strong> server-sent events rather than streaming them, and its CDN
            terminates the origin connection at about thirty seconds. A probe confirmed both:
            94 SSE events from an existing endpoint arrived simultaneously at 12.4 seconds, and
            a longer response failed outright at 30.5. A Function URL delivers frames
            incrementally from 0.4 seconds out past 90.
          </p>
          <p className="mt-2">
            The corpus and its vectors are ~6 MB, so they ship inside the deployment package.
            An earlier design put them in S3; at this size that bought a round trip, an IAM
            policy, and a failure mode, and nothing else.
          </p>
        </div>

        <div>
          <h2 className="mb-2 font-serif text-xl text-stone-900">8. What is deliberately absent</h2>
          <p>
            No Westlaw or Lexis headnotes, no Shepard&apos;s or KeyCite treatment signals. Those
            are proprietary editorial layers, and their absence is a real limitation: the
            citation graph here records that one case cites another, but not whether it{" "}
            <em>followed</em>, <em>distinguished</em>, or <em>criticised</em> it. Inferring that
            from the surrounding text is an open problem and a natural next step.
          </p>
          <p className="mt-2">
            The exclusion is also the subject matter. <em>Thomson Reuters v. Ross Intelligence</em>{" "}
            — in this corpus — held that copying 2,243 Westlaw headnotes to build training data
            was infringement and not fair use.
          </p>
        </div>

        <div>
          <h2 className="mb-2 font-serif text-xl text-stone-900">9. Stack</h2>
          <p className="text-[14px] text-stone-600">
            Python (uv) for the offline corpus and evaluation harness · TypeScript on AWS Lambda
            with a streaming Function URL · Amazon Bedrock — Claude Sonnet 4.6 for analysis,
            assessment, and synthesis; Titan Text Embeddings v2; Cohere Rerank 3.5 · hand-written
            BM25 and Reciprocal Rank Fusion · AWS CDK · Next.js on Amplify · sources: CourtListener
            (Free Law Project), govinfo, and the courts&apos; own opinion archives.
          </p>
        </div>
      </section>
    </main>
  );
}
