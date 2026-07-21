import type { Metadata } from "next";
import Link from "next/link";

import { ProjectShell } from "./ProjectShell";

export const metadata: Metadata = {
  title: "Glass Box RAG · Greg Lewis",
  description:
    "A legal precedent retrieval system that shows its work — hybrid search, cross-encoder reranking, and an agentic citation loop over published opinions on AI and copyright, rendered live as it runs.",
};

export default function Page() {
  return (
    <main className="mx-auto max-w-[1400px] px-5 py-10 sm:px-8 sm:py-14">
      <nav className="mb-8">
        <Link
          href="/"
          className="text-xs uppercase tracking-wider text-stone-500 transition hover:text-stone-900"
        >
          ← All projects
        </Link>
      </nav>

      <header className="mb-8 max-w-3xl">
        <h1 className="font-serif text-3xl leading-tight text-stone-900 sm:text-4xl">
          Glass Box RAG
        </h1>
        <p className="mt-3 text-base leading-relaxed text-stone-600">
          Retrieval-augmented generation is usually a black box: a question goes in, an answer
          comes out, and the machinery in between is invisible. This one runs the same pipeline
          but streams every stage as it happens — the two searches racing, the ranks reshuffling
          under fusion and again under a cross-encoder, the agent deciding whether to follow a
          citation.
        </p>
        <p className="mt-3 text-base leading-relaxed text-stone-600">
          The heart of the corpus is 28 published U.S. opinions on AI and copyright fair use —
          the three decisions that have actually reached the merits, and the doctrinal lineage
          they argue over. It is a genuinely unsettled area of law, which makes it a good test: a
          retrieval system that quietly returns only one side of a split gives a confident, wrong
          answer. Six deliberately unrelated AI cases — algorithmic insurance denials, AI patent
          inventorship — sit alongside them as a control group, so the retriever has to prove it
          can tell different legal questions apart rather than just recognise &ldquo;a copyright
          case.&rdquo;
        </p>
        <p className="mt-3 text-sm text-stone-500">
          <Link href="/projects/glass-box-rag/methodology" className="underline hover:text-stone-900">
            How it was built and measured →
          </Link>
        </p>
      </header>

      <ProjectShell functionUrl={process.env.NEXT_PUBLIC_GLASS_BOX_RAG_FUNCTION_URL} />

      <footer className="mt-10 max-w-3xl text-[11px] leading-relaxed text-stone-400">
        Opinions are public domain, sourced from CourtListener (Free Law Project), govinfo, and
        the courts&apos; own sites. Proprietary editorial layers — Westlaw and Lexis headnotes,
        Shepard&apos;s and KeyCite treatment signals — are deliberately excluded; the citation
        graph here is derived from the opinions themselves. Not legal advice.
      </footer>
    </main>
  );
}
