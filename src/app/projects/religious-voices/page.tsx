import type { Metadata } from "next";
import Link from "next/link";
import { ProjectShell } from "./ProjectShell";
import type { Leader } from "@/lib/religious-voices/types";

export const metadata: Metadata = {
  title: "Religious Voices · Greg Lewis",
  description:
    "An AI chatbot that channels the voice of religious leaders across eight traditions and two centuries — grounded in each leader's published writings.",
};

// Fetch the leader manifest via the same-origin proxy route at SSR
// time. The proxy handles SigV4-signing the request to the Python
// Lambda (whose Function URL requires AWS_IAM auth).
async function safeLoadLeaders(): Promise<Leader[]> {
  try {
    // At SSR time on Amplify, relative URLs need a host. Default to the
    // public origin in production; for local dev the dev server resolves
    // the relative path itself.
    const origin =
      process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.AMPLIFY_HOSTING_URL ||
      "http://localhost:3000";
    const res = await fetch(`${origin}/api/religious-voices/leaders`, {
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { leaders?: Leader[] };
    return data.leaders ?? [];
  } catch {
    return [];
  }
}

export default async function Page() {
  const leaders = await safeLoadLeaders();

  return (
    <main className="max-w-3xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <nav className="mb-8">
        <Link
          href="/"
          className="text-xs uppercase tracking-wider text-stone-500 hover:text-stone-900 transition"
        >
          ← All projects
        </Link>
      </nav>

      <header className="mb-8">
        <h1 className="font-serif text-3xl sm:text-4xl text-stone-900 leading-tight">
          Religious Voices
        </h1>
        <p className="mt-3 text-stone-600 text-base leading-relaxed">
          Converse with chatbot personas of religious leaders across eight
          traditions and two centuries. Each persona is grounded in the
          leader&apos;s own published writings.
        </p>
      </header>

      <div className="mb-8 rounded-lg border-l-2 border-amber-500 bg-amber-50/60 px-4 py-3 text-sm text-stone-700">
        <p>
          <strong className="text-stone-900">This is a simulation.</strong>{" "}
          The bot speaks in each leader&apos;s voice using their published
          words, but it is not the leader and not an authoritative source.
        </p>
        <p className="mt-2 text-xs text-stone-600">
          <span className="text-stone-900 font-medium">Black text</span>
          {" is drawn from the leader's actual writings — the small superscript number on each sourced sentence links to the specific passage. "}
          <span className="text-stone-500">Lighter grey text</span>
          {" is the model extrapolating in their style — not the leader's own words."}
        </p>
      </div>

      <ProjectShell leaders={leaders} />

      <footer className="mt-16 pt-6 border-t border-stone-200 text-xs text-stone-500 leading-relaxed">
        <p>
          Architecture: {leaders.length} leaders × ~1,800 verbatim excerpts
          across eight traditions. Embeddings are computed locally with{" "}
          <code className="text-[11px] bg-stone-100 px-1 rounded">
            BAAI/bge-base-en-v1.5
          </code>{" "}
          (768-dim sentence-transformer) and stored in a persistent Chroma
          vector store. At query time, a Python LangChain pipeline runs
          retrieval against Chroma, fills a persona prompt template, and
          streams the answer from Claude Sonnet 4.5 via the Anthropic
          Python SDK with two-breakpoint prompt caching. The Next.js
          frontend you&apos;re reading calls the Python service directly
          over SSE.
        </p>
        <p className="mt-2">
          Sources: Wikisource (Journal of Discourses for 19th-c. Mormon
          leaders; Vivekananda&apos;s Complete Works; Gandhi&apos;s Indian
          Home Rule), vatican.va (papal encyclicals from Leo XIII through
          Francis), churchofjesuschrist.org (modern LDS General Conference),
          and archive.org (Olcott&apos;s Buddhist Catechism; Spurgeon
          sermons; Asbury&apos;s journal; Schechter&apos;s Studies in
          Judaism; Iqbal&apos;s Reconstruction). The superscript number
          on each quoted sentence links back to the specific source
          passage.
        </p>
        <p className="mt-2">
          A deliberate architectural contrast to the{" "}
          <Link
            href="/projects/nfl-prospect-comparables"
            className="underline decoration-stone-300 underline-offset-2 hover:text-stone-900"
          >
            NFL Comparables chatbot
          </Link>{" "}
          on this site: that one is a TypeScript-first AWS Bedrock RAG;
          this one is Python-first with LangChain and a self-managed
          vector store.
        </p>
      </footer>
    </main>
  );
}
