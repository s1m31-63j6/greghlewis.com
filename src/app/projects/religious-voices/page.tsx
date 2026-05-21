import type { Metadata } from "next";
import Link from "next/link";
import { ProjectShell } from "./ProjectShell";
import { loadMeta } from "@/lib/religious-voices/leaders";
import type { Leader } from "@/lib/religious-voices/types";

export const metadata: Metadata = {
  title: "Religious Voices · Greg Lewis",
  description:
    "An AI chatbot that channels the voice of religious leaders across eight traditions and two centuries — grounded in each leader's published writings.",
};

// Best-effort meta load. If the corpus hasn't been built yet (e.g., the
// first deploy before the Python pipeline runs), render the page with no
// leaders rather than failing the build.
async function safeLoadLeaders(): Promise<Leader[]> {
  try {
    const meta = await loadMeta();
    return meta.leaders;
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
          <span className="text-stone-900">Roman text</span> is drawn from
          the leader&apos;s actual writings (sources linked beneath each
          answer).{" "}
          <em className="text-stone-500">Italicized text</em> is the model
          extrapolating in their style — not the leader&apos;s own words.
        </p>
      </div>

      <ProjectShell leaders={leaders} />

      <footer className="mt-16 pt-6 border-t border-stone-200 text-xs text-stone-500 leading-relaxed">
        <p>
          Architecture: a static corpus of {leaders.length} leaders and
          ~1,800 verbatim excerpts, embedded with Cohere&apos;s English v3
          model and stored as a single JSON file in the app bundle. Each
          chat turn runs an in-process cosine similarity to pull the most
          relevant excerpts for the selected leader, then asks Claude
          Sonnet 4.6 (via AWS Bedrock) to compose an answer in that
          leader&apos;s voice. The persona system prompt is cached on
          Bedrock so follow-up turns in the same session pay only ~10% of
          the input cost.
        </p>
        <p className="mt-2">
          Sources: Wikisource (Journal of Discourses for 19th-c. Mormon
          leaders; Vivekananda&apos;s Complete Works; Gandhi&apos;s Indian
          Home Rule), vatican.va (papal encyclicals from Leo XIII through
          Francis), and archive.org (Olcott&apos;s Buddhist Catechism;
          Spurgeon sermons; Asbury&apos;s journal; Schechter&apos;s
          Studies in Judaism; Iqbal&apos;s Reconstruction). Every chunk
          links back to its source on hover.
        </p>
        <p className="mt-2">
          No managed vector database, no idle cost. A deliberate
          architectural contrast to the{" "}
          <Link
            href="/projects/nfl-prospect-comparables"
            className="underline decoration-stone-300 underline-offset-2 hover:text-stone-900"
          >
            NFL Comparables chatbot
          </Link>{" "}
          on this site, which uses Bedrock Knowledge Bases on top of an
          Aurora vector store — appropriate at scale, overkill here.
        </p>
      </footer>
    </main>
  );
}
