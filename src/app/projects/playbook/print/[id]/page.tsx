import type { Metadata } from "next";

import PrintSheet from "./PrintSheet";
import { getPlaybook } from "@/lib/playbook/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Print · Playbook",
  robots: { index: false },
};

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ layout?: string; color?: string }>;
}) {
  const { id } = await params;
  const { layout, color } = await searchParams;
  const book = await getPlaybook(id);

  if (!book) {
    return (
      <main className="pb-page">
        <p className="pb-prose" style={{ padding: "3rem" }}>
          That playbook could not be found.
        </p>
      </main>
    );
  }

  const chosen =
    layout === "callsheet" || layout === "wristband" ? layout : "grid12";

  return <PrintSheet book={book} layout={chosen} color={color === "1"} />;
}
