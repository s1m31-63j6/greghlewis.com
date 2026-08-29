import type { Metadata } from "next";

import { PrintBoard } from "./PrintBoard";
import "./print.css";

export const metadata: Metadata = {
  title: "Draft Sheet — print · Greg Lewis",
  // A sheet built from somebody's own league settings has nothing to offer a
  // search index.
  robots: { index: false, follow: false },
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ layout?: string; tracker?: string; adp?: string }>;
}) {
  const sp = await searchParams;
  return (
    <PrintBoard
      layout={sp.layout === "landscape" ? "landscape" : "portrait"}
      tracker={sp.tracker !== "0"}
      adpSource={sp.adp ?? "mean"}
    />
  );
}
