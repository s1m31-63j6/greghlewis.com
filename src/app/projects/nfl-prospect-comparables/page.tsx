import type { Metadata } from "next";
import CompExplorer from "./CompExplorer";

export const metadata: Metadata = {
  title: "NFL Prospect Comparables · Greg Lewis",
  description:
    "A 3D similarity engine for NFL draft prospects. Hybrid feature + Sonnet-extracted trait vectors over 1,000+ players from 2014-2026.",
};

export default function Page() {
  return (
    <main className="fixed inset-0 bg-stone-50 text-stone-900">
      <CompExplorer />
    </main>
  );
}
