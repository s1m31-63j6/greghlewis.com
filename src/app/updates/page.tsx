/**
 * The signup page.
 *
 * Reached from a "Want more?" button in a project's own header, carrying that
 * project in `?from=`. The source is shown on the page rather than hidden in
 * the URL: somebody who clicked from the playbook should be able to see that
 * they are signing up for playbook news, and that the thing they are about to
 * type will be filed under it.
 *
 * An unknown or absent `from` renders the general version instead of failing,
 * so a hand-typed /updates still works.
 */

import type { Metadata } from "next";
import Link from "next/link";

import UpdatesForm from "./UpdatesForm";
import { copyForSource } from "@/lib/subscribe/copy";

export const metadata: Metadata = {
  title: "Updates · Greg Lewis",
  description:
    "Get a note when there is something new worth reading — a project, a model, or an analysis.",
};

export default async function UpdatesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  const copy = copyForSource(from);
  const isProject = copy.id !== "home";

  return (
    <main className="mx-auto w-full max-w-3xl px-6 pb-24 pt-12 sm:pt-16">
      <nav className="mb-8">
        <Link
          href={isProject ? `/projects/${copy.id}` : "/"}
          className="font-mono text-[11px] uppercase tracking-[0.12em] text-neutral-500 transition-colors hover:text-neutral-900 dark:hover:text-neutral-100"
        >
          ← {isProject ? `Back to ${copy.label}` : "All projects"}
        </Link>
      </nav>

      <header>
        {/* The source, stated plainly. This is what will be stored with the
            signup, so it is shown rather than implied. */}
        <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-neutral-500">
          {isProject ? `From ${copy.label}` : "greghlewis.com"}
        </p>
        <h1 className="mt-2 font-[family-name:var(--font-source-serif)] text-3xl leading-tight text-neutral-900 sm:text-4xl dark:text-neutral-100">
          {copy.headline}
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-neutral-600 dark:text-neutral-400">
          {copy.blurb}
        </p>
      </header>

      <UpdatesForm copy={copy} />
    </main>
  );
}
