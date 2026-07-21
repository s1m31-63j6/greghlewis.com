import type { Metadata } from "next";
import Link from "next/link";

import { ReadingLevelProvider } from "./copy";
import { Header } from "./Header";
import { ProjectShell } from "./ProjectShell";

export const metadata: Metadata = {
  title: "Glass Box RAG · Greg Lewis",
  description:
    "A legal precedent retrieval system that shows its work — hybrid search, cross-encoder reranking, and an agentic citation loop over published opinions on AI and copyright, rendered live as it runs.",
};

export default function Page() {
  return (
    <ReadingLevelProvider>
      <main className="mx-auto max-w-[1400px] px-5 py-10 sm:px-8 sm:py-14">
        <nav className="mb-8">
          <Link
            href="/"
            className="text-xs uppercase tracking-wider text-slate-500 transition hover:text-slate-900"
          >
            ← All projects
          </Link>
        </nav>

        <Header />

        <ProjectShell functionUrl={process.env.NEXT_PUBLIC_GLASS_BOX_RAG_FUNCTION_URL} />

        <footer className="mt-10 max-w-3xl text-[11px] leading-relaxed text-slate-400">
        Opinions are public domain, sourced from CourtListener (Free Law Project), govinfo, and
        the courts&apos; own sites. Proprietary editorial layers — Westlaw and Lexis headnotes,
        Shepard&apos;s and KeyCite treatment signals — are deliberately excluded; the citation
        graph here is derived from the opinions themselves. Not legal advice.
      </footer>
      </main>
    </ReadingLevelProvider>
  );
}
