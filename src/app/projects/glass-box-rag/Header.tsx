"use client";

import Link from "next/link";

import { COPY, ReadingLevelToggle, Term, useLevel } from "./copy";
import { Glossary } from "./Glossary";

/**
 * The page header: title, the methodology link and reading controls pulled up
 * beside it, and the (short, leveled) intro. Client component so it can read the
 * reading level; the deep treatment lives on /methodology.
 */
export function Header() {
  const level = useLevel();
  return (
    <header className="mb-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl leading-tight text-slate-900 sm:text-4xl">
            Glass Box RAG
          </h1>
          <Link
            href="/projects/glass-box-rag/methodology"
            className="mt-1 inline-block text-sm text-blue-700 underline underline-offset-2 hover:text-blue-500"
          >
            How it was built and measured →
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <ReadingLevelToggle />
          <Glossary />
        </div>
      </div>

      <p className="mt-4 max-w-3xl text-base leading-relaxed text-slate-600">
        {level === "grad" ? (
          <>
            Learn how <Term id="rag">retrieval-augmented AI</Term> actually works by watching an
            agent narrate itself as it runs — every search, re-ranking, and decision, live on the
            right. The worked example is AI and the law, an area where the courts genuinely
            disagree.
          </>
        ) : (
          COPY.intro.eli5
        )}
      </p>
    </header>
  );
}
