import type { Metadata } from "next";

import SharedBook from "./SharedBook";
import { getPlaybook } from "@/lib/playbook/store";
import { PRODUCT } from "../../product";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const book = await getPlaybook(id);
  return {
    title: book ? `${book.name} · ${PRODUCT.name}` : `${PRODUCT.name}`,
    description: book
      ? `${book.entries.length} plays, shared from ${PRODUCT.name}.`
      : "A shared football playbook.",
    // A share link is meant for a group chat, not a search engine.
    robots: { index: false },
  };
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const book = await getPlaybook(id);

  if (!book) {
    return (
      <main className="pb-page">
        <div className="pb-container">
          <h1 className="pb-h1">Not found</h1>
          <p className="pb-prose">
            That link does not point at a playbook. It may have expired — books
            are kept for eighteen months after the last change.
          </p>
        </div>
      </main>
    );
  }

  return <SharedBook book={book} />;
}
