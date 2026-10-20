"use client";

/**
 * Intro to Bond Yields, Working Paper No. 11. The timeline leads; under
 * it, Bond Fundamentals: the five ideas as five charts. An episode's idea
 * list switches the fundamentals tab and scrolls to it.
 */

import { useCallback, useState } from "react";

import { DottedRule, InkLink, PaperShell } from "@/app/_paper/Paper";

import Fundamentals from "./Fundamentals";
import YieldChart from "./YieldChart";
import { DATA, fmtDate } from "./data";
import { INKS, PAPER_NO, PROJECT } from "./paper";
import type { PillarId } from "./pillars";

export default function BondYields() {
  const [active, setActive] = useState<string | null>(null);
  const [tab, setTab] = useState<PillarId>("fisher");

  const onIdea = useCallback((id: PillarId) => {
    setTab(id);
    document.getElementById("fundamentals")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <PaperShell
      no={PAPER_NO}
      title="Intro to Bond Yields"
      note="Given the recent interest in rising housing rates, I wanted to revisit the fundamentals that drive the bond market. Hope you enjoy this simple visual explainer."
      inks={INKS}
      project={PROJECT}
      meta={[
        { label: "Paper", value: `No. ${PAPER_NO}` },
        { label: "Author", value: "Greg Lewis" },
        { label: "Revised", value: fmtDate(DATA.asOf) },
        { label: "Data", value: <InkLink href="https://fred.stlouisfed.org/">FRED, St. Louis Fed</InkLink> },
      ]}
      links={[
        { href: "/projects/bond-yields/methodology", label: "How it was built" },
        { href: `/updates?from=${PROJECT}`, label: "Want more?", tel: "want-more" },
      ]}
    >
      <DottedRule />
      <section className="by-sec" id="timeline">
        <YieldChart active={active} setActive={setActive} onIdea={onIdea} />
      </section>
      <DottedRule />
      <section className="by-sec" id="fundamentals">
        <Fundamentals tab={tab} setTab={setTab} />
      </section>
    </PaperShell>
  );
}
